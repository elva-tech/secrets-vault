import { EnvironmentStatus, PolicyResourceType } from '@vault/shared';
import { AccessPolicyService } from '../../access-control/services/access-policy.service.js';
import { EnvironmentRepository } from '../repositories/environment.repository.js';
import { ApplicationRepository } from '../../applications/repositories/application.repository.js';
import { ApplicationDomainError } from '../../applications/services/tenant-user-validation.service.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-_]*[a-z0-9])?$/;

export class EnvironmentService {
  constructor(
    private readonly environments = new EnvironmentRepository(),
    private readonly applications = new ApplicationRepository(),
    private readonly accessPolicies = new AccessPolicyService(),
  ) {}

  async create(
    tenantId: string,
    applicationId: string,
    actorUserId: string,
    input: { name: string; slug: string; description?: string },
  ) {
    await this.requireApplicationInTenant(tenantId, applicationId);
    const slug = input.slug.toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new ApplicationDomainError('INVALID_SLUG', 'Invalid environment slug');
    }

    try {
      const env = await this.environments.create({
        tenantId,
        applicationId,
        name: input.name,
        slug,
        description: input.description,
        createdBy: actorUserId,
      });
      await this.accessPolicies.ensureDefaultForResource(
        tenantId,
        PolicyResourceType.ENVIRONMENT,
        env._id.toString(),
      );
      return this.toPublic(env);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ApplicationDomainError('SLUG_EXISTS', 'Environment slug already exists');
      }
      throw err;
    }
  }

  async listByApplication(tenantId: string, applicationId: string) {
    await this.requireApplicationInTenant(tenantId, applicationId);
    const envs = await this.environments.listByApplication(tenantId, applicationId);
    return envs.map((e) => this.toPublic(e));
  }

  async getById(tenantId: string, environmentId: string) {
    const env = await this.environments.findByIdWithinTenant(environmentId, tenantId);
    if (!env) {
      throw new ApplicationDomainError('NOT_FOUND', 'Environment not found');
    }
    return this.toPublic(env);
  }

  async update(
    tenantId: string,
    environmentId: string,
    actorUserId: string,
    patch: { name?: string; description?: string; status?: EnvironmentStatus },
  ) {
    const existing = await this.environments.findByIdWithinTenant(environmentId, tenantId);
    if (!existing) {
      throw new ApplicationDomainError('NOT_FOUND', 'Environment not found');
    }
    await this.requireApplicationInTenant(tenantId, existing.applicationId.toString());

    const updated = await this.environments.updateWithinTenant(environmentId, tenantId, {
      ...patch,
      updatedBy: actorUserId,
    });
    if (!updated) {
      throw new ApplicationDomainError('NOT_FOUND', 'Environment not found');
    }
    return this.toPublic(updated);
  }

  async delete(tenantId: string, environmentId: string, actorUserId: string) {
    const existing = await this.environments.findByIdWithinTenant(environmentId, tenantId);
    if (!existing) {
      throw new ApplicationDomainError('NOT_FOUND', 'Environment not found');
    }
    await this.requireApplicationInTenant(tenantId, existing.applicationId.toString());

    const deleted = await this.environments.softDeleteWithinTenant(
      environmentId,
      tenantId,
      actorUserId,
    );
    if (!deleted) {
      throw new ApplicationDomainError('NOT_FOUND', 'Environment not found');
    }
    return { id: deleted._id.toString(), status: deleted.status };
  }

  private async requireApplicationInTenant(tenantId: string, applicationId: string) {
    const app = await this.applications.findByIdWithinTenant(applicationId, tenantId);
    if (!app) {
      throw new ApplicationDomainError('NOT_FOUND', 'Application not found');
    }
    return app;
  }

  private toPublic(env: {
    _id: { toString(): string };
    tenantId: { toString(): string };
    applicationId: { toString(): string };
    name: string;
    slug: string;
    description?: string;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: env._id.toString(),
      tenantId: env.tenantId.toString(),
      applicationId: env.applicationId.toString(),
      name: env.name,
      slug: env.slug,
      description: env.description ?? '',
      status: env.status,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
    };
  }
}
