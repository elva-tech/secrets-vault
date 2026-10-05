import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { AccessGrantStatus } from '@vault/shared';

const accessGrantSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    accessRequestId: { type: Schema.Types.ObjectId, ref: 'AccessRequest', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    environmentId: { type: Schema.Types.ObjectId, ref: 'Environment', required: true },
    resourceIds: [{ type: Schema.Types.ObjectId, required: true }],
    resourceType: { type: String, enum: ['SECRET', 'FILE'], required: true },
    permissions: [{ type: String }],
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    grantedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(AccessGrantStatus),
      default: AccessGrantStatus.ACTIVE,
      index: true,
    },
  },
  { timestamps: true },
);

accessGrantSchema.index({ tenantId: 1, userId: 1, status: 1 });

export type AccessGrantDocument = InferSchemaType<typeof accessGrantSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AccessGrantModel = mongoose.model('AccessGrant', accessGrantSchema);
