import mongoose from 'mongoose';
import { AccessRequestStatus, AccessGrantStatus, PolicyResourceType, ApplicationMemberRole } from '@vault/shared';
import { loadEnv } from '../../../config/env.js';
import { AccessRequestModel } from '../models/access-request.model.js';
import { AccessGrantRepository } from '../repositories/access-grant.repository.js';
import { VaultScopeService } from '../../vault/services/vault-scope.service.js';
import { VaultItemRepository } from '../../vault/repositories/vault-item.repository.js';
import { VaultFileRepository } from '../../vault/repositories/vault-file.repository.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { UserRepository } from '../../users/repositories/user.repository.js';
import { ApplicationMemberRepository } from '../../applications/repositories/application-member.repository.js';
import { emitSecurityEvent } from '../events/security-events.js';
import { AccessControlError } from './access-control.error.js';
import { AccessPolicyService } from './access-policy.service.js';
import { logger } from '../../../config/logger.js';

const ACTIVE_DUPLICATE_STATUSES = [AccessRequestStatus.PENDING];

export class AccessRequestService {
  constructor(
    private readonly scope = new VaultScopeService(),
    private readonly secrets = new VaultItemRepository(),
    private readonly files = new VaultFileRepository(),
    private readonly users = new UserRepository(),
    private readonly grants = new AccessGrantRepository(),
    private readonly notifications = new NotificationService(),
    private readonly policies = new AccessPolicyService(),
    private readonly appMembers = new ApplicationMemberRepository(),
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
    const normalizedIds = [...new Set(input.resourceIds)].sort();
    await this.validateResources(
      input.tenantId,
      input.applicationId,
      input.environmentId,
      input.resourceType,
      normalizedIds,
    );
    const ownerId = await this.assertUniformResourceOwnership(
      input.tenantId,
      input.resourceType,
      normalizedIds,
    );

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

    const resourceLabel = await this.describeResources(
      input.tenantId,
      input.resourceType,
      normalizedIds,
    );
    const portalPath = `/applications/${input.applicationId}/access`;
    const approverIds = await this.resolveApproverUserIds(
      input.tenantId,
      input.applicationId,
      ownerId,
      input.requesterId,
    );
    const requester = await this.users.findById(input.requesterId);
    const requesterLabel = requester?.displayName ?? requester?.email ?? 'A team member';

    for (const approverId of approverIds) {
      await this.notifications.send({
        event: 'ACCESS_REQUESTED',
        tenantId: input.tenantId,
        toUserId: approverId,
        subject: 'Access request pending review',
        body: [
          `${requesterLabel} requested access to ${resourceLabel}.`,
          `Reason: ${input.reason}`,
          `Permissions: ${input.permissions.join(', ')}`,
          `Review and approve or reject in the portal: ${portalPath}`,
        ].join('\n'),
        correlationId: `${request._id.toString()}:${approverId}`,
      });
    }

    return this.toPublic(request);
  }

  async approve(tenantId: string, requestId: string, actorUserId: string) {
    const request = await this.getRequest(tenantId, requestId);
    if (request.requesterId.toString() === actorUserId) {
      throw new AccessControlError('FORBIDDEN', 'Cannot approve your own request');
    }
    await this.assertCanDecide(request, actorUserId);
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new AccessControlError('INVALID_STATE', 'Request is not pending');
    }

