import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';

/**
 * Behind Render/Vercel, `trust proxy` is enabled and multiple limiters run per request.
 * express-rate-limit v7 validation can throw and become 500s on login routes otherwise.
 */
export function createRateLimiter(options: Partial<Options>): RateLimitRequestHandler {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
    validate: {
      xForwardedForHeader: false,
      ...(options.validate ?? {}),
    },
  });
}
