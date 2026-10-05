import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { VaultFileStatus, VaultScope } from '@vault/shared';

const vaultFileSchema = new Schema(
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
    originalFilename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storageKey: { type: String, required: true, unique: true },
    envelope: {
      provider: { type: String, required: true },
      keyId: { type: String, required: true },
      algorithm: { type: String, required: true },
      ciphertext: { type: String, default: '' },
      encryptedDek: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true },
    },
    status: {
      type: String,
      enum: Object.values(VaultFileStatus),
      default: VaultFileStatus.ACTIVE,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vaultFileSchema.index({ tenantId: 1, environmentId: 1, status: 1 });
vaultFileSchema.index({ tenantId: 1, ownerId: 1, vaultScope: 1, status: 1 });

export type VaultFileDocument = InferSchemaType<typeof vaultFileSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const VaultFileModel = mongoose.model('VaultFile', vaultFileSchema);
