import { handleCopilotRequest } from '@/lib/ai/copilot-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** The internal business copilot; guarded by the DB-backed AI usage guard (F3). */
export async function POST(req: Request) {
  return handleCopilotRequest(req)
}
