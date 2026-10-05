import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { MetadataVisibility } from '@vault/shared';
import { RotationMode, RotationStatus, RotationType, VaultItemStatus, VaultItemType, VaultScope } from '@vault/shared';

const rotationSchema = new Schema(
  {
    rotationEnabled: { type: Boolean, default: false },
    rotationType: { type: String, enum: Object.values(RotationType), default: RotationType.NO_EXPIRY },
    customRotationDate: { type: Date, default: null },
    lastRotatedAt: { type: Date, default: null },
    nextRotationAt: { type: Date, default: null },
    rotationMode: { type: String, enum: Object.values(RotationMode), default: RotationMode.MANUAL },
    rotationStatus: { type: String, enum: Object.values(RotationStatus), default: RotationStatus.NONE },
  },
  { _id: false },
);

const vaultItemSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    vaultScope: {
      type: String,
      enum: Object.values(VaultScope),
      default: VaultScope.APPLICATION,
      index: true,
    },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null, index: true },
    environmentId: { type: Schema.Types.ObjectId, ref: 'Environment', default: null, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(VaultItemType), required: true, index: true },
    description: { type: String, default: '', trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    visibility: {
      type: String,
      enum: Object.values(MetadataVisibility),
      default: MetadataVisibility.TENANT_VISIBLE,
    },
    accessPolicyId: { type: Schema.Types.ObjectId, default: null },
    rotationPolicyId: { type: Schema.Types.ObjectId, default: null },
    currentVersionId: { type: Schema.Types.ObjectId, ref: 'SecretVersion', default: null },
    currentVersionNumber: { type: Number, default: 1 },
    status: {
      type: String,
      enum: Object.values(VaultItemStatus),
      default: VaultItemStatus.ACTIVE,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
    rotation: { type: rotationSchema, default: () => ({}) },
  },
  { timestamps: true },
);

vaultItemSchema.index({ tenantId: 1, environmentId: 1, status: 1 });
vaultItemSchema.index({ tenantId: 1, applicationId: 1, environmentId: 1 });
vaultItemSchema.index({ tenantId: 1, ownerId: 1, vaultScope: 1, status: 1 });
vaultItemSchema.index(
  { tenantId: 1, environmentId: 1, name: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $ne: VaultItemStatus.DELETED },
      vaultScope: VaultScope.APPLICATION,
    },
  },
);
vaultItemSchema.index(
  { tenantId: 1, ownerId: 1, name: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $ne: VaultItemStatus.DELETED },
      vaultScope: VaultScope.PERSONAL,
    },
  },
);

export type VaultItemDocument = InferSchemaType<typeof vaultItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const VaultItemModel = mongoose.model('VaultItem', vaultItemSchema);
