/**
 * The optional "try your new employee" reply test.
 *
 * It calls the same provider with the same business prompt the runtime uses for a real
 * customer message, so a passing result means the agent really can answer. When no model
 * credential is configured the test reports that it was skipped instead of pretending to
 * have answered — the required Go Live checks stay in smoke-test.ts and are unaffected.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'
import { geminiProvider } from '@/lib/providers/gemini'

export type ReplyTestResult = {
  status: 'answered' | 'skipped' | 'failed'
  reply?: string
  message: string
}

export async function tryAgentReply(input: {
  supabase: SupabaseClient
  organizationId: string
  agentId: string | null
  message: string
}): Promise<ReplyTestResult> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      status: 'skipped',
      message: 'تجربة الرد غير متاحة الآن: مزوّد الذكاء الاصطناعي غير مُهيّأ على الخادم.',
    }
  }

  const message = input.message.trim()
  if (message.length < 2) {
    return { status: 'failed', message: 'اكتب رسالة تجريبية ليتم الرد عليها.' }
  }

  try {
    const system = await buildBusinessSystemPrompt(
      input.supabase,
      input.organizationId,
      input.agentId
    )
    const result = await geminiProvider.call({
      system,
      messages: [{ role: 'user', content: message }],
      tools: [],
    })
    const reply = result.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    if (!reply) return { status: 'failed', message: 'لم يصل رد من الوكيل. أعد المحاولة.' }
    return { status: 'answered', reply, message: 'الرد تم بنجاح ✅' }
  } catch (error) {
    console.error('Agent reply test failed', error)
    return {
      status: 'failed',
      message: 'لم يكتمل الرد التجريبي. تحقق من إعداد الوكيل ثم أعد المحاولة.',
    }
  }
}
