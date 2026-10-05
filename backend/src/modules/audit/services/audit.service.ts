import mongoose from 'mongoose';
import { AuditAction, AuditResult } from '@vault/shared';
import { AuditLogModel } from '../models/audit-log.model.js';

export type AuditRecordInput = {
  tenantId: string;
  actorId: string;
  action: AuditAction;
  result: AuditResult;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  applicationId?: string;
  environmentId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  additionalMetadata?: Record<string, unknown>;
};

const SENSITIVE_KEYS = /password|secret|token|otp|apikey|api_key|plaintext|ciphertext|encrypted/i;

function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    if (typeof value === 'string' && value.length > 500) {
      out[key] = '[truncated]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

export class AuditService {
  async record(input: AuditRecordInput): Promise<void> {
    await AuditLogModel.create({
      tenantId: new mongoose.Types.ObjectId(input.tenantId),
      actorId: new mongoose.Types.ObjectId(input.actorId),
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ? new mongoose.Types.ObjectId(input.resourceId) : null,
      resourceName: input.resourceName ?? null,
      applicationId: input.applicationId ? new mongoose.Types.ObjectId(input.applicationId) : null,
      environmentId: input.environmentId ? new mongoose.Types.ObjectId(input.environmentId) : null,
      targetUserId: input.targetUserId ? new mongoose.Types.ObjectId(input.targetUserId) : null,
      result: input.result,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      additionalMetadata: sanitizeMetadata(input.additionalMetadata ?? {}),
    });
  }

  async list(
    tenantId: string,
    filters: {
      action?: string;
      actorId?: string;
      resourceType?: string;
      applicationId?: string;
      environmentId?: string;
      result?: string;
      from?: Date;
      to?: Date;
      page: number;
      limit: number;
    },
  ) {
    const query: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
    };
    if (filters.action) query.action = filters.action;
    if (filters.actorId) query.actorId = new mongoose.Types.ObjectId(filters.actorId);
    if (filters.resourceType) query.resourceType = filters.resourceType;
    if (filters.applicationId) query.applicationId = new mongoose.Types.ObjectId(filters.applicationId);
    if (filters.environmentId) query.environmentId = new mongoose.Types.ObjectId(filters.environmentId);
    if (filters.result) query.result = filters.result;
    if (filters.from || filters.to) {
      query.createdAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }
    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).exec(),
      AuditLogModel.countDocuments(query),
    ]);
    return {
      total,
      page: filters.page,
      limit: filters.limit,
      items: items.map((row) => ({
        id: row._id.toString(),
        action: row.action,
        actorId: row.actorId.toString(),
        resourceType: row.resourceType,
        resourceId: row.resourceId?.toString() ?? null,
        resourceName: row.resourceName,
        applicationId: row.applicationId?.toString() ?? null,
        environmentId: row.environmentId?.toString() ?? null,
        targetUserId: row.targetUserId?.toString() ?? null,
        result: row.result,
        requestId: row.requestId,
        createdAt: row.createdAt,
        additionalMetadata: row.additionalMetadata,
      })),
    };
  }

  async getById(tenantId: string, id: string) {
    const row = await AuditLogModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
    if (!row) return null;
    return {
      id: row._id.toString(),
      action: row.action,
      actorId: row.actorId.toString(),
      resourceType: row.resourceType,
      resourceId: row.resourceId?.toString() ?? null,
      resourceName: row.resourceName,
      applicationId: row.applicationId?.toString() ?? null,
      environmentId: row.environmentId?.toString() ?? null,
      targetUserId: row.targetUserId?.toString() ?? null,
      result: row.result,
      requestId: row.requestId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      additionalMetadata: row.additionalMetadata,
    };
  }
}
