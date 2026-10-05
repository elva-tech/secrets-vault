import mongoose from 'mongoose';
import { AccessRequestStatus, AccessGrantStatus, PolicyResourceType } from '@vault/shared';
import { loadEnv } from '../../../config/env.js';
import { AccessRequestModel } from '../models/access-request.model.js';
import { AccessGrantRepository } from '../repositories/access-grant.repository.js';
import { VaultScopeService } from '../../vault/services/vault-scope.service.js';
import { VaultItemRepository } from '../../vault/repositories/vault-item.repository.js';
import { VaultFileRepository } from '../../vault/repositories/vault-file.repository.js';
import { OtpService } from './otp.service.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { emitSecurityEvent } from '../events/security-events.js';
import { AccessControlError } from './access-control.error.js';
import { AccessPolicyService } from './access-policy.service.js';

const ACTIVE_DUPLICATE_STATUSES = [
  AccessRequestStatus.PENDING,
  AccessRequestStatus.APPROVED,
  AccessRequestStatus.OTP_GENERATED,
];

export class AccessRequestService {
  constructor(
    private readonly scope = new VaultScopeService(),
    private readonly secrets = new VaultItemRepository(),
    private readonly files = new VaultFileRepository(),
    private readonly otp = new OtpService(),
    private readonly grants = new AccessGrantRepository(),
    private readonly notifications = new NotificationService(),
    private readonly policies = new AccessPolicyService(),
  ) {}

