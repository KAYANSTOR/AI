import { after } from 'next/server'
import {
  handleAssistantExportsGet,
  handleAssistantExportsPost,
} from '@/lib/central-bot/api-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleAssistantExportsGet(request)
}

export async function POST(request: Request) {
  return handleAssistantExportsPost(request, {
    scheduleBackground: (work) => {
      after(work)
    },
  })
}
