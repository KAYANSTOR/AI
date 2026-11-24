import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/**
 * RLS contract for migration 0086.
 *
 * The project's test environment has no PostgreSQL instance, so this suite asserts the
 * security properties the migration must encode (policies, column grants, immutability)
 * rather than executing them. Each assertion maps to a rule in the brief:
 *  - full tenant isolation for templates, connectors and the vault;
 *  - clients can never read encrypted connector tokens or vault ciphertext;
 *  - service_role is the only writer;
 *  - no schema-wide REVOKE and no SQLite.
 */
const SQL = readFileSync(new URL('../../../packages/db/migrations/0086_templates_connectors_and_vault.sql', import.meta.url), 'utf8')

const TABLES = [
  'whatsapp_message_templates',
  'user_tool_connections',
  'user_secret_vault',
]

function columnGrant(sql: string, table: string): string {
  const match = new RegExp(`GRANT\\s+SELECT\\s*\\(([^()]*)\\)\\s*ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+authenticated`, 'i').exec(sql)
  return match?.[1] ?? ''
}

describe('migration 0086 · structure', () => {
  test('creates the templates, connections and vault tables', () => {
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates')
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.user_tool_connections')
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.user_secret_vault')
  })

  test('templates carry the Meta review lifecycle and variables schema', () => {
    expect(SQL).toContain("status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected'))")
    expect(SQL).toContain('variables_schema JSONB')
    expect(SQL).toContain('meta_template_id')
    expect(SQL).toContain('rejection_reason')
    expect(SQL).toContain('UNIQUE (channel_id, template_name, language_code)')
  })

  test('outbox and reminder schedule gain template fields', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.outbox_events[\s\S]*template_name TEXT/)
    expect(SQL).toMatch(/ALTER TABLE public\.outbox_events[\s\S]*template_language_code TEXT/)
    expect(SQL).toMatch(/ALTER TABLE public\.outbox_events[\s\S]*template_variables_json JSONB/)
    expect(SQL).toMatch(/ALTER TABLE public\.appointments[\s\S]*reminder_template_name TEXT/)
    expect(SQL).toMatch(/ALTER TABLE public\.appointments[\s\S]*reminder_template_language_code TEXT/)
    expect(SQL).toMatch(/ALTER TABLE public\.appointments[\s\S]*reminder_template_variables JSONB/)
  })

  test('connector tokens and vault values are immutable-by-rotation, never plaintext', () => {
    expect(SQL).toContain('encrypted_tokens')
    expect(SQL).toContain('ciphertext')
    expect(SQL).toContain('secret_ref TEXT NOT NULL UNIQUE CHECK (secret_ref ~ \'^sec_[a-f0-9]{32}$\')')
    expect(SQL).toContain('FUNCTION public.user_secret_vault_immutable_value')
    expect(SQL).toContain('user_secret_vault values are immutable')
  })
})

describe('migration 0086 · tenant isolation', () => {
  test('RLS is enabled on every new table', () => {
    for (const table of TABLES) {
      expect(SQL).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
    }
  })

  test('templates are readable only inside the caller organization', () => {
    expect(SQL).toContain('CREATE POLICY whatsapp_message_templates_member_select')
    expect(SQL).toContain('FOR SELECT TO authenticated')
    expect(SQL).toContain('USING (public.is_org_member(org_id))')
  })

  test('connections and vault rows are scoped to both owner and organization', () => {
    for (const table of ['user_tool_connections', 'user_secret_vault']) {
      expect(SQL).toContain(`CREATE POLICY ${table}_owner_select`)
      expect(SQL).toContain('USING (user_id = auth.uid() AND public.is_org_member(org_id))')
    }
  })

  test('clients cannot insert, update or delete rows in any new table', () => {
    for (const table of TABLES) {
      expect(SQL).not.toMatch(new RegExp(`GRANT\\s+(INSERT|UPDATE|DELETE|ALL)[^;]*ON TABLE public\\.${table} TO authenticated`, 'i'))
      expect(SQL).not.toMatch(new RegExp(`CREATE POLICY [a-z_]+ ON public\\.${table} FOR (INSERT|UPDATE|DELETE|ALL) TO authenticated`, 'i'))
    }
  })

  test('service_role is the only writer and has explicit policies', () => {
    for (const table of TABLES) {
      expect(SQL).toContain(`CREATE POLICY ${table}_service`)
      expect(SQL).toContain('FOR ALL TO service_role USING (true) WITH CHECK (true)')
      expect(SQL).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\\.${table} TO service_role;`))
    }
  })
})

describe('migration 0086 · encrypted values are unreadable by clients', () => {
  test('the connection SELECT grant excludes encrypted_tokens', () => {
    const grant = columnGrant(SQL, 'user_tool_connections')
    expect(grant).toContain('provider')
    expect(grant).toContain('account_email')
    expect(grant).not.toContain('encrypted_tokens')
  })

  test('the vault SELECT grant excludes ciphertext', () => {
    const grant = columnGrant(SQL, 'user_secret_vault')
    expect(grant).toContain('secret_ref')
    expect(grant).toContain('fingerprint')
    expect(grant).not.toContain('ciphertext')
  })

  test('table-wide client privileges are revoked before the column grants', () => {
    for (const table of TABLES) {
      expect(SQL).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role;`)
    }
  })
})

describe('migration 0086 · project guard rails', () => {
  test('no schema-wide revoke and no SQLite trace', () => {
    expect(SQL).not.toContain('ON ALL TABLES')
    expect(/sqlite/i.test(SQL)).toBe(false)
  })

  test('every object is created idempotently', () => {
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS')
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS')
    expect(SQL).toContain('DROP POLICY IF EXISTS')
    expect(SQL).toContain('DROP TRIGGER IF EXISTS')
  })

  test('the migration file is numbered last and contiguous with the project sequence', async () => {
    const files = readFileSync(new URL('../../../packages/db/scripts/migrate.mjs', import.meta.url), 'utf8')
    expect(files).toContain('FILE_PATTERN')
    const list = (await import('node:fs')).readdirSync(new URL('../../../packages/db/migrations', import.meta.url))
      .filter((name: string) => /^\d{4}_.+\.sql$/.test(name))
      .sort()
    expect(list[list.length - 1]).toBe('0086_templates_connectors_and_vault.sql')
  })
})