  async create(input: {
    tenantId: string;
    requesterId: string;
    applicationId: string;
    environmentId: string;
    resourceType: 'SECRET' | 'FILE';
    resourceIds: string[];
    reason: string;
    permissions: string[];
  }) {
    await this.scope.assertEnvironmentInTenant(input.tenantId, input.environmentId, input.applicationId);
    const ownerId = await this.resolveOwner(input);
    const normalizedIds = [...new Set(input.resourceIds)].sort();
    await this.validateResources(input.tenantId, input.applicationId, input.environmentId, input.resourceType, normalizedIds);

    const pending = await AccessRequestModel.find({
      tenantId: new mongoose.Types.ObjectId(input.tenantId),
      requesterId: new mongoose.Types.ObjectId(input.requesterId),
      environmentId: new mongoose.Types.ObjectId(input.environmentId),
      status: { $in: ACTIVE_DUPLICATE_STATUSES },
    }).exec();
    const scopeKey = normalizedIds.join(',');
    if (
      pending.some(
        (p) =>
          p.resourceIds.map((id) => id.toString()).sort().join(',') === scopeKey,
      )
    ) {
      throw new AccessControlError('DUPLICATE_REQUEST', 'Active request already exists for this scope');
    }

    const request = await AccessRequestModel.create({
      tenantId: new mongoose.Types.ObjectId(input.tenantId),
      requesterId: new mongoose.Types.ObjectId(input.requesterId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
      applicationId: new mongoose.Types.ObjectId(input.applicationId),
      environmentId: new mongoose.Types.ObjectId(input.environmentId),
      resourceIds: normalizedIds.map((id) => new mongoose.Types.ObjectId(id)),
      resourceType: input.resourceType,
      permissions: input.permissions,
      reason: input.reason,
      status: AccessRequestStatus.PENDING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    emitSecurityEvent({
      type: 'ACCESS_REQUESTED',
      tenantId: input.tenantId,
      userId: input.requesterId,
      resourceIds: normalizedIds,
      accessRequestId: request._id.toString(),
      timestamp: new Date(),
    });

    await this.notifications.send({
      event: 'ACCESS_REQUESTED',
      tenantId: input.tenantId,
      toUserId: ownerId,
      subject: 'Access request pending',
      body: `Requester ${input.requesterId} requested access to ${normalizedIds.length} resource(s). Reason: ${input.reason}`,
    });

    return this.toPublic(request);
  }

  async approve(tenantId: string, requestId: string, ownerUserId: string) {
    const request = await this.getRequest(tenantId, requestId);
    if (request.requesterId.toString() === ownerUserId) {
      throw new AccessControlError('FORBIDDEN', 'Cannot approve your own request');
    }
    if (request.ownerId.toString() !== ownerUserId) {
      throw new AccessControlError('FORBIDDEN', 'Only resource owner can approve');
    }
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new AccessControlError('INVALID_STATE', 'Request is not pending');
    }

    request.status = AccessRequestStatus.APPROVED;
    request.approvedAt = new Date();
    const otpCode = await this.otp.createForRequest(tenantId, request._id.toString());
    request.status = AccessRequestStatus.OTP_GENERATED;
    await request.save();

    await this.notifications.send({
      event: 'OTP_CREATED',
      tenantId,
      toUserId: request.requesterId.toString(),
      subject: 'Access OTP',
      body: 'Use the OTP to complete access verification.',
      otpCode,
    });

    emitSecurityEvent({ type: 'OTP_GENERATED', tenantId, userId: ownerUserId, accessRequestId: requestId, timestamp: new Date() });
    emitSecurityEvent({ type: 'ACCESS_APPROVED', tenantId, userId: ownerUserId, accessRequestId: requestId, timestamp: new Date() });

    return this.toPublic(request);
  }

  async reject(tenantId: string, requestId: string, ownerUserId: string) {
    const request = await this.getRequest(tenantId, requestId);
    if (request.ownerId.toString() !== ownerUserId) {
      throw new AccessControlError('FORBIDDEN', 'Only resource owner can reject');
    }
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new AccessControlError('INVALID_STATE', 'Request is not pending');
    }
    request.status = AccessRequestStatus.REJECTED;
    request.rejectedAt = new Date();
    await request.save();
    await this.otp.revokeForRequest(request._id.toString());
    emitSecurityEvent({ type: 'ACCESS_REJECTED', tenantId, userId: ownerUserId, accessRequestId: requestId, timestamp: new Date() });
    return this.toPublic(request);
  }

  async verifyOtp(tenantId: string, requestId: string, requesterId: string, code: string) {
    const request = await this.getRequest(tenantId, requestId);
    if (request.requesterId.toString() !== requesterId) {
      throw new AccessControlError('FORBIDDEN', 'Not the requester');
    }
    if (request.status !== AccessRequestStatus.OTP_GENERATED) {
      throw new AccessControlError('INVALID_STATE', 'OTP verification not available');
    }

    const result = await this.otp.verify(tenantId, requestId, code);
    if (!result.ok) {
      throw new AccessControlError(result.reason, 'OTP verification failed');
    }

    const policy = await this.policies.getPolicy(
      tenantId,
      request.resourceType === 'SECRET' ? PolicyResourceType.SECRET : PolicyResourceType.FILE,
      request.resourceIds[0]!.toString(),
    );
    const minutes = policy?.grantDurationMinutes ?? loadEnv().ACCESS_GRANT_DEFAULT_MINUTES;
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + minutes * 60 * 1000);

    const grant = await this.grants.create({
      tenantId,
      accessRequestId: requestId,
      userId: requesterId,
      applicationId: request.applicationId.toString(),
      environmentId: request.environmentId.toString(),
      resourceIds: request.resourceIds.map((id) => id.toString()),
      resourceType: request.resourceType,
      permissions: request.permissions,
      grantedBy: request.ownerId.toString(),
      grantedAt,
      expiresAt,
    });

    request.status = AccessRequestStatus.OTP_VERIFIED;
    request.grantId = grant._id;
    await request.save();

    emitSecurityEvent({ type: 'OTP_VERIFIED', tenantId, userId: requesterId, accessRequestId: requestId, timestamp: new Date() });
    emitSecurityEvent({ type: 'ACCESS_GRANTED', tenantId, userId: requesterId, grantId: grant._id.toString(), timestamp: new Date() });

    return { grant: { id: grant._id.toString(), expiresAt, status: AccessGrantStatus.ACTIVE } };
  }

