import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { AuditAction, AuditResult } from '@vault/shared';

const auditLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, enum: Object.values(AuditAction), required: true, index: true },
    resourceType: { type: String, default: null, index: true },
    resourceId: { type: Schema.Types.ObjectId, default: null, index: true },
    resourceName: { type: String, default: null },
    applicationId: { type: Schema.Types.ObjectId, default: null, index: true },
    environmentId: { type: Schema.Types.ObjectId, default: null, index: true },
    targetUserId: { type: Schema.Types.ObjectId, default: null },
    result: { type: String, enum: Object.values(AuditResult), required: true, index: true },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    requestId: { type: String, default: null, index: true },
    additionalMetadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);
