import crypto from 'node:crypto';

let ephemeralEncryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const configured = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (configured) {
    // Support 32-byte base64 or arbitrary passphrase derived via SHA-256
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
    return crypto.createHash('sha256').update(configured).digest();
  }
  if (!ephemeralEncryptionKey) {
    ephemeralEncryptionKey = crypto.randomBytes(32);
  }
  return ephemeralEncryptionKey;
}

export function isEncryptionKeyConfigured(): boolean {
  return Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY?.trim());
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string): string {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) {
    return false;
  }
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted secret format.');
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const encrypted = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function maskSecret(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'غير محدد';
  if (trimmed.length <= 4) return '••••••••';
  return `••••••••${trimmed.slice(-4)}`;
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gsk_[A-Za-z0-9_-]{16,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /(password|passcode|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
];

export function sanitizeLogText(input: string): string {
  let sanitized = input;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// RFC 6238 Base32 TOTP helpers (zero external dependencies)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let output = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timestampMs = Date.now(), stepSeconds = 30): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return String(code).padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string, timestampMs = Date.now()): boolean {
  const normalized = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }
  const stepMs = 30_000;
  for (const offset of [-1, 0, 1]) {
    const expected = generateTotpCode(secret, timestampMs + offset * stepMs);
    if (crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}
