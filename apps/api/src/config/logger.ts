const SENSITIVE_KEYS = /password|secret|token|session|authorization|cookie|api[_-]?key|private[_-]?key/i;

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.test(key)) return '[REDACTED]';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(message, meta ? redactObject(meta) : '');
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message, meta ? redactObject(meta) : '');
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message, meta ? redactObject(meta) : '');
  },
};
