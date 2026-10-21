import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url(),
  /** When true, serve built SPA from ../frontend/dist (optional combined deploy). */
  SERVE_WEB: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  VAULT_BASE_DOMAIN: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  REDIS_URL: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().default(28800),
  /** Use `none` when the UI and API are on different origins (e.g. Vercel + Render). */
  SESSION_COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  VAULT_ENCRYPTION_MASTER_KEY: z.string().min(32).optional(),
  ENCRYPTION_PROVIDER: z.enum(['development', 'kms']).default('development'),
  AWS_REGION: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),
  OBJECT_STORAGE_PROVIDER: z.enum(['local', 's3', 'cloudinary']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  NOTIFICATION_PROVIDER: z.enum(['log', 'elva_notify']).default('log'),
  ELVA_NOTIFY_API_BASE: z.string().url().optional(),
  /** @deprecated Use ELVA_NOTIFY_API_BASE */
  ELVA_NOTIFY_BASE_URL: z.string().url().optional(),
  ELVA_NOTIFY_APP_ID: z.string().min(1).optional(),
  ELVA_NOTIFY_API_KEY: z.string().min(8).optional(),
  ELVA_NOTIFY_BRAND_ID: z.string().min(1).optional(),
  ELVA_NOTIFY_TIMEOUT_MS: z.coerce.number().default(15_000),
  VAULT_FILE_STORAGE_PATH: z.string().default('./data/vault-files'),
  VAULT_MAX_FILE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  ACCESS_GRANT_DEFAULT_MINUTES: z.coerce.number().default(60),
  JOB_WORKER_INTERVAL_MS: z.coerce.number().default(15000),
  EMAIL_FROM: z.string().email().optional(),
}).superRefine((data, ctx) => {
  if (data.ENCRYPTION_PROVIDER === 'development' && !data.VAULT_ENCRYPTION_MASTER_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'VAULT_ENCRYPTION_MASTER_KEY is required when ENCRYPTION_PROVIDER=development',
      path: ['VAULT_ENCRYPTION_MASTER_KEY'],
    });
  }
  if (data.ENCRYPTION_PROVIDER === 'kms' && !data.AWS_KMS_KEY_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'AWS_KMS_KEY_ID is required when ENCRYPTION_PROVIDER=kms',
      path: ['AWS_KMS_KEY_ID'],
    });
  }
  if (data.OBJECT_STORAGE_PROVIDER === 's3' && !data.S3_BUCKET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'S3_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3',
      path: ['S3_BUCKET'],
    });
  }
  if (data.OBJECT_STORAGE_PROVIDER === 'cloudinary') {
    if (!data.CLOUDINARY_CLOUD_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CLOUDINARY_CLOUD_NAME is required when OBJECT_STORAGE_PROVIDER=cloudinary',
        path: ['CLOUDINARY_CLOUD_NAME'],
      });
    }
    if (!data.CLOUDINARY_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CLOUDINARY_API_KEY is required when OBJECT_STORAGE_PROVIDER=cloudinary',
        path: ['CLOUDINARY_API_KEY'],
      });
    }
    if (!data.CLOUDINARY_API_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CLOUDINARY_API_SECRET is required when OBJECT_STORAGE_PROVIDER=cloudinary',
        path: ['CLOUDINARY_API_SECRET'],
      });
    }
  }
  if (data.NODE_ENV === 'production' && data.NOTIFICATION_PROVIDER === 'log') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'NOTIFICATION_PROVIDER must be elva_notify in production',
      path: ['NOTIFICATION_PROVIDER'],
    });
  }
  if (data.NOTIFICATION_PROVIDER === 'elva_notify') {
    if (!data.ELVA_NOTIFY_APP_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ELVA_NOTIFY_APP_ID is required for ELVA Notify',
        path: ['ELVA_NOTIFY_APP_ID'],
      });
    }
    if (!data.ELVA_NOTIFY_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ELVA_NOTIFY_API_KEY is required for ELVA Notify',
        path: ['ELVA_NOTIFY_API_KEY'],
      });
    }
    if (!data.ELVA_NOTIFY_BRAND_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ELVA_NOTIFY_BRAND_ID is required when NOTIFICATION_PROVIDER=elva_notify',
        path: ['ELVA_NOTIFY_BRAND_ID'],
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
