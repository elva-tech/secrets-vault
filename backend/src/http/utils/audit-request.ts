import type { Request } from 'express';

export function auditContextFromRequest(req: Request): {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
} {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    requestId: req.requestId,
  };
}
