import mongoose from 'mongoose';
import type { EncryptedEnvelope } from '../encryption/encryption.types.js';
import { SecretVersionModel, type SecretVersionDocument } from '../models/secret-version.model.js';

export class SecretVersionRepository {
  async createVersion(data: {
    tenantId: string;
    secretId: string;
    versionNumber: number;
    envelope: EncryptedEnvelope;
    createdBy: string;
    reason?: string;
  }): Promise<SecretVersionDocument> {
    return SecretVersionModel.create({
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      secretId: new mongoose.Types.ObjectId(data.secretId),
      versionNumber: data.versionNumber,
      envelope: data.envelope,
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      reason: data.reason ?? '',
    });
  }

  async findByIdWithinTenant(
    versionId: string,
    tenantId: string,
  ): Promise<SecretVersionDocument | null> {
    return SecretVersionModel.findOne({
      _id: new mongoose.Types.ObjectId(versionId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async findBySecretAndNumber(
    tenantId: string,
    secretId: string,
    versionNumber: number,
  ): Promise<SecretVersionDocument | null> {
    return SecretVersionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      secretId: new mongoose.Types.ObjectId(secretId),
      versionNumber,
    }).exec();
  }

  async listBySecret(tenantId: string, secretId: string): Promise<SecretVersionDocument[]> {
    return SecretVersionModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      secretId: new mongoose.Types.ObjectId(secretId),
    })
      .sort({ versionNumber: -1 })
      .exec();
  }

  async nextVersionNumber(tenantId: string, secretId: string): Promise<number> {
    const latest = await SecretVersionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      secretId: new mongoose.Types.ObjectId(secretId),
    })
      .sort({ versionNumber: -1 })
      .exec();
    return (latest?.versionNumber ?? 0) + 1;
  }
}
