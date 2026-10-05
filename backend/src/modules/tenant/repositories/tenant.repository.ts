import { TenantStatus } from '@vault/shared';
import { TenantModel, type TenantDocument } from '../models/tenant.model.js';

export class TenantRepository {
  async findBySlug(slug: string): Promise<TenantDocument | null> {
    return TenantModel.findOne({ slug: slug.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<TenantDocument | null> {
    return TenantModel.findById(id).exec();
  }

  async listAll(): Promise<TenantDocument[]> {
    return TenantModel.find().sort({ createdAt: -1 }).exec();
  }

  async create(data: {
    name: string;
    slug: string;
    primaryDomain: string;
    status?: TenantStatus;
    plan?: string;
    settings?: Record<string, unknown>;
  }): Promise<TenantDocument> {
    return TenantModel.create({
      ...data,
      slug: data.slug.toLowerCase(),
      status: data.status ?? TenantStatus.PENDING,
    });
  }

  async updateStatus(id: string, status: TenantStatus): Promise<TenantDocument | null> {
    return TenantModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
  }

  async updateById(
    id: string,
    patch: Partial<Pick<TenantDocument, 'name' | 'settings' | 'plan' | 'primaryDomain'>>,
  ): Promise<TenantDocument | null> {
    return TenantModel.findByIdAndUpdate(id, patch, { new: true }).exec();
  }
}
