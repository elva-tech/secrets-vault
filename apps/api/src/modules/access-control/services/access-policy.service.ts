import { NonOwnerBehavior, PolicyResourceType } from '@vault/shared';
import { AccessPolicyRepository } from '../repositories/access-policy.repository.js';
import type { AccessPolicyDocument } from '../models/access-policy.model.js';
import { loadEnv } from '../../../config/env.js';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';
import { AccessControlError } from './access-control.error.js';

export class AccessPolicyService {
  constructor(
    private readonly policies = new AccessPolicyRepository(),
    private readonly memberships = new TenantMembershipRepository(),
  ) {}

  async ensureDefaultForResource(
    tenantId: string,
    resourceType: PolicyResourceType,
    resourceId: string,
  ) {
    const { ACCESS_GRANT_DEFAULT_MINUTES } = loadEnv();
    return this.policies.upsert(tenantId, resourceType, resourceId, {
      ownerAccess: NonOwnerBehavior.ALLOW,
      nonOwnerBehavior: NonOwnerBehavior.APPROVAL_REQUIRED,
      approvalRequired: true,
      grantDurationMinutes: ACCESS_GRANT_DEFAULT_MINUTES,
      allowReveal: true,
      allowCopy: true,
      allowDownload: true,
    });
  }

  async getPolicy(tenantId: string, resourceType: PolicyResourceType, resourceId: string) {
    return this.policies.findForResource(tenantId, resourceType, resourceId);
  }

  async updatePolicy(
    tenantId: string,
    resourceType: PolicyResourceType,
    resourceId: string,
    patch: Record<string, unknown>,
    actorUserId: string,
  ) {
    await this.validatePolicyPatch(tenantId, patch);
    const policy = await this.policies.upsert(tenantId, resourceType, resourceId, patch);
    return this.toPublic(policy, actorUserId);
  }

  private async validatePolicyPatch(tenantId: string, patch: Record<string, unknown>) {
    const userAccess = patch.userAccess as Array<{ userId: string }> | undefined;
    if (userAccess) {
      for (const rule of userAccess) {
        const m = await this.memberships.findActiveMembership(tenantId, rule.userId);
        if (!m) {
          throw new AccessControlError('INVALID_POLICY', 'User access rule references invalid tenant user');
        }
      }
    }
  }

  private toPublic(policy: AccessPolicyDocument, _actor: string) {
    return {
      id: policy._id.toString(),
      tenantId: policy.tenantId.toString(),
      resourceType: policy.resourceType,
      resourceId: policy.resourceId.toString(),
      ownerAccess: policy.ownerAccess,
      nonOwnerBehavior: policy.nonOwnerBehavior,
      applicationMembersBehavior: policy.applicationMembersBehavior,
      approvalRequired: policy.approvalRequired,
      approvalTimeoutMinutes: policy.approvalTimeoutMinutes,
      grantDurationMinutes: policy.grantDurationMinutes,
      allowReveal: policy.allowReveal,
      allowCopy: policy.allowCopy,
      allowDownload: policy.allowDownload,
      roleAccess: policy.roleAccess,
      userAccess: policy.userAccess,
    };
  }
}
