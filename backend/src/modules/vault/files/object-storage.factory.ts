import { loadEnv } from '../../../config/env.js';
import type { ObjectStorageProvider } from './object-storage.types.js';
import { LocalFilesystemObjectStorageProvider } from './local-object-storage.provider.js';
import { S3ObjectStorageProvider } from './s3-object-storage.provider.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.provider.js';

let storage: ObjectStorageProvider | null = null;

export function getObjectStorageProvider(): ObjectStorageProvider {
  if (!storage) {
    const { OBJECT_STORAGE_PROVIDER } = loadEnv();
    if (OBJECT_STORAGE_PROVIDER === 's3') {
      storage = new S3ObjectStorageProvider();
    } else if (OBJECT_STORAGE_PROVIDER === 'cloudinary') {
      storage = new CloudinaryObjectStorageProvider();
    } else {
      storage = new LocalFilesystemObjectStorageProvider();
    }
  }
  return storage;
}

export function resetObjectStorageProviderCache(): void {
  storage = null;
}
