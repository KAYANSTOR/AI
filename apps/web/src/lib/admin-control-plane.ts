import { getSql } from '@/lib/db/pool'
import { authorizeKayanAdminRequest } from '@/lib/admin-api-auth'

export function requireAdmin(request: Request) {
  return authorizeKayanAdminRequest(request)
}

export async function auditAdminAction(action: string, entityType: string, entityId: string, summary: string, after: unknown) {
  const sql = getSql()
  await sql`
    INSERT INTO platform_audit_logs (actor_email, actor_role, action, entity_type, entity_id, summary, after_json)
    VALUES (${process.env.OWNER_EMAIL?.trim() || 'kayan-admin-api'}, 'platform_owner', ${action}, ${entityType}, ${entityId}, ${summary}, ${sql.json(after as any)})
  `
}
