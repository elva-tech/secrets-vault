import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { AccessRequestStatus } from '@vault/shared';

const accessRequestSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    environmentId: { type: Schema.Types.ObjectId, ref: 'Environment', required: true },
    resourceIds: [{ type: Schema.Types.ObjectId, required: true }],
    resourceType: { type: String, enum: ['SECRET', 'FILE'], required: true },
    permissions: [{ type: String, required: true }],
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: Object.values(AccessRequestStatus),
      default: AccessRequestStatus.PENDING,
      index: true,
    },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    otpId: { type: Schema.Types.ObjectId, ref: 'Otp', default: null },
    grantId: { type: Schema.Types.ObjectId, ref: 'AccessGrant', default: null },
  },
  { timestamps: true },
);

accessRequestSchema.index({ tenantId: 1, requesterId: 1, status: 1 });
accessRequestSchema.index({ tenantId: 1, ownerId: 1, status: 1 });

export type AccessRequestDocument = InferSchemaType<typeof accessRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AccessRequestModel = mongoose.model('AccessRequest', accessRequestSchema);
