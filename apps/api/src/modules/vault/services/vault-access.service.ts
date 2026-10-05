import { AuthorizationDecision, PolicyResourceType, type VaultAccessDecisionResult } from '@vault/shared';
import { AuthorizationService } from '../../access-control/authorization.service.js';
import { PolicyEvaluationService } from '../../access-control/services/policy-evaluation.service.js';
import { AccessPolicyRepository } from '../../access-control/repositories/access-policy.repository.js';
import { AccessGrantRepository } from '../../access-control/repositories/access-grant.repository.js';
import { VaultItemRepository } from '../repositories/vault-item.repository.js';
import { VaultFileRepository } from '../repositories/vault-file.repository.js';
import { UserRepository } from '../../users/repositories/user.repository.js';

export type VaultResourceOperation = {
  userId: string;
  tenantId: string;
  permission: string;
  resourceType: 'SECRET' | 'FILE';
  resourceId: string;
  /** When false, only RBAC (+ platform boundary) applies — metadata operations */
  sensitive?: boolean;
};

export class VaultAccessService {
  constructor(
    private readonly authorization = new AuthorizationService(),
    private readonly policyEval = new PolicyEvaluationService(),
    private readonly policies = new AccessPolicyRepository(),
    private readonly grants = new AccessGrantRepository(),
    private readonly secrets = new VaultItemRepository(),
    private readonly files = new VaultFileRepository(),
    private readonly users = new UserRepository(),
  ) {}

  async authorizeVaultOperation(input: VaultResourceOperation): Promise<VaultAccessDecisionResult> {
    const base = await this.authorization.authorize({
      userId: input.userId,
      tenantId: input.tenantId,
      permission: input.permission,
      resource: {
        type: input.resourceType,
        id: input.resourceId,
        tenantId: input.tenantId,
      },
    });
    if (base === AuthorizationDecision.DENY) {
      return {
        decision: AuthorizationDecision.DENY,
        reason: 'RBAC_DENIED',
        requiredPermission: input.permission,
        resourceId: input.resourceId,
      };
    }

    const user = await this.users.findById(input.userId);
    if (user?.isPlatformSuperAdmin) {
      return {
        decision: AuthorizationDecision.DENY,
        reason: 'PLATFORM_ADMIN_NO_SECRET_ACCESS',
        resourceId: input.resourceId,
      };
    }

    const resource = await this.loadResource(input);
    if (!resource) {
      return { decision: AuthorizationDecision.DENY, reason: 'NOT_FOUND', resourceId: input.resourceId };
    }

    if (!input.sensitive) {
      return {
        decision: AuthorizationDecision.ALLOW,
        reason: 'RBAC_ALLOW',
        resourceId: input.resourceId,
      };
    }

    const grant = await this.grants.findActiveForUserResource(
      input.tenantId,
      input.userId,
      input.resourceId,
      input.permission,
    );
    if (grant) {
      return {
        decision: AuthorizationDecision.ALLOW,
        reason: 'TEMPORARY_GRANT',
        resourceId: input.resourceId,
      };
    }

    const policyType =
      input.resourceType === 'SECRET' ? PolicyResourceType.SECRET : PolicyResourceType.FILE;
    const resourcePolicy = await this.policies.findForResource(
      input.tenantId,
      policyType,
      input.resourceId,
    );
    const environmentPolicy = await this.policies.findForResource(
      input.tenantId,
      PolicyResourceType.ENVIRONMENT,
      resource.environmentId,
    );

    const policyDecision = await this.policyEval.evaluate({
      userId: input.userId,
      tenantId: input.tenantId,
      ownerId: resource.ownerId,
      applicationId: resource.applicationId,
      permission: input.permission,
      resourcePolicy,
      environmentPolicy,
    });

    return {
      decision: policyDecision,
      reason: policyDecision === AuthorizationDecision.ALLOW ? 'POLICY_ALLOW' : 'POLICY_RESTRICTED',
      requiredPermission: input.permission,
      resourceId: input.resourceId,
    };
  }

  private async loadResource(input: VaultResourceOperation): Promise<{
    ownerId: string;
    applicationId: string;
    environmentId: string;
  } | null> {
    if (input.resourceType === 'SECRET') {
      const item = await this.secrets.findApplicationSecretById(input.resourceId, input.tenantId);
      if (!item) return null;
      if (!item.applicationId || !item.environmentId) {
        return null;
      }
      return {
        ownerId: item.ownerId.toString(),
        applicationId: item.applicationId.toString(),
        environmentId: item.environmentId.toString(),
      };
    }
    const file = await this.files.findApplicationFileById(input.resourceId, input.tenantId);
    if (!file) return null;
    if (!file.applicationId || !file.environmentId) {
      return null;
    }
    return {
      ownerId: file.ownerId.toString(),
      applicationId: file.applicationId.toString(),
      environmentId: file.environmentId.toString(),
    };
  }
}
