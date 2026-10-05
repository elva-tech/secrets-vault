import mongoose from 'mongoose';
import { AccessGrantStatus } from '@vault/shared';
import { AccessGrantModel, type AccessGrantDocument } from '../models/access-grant.model.js';

export class AccessGrantRepository {
  async findActiveForUserResource(
    tenantId: string,
    userId: string,
    resourceId: string,
    permission: string,
  ): Promise<AccessGrantDocument | null> {
    const now = new Date();
    return AccessGrantModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
      status: AccessGrantStatus.ACTIVE,
      expiresAt: { $gt: now },
      resourceIds: new mongoose.Types.ObjectId(resourceId),
      permissions: permission,
    }).exec();
  }

  async create(data: {
    tenantId: string;
    accessRequestId: string;
    userId: string;
    applicationId: string;
    environmentId: string;
    resourceIds: string[];
    resourceType: string;
    permissions: string[];
    grantedBy: string;
    grantedAt: Date;
    expiresAt: Date;
  }): Promise<AccessGrantDocument> {
    return AccessGrantModel.create({
      ...data,
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      accessRequestId: new mongoose.Types.ObjectId(data.accessRequestId),
      userId: new mongoose.Types.ObjectId(data.userId),
      applicationId: new mongoose.Types.ObjectId(data.applicationId),
      environmentId: new mongoose.Types.ObjectId(data.environmentId),
      resourceIds: data.resourceIds.map((id) => new mongoose.Types.ObjectId(id)),
      grantedBy: new mongoose.Types.ObjectId(data.grantedBy),
    });
  }

  async findByIdWithinTenant(id: string, tenantId: string): Promise<AccessGrantDocument | null> {
    return AccessGrantModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async revoke(id: string, tenantId: string): Promise<AccessGrantDocument | null> {
    return AccessGrantModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        status: AccessGrantStatus.ACTIVE,
      },
      { status: AccessGrantStatus.REVOKED },
      { new: true },
    ).exec();
  }

  async listActiveForUser(tenantId: string, userId: string): Promise<AccessGrantDocument[]> {
    const now = new Date();
    return AccessGrantModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
      status: AccessGrantStatus.ACTIVE,
      expiresAt: { $gt: now },
    }).exec();
  }
}
