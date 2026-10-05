import {
  ApplicationMemberRole,
  ApplicationStatus,
  DEFAULT_ENVIRONMENT_NAMES,
  MetadataVisibility,
  type ApplicationMetadataItem,
} from '@vault/shared';
import { ApplicationRepository } from '../repositories/application.repository.js';
import { ApplicationMemberRepository } from '../repositories/application-member.repository.js';
import { EnvironmentRepository } from '../../environments/repositories/environment.repository.js';
import {
  ApplicationDomainError,
  TenantUserValidationService,
} from './tenant-user-validation.service.js';
import { MetadataVisibilityService } from './metadata-visibility.service.js';
import { UserRepository } from '../../users/repositories/user.repository.js';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';
import type { ApplicationDocument } from '../models/application.model.js';
import { PolicyResourceType } from '@vault/shared';
import { AccessPolicyService } from '../../access-control/services/access-policy.service.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export class ApplicationService {
  constructor(
    private readonly applications = new ApplicationRepository(),
    private readonly members = new ApplicationMemberRepository(),
    private readonly environments = new EnvironmentRepository(),
    private readonly tenantUsers = new TenantUserValidationService(),
    private readonly metadataVisibility = new MetadataVisibilityService(),
    private readonly users = new UserRepository(),
    private readonly tenantMemberships = new TenantMembershipRepository(),
    private readonly accessPolicies = new AccessPolicyService(),
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: {
      name: string;
      slug: string;
      description?: string;
      ownerId?: string;
      metadata?: ApplicationMetadataItem[];
      seedDefaultEnvironments?: boolean;
    },
  ) {
    const slug = input.slug.toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new ApplicationDomainError('INVALID_SLUG', 'Invalid application slug');
    }
    const existing = await this.applications.findBySlugWithinTenant(slug, tenantId);
    if (existing) {
      throw new ApplicationDomainError('SLUG_EXISTS', 'Application slug already exists in tenant');
    }

    const ownerId = input.ownerId ?? actorUserId;
    await this.tenantUsers.assertActiveTenantMember(tenantId, ownerId);

    const app = await this.applications.create({
      tenantId,
      name: input.name,
      slug,
      description: input.description,
      ownerId,
      createdBy: actorUserId,
      metadata: this.sanitizeMetadata(input.metadata),
    });

    await this.members.upsertMember({
      tenantId,
      applicationId: app._id.toString(),
      userId: ownerId,
      role: ApplicationMemberRole.OWNER,
    });

    if (input.seedDefaultEnvironments !== false) {
      for (const envName of DEFAULT_ENVIRONMENT_NAMES) {
        const env = await this.environments.create({
          tenantId,
          applicationId: app._id.toString(),
          name: envName,
          slug: envName.toLowerCase(),
          createdBy: actorUserId,
        });
        await this.accessPolicies.ensureDefaultForResource(
          tenantId,
          PolicyResourceType.ENVIRONMENT,
          env._id.toString(),
        );
      }
    }

    return this.toDetail(app, tenantId, actorUserId, true);
  }

  async list(tenantId: string, actorUserId: string, search?: string) {
    const apps = await this.applications.listByTenant(tenantId, search);
    const ctx = await this.buildMetadataContext(tenantId, actorUserId, '');
    return apps.map((app) => ({
      id: app._id.toString(),
      name: app.name,
      slug: app.slug,
      description: app.description,
      status: app.status,
      ownerId: app.ownerId.toString(),
      metadataPreview: this.metadataVisibility
        .filterForViewer(app.metadata, { ...ctx, ownerId: app.ownerId.toString() })
        .slice(0, 3),
    }));
  }

  async getById(tenantId: string, applicationId: string, actorUserId: string) {
    const app = await this.requireApplication(tenantId, applicationId);
    return this.toDetail(app, tenantId, actorUserId, true);
  }

  async update(
    tenantId: string,
    applicationId: string,
    actorUserId: string,
    patch: {
      name?: string;
      description?: string;
      metadata?: ApplicationMetadataItem[];
      status?: ApplicationStatus;
    },
  ) {
    const updated = await this.applications.updateWithinTenant(applicationId, tenantId, {
      ...patch,
      metadata: patch.metadata ? this.sanitizeMetadata(patch.metadata) : undefined,
      updatedBy: actorUserId,
    });
    if (!updated) {
      throw new ApplicationDomainError('NOT_FOUND', 'Application not found');
    }
    return this.toDetail(updated, tenantId, actorUserId, true);
  }

  async delete(tenantId: string, applicationId: string, actorUserId: string) {
    const deleted = await this.applications.softDeleteWithinTenant(
      applicationId,
      tenantId,
      actorUserId,
    );
    if (!deleted) {
      throw new ApplicationDomainError('NOT_FOUND', 'Application not found');
    }
    return { id: deleted._id.toString(), status: deleted.status };
  }

  async changeOwner(
    tenantId: string,
    applicationId: string,
    actorUserId: string,
    newOwnerId: string,
  ) {
    await this.tenantUsers.assertActiveTenantMember(tenantId, newOwnerId);
    const app = await this.requireApplication(tenantId, applicationId);

    const oldOwnerId = app.ownerId.toString();
    await this.applications.updateWithinTenant(applicationId, tenantId, {
      ownerId: newOwnerId,
      updatedBy: actorUserId,
    });

    await this.members.upsertMember({
      tenantId,
      applicationId,
      userId: newOwnerId,
      role: ApplicationMemberRole.OWNER,
    });
    if (oldOwnerId !== newOwnerId) {
      const oldMembership = await this.members.findMembership(tenantId, applicationId, oldOwnerId);
      if (oldMembership && oldMembership.role === ApplicationMemberRole.OWNER) {
        await this.members.upsertMember({
          tenantId,
          applicationId,
          userId: oldOwnerId,
          role: ApplicationMemberRole.MEMBER,
        });
      }
    }

    return this.getById(tenantId, applicationId, actorUserId);
  }

  async addManager(
    tenantId: string,
    applicationId: string,
    actorUserId: string,
    userId: string,
  ) {
    await this.requireApplication(tenantId, applicationId);
    await this.tenantUsers.assertActiveTenantMember(tenantId, userId);
    await this.members.upsertMember({
      tenantId,
      applicationId,
      userId,
      role: ApplicationMemberRole.MANAGER,
    });
    return this.listMembers(tenantId, applicationId);
  }

  async removeManager(
    tenantId: string,
    applicationId: string,
    userId: string,
  ) {
    const membership = await this.members.findMembership(tenantId, applicationId, userId);
    if (!membership || membership.role !== ApplicationMemberRole.MANAGER) {
      throw new ApplicationDomainError('NOT_FOUND', 'Manager not found');
    }
    await this.members.removeMember(tenantId, applicationId, userId);
    return this.listMembers(tenantId, applicationId);
  }

  async addMember(
    tenantId: string,
    applicationId: string,
    userId: string,
  ) {
    await this.requireApplication(tenantId, applicationId);
    await this.tenantUsers.assertActiveTenantMember(tenantId, userId);
    const existing = await this.members.findMembership(tenantId, applicationId, userId);
    if (existing?.role === ApplicationMemberRole.OWNER) {
      throw new ApplicationDomainError('INVALID_OPERATION', 'User is already the owner');
    }
    await this.members.upsertMember({
      tenantId,
      applicationId,
      userId,
      role: ApplicationMemberRole.MEMBER,
    });
    return this.listMembers(tenantId, applicationId);
  }

  async removeMember(tenantId: string, applicationId: string, userId: string) {
    const membership = await this.members.findMembership(tenantId, applicationId, userId);
    if (!membership) {
      throw new ApplicationDomainError('NOT_FOUND', 'Member not found');
    }
    if (membership.role === ApplicationMemberRole.OWNER) {
      throw new ApplicationDomainError('INVALID_OPERATION', 'Cannot remove application owner');
    }
    await this.members.removeMember(tenantId, applicationId, userId);
    return this.listMembers(tenantId, applicationId);
  }

  async listMembers(tenantId: string, applicationId: string) {
    await this.requireApplication(tenantId, applicationId);
    const rows = await this.members.listByApplication(tenantId, applicationId);
    const result = [];
    for (const row of rows) {
      const user = await this.users.findById(row.userId.toString());
      if (!user) continue;
      result.push({
        userId: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        role: row.role,
      });
    }
    return result;
  }

  async assertApplicationInTenant(tenantId: string, applicationId: string) {
    return this.requireApplication(tenantId, applicationId);
  }

  private async requireApplication(tenantId: string, applicationId: string) {
    const app = await this.applications.findByIdWithinTenant(applicationId, tenantId);
    if (!app) {
      throw new ApplicationDomainError('NOT_FOUND', 'Application not found');
    }
    return app;
  }

  private sanitizeMetadata(metadata?: ApplicationMetadataItem[]) {
    if (!metadata) return [];
    return metadata.map((m) => ({
      label: m.label.trim(),
      value: m.value.trim(),
      visibility: m.visibility ?? MetadataVisibility.TENANT_VISIBLE,
      restrictedRoleIds: m.restrictedRoleIds,
    }));
  }

  private async buildMetadataContext(tenantId: string, userId: string, ownerId: string) {
    const membership = await this.tenantMemberships.findActiveMembership(tenantId, userId);
    const tenantRoleIds = membership?.roleIds.map((id) => id.toString()) ?? [];
    return {
      userId,
      ownerId,
      tenantRoleIds,
      canViewRestricted: false,
    };
  }

  private async toDetail(
    app: ApplicationDocument,
    tenantId: string,
    actorUserId: string,
    includeMembers: boolean,
  ) {
    const ctx = await this.buildMetadataContext(tenantId, actorUserId, app.ownerId.toString());
    const owner = await this.users.findById(app.ownerId.toString());
    const members = includeMembers
      ? await this.listMembers(tenantId, app._id.toString())
      : undefined;
    const managers = members?.filter((m) => m.role === ApplicationMemberRole.MANAGER) ?? [];

    return {
      id: app._id.toString(),
      tenantId: app.tenantId.toString(),
      name: app.name,
      slug: app.slug,
      description: app.description,
      status: app.status,
      owner: owner
        ? { id: owner._id.toString(), email: owner.email, displayName: owner.displayName }
        : null,
      managers,
      metadata: this.metadataVisibility.filterForViewer(app.metadata, {
        ...ctx,
        ownerId: app.ownerId.toString(),
      }),
      members,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }
}
