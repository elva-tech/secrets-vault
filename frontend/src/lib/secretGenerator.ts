/** Default length for generated rotation secrets (meets typical min length 8). */
export const DEFAULT_SECRET_LENGTH = 32;

const CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=?';

const CHARSET_MAX = 256 - (256 % CHARSET.length);

export class SecureRandomUnavailableError extends Error {
  constructor() {
    super('Secure random generation is not available in this browser.');
    this.name = 'SecureRandomUnavailableError';
  }
}

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) {
    throw new SecureRandomUnavailableError();
  }
  return c;
}

/** Unbiased index into CHARSET using rejection sampling. */
function randomCharsetIndex(crypto: Crypto): number {
  const buf = new Uint8Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const byte = buf[0];
    if (byte < CHARSET_MAX) {
      return byte % CHARSET.length;
    }
  }
}

/**
 * Generate a cryptographically strong secret suitable for passwords, tokens, and API keys.
 */
export function generateSecureSecret(length = DEFAULT_SECRET_LENGTH): string {
  if (length < 8) {
    throw new RangeError('Secret length must be at least 8 characters.');
  }
  const crypto = getCrypto();
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[randomCharsetIndex(crypto)];
  }
  return out;
}
