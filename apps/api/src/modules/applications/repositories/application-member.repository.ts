import mongoose from 'mongoose';
import { ApplicationMemberRole } from '@vault/shared';
import {
  ApplicationMemberModel,
  type ApplicationMemberDocument,
} from '../models/application-member.model.js';

export class ApplicationMemberRepository {
  async listByApplication(
    tenantId: string,
    applicationId: string,
  ): Promise<ApplicationMemberDocument[]> {
    return ApplicationMemberModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      applicationId: new mongoose.Types.ObjectId(applicationId),
    }).exec();
  }

  async findMembership(
    tenantId: string,
    applicationId: string,
    userId: string,
  ): Promise<ApplicationMemberDocument | null> {
    return ApplicationMemberModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      applicationId: new mongoose.Types.ObjectId(applicationId),
      userId: new mongoose.Types.ObjectId(userId),
    }).exec();
  }

  async upsertMember(data: {
    tenantId: string;
    applicationId: string;
    userId: string;
    role: ApplicationMemberRole;
  }): Promise<ApplicationMemberDocument> {
    return ApplicationMemberModel.findOneAndUpdate(
      {
        tenantId: new mongoose.Types.ObjectId(data.tenantId),
        applicationId: new mongoose.Types.ObjectId(data.applicationId),
        userId: new mongoose.Types.ObjectId(data.userId),
      },
      { role: data.role },
      { upsert: true, new: true },
    ).exec() as Promise<ApplicationMemberDocument>;
  }

  async removeMember(
    tenantId: string,
    applicationId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await ApplicationMemberModel.deleteOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      applicationId: new mongoose.Types.ObjectId(applicationId),
      userId: new mongoose.Types.ObjectId(userId),
    }).exec();
    return result.deletedCount > 0;
  }

  async countOwners(applicationId: string, tenantId: string): Promise<number> {
    return ApplicationMemberModel.countDocuments({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      applicationId: new mongoose.Types.ObjectId(applicationId),
      role: ApplicationMemberRole.OWNER,
    }).exec();
  }
}
