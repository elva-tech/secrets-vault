import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url(),
  /** When true, serve built SPA from apps/web/dist (standalone single-server deployment). */
  SERVE_WEB: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  VAULT_BASE_DOMAIN: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  REDIS_URL: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().default(28800),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  VAULT_ENCRYPTION_MASTER_KEY: z.string().min(32).optional(),
  ENCRYPTION_PROVIDER: z.enum(['development', 'kms']).default('development'),
  AWS_REGION: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),
  OBJECT_STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  VAULT_FILE_STORAGE_PATH: z.string().default('./data/vault-files'),
  VAULT_MAX_FILE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  OTP_LENGTH: z.coerce.number().default(6),
  OTP_TTL_SECONDS: z.coerce.number().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
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
