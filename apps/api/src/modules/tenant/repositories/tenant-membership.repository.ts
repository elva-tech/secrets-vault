import { MembershipStatus } from '@vault/shared';
import {
  TenantMembershipModel,
  type TenantMembershipDocument,
} from '../models/tenant-membership.model.js';
import mongoose from 'mongoose';

export class TenantMembershipRepository {
  async findActiveMembership(
    tenantId: string,
    userId: string,
  ): Promise<TenantMembershipDocument | null> {
    return TenantMembershipModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
      status: MembershipStatus.ACTIVE,
    }).exec();
  }

  async findByTenantAndUser(
    tenantId: string,
    userId: string,
  ): Promise<TenantMembershipDocument | null> {
    return TenantMembershipModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
    }).exec();
  }

  async listByTenant(tenantId: string): Promise<TenantMembershipDocument[]> {
    return TenantMembershipModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async create(data: {
    tenantId: string;
    userId: string;
    roleIds: string[];
    status?: MembershipStatus;
  }): Promise<TenantMembershipDocument> {
    return TenantMembershipModel.create({
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      userId: new mongoose.Types.ObjectId(data.userId),
      roleIds: data.roleIds.map((id) => new mongoose.Types.ObjectId(id)),
      status: data.status ?? MembershipStatus.ACTIVE,
    });
  }

  async updateRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
  ): Promise<TenantMembershipDocument | null> {
    return TenantMembershipModel.findOneAndUpdate(
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { roleIds: roleIds.map((id) => new mongoose.Types.ObjectId(id)) },
      { new: true },
    ).exec();
  }
}
