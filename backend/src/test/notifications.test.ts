import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../modules/notifications/notification.service.js';

describe('NotificationService test sink', () => {
  beforeEach(() => {
    NotificationService.clearTestNotifications();
  });

  it('stores access notifications without secret payloads', async () => {
    const service = new NotificationService();
    await service.send({
      event: 'ACCESS_REQUESTED',
      tenantId: 't1',
      toUserId: 'user-1',
      subject: 'Access request pending review',
      body: 'A team member requested access to billing-api config.',
      correlationId: 'req-1',
    });
    const drained = NotificationService.drainTestNotifications();
    expect(drained[0]?.event).toBe('ACCESS_REQUESTED');
    expect(JSON.stringify(drained)).not.toMatch(/password|secret/i);
  });
});
