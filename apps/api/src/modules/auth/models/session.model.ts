import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const sessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    scope: {
      type: String,
      enum: ['platform', 'tenant'],
      required: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    terminatedAt: { type: Date, default: null },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

sessionSchema.index({ sessionId: 1, terminatedAt: 1, expiresAt: 1 });

export type SessionDocument = InferSchemaType<typeof sessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SessionModel = mongoose.model('Session', sessionSchema);
