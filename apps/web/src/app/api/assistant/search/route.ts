import { handleAssistantSearchPost } from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleAssistantSearchPost(request)
}
