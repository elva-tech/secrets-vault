import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { NonOwnerBehavior, PolicyResourceType } from '@vault/shared';

const ruleSchema = new Schema(
  {
    roleId: { type: Schema.Types.ObjectId, ref: 'Role' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    behavior: { type: String, enum: Object.values(NonOwnerBehavior), required: true },
  },
  { _id: false },
);

const accessPolicySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    resourceType: { type: String, enum: Object.values(PolicyResourceType), required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    ownerAccess: { type: String, enum: Object.values(NonOwnerBehavior), default: NonOwnerBehavior.ALLOW },
    nonOwnerBehavior: {
      type: String,
      enum: Object.values(NonOwnerBehavior),
      default: NonOwnerBehavior.APPROVAL_REQUIRED,
    },
    roleAccess: [ruleSchema],
    userAccess: [ruleSchema],
    applicationMembersBehavior: {
      type: String,
      enum: Object.values(NonOwnerBehavior),
      default: NonOwnerBehavior.APPROVAL_REQUIRED,
    },
    approvalRequired: { type: Boolean, default: true },
    approvalTimeoutMinutes: { type: Number, default: 60 },
    grantDurationMinutes: { type: Number, default: 60 },
    allowReveal: { type: Boolean, default: true },
    allowCopy: { type: Boolean, default: true },
    allowDownload: { type: Boolean, default: true },
  },
  { timestamps: true },
);

accessPolicySchema.index({ tenantId: 1, resourceType: 1, resourceId: 1 }, { unique: true });

export type AccessPolicyDocument = InferSchemaType<typeof accessPolicySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AccessPolicyModel = mongoose.model('AccessPolicy', accessPolicySchema);