  async listMine(tenantId: string, userId: string) {
    const rows = await AccessRequestModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      requesterId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .exec();
    return rows.map((r) => this.toPublic(r));
  }

  async listForOwner(tenantId: string, ownerId: string) {
    const rows = await AccessRequestModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
      status: AccessRequestStatus.PENDING,
    }).exec();
    return rows.map((r) => this.toPublic(r));
  }

  async revokeGrant(tenantId: string, grantId: string, actorUserId: string) {
    const grant = await this.grants.findByIdWithinTenant(grantId, tenantId);
    if (!grant) throw new AccessControlError('NOT_FOUND', 'Grant not found');
    if (grant.userId.toString() !== actorUserId && grant.grantedBy.toString() !== actorUserId) {
      throw new AccessControlError('FORBIDDEN', 'Cannot revoke grant');
    }
    const revoked = await this.grants.revoke(grantId, tenantId);
    emitSecurityEvent({ type: 'ACCESS_REVOKED', tenantId, userId: actorUserId, grantId, timestamp: new Date() });
    return revoked;
  }

  async listGrants(tenantId: string, userId: string) {
    return this.grants.listActiveForUser(tenantId, userId);
  }

  private async getRequest(tenantId: string, requestId: string) {
    const request = await AccessRequestModel.findOne({
      _id: new mongoose.Types.ObjectId(requestId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
    if (!request) throw new AccessControlError('NOT_FOUND', 'Access request not found');
    return request;
  }

  private async resolveOwner(input: {
    tenantId: string;
    resourceType: 'SECRET' | 'FILE';
    resourceIds: string[];
  }) {
    const id = input.resourceIds[0]!;
    if (input.resourceType === 'SECRET') {
      const secret = await this.secrets.findByIdWithinTenant(id, input.tenantId);
      if (!secret) throw new AccessControlError('NOT_FOUND', 'Resource not found');
      return secret.ownerId.toString();
    }
    const file = await this.files.findByIdWithinTenant(id, input.tenantId);
    if (!file) throw new AccessControlError('NOT_FOUND', 'Resource not found');
    return file.ownerId.toString();
  }

  private async validateResources(
    tenantId: string,
    applicationId: string,
    environmentId: string,
    resourceType: 'SECRET' | 'FILE',
    resourceIds: string[],
  ) {
    for (const id of resourceIds) {
      if (resourceType === 'SECRET') {
        const s = await this.secrets.findByIdWithinTenant(id, tenantId);
        if (
          !s ||
          !s.applicationId ||
          !s.environmentId ||
          s.applicationId.toString() !== applicationId ||
          s.environmentId.toString() !== environmentId
        ) {
          throw new AccessControlError('INVALID_SCOPE', 'Invalid resource scope');
        }
      } else {
        const f = await this.files.findByIdWithinTenant(id, tenantId);
        if (
          !f ||
          !f.applicationId ||
          !f.environmentId ||
          f.applicationId.toString() !== applicationId ||
          f.environmentId.toString() !== environmentId
        ) {
          throw new AccessControlError('INVALID_SCOPE', 'Invalid resource scope');
        }
      }
    }
  }

  private toPublic(request: {
    _id: { toString(): string };
    status: string;
    reason: string;
    requesterId: { toString(): string };
    ownerId: { toString(): string };
    applicationId: { toString(): string };
    environmentId: { toString(): string };
    resourceIds: { toString(): string }[];
    resourceType: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: request._id.toString(),
      status: request.status,
      reason: request.reason,
      requesterId: request.requesterId.toString(),
      ownerId: request.ownerId.toString(),
      applicationId: request.applicationId.toString(),
      environmentId: request.environmentId.toString(),
      resourceIds: request.resourceIds.map((id) => id.toString()),
      resourceType: request.resourceType,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
