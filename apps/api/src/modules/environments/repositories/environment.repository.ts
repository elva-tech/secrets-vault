import mongoose from 'mongoose';
import { EnvironmentStatus } from '@vault/shared';
import { EnvironmentModel, type EnvironmentDocument } from '../models/environment.model.js';

const activeFilter = {
  status: { $ne: EnvironmentStatus.DELETED },
  deletedAt: null,
};

export class EnvironmentRepository {
  async findByIdWithinTenant(
    id: string,
    tenantId: string,
  ): Promise<EnvironmentDocument | null> {
    return EnvironmentModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...activeFilter,
    }).exec();
  }

  async listByApplication(
    tenantId: string,
    applicationId: string,
  ): Promise<EnvironmentDocument[]> {
    return EnvironmentModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      applicationId: new mongoose.Types.ObjectId(applicationId),
      ...activeFilter,
    })
      .sort({ name: 1 })
      .exec();
  }

  async create(data: {
    tenantId: string;
    applicationId: string;
    name: string;
    slug: string;
    description?: string;
    createdBy: string;
  }): Promise<EnvironmentDocument> {
    return EnvironmentModel.create({
      ...data,
      slug: data.slug.toLowerCase(),
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      applicationId: new mongoose.Types.ObjectId(data.applicationId),
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      updatedBy: new mongoose.Types.ObjectId(data.createdBy),
      status: EnvironmentStatus.ACTIVE,
    });
  }

  async updateWithinTenant(
    id: string,
    tenantId: string,
    patch: Partial<{
      name: string;
      description: string;
      status: EnvironmentStatus;
      updatedBy: string;
    }>,
  ): Promise<EnvironmentDocument | null> {
    const update: Record<string, unknown> = { ...patch };
    if (patch.updatedBy) {
      update.updatedBy = new mongoose.Types.ObjectId(patch.updatedBy);
    }
    return EnvironmentModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...activeFilter,
      },
      update,
      { new: true },
    ).exec();
  }

  async softDeleteWithinTenant(
    id: string,
    tenantId: string,
    updatedBy: string,
  ): Promise<EnvironmentDocument | null> {
    return EnvironmentModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...activeFilter,
      },
      {
        status: EnvironmentStatus.DELETED,
        deletedAt: new Date(),
        updatedBy: new mongoose.Types.ObjectId(updatedBy),
      },
      { new: true },
    ).exec();
  }
}
