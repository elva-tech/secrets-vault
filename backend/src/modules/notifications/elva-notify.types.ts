/** ELVA Notify API — shapes per integration guide (notify.elvatech.in). */

export type ElvaNotifyOtpSendResponse = {
  success?: boolean;
  message?: string;
  expiresIn?: number;
  requestId?: string;
};

export type ElvaNotifyOtpVerifyResponse = {
  success?: boolean;
  message?: string;
  requestId?: string;
};

export type ElvaNotifyTransactionalResponse = {
  success?: boolean;
  message?: string;
  requestId?: string;
};

export class ElvaNotifyApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly requestId?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ElvaNotifyApiError';
  }
}
