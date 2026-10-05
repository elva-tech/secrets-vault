import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { TenantStatus } from '@vault/shared';

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TenantStatus),
      default: TenantStatus.PENDING,
      index: true,
    },
    primaryDomain: { type: String, required: true, trim: true },
    settings: { type: Schema.Types.Mixed, default: {} },
    plan: { type: String, default: 'standard' },
  },
  { timestamps: true },
);

tenantSchema.index({ slug: 1, status: 1 });

export type TenantDocument = InferSchemaType<typeof tenantSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TenantModel = mongoose.model('Tenant', tenantSchema);
