import mongoose from 'mongoose';
import { VaultItemStatus, VaultScope } from '@vault/shared';
import { VaultItemModel, type VaultItemDocument } from '../models/vault-item.model.js';

const active = { status: { $ne: VaultItemStatus.DELETED }, deletedAt: null };

export class VaultItemRepository {
  async findByIdWithinTenant(id: string, tenantId: string): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...active,
    }).exec();
  }

  async findApplicationSecretById(id: string, tenantId: string): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      vaultScope: VaultScope.APPLICATION,
      ...active,
    }).exec();
  }

  async findPersonalSecretById(
    id: string,
    tenantId: string,
    ownerId: string,
  ): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      vaultScope: VaultScope.PERSONAL,
      ownerId: new mongoose.Types.ObjectId(ownerId),
      ...active,
    }).exec();
  }

  async listByEnvironment(tenantId: string, environmentId: string): Promise<VaultItemDocument[]> {
    return VaultItemModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      environmentId: new mongoose.Types.ObjectId(environmentId),
      vaultScope: VaultScope.APPLICATION,
      ...active,
    })
      .sort({ name: 1 })
      .exec();
  }

  async listPersonal(tenantId: string, ownerId: string): Promise<VaultItemDocument[]> {
    return VaultItemModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      vaultScope: VaultScope.PERSONAL,
      ownerId: new mongoose.Types.ObjectId(ownerId),
      ...active,
    })
      .sort({ name: 1 })
      .exec();
  }

  async create(data: {
    tenantId: string;
    applicationId: string;
    environmentId: string;
    name: string;
    type: string;
    description?: string;
    ownerId: string;
    createdBy: string;
    visibility?: string;
  }): Promise<VaultItemDocument> {
    return VaultItemModel.create({
      ...data,
      vaultScope: VaultScope.APPLICATION,
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      applicationId: new mongoose.Types.ObjectId(data.applicationId),
      environmentId: new mongoose.Types.ObjectId(data.environmentId),
      ownerId: new mongoose.Types.ObjectId(data.ownerId),
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      updatedBy: new mongoose.Types.ObjectId(data.createdBy),
    });
  }

  async createPersonal(data: {
    tenantId: string;
    name: string;
    type: string;
    description?: string;
    ownerId: string;
    createdBy: string;
  }): Promise<VaultItemDocument> {
    return VaultItemModel.create({
      vaultScope: VaultScope.PERSONAL,
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      applicationId: null,
      environmentId: null,
      name: data.name,
      type: data.type,
      description: data.description,
      ownerId: new mongoose.Types.ObjectId(data.ownerId),
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      updatedBy: new mongoose.Types.ObjectId(data.createdBy),
    });
  }

  async updateRotation(
    id: string,
    tenantId: string,
    rotation: Record<string, unknown>,
    updatedBy: string,
  ): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        vaultScope: VaultScope.APPLICATION,
        ...active,
      },
      {
        rotation,
        updatedBy: new mongoose.Types.ObjectId(updatedBy),
      },
      { new: true },
    ).exec();
  }

  async setCurrentVersion(
    id: string,
    tenantId: string,
    versionId: string,
    versionNumber: number,
    updatedBy: string,
  ): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...active,
      },
      {
        currentVersionId: new mongoose.Types.ObjectId(versionId),
        currentVersionNumber: versionNumber,
        updatedBy: new mongoose.Types.ObjectId(updatedBy),
      },
      { new: true },
    ).exec();
  }

  async updateMetadata(
    id: string,
    tenantId: string,
    patch: { name?: string; description?: string; updatedBy: string },
  ): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...active,
      },
      {
        ...patch,
        updatedBy: new mongoose.Types.ObjectId(patch.updatedBy),
      },
      { new: true },
    ).exec();
  }

  async softDelete(id: string, tenantId: string, updatedBy: string): Promise<VaultItemDocument | null> {
    return VaultItemModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...active,
      },
      {
        status: VaultItemStatus.DELETED,
        deletedAt: new Date(),
        updatedBy: new mongoose.Types.ObjectId(updatedBy),
      },
      { new: true },
    ).exec();
  }
}
