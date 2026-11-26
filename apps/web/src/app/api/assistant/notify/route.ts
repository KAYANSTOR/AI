import {
  handleAssistantNotifyGet,
  handleAssistantNotifyPost,
} from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handleAssistantNotifyGet()
}

export async function POST(request: Request) {
  return handleAssistantNotifyPost(request)
}
