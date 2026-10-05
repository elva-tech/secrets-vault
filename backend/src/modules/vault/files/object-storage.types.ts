export interface ObjectStorageProvider {
  putObject(key: string, data: Buffer): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
