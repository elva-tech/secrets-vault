import { loadEnv } from '../../../config/env.js';
import type { ObjectStorageProvider } from './object-storage.types.js';
import { LocalFilesystemObjectStorageProvider } from './local-object-storage.provider.js';
import { S3ObjectStorageProvider } from './s3-object-storage.provider.js';

let storage: ObjectStorageProvider | null = null;

export function getObjectStorageProvider(): ObjectStorageProvider {
  if (!storage) {
    const { OBJECT_STORAGE_PROVIDER } = loadEnv();
    storage =
      OBJECT_STORAGE_PROVIDER === 's3'
        ? new S3ObjectStorageProvider()
        : new LocalFilesystemObjectStorageProvider();
  }
  return storage;
}
