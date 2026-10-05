import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../../../config/env.js';
import { OtpStatus } from '@vault/shared';
import { OtpModel } from '../models/otp.model.js';
import mongoose from 'mongoose';

export class OtpService {
  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  generateCode(): string {
    const { OTP_LENGTH } = loadEnv();
    const max = 10 ** OTP_LENGTH;
    const num = randomInt(0, max);
    return num.toString().padStart(OTP_LENGTH, '0');
  }

  async createForRequest(tenantId: string, accessRequestId: string): Promise<string> {
    const { OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS } = loadEnv();
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await OtpModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      accessRequestId: new mongoose.Types.ObjectId(accessRequestId),
      hashedCode: this.hash(code),
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      status: OtpStatus.ACTIVE,
    });
    return code;
  }

  async verify(
    tenantId: string,
    accessRequestId: string,
    submitted: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const record = await OtpModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      accessRequestId: new mongoose.Types.ObjectId(accessRequestId),
    })
      .select('+hashedCode')
      .exec();

    if (!record) return { ok: false, reason: 'INVALID_OTP' };
    if (record.status !== OtpStatus.ACTIVE) return { ok: false, reason: 'INVALID_OTP' };
    if (record.expiresAt.getTime() <= Date.now()) {
      record.status = OtpStatus.EXPIRED;
      await record.save();
      return { ok: false, reason: 'OTP_EXPIRED' };
    }
    if (record.attemptCount >= record.maxAttempts) {
      record.status = OtpStatus.LOCKED;
      await record.save();
      return { ok: false, reason: 'OTP_LOCKED' };
    }

    const submittedHash = this.hash(submitted);
    const valid = timingSafeEqual(Buffer.from(submittedHash), Buffer.from(record.hashedCode));
    if (!valid) {
      record.attemptCount += 1;
      if (record.attemptCount >= record.maxAttempts) {
        record.status = OtpStatus.LOCKED;
      }
      await record.save();
      return { ok: false, reason: 'INVALID_OTP' };
    }

    record.status = OtpStatus.VERIFIED;
    record.verifiedAt = new Date();
    await record.save();
    return { ok: true };
  }

  async revokeForRequest(accessRequestId: string): Promise<void> {
    await OtpModel.updateMany(
      { accessRequestId: new mongoose.Types.ObjectId(accessRequestId) },
      { status: OtpStatus.REVOKED },
    );
  }
}