    const policy = await this.policies.getPolicy(
      tenantId,
      request.resourceType === 'SECRET' ? PolicyResourceType.SECRET : PolicyResourceType.FILE,
      request.resourceIds[0]!.toString(),
    );
    const minutes = policy?.grantDurationMinutes ?? loadEnv().ACCESS_GRANT_DEFAULT_MINUTES;
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + minutes * 60 * 1000);

    const locked = await AccessRequestModel.findOneAndUpdate(
      {
        _id: request._id,
        tenantId: new mongoose.Types.ObjectId(tenantId),
        status: AccessRequestStatus.PENDING,
      },
      {
        status: AccessRequestStatus.APPROVED,
        approvedAt: grantedAt,
        approvedBy: new mongoose.Types.ObjectId(actorUserId),
      },
      { new: true },
    ).exec();
    if (!locked) {
      throw new AccessControlError('INVALID_STATE', 'Request is no longer pending');
    }

    let grant;
    let createdGrantId: string | undefined;
    try {
      grant = await this.grants.create({
        tenantId,
        accessRequestId: requestId,
        userId: request.requesterId.toString(),
        applicationId: request.applicationId.toString(),
        environmentId: request.environmentId.toString(),
        resourceIds: request.resourceIds.map((id) => id.toString()),
        resourceType: request.resourceType,
        permissions: request.permissions,
        grantedBy: actorUserId,
        grantedAt,
        expiresAt,
      });
      createdGrantId = grant._id.toString();
      const linked = await AccessRequestModel.updateOne(
        {
          _id: request._id,
          tenantId: new mongoose.Types.ObjectId(tenantId),
          status: AccessRequestStatus.APPROVED,
          grantId: null,
        },
        { grantId: grant._id },
      ).exec();
      if (linked.modifiedCount === 0) {
        throw new AccessControlError('GRANT_LINK_FAILED', 'Failed to finalize access grant');
      }
    } catch (err) {
      await this.compensateFailedApproval(tenantId, requestId, request._id, createdGrantId);
      throw err;
    }

    emitSecurityEvent({
      type: 'ACCESS_APPROVED',
      tenantId,
      userId: actorUserId,
      accessRequestId: requestId,
      timestamp: new Date(),
    });
    emitSecurityEvent({
      type: 'ACCESS_GRANTED',
      tenantId,
      userId: request.requesterId.toString(),
      grantId: grant._id.toString(),
      timestamp: new Date(),
    });

    const portalPath = `/applications/${request.applicationId.toString()}/access`;
    await this.notifications.send({
      event: 'ACCESS_APPROVED',
      tenantId,
      toUserId: request.requesterId.toString(),
      subject: 'Access request approved',
      body: [
        'Your access request was approved in the Secrets Vault portal.',
        `Temporary access is active until ${expiresAt.toISOString()}.`,
        `View grants: ${portalPath}`,
      ].join('\n'),
      correlationId: requestId,
    });
    await this.notifications.send({
      event: 'ACCESS_GRANTED',
      tenantId,
      toUserId: request.requesterId.toString(),
      subject: 'Access granted',
      body: `Your temporary access is active until ${expiresAt.toISOString()}.`,
      correlationId: grant._id.toString(),
    });

    return {
      request: this.toPublic(locked),
      grant: { id: grant._id.toString(), expiresAt, status: AccessGrantStatus.ACTIVE },
    };
  }

  async reject(
    tenantId: string,
    requestId: string,
    actorUserId: string,
    rejectionReason?: string,
  ) {
    const request = await this.getRequest(tenantId, requestId);
    await this.assertCanDecide(request, actorUserId);
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new AccessControlError('INVALID_STATE', 'Request is not pending');
    }

    const rejected = await AccessRequestModel.findOneAndUpdate(
      {
        _id: request._id,
        tenantId: new mongoose.Types.ObjectId(tenantId),
        status: AccessRequestStatus.PENDING,
      },
      {
        status: AccessRequestStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedBy: new mongoose.Types.ObjectId(actorUserId),
        rejectionReason: rejectionReason?.trim() || null,
      },
      { new: true },
    ).exec();
    if (!rejected) {
      throw new AccessControlError('INVALID_STATE', 'Request is no longer pending');
    }

    const portalPath = `/applications/${request.applicationId.toString()}/access`;
    await this.notifications.send({
      event: 'ACCESS_REJECTED',
      tenantId,
      toUserId: request.requesterId.toString(),
      subject: 'Access request declined',
      body: [
        'Your access request was declined in the Secrets Vault portal.',
        rejectionReason ? `Reason: ${rejectionReason}` : '',
        `Status: ${portalPath}`,
      ]
        .filter(Boolean)
        .join('\n'),
      correlationId: requestId,
    });
    emitSecurityEvent({
      type: 'ACCESS_REJECTED',
      tenantId,
      userId: actorUserId,
      accessRequestId: requestId,
      timestamp: new Date(),
    });
    return this.toPublic(rejected);
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

  async listForOwner(tenantId: string, approverUserId: string) {
    const managedAppIds = await this.appMembers.listManagedApplicationIds(tenantId, approverUserId);
    const orClauses: Record<string, unknown>[] = [
      { ownerId: new mongoose.Types.ObjectId(approverUserId) },
    ];
    if (managedAppIds.length > 0) {
      orClauses.push({
        applicationId: {
          $in: managedAppIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      });
    }

    const rows = await AccessRequestModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: AccessRequestStatus.PENDING,
      $or: orClauses,
    })
      .sort({ createdAt: -1 })
      .exec();
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

  private async assertCanDecide(
    request: { ownerId: { toString(): string }; applicationId: { toString(): string }; tenantId: { toString(): string } },
    actorUserId: string,
  ) {
    if (request.ownerId.toString() === actorUserId) return;
    const membership = await this.appMembers.findMembership(
      request.tenantId.toString(),
      request.applicationId.toString(),
      actorUserId,
    );
    if (membership?.role === ApplicationMemberRole.MANAGER) return;
    throw new AccessControlError('FORBIDDEN', 'Not authorized to decide this request');
  }

  private async resolveApproverUserIds(
    tenantId: string,
    applicationId: string,
    ownerId: string,
    requesterId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (ownerId !== requesterId) ids.add(ownerId);
    const members = await this.appMembers.listByApplication(tenantId, applicationId);
    for (const m of members) {
      if (m.role === ApplicationMemberRole.MANAGER && m.userId.toString() !== requesterId) {
        ids.add(m.userId.toString());
      }
    }
    return [...ids];
  }

  private async describeResources(
    tenantId: string,
    resourceType: 'SECRET' | 'FILE',
    resourceIds: string[],
  ): Promise<string> {
    const names: string[] = [];
    for (const id of resourceIds.slice(0, 3)) {
      if (resourceType === 'SECRET') {
        const s = await this.secrets.findByIdWithinTenant(id, tenantId);
        if (s?.name) names.push(s.name);
      } else {
        const f = await this.files.findByIdWithinTenant(id, tenantId);
        if (f?.originalFilename) names.push(f.originalFilename);
      }
    }
    const label = names.length > 0 ? names.join(', ') : `${resourceType} resource`;
    if (resourceIds.length > names.length) {
      return `${label} (+${resourceIds.length - names.length} more)`;
    }
    return label;
  }

  private async getRequest(tenantId: string, requestId: string) {
    const request = await AccessRequestModel.findOne({
      _id: new mongoose.Types.ObjectId(requestId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
    if (!request) throw new AccessControlError('NOT_FOUND', 'Access request not found');
    return request;
  }

  private async compensateFailedApproval(
    tenantId: string,
    accessRequestId: string,
    requestObjectId: mongoose.Types.ObjectId,
    createdGrantId?: string,
  ): Promise<void> {
    let grantRevoked = !createdGrantId;
    if (createdGrantId) {
      const revoked = await this.grants.revoke(createdGrantId, tenantId);
      grantRevoked = Boolean(revoked);
      if (!grantRevoked) {
        logger.error('Access approval compensation: grant revoke failed', {
          tenantId,
          accessRequestId,
          grantId: createdGrantId,
        });
      }
    }

    const reverted = await AccessRequestModel.findOneAndUpdate(
      {
        _id: requestObjectId,
        tenantId: new mongoose.Types.ObjectId(tenantId),
        status: AccessRequestStatus.APPROVED,
        grantId: null,
      },
      {
        status: AccessRequestStatus.PENDING,
        approvedAt: null,
        approvedBy: null,
      },
      { new: true },
    ).exec();

    if (!reverted) {
      const snapshot = await AccessRequestModel.findById(requestObjectId)
        .select('status grantId')
        .lean()
        .exec();
      logger.warn('Access approval compensation: request not reverted to pending', {
        tenantId,
        accessRequestId,
        currentStatus: snapshot?.status,
        hasGrantId: Boolean(snapshot?.grantId),
        grantRevoked: createdGrantId ? grantRevoked : undefined,
      });
    }

    if (createdGrantId && !grantRevoked) {
      throw new AccessControlError(
        'APPROVAL_ROLLBACK_INCOMPLETE',
        'Approval failed and the temporary grant could not be revoked. Contact an administrator.',
      );
    }
  }

  private async assertUniformResourceOwnership(
    tenantId: string,
    resourceType: 'SECRET' | 'FILE',
    resourceIds: string[],
  ): Promise<string> {
    let ownerId: string | undefined;
    for (const id of resourceIds) {
      const resourceOwnerId = await this.getResourceOwnerId(tenantId, resourceType, id);
      if (ownerId === undefined) {
        ownerId = resourceOwnerId;
      } else if (ownerId !== resourceOwnerId) {
        throw new AccessControlError(
          'MIXED_RESOURCE_OWNERS',
          'All resources in one access request must have the same owner',
        );
      }
    }
    if (!ownerId) {
      throw new AccessControlError('NOT_FOUND', 'Resource not found');
    }
    return ownerId;
  }

  private async getResourceOwnerId(
    tenantId: string,
    resourceType: 'SECRET' | 'FILE',
    resourceId: string,
  ): Promise<string> {
    if (resourceType === 'SECRET') {
      const secret = await this.secrets.findByIdWithinTenant(resourceId, tenantId);
      if (!secret) throw new AccessControlError('NOT_FOUND', 'Resource not found');
      return secret.ownerId.toString();
    }
    const file = await this.files.findByIdWithinTenant(resourceId, tenantId);
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
    permissions?: string[];
    grantId?: { toString(): string } | null;
    approvedAt?: Date | null;
    rejectedAt?: Date | null;
    approvedBy?: { toString(): string } | null;
    rejectedBy?: { toString(): string } | null;
    rejectionReason?: string | null;
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
      permissions: request.permissions ?? [],
      grantId: request.grantId?.toString() ?? null,
      approvedAt: request.approvedAt ?? null,
      rejectedAt: request.rejectedAt ?? null,
      approvedBy: request.approvedBy?.toString() ?? null,
      rejectedBy: request.rejectedBy?.toString() ?? null,
      rejectionReason: request.rejectionReason ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
