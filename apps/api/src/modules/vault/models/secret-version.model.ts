import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const secretVersionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    secretId: { type: Schema.Types.ObjectId, ref: 'VaultItem', required: true, index: true },
    versionNumber: { type: Number, required: true },
    envelope: {
      provider: { type: String, required: true },
      keyId: { type: String, required: true },
      algorithm: { type: String, required: true },
      ciphertext: { type: String, required: true },
      encryptedDek: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, default: '', trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

secretVersionSchema.index({ secretId: 1, versionNumber: 1 }, { unique: true });
secretVersionSchema.index({ tenantId: 1, secretId: 1 });

export type SecretVersionDocument = InferSchemaType<typeof secretVersionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SecretVersionModel = mongoose.model('SecretVersion', secretVersionSchema);
