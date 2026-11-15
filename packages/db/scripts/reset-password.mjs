#!/usr/bin/env node
/**
 * Sets a new password for an account and signs it out everywhere.
 *
 *   DATABASE_URL=postgres://... node packages/db/scripts/reset-password.mjs user@example.com
 *
 * The new password is read from standard input (or the NEW_PASSWORD variable) so it never
 * appears in shell history or the process list.
 */
import { createInterface } from 'node:readline'
import postgres from 'postgres'

const email = process.argv[2]?.trim().toLowerCase()
if (!email || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... node packages/db/scripts/reset-password.mjs <email>')
  process.exit(1)
}

async function readPassword() {
  if (process.env.NEW_PASSWORD) return process.env.NEW_PASSWORD
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false })
  process.stderr.write('New password: ')
  for await (const line of rl) {
    rl.close()
    return line
  }
  return ''
}

const password = (await readPassword()).trim()
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const url = process.env.DATABASE_URL
const local = /@(localhost|127\.0\.0\.1|[^/]*\.railway\.internal)[:/]/.test(url)
const sql = postgres(url, { ssl: local ? false : 'require', max: 1, onnotice: () => {} })

try {
  const rows = await sql`
    update auth.users
    set encrypted_password = crypt(${password}, gen_salt('bf', 12)),
        session_version = session_version + 1,
        updated_at = now()
    where lower(email) = ${email} and deleted_at is null
    returning id`
  if (!rows.length) {
    console.error(`No active account found for ${email}.`)
    process.exitCode = 1
  } else {
    console.log(`Password updated for ${email}; existing sessions were revoked.`)
  }
} finally {
  await sql.end({ timeout: 5 })
}
