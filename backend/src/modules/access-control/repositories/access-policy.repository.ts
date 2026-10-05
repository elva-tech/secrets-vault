import mongoose from 'mongoose';
import { PolicyResourceType } from '@vault/shared';
import { AccessPolicyModel, type AccessPolicyDocument } from '../models/access-policy.model.js';

export class AccessPolicyRepository {
  async findForResource(
    tenantId: string,
    resourceType: PolicyResourceType,
    resourceId: string,
  ): Promise<AccessPolicyDocument | null> {
    return AccessPolicyModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      resourceType,
      resourceId: new mongoose.Types.ObjectId(resourceId),
    }).exec();
  }

  async upsert(
    tenantId: string,
    resourceType: PolicyResourceType,
    resourceId: string,
    patch: Partial<AccessPolicyDocument>,
  ): Promise<AccessPolicyDocument> {
    return AccessPolicyModel.findOneAndUpdate(
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        resourceType,
        resourceId: new mongoose.Types.ObjectId(resourceId),
      },
      {
        $set: {
          ...patch,
          tenantId: new mongoose.Types.ObjectId(tenantId),
          resourceType,
          resourceId: new mongoose.Types.ObjectId(resourceId),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec() as Promise<AccessPolicyDocument>;
  }
}
