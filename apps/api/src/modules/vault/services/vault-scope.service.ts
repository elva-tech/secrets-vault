import { ApplicationRepository } from '../../applications/repositories/application.repository.js';
import { EnvironmentRepository } from '../../environments/repositories/environment.repository.js';
import { VaultDomainError } from './vault-domain.error.js';

export class VaultScopeService {
  constructor(
    private readonly applications = new ApplicationRepository(),
    private readonly environments = new EnvironmentRepository(),
  ) {}

  async assertEnvironmentInTenant(tenantId: string, environmentId: string, applicationId?: string) {
    const env = await this.environments.findByIdWithinTenant(environmentId, tenantId);
    if (!env) {
      throw new VaultDomainError('NOT_FOUND', 'Environment not found');
    }
    if (applicationId && env.applicationId.toString() !== applicationId) {
      throw new VaultDomainError('NOT_FOUND', 'Environment not found');
    }
    const app = await this.applications.findByIdWithinTenant(
      env.applicationId.toString(),
      tenantId,
    );
    if (!app) {
      throw new VaultDomainError('NOT_FOUND', 'Application not found');
    }
    return { environment: env, application: app };
  }
}
