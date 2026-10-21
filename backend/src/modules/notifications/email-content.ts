import type { NotificationPayload } from './notification.types.js';

export function buildEmailContent(
  payload: Pick<NotificationPayload, 'body' | 'subject'>,
  workspaceUrl?: string,
): { text: string; html: string } {
  const lines = [payload.body];
  if (workspaceUrl) {
    lines.push('', `Workspace: ${workspaceUrl}`);
  }
  const text = lines.join('\n');
  const html = `<p>${lines.map((l) => (l ? l.replace(/</g, '&lt;') : '<br/>')).join('</p><p>')}</p>`;
  return { text, html };
}
