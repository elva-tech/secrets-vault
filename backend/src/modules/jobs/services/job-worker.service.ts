import { AccessGrantStatus, OtpStatus } from '@vault/shared';
import { JobQueueService } from './job-queue.service.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { RotationService } from '../../vault/services/rotation.service.js';
import { VaultScope } from '@vault/shared';
import { VaultItemModel } from '../../vault/models/vault-item.model.js';
import { AccessGrantModel } from '../../access-control/models/access-grant.model.js';
import { OtpModel } from '../../access-control/models/otp.model.js';
import { logger } from '../../../config/logger.js';

export class JobWorkerService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queue = new JobQueueService(),
    private readonly notifications = new NotificationService(),
    private readonly rotation = new RotationService(),
  ) {}

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((err) => logger.error('Job worker tick failed', { message: String(err) }));
    }, intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    await this.expireGrants();
    await this.expireOtps();
    await this.scheduleRotationReminders();
    for (let i = 0; i < 10; i++) {
      const job = await this.queue.claimNext();
      if (!job) break;
      try {
        await this.process(job);
        await this.queue.complete(job.id);
      } catch (err) {
        await this.queue.fail(job.id, String(err));
      }
    }
  }

  private async process(job: {
    id: string;
    type: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (job.type === 'ROTATION_REMINDER') {
      const tenantId = job.payload.tenantId as string;
      const toUserId = job.payload.ownerId as string;
      const secretName = job.payload.secretName as string;
      const daysRemaining = job.payload.daysRemaining as number;
      await this.notifications.send({
        event: 'ROTATION_REMINDER',
        tenantId,
        toUserId,
        subject: 'Credential rotation reminder',
        body: `Secret ${secretName} rotates in ${daysRemaining} day(s).`,
      });
      return;
    }
    if (job.type === 'NOTIFICATION_DELIVERY') {
      await this.notifications.send(job.payload as Parameters<NotificationService['send']>[0]);
    }
  }

  private async expireGrants(): Promise<void> {
    const now = new Date();
    await AccessGrantModel.updateMany(
      { status: AccessGrantStatus.ACTIVE, expiresAt: { $lte: now } },
      { status: AccessGrantStatus.EXPIRED },
    );
  }

  private async expireOtps(): Promise<void> {
    const now = new Date();
    await OtpModel.updateMany(
      { status: OtpStatus.ACTIVE, expiresAt: { $lte: now } },
      { status: OtpStatus.EXPIRED },
    );
  }

  private async scheduleRotationReminders(): Promise<void> {
    const secrets = await VaultItemModel.find({
      vaultScope: VaultScope.APPLICATION,
      'rotation.rotationEnabled': true,
      'rotation.nextRotationAt': { $ne: null },
      status: { $ne: 'DELETED' },
      deletedAt: null,
    }).exec();
    for (const secret of secrets) {
      const rotationDate = secret.rotation?.nextRotationAt as Date | undefined;
      if (!rotationDate) continue;
      const reminders = this.rotation.reminderDates(rotationDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const r of reminders) {
        const sendDay = new Date(r.sendOn);
        sendDay.setHours(0, 0, 0, 0);
        if (sendDay.getTime() !== today.getTime()) continue;
        const dedupKey = this.rotation.reminderDedupKey(
          secret._id.toString(),
          rotationDate,
          r.offsetDays,
        );
        await this.queue.enqueue(
          'ROTATION_REMINDER',
          dedupKey,
          {
            tenantId: secret.tenantId.toString(),
            ownerId: secret.ownerId.toString(),
            secretName: secret.name,
            daysRemaining: r.offsetDays,
          },
          new Date(),
        );
      }
    }
  }
}

let workerInstance: JobWorkerService | null = null;

export function startBackgroundWorker(): JobWorkerService {
  if (!workerInstance) {
    workerInstance = new JobWorkerService();
    workerInstance.start();
  }
  return workerInstance;
}

export function stopBackgroundWorker(): void {
  workerInstance?.stop();
  workerInstance = null;
}
