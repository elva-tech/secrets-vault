import mongoose from 'mongoose';
import { SessionModel, type SessionDocument } from '../models/session.model.js';

export class SessionRepository {
  async create(data: {
    sessionId: string;
    userId: string;
    tenantId: string | null;
    scope: 'platform' | 'tenant';
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<SessionDocument> {
    return SessionModel.create({
      ...data,
      userId: new mongoose.Types.ObjectId(data.userId),
      tenantId: data.tenantId ? new mongoose.Types.ObjectId(data.tenantId) : null,
    });
  }

  async findValidBySessionId(sessionId: string): Promise<SessionDocument | null> {
    const now = new Date();
    return SessionModel.findOne({
      sessionId,
      terminatedAt: null,
      expiresAt: { $gt: now },
    }).exec();
  }

  async terminate(sessionId: string): Promise<void> {
    await SessionModel.updateOne({ sessionId }, { terminatedAt: new Date() }).exec();
  }
}
