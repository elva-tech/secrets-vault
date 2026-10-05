import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { ApplicationStatus, MetadataVisibility } from '@vault/shared';

const metadataSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    visibility: {
      type: String,
      enum: Object.values(MetadataVisibility),
      default: MetadataVisibility.TENANT_VISIBLE,
    },
    restrictedRoleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  },
  { _id: true },
);

const applicationSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.ACTIVE,
      index: true,
    },
    metadata: { type: [metadataSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applicationSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
applicationSchema.index({ tenantId: 1, status: 1 });
applicationSchema.index({ tenantId: 1, createdAt: -1 });

export type ApplicationDocument = InferSchemaType<typeof applicationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ApplicationModel = mongoose.model('Application', applicationSchema);
