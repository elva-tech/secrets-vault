import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { OtpStatus } from '@vault/shared';

const otpSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    accessRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'AccessRequest',
      required: true,
      unique: true,
      index: true,
    },
    hashedCode: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: true },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    verifiedAt: { type: Date, default: null },
    status: { type: String, enum: Object.values(OtpStatus), default: OtpStatus.ACTIVE, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type OtpDocument = InferSchemaType<typeof otpSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const OtpModel = mongoose.model('Otp', otpSchema);
