import {
  handleAssistantTrainingGet,
  handleAssistantTrainingPost,
} from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handleAssistantTrainingGet()
}

export async function POST(request: Request) {
  return handleAssistantTrainingPost(request)
}
