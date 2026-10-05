import mongoose from 'mongoose';
import { ApplicationStatus } from '@vault/shared';
import { ApplicationModel, type ApplicationDocument } from '../models/application.model.js';

const activeFilter = {
  status: { $ne: ApplicationStatus.DELETED },
  deletedAt: null,
};

export class ApplicationRepository {
  async findByIdWithinTenant(
    id: string,
    tenantId: string,
    includeDeleted = false,
  ): Promise<ApplicationDocument | null> {
    const filter: Record<string, unknown> = {
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    };
    if (!includeDeleted) {
      Object.assign(filter, activeFilter);
    }
    return ApplicationModel.findOne(filter).exec();
  }

  async findBySlugWithinTenant(
    slug: string,
    tenantId: string,
  ): Promise<ApplicationDocument | null> {
    return ApplicationModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      slug: slug.toLowerCase(),
      ...activeFilter,
    }).exec();
  }

  async listByTenant(tenantId: string, search?: string): Promise<ApplicationDocument[]> {
    const filter: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...activeFilter,
    };
    if (search?.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { slug: { $regex: q, $options: 'i' } },
      ];
    }
    return ApplicationModel.find(filter).sort({ name: 1 }).exec();
  }

  async create(data: {
    tenantId: string;
    name: string;
    slug: string;
    description?: string;
    ownerId: string;
    createdBy: string;
    metadata?: unknown[];
  }): Promise<ApplicationDocument> {
    return ApplicationModel.create({
      ...data,
      slug: data.slug.toLowerCase(),
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      ownerId: new mongoose.Types.ObjectId(data.ownerId),
      createdBy: new mongoose.Types.ObjectId(data.createdBy),
      updatedBy: new mongoose.Types.ObjectId(data.createdBy),
      status: ApplicationStatus.ACTIVE,
    });
  }

  async updateWithinTenant(
    id: string,
    tenantId: string,
    patch: Partial<{
      name: string;
      description: string;
      ownerId: string;
      metadata: unknown[];
      status: ApplicationStatus;
      updatedBy: string;
    }>,
  ): Promise<ApplicationDocument | null> {
    const update: Record<string, unknown> = { ...patch };
    if (patch.ownerId) {
      update.ownerId = new mongoose.Types.ObjectId(patch.ownerId);
    }
    if (patch.updatedBy) {
      update.updatedBy = new mongoose.Types.ObjectId(patch.updatedBy);
    }
    return ApplicationModel.findOneAndUpdate(
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
  ): Promise<ApplicationDocument | null> {
    return ApplicationModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...activeFilter,
      },
      {
        status: ApplicationStatus.DELETED,
        deletedAt: new Date(),
        updatedBy: new mongoose.Types.ObjectId(updatedBy),
      },
      { new: true },
    ).exec();
  }
}
