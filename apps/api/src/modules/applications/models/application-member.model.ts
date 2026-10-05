import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { ApplicationMemberRole } from '@vault/shared';

const applicationMemberSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(ApplicationMemberRole),
      required: true,
    },
  },
  { timestamps: true },
);

applicationMemberSchema.index({ applicationId: 1, userId: 1 }, { unique: true });
applicationMemberSchema.index({ tenantId: 1, applicationId: 1 });
applicationMemberSchema.index({ tenantId: 1, userId: 1 });

export type ApplicationMemberDocument = InferSchemaType<typeof applicationMemberSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ApplicationMemberModel = mongoose.model(
  'ApplicationMember',
  applicationMemberSchema,
);
