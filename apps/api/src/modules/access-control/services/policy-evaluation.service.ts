import { AuthorizationDecision, NonOwnerBehavior } from '@vault/shared';
import type { AccessPolicyDocument } from '../models/access-policy.model.js';
import { ApplicationMemberRepository } from '../../applications/repositories/application-member.repository.js';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';

export type PolicyEvaluationInput = {
  userId: string;
  tenantId: string;
  ownerId: string;
  applicationId: string;
  permission: string;
  resourcePolicy: AccessPolicyDocument | null;
  environmentPolicy: AccessPolicyDocument | null;
};

export class PolicyEvaluationService {
  constructor(
    private readonly appMembers = new ApplicationMemberRepository(),
    private readonly memberships = new TenantMembershipRepository(),
  ) {}

  async evaluate(input: PolicyEvaluationInput): Promise<AuthorizationDecision> {
    const policy = input.resourcePolicy ?? input.environmentPolicy;
    if (!policy) {
      return AuthorizationDecision.APPROVAL_REQUIRED;
    }

    if (!this.operationAllowed(policy, input.permission)) {
      return AuthorizationDecision.DENY;
    }

    if (input.userId === input.ownerId) {
      if (policy.ownerAccess === NonOwnerBehavior.ALLOW) {
        return AuthorizationDecision.ALLOW;
      }
      if (policy.ownerAccess === NonOwnerBehavior.DENY) {
        return AuthorizationDecision.DENY;
      }
      return AuthorizationDecision.APPROVAL_REQUIRED;
    }

    const userRule = policy.userAccess?.find(
      (r) => r.userId?.toString() === input.userId,
    );
    if (userRule) {
      return this.behaviorToDecision(userRule.behavior as NonOwnerBehavior);
    }

    const membership = await this.memberships.findActiveMembership(input.tenantId, input.userId);
    const roleIds = membership?.roleIds.map((id) => id.toString()) ?? [];
    for (const rule of policy.roleAccess ?? []) {
      if (rule.roleId && roleIds.includes(rule.roleId.toString())) {
        return this.behaviorToDecision(rule.behavior as NonOwnerBehavior);
      }
    }

    const isAppMember = await this.appMembers.findMembership(
      input.tenantId,
      input.applicationId,
      input.userId,
    );
    if (isAppMember) {
      const memberBehavior = (policy.applicationMembersBehavior ??
        NonOwnerBehavior.APPROVAL_REQUIRED) as NonOwnerBehavior;
      const memberDecision = this.behaviorToDecision(memberBehavior);
      if (memberDecision !== AuthorizationDecision.DENY) {
        return memberDecision;
      }
    }

    return this.behaviorToDecision(policy.nonOwnerBehavior as NonOwnerBehavior);
  }

  private operationAllowed(policy: AccessPolicyDocument, permission: string): boolean {
    if (permission === 'secret.reveal') return policy.allowReveal !== false;
    if (permission === 'secret.copy') return policy.allowCopy !== false;
    if (permission === 'file.download') return policy.allowDownload !== false;
    return true;
  }

  private behaviorToDecision(behavior: NonOwnerBehavior): AuthorizationDecision {
    if (behavior === NonOwnerBehavior.ALLOW) return AuthorizationDecision.ALLOW;
    if (behavior === NonOwnerBehavior.APPROVAL_REQUIRED) {
      return AuthorizationDecision.APPROVAL_REQUIRED;
    }
    return AuthorizationDecision.DENY;
  }
}
