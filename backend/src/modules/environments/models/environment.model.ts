import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { EnvironmentStatus } from '@vault/shared';

const environmentSchema = new Schema(
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
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    policyId: { type: Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: Object.values(EnvironmentStatus),
      default: EnvironmentStatus.ACTIVE,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

environmentSchema.index({ applicationId: 1, slug: 1 }, { unique: true });
environmentSchema.index({ tenantId: 1, applicationId: 1 });
environmentSchema.index({ applicationId: 1, tenantId: 1, status: 1 });

export type EnvironmentDocument = InferSchemaType<typeof environmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const EnvironmentModel = mongoose.model('Environment', environmentSchema);
