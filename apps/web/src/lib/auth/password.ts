import bcrypt from 'bcryptjs'

/** bcrypt, cost 10 — the same format existing accounts were stored with, so old passwords keep working. */
const COST = 10

export const MIN_PASSWORD_LENGTH = 8

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST)
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

/** Constant-ish work for unknown accounts so response time does not reveal whether an email exists. */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.cQ9s4bP0f6bNn8S5tBWBp1bm1xlO'
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH)
}
