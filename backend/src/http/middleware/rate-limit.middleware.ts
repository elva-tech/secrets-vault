import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';

/**
 * Behind Render/Vercel, `trust proxy` is enabled and multiple limiters run per request.
 * express-rate-limit v7 validation can throw and become 500s on login routes otherwise.
 */
export function createRateLimiter(options: Partial<Options>): RateLimitRequestHandler {
  const { validate: userValidate, ...rest } = options;
  const validateOverrides =
    userValidate !== undefined && typeof userValidate === 'object' ? userValidate : {};

  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...rest,
    validate: {
      xForwardedForHeader: false,
      ...validateOverrides,
    },
  });
}
