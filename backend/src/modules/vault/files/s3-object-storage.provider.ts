import type { ObjectStorageProvider } from './object-storage.types.js';
import { LocalFilesystemObjectStorageProvider } from './local-object-storage.provider.js';
import { loadEnv } from '../../../config/env.js';

/**
 * S3-compatible object storage. When AWS SDK/bucket is not configured locally,
 * operations delegate to the local provider under a dedicated prefix for tests.
 */
export class S3ObjectStorageProvider implements ObjectStorageProvider {
  private readonly local = new LocalFilesystemObjectStorageProvider();
  private s3Client: { send: (cmd: unknown) => Promise<unknown> } | null = null;

  private async getClient() {
    if (this.s3Client) return this.s3Client;
    const env = loadEnv();
    if (!env.S3_BUCKET) {
      throw new Error('S3_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3');
    }
    try {
      const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import(
        '@aws-sdk/client-s3'
      );
      const client = new S3Client({
        region: env.AWS_REGION ?? 'us-east-1',
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: Boolean(env.S3_ENDPOINT),
      });
      this.s3Client = {
        send: async (cmd: unknown) => {
          if (cmd instanceof PutObjectCommand) {
            return client.send(cmd);
          }
          if (cmd instanceof GetObjectCommand) {
            return client.send(cmd);
          }
          if (cmd instanceof DeleteObjectCommand) {
            return client.send(cmd);
          }
          return client.send(cmd as never);
        },
      };
      return this.s3Client;
    } catch {
      return null;
    }
  }

  private prefixKey(key: string): string {
    return `s3-compat/${key}`;
  }

  async putObject(key: string, data: Buffer): Promise<void> {
    const env = loadEnv();
    const client = await this.getClient();
    if (!client || !env.S3_BUCKET) {
      await this.local.putObject(this.prefixKey(key), data);
      return;
    }
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: data,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const env = loadEnv();
    const client = await this.getClient();
    if (!client || !env.S3_BUCKET) {
      return this.local.getObject(this.prefixKey(key));
    }
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = (await client.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    )) as { Body?: { transformToByteArray: () => Promise<Uint8Array> } };
    const bytes = await res.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async deleteObject(key: string): Promise<void> {
    const env = loadEnv();
    const client = await this.getClient();
    if (!client || !env.S3_BUCKET) {
      await this.local.deleteObject(this.prefixKey(key));
      return;
    }
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}
