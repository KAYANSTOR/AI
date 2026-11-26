import {
  handleAssistantDirectivesGet,
  handleAssistantDirectivesPost,
} from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handleAssistantDirectivesGet()
}

export async function POST(request: Request) {
  return handleAssistantDirectivesPost(request)
}
