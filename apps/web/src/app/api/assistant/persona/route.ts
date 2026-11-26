import {
  handleAssistantPersonaGet,
  handleAssistantPersonaPost,
} from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handleAssistantPersonaGet()
}

export async function POST(request: Request) {
  return handleAssistantPersonaPost(request)
}

export async function PUT(request: Request) {
  return handleAssistantPersonaPost(request)
}
