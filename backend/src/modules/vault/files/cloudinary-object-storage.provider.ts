import { v2 as cloudinary } from 'cloudinary';
import { loadEnv } from '../../../config/env.js';
import type { ObjectStorageProvider } from './object-storage.types.js';
import { logicalKeyToCloudinaryAsset } from './storage-key.js';

/**
 * Stores opaque encrypted blobs in Cloudinary as authenticated raw assets.
 * Authorization remains in Secrets Vault; folder names are not a security boundary.
 */
export class CloudinaryObjectStorageProvider implements ObjectStorageProvider {
  private configured = false;

  private ensureConfigured(): void {
    if (this.configured) return;
    const env = loadEnv();
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials are required when OBJECT_STORAGE_PROVIDER=cloudinary');
    }
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    this.configured = true;
  }

  private resolveAsset(logicalKey: string) {
    return logicalKeyToCloudinaryAsset(logicalKey);
  }

  async putObject(key: string, data: Buffer): Promise<void> {
    this.ensureConfigured();
    const asset = this.resolveAsset(key);
    await new Promise<void>((resolve, reject) => {
      const options: Record<string, unknown> = {
        resource_type: 'raw',
        type: 'authenticated',
        overwrite: true,
      };
      if (asset.folder) {
        options.folder = asset.folder;
        options.public_id = asset.publicId;
      } else {
        options.public_id = asset.publicId;
      }
      const stream = cloudinary.uploader.upload_stream(options, (err) => {
        if (err) reject(err);
        else resolve();
      });
      stream.end(data);
    });
  }

  async getObject(key: string): Promise<Buffer> {
    this.ensureConfigured();
    const asset = this.resolveAsset(key);
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const url = cloudinary.utils.private_download_url(asset.fullPublicId, 'raw', {
      type: 'authenticated',
      expires_at: expiresAt,
    });
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Cloudinary download failed (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteObject(key: string): Promise<void> {
    this.ensureConfigured();
    const asset = this.resolveAsset(key);
    await cloudinary.uploader.destroy(asset.fullPublicId, {
      resource_type: 'raw',
      type: 'authenticated',
    });
  }
}
