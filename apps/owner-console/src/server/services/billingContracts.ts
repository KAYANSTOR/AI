import { createHash } from 'node:crypto';

/**
 * Pure, dependency-free contracts shared between the owner console and apps/web.
 * apps/web tests import this file directly to prove both sides stay in lock-step.
 */

/** Same formula as apps/web lib/billing/free-tier.ts quotaFingerprint (kayan-free-quota:v1). */
export function freeQuotaFingerprint(value: string): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw.length > 200) return null;
  const digits = raw.replace(/\D/g, '');
  const normalized = digits.length >= 7 && digits.length <= 15 && /^[+\d\s()-]+$/.test(raw) ? 'phone:' + digits : 'id:' + raw;
  return createHash('sha256').update('kayan-free-quota:v1:' + normalized).digest('hex');
}

export const YER_RATE_SETTING_KEY = 'billing.yer_per_usd';

/** Extracts the numeric YER/USD rate from `600` or `{ value: 600, ... }`. Mirrors web parseYerRate. */
export function readYerRate(value: unknown): number | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as Record<string, unknown>)
    ? (value as Record<string, unknown>).value
    : value;
  const rate = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw.trim()) : NaN;
  return Number.isFinite(rate) && rate > 0 && rate < 1_000_000 ? rate : null;
}

/**
 * Validates owner-console settings before they are written. Settings consumed by
 * apps/web (the YER rate) must keep a shape the web parser accepts; otherwise the
 * billing page would silently fall back to "rate unavailable".
 */
export function validatePlatformSettingValue(key: string, value: unknown): unknown {
  if (key !== YER_RATE_SETTING_KEY) return value;
  const rate = readYerRate(value);
  if (rate === null) throw new Error('سعر الصرف يجب أن يكون رقماً أكبر من صفر وأقل من مليون.');
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    value: rate,
    category: typeof base.category === 'string' ? base.category : 'billing',
    description: typeof base.description === 'string' ? base.description : 'سعر صرف الدولار بالريال اليمني',
  };
}

/** Normalizes the optional wallet display order (0..1000). Missing → null (keep current / default). */
export function walletSortOrder(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error('ترتيب العرض يجب أن يكون رقماً صحيحاً بين 0 و1000.');
  return n;
}
