import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { MembershipStatus } from '@vault/shared';

const tenantMembershipSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(MembershipStatus),
      default: MembershipStatus.ACTIVE,
      index: true,
    },
    roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

tenantMembershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
tenantMembershipSchema.index({ userId: 1, status: 1 });

export type TenantMembershipDocument = InferSchemaType<typeof tenantMembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TenantMembershipModel = mongoose.model(
  'TenantMembership',
  tenantMembershipSchema,
);
