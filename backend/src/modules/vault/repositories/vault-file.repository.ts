import mongoose from 'mongoose';
import { VaultFileStatus, VaultScope } from '@vault/shared';
import type { EncryptedEnvelope } from '../encryption/encryption.types.js';
import { VaultFileModel, type VaultFileDocument } from '../models/vault-file.model.js';

const active = { status: { $ne: VaultFileStatus.DELETED }, deletedAt: null };

export class VaultFileRepository {
  async findByIdWithinTenant(id: string, tenantId: string): Promise<VaultFileDocument | null> {
    return VaultFileModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...active,
    }).exec();
  }

  async findApplicationFileById(id: string, tenantId: string): Promise<VaultFileDocument | null> {
    return VaultFileModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      vaultScope: VaultScope.APPLICATION,
      ...active,
    }).exec();
  }

  async findPersonalFileById(
    id: string,
    tenantId: string,
    ownerId: string,
  ): Promise<VaultFileDocument | null> {
    return VaultFileModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      vaultScope: VaultScope.PERSONAL,
      ownerId: new mongoose.Types.ObjectId(ownerId),
      ...active,
    }).exec();
  }

  async listByEnvironment(tenantId: string, environmentId: string): Promise<VaultFileDocument[]> {
    return VaultFileModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      environmentId: new mongoose.Types.ObjectId(environmentId),
      vaultScope: VaultScope.APPLICATION,
      ...active,
    })
      .sort({ name: 1 })
      .exec();
  }

  async listPersonal(tenantId: string, ownerId: string): Promise<VaultFileDocument[]> {
    return VaultFileModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      vaultScope: VaultScope.PERSONAL,
      ownerId: new mongoose.Types.ObjectId(ownerId),
      ...active,
    })
      .sort({ name: 1 })
      .exec();
  }

  async create(data: {
    id?: string;
    tenantId: string;
    applicationId: string;
    environmentId: string;
    name: string;
    originalFilename: string;
    mimeType: string;
    size: number;
    ownerId: string;
    storageKey: string;
    envelope: EncryptedEnvelope;
    createdBy: string;
  }): Promise<VaultFileDocument> {
    const { id, ...rest } = data;
    return VaultFileModel.create({
      ...rest,
      vaultScope: VaultScope.APPLICATION,
      ...(id ? { _id: new mongoose.Types.ObjectId(id) } : {}),
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      applicationId: new mongoose.Types.ObjectId(data.applicationId),
      environmentId: new mongoose.Types.ObjectId(data.environmentId),
      ownerId: new mongoose.Types.ObjectId(data.ownerId),
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      updatedBy: new mongoose.Types.ObjectId(data.createdBy),
    });
  }

  async createPersonal(data: {
    id?: string;
    tenantId: string;
    name: string;
    originalFilename: string;
    mimeType: string;
    size: number;
    ownerId: string;
    storageKey: string;
    envelope: EncryptedEnvelope;
    createdBy: string;
  }): Promise<VaultFileDocument> {
    const { id, ...rest } = data;
    return VaultFileModel.create({
      ...rest,
      vaultScope: VaultScope.PERSONAL,
      ...(id ? { _id: new mongoose.Types.ObjectId(id) } : {}),
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      applicationId: null,
      environmentId: null,
      ownerId: new mongoose.Types.ObjectId(data.ownerId),
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      updatedBy: new mongoose.Types.ObjectId(data.createdBy),
    });
  }

  async softDelete(id: string, tenantId: string, updatedBy: string): Promise<VaultFileDocument | null> {
    return VaultFileModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...active,
      },
      {
        status: VaultFileStatus.DELETED,
        deletedAt: new Date(),
        updatedBy: new mongoose.Types.ObjectId(updatedBy),
      },
      { new: true },
    ).exec();
  }
}
