import {
  RotationMode,
  RotationStatus,
  RotationType,
  ROTATION_REMINDER_OFFSETS_DAYS,
} from '@vault/shared';
import { VaultItemRepository } from '../repositories/vault-item.repository.js';
import { VaultSecretService, type SecretValueInput } from './vault-secret.service.js';
import { VaultDomainError } from './vault-domain.error.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { AuditService } from '../../audit/services/audit.service.js';
import { AuditAction, AuditResult } from '@vault/shared';

export class RotationService {
  constructor(
    private readonly items = new VaultItemRepository(),
    private readonly secrets = new VaultSecretService(),
    private readonly notifications = new NotificationService(),
    private readonly audit = new AuditService(),
  ) {}

  computeNextRotationAt(rotationType: RotationType, customDate?: Date, from = new Date()): Date | null {
    if (rotationType === RotationType.NO_EXPIRY) return null;
    if (rotationType === RotationType.CUSTOM_DATE) {
      if (!customDate) return null;
      return customDate;
    }
    const months =
      rotationType === RotationType.MONTHS_3
        ? 3
        : rotationType === RotationType.MONTHS_6
          ? 6
          : rotationType === RotationType.MONTHS_9
            ? 9
            : 12;
    const d = new Date(from);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  async updateRotationPolicy(
    tenantId: string,
    secretId: string,
    actorUserId: string,
    input: { rotationType: RotationType; customRotationDate?: string },
  ) {
    if (input.rotationType === RotationType.CUSTOM_DATE) {
      if (!input.customRotationDate) {
        throw new VaultDomainError('INVALID_ROTATION', 'Custom rotation date required');
      }
      const custom = new Date(input.customRotationDate);
      if (custom.getTime() <= Date.now()) {
        throw new VaultDomainError('INVALID_ROTATION', 'Custom rotation date must be in the future');
      }
    }
    const next = this.computeNextRotationAt(
      input.rotationType,
      input.customRotationDate ? new Date(input.customRotationDate) : undefined,
    );
    const rotation = {
      rotationEnabled: input.rotationType !== RotationType.NO_EXPIRY,
      rotationType: input.rotationType,
      customRotationDate: input.customRotationDate ? new Date(input.customRotationDate) : null,
      nextRotationAt: next,
      rotationMode: RotationMode.MANUAL,
      rotationStatus: next ? RotationStatus.SCHEDULED : RotationStatus.NONE,
    };
    const updated = await this.items.updateRotation(secretId, tenantId, rotation, actorUserId);
    if (!updated) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    await this.audit.record({
      tenantId,
      actorId: actorUserId,
      action: AuditAction.ROTATION_SCHEDULED,
      result: AuditResult.ALLOWED,
      resourceType: 'SECRET',
      resourceId: secretId,
      resourceName: updated.name,
      applicationId: updated.applicationId?.toString(),
      environmentId: updated.environmentId?.toString(),
    });
    return {
      rotation: updated.rotation,
      secretId: updated._id.toString(),
    };
  }

  async rotateNow(
    tenantId: string,
    secretId: string,
    actorUserId: string,
    input: { value: SecretValueInput; requestId?: string },
  ) {
    const item = await this.items.findApplicationSecretById(secretId, tenantId);
    if (!item) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    await this.audit.record({
      tenantId,
      actorId: actorUserId,
      action: AuditAction.ROTATION_STARTED,
      result: AuditResult.ALLOWED,
      resourceType: 'SECRET',
      resourceId: secretId,
      resourceName: item.name,
      applicationId: item.applicationId?.toString(),
      environmentId: item.environmentId?.toString(),
      requestId: input.requestId,
    });
    try {
      const meta = await this.secrets.updateValue(tenantId, secretId, actorUserId, {
        value: input.value,
        reason: 'Manual rotation',
      });
      const now = new Date();
      const rotationType = (item.rotation?.rotationType as RotationType) ?? RotationType.NO_EXPIRY;
      const next = this.computeNextRotationAt(
        rotationType,
        item.rotation?.customRotationDate ?? undefined,
        now,
      );
      await this.items.updateRotation(
        secretId,
        tenantId,
        {
          ...item.rotation,
          lastRotatedAt: now,
          nextRotationAt: next,
          rotationStatus: RotationStatus.COMPLETED,
        },
        actorUserId,
      );
      await this.audit.record({
        tenantId,
        actorId: actorUserId,
        action: AuditAction.ROTATION_COMPLETED,
        result: AuditResult.ALLOWED,
        resourceType: 'SECRET',
        resourceId: secretId,
        resourceName: item.name,
        applicationId: item.applicationId?.toString(),
        environmentId: item.environmentId?.toString(),
        requestId: input.requestId,
      });
      await this.notifications.send({
        event: 'ROTATION_COMPLETED',
        tenantId,
        toUserId: actorUserId,
        subject: 'Credential rotation completed',
        body: `Secret ${item.name} was rotated successfully.`,
      });
      return meta;
    } catch (err) {
      await this.audit.record({
        tenantId,
        actorId: actorUserId,
        action: AuditAction.ROTATION_FAILED,
        result: AuditResult.FAILED,
        resourceType: 'SECRET',
        resourceId: secretId,
        resourceName: item.name,
      });
      throw err;
    }
  }

  reminderDedupKey(secretId: string, rotationDate: Date, offsetDays: number): string {
    return `rotation_reminder:${secretId}:${rotationDate.toISOString().slice(0, 10)}:d${offsetDays}`;
  }

  reminderDates(rotationDate: Date): Array<{ offsetDays: number; sendOn: Date }> {
    return ROTATION_REMINDER_OFFSETS_DAYS.map((offsetDays) => {
      const sendOn = new Date(rotationDate);
      sendOn.setDate(sendOn.getDate() - offsetDays);
      return { offsetDays, sendOn };
    });
  }
}
