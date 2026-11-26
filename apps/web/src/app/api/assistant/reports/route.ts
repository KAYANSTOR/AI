import {
  handleAssistantReportsGet,
  handleAssistantReportsPost,
} from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleAssistantReportsGet(request)
}

export async function POST(request: Request) {
  return handleAssistantReportsPost(request)
}
