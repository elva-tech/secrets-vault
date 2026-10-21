/**
 * ELVA Notify official API boundary (notify.elvatech.in integration guide).
 *
 * Base URL: https://api.notify.elvatech.in
 * Authentication: appId + apiKey in JSON body (not Bearer headers).
 *
 * OTP:
 *   POST /otp/send   — channel EMAIL, email, brandId
 *   POST /otp/resend
 *   POST /otp/verify — otp field
 *
 * Transactional email:
 *   POST /notify — channel EMAIL, to, subject, html, brandId
 *
 * Implementations: `elva-notify.client.ts`
 */

export const ELVA_NOTIFY_API_PATHS = {
  otpSend: '/otp/send',
  otpResend: '/otp/resend',
  otpVerify: '/otp/verify',
  notify: '/notify',
} as const;
