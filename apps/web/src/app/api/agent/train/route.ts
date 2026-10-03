import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { calculateAgentReadiness } from '@/lib/ai/readiness'
import {
  saveValidatedKnowledge,
  saveValidatedServices,
  type ValidatedFact,
  type ValidatedServiceDraft,
} from '@/lib/knowledge/layer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  agentId: z.string().uuid(),
  stream: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1),
})

function normalizeGeminiMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const valid = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      content: m.content.trim(),
    }))

  if (valid.length === 0) return []

  // Retain the last 30 turns to avoid exceeding context while preserving recency
  const sliced = valid.slice(-30)

  const merged: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
  for (const m of sliced) {
    if (merged.length > 0 && merged[merged.length - 1].role === m.role) {
      merged[merged.length - 1].parts[0].text += '\n\n' + m.content
    } else {
      merged.push({
        role: m.role,
        parts: [{ text: m.content }],
      })
    }
  }

  // Ensure first message is user for Gemini API
  if (merged.length > 0 && merged[0].role === 'model') {
    merged.unshift({
      role: 'user',
      parts: [{ text: 'مرحباً، أود بدء تدريب الوكيل لمعلومات الشركة.' }],
    })
  }

  return merged
}

const KNOWLEDGE_DELIMITER = '---KNOWLEDGE_EXTRACT---'

type ModelExtractionBlock = {
  extractedFacts?: ValidatedFact[]
  newServices?: ValidatedServiceDraft[]
  systemPromptAddition?: string | null
}

function parseExtractionBlock(rawText: string): { reply: string; extraction: ModelExtractionBlock } {
  const delimIndex = rawText.indexOf(KNOWLEDGE_DELIMITER)
  if (delimIndex === -1) {
    // Check if the whole text is a JSON block
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        if (parsed && typeof parsed.reply === 'string') {
          return {
            reply: parsed.reply.trim(),
            extraction: {
              extractedFacts: Array.isArray(parsed.extractedFacts) ? parsed.extractedFacts : [],
              newServices: Array.isArray(parsed.newServices) ? parsed.newServices : [],
              systemPromptAddition:
                typeof parsed.systemPromptAddition === 'string' ? parsed.systemPromptAddition : null,
            },
          }
        }
      } catch {
        // Fallback
      }
    }
    return {
      reply: rawText.replace(/```(?:json)?[\s\S]*?```/g, '').trim() || rawText.trim(),
      extraction: {},
    }
  }

  const reply = rawText.slice(0, delimIndex).trim()
  const trailing = rawText.slice(delimIndex + KNOWLEDGE_DELIMITER.length).trim()

  const jsonMatch = trailing.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = jsonMatch ? jsonMatch[1] : trailing

  try {
    const parsed = JSON.parse(candidate)
    return {
      reply,
      extraction: {
        extractedFacts: Array.isArray(parsed.extractedFacts) ? parsed.extractedFacts : [],
        newServices: Array.isArray(parsed.newServices) ? parsed.newServices : [],
        systemPromptAddition:
          typeof parsed.systemPromptAddition === 'string' ? parsed.systemPromptAddition : null,
      },
    }
  } catch {
    return { reply, extraction: {} }
  }
}

export async function POST(req: Request) {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!context.businessId) {
    return NextResponse.json({ error: 'business_not_configured' }, { status: 409 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ai_provider_not_configured' }, { status: 503 })
  }

  const supabase = await createClient()

  // Verify the agent belongs to this organization
  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select('id, name, locale, status')
    .eq('id', body.agentId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (agentError || !agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }

  // Load current readiness and existing knowledge to ground the training assistant
  const [readiness, { data: business }, { data: profile }, { data: services }, { data: hours }] =
    await Promise.all([
      calculateAgentReadiness(supabase, context.organizationId),
      supabase
        .from('businesses')
        .select('name')
        .eq('id', context.businessId)
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      supabase
        .from('business_profiles')
        .select('setup_description, system_prompt_addition, public_phone_number, industry')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      supabase
        .from('services')
        .select('name, price_amount, duration_minutes')
        .eq('organization_id', context.organizationId)
        .eq('is_active', true),
      supabase
        .from('business_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('organization_id', context.organizationId)
        .eq('is_closed', false),
    ])

  const businessName = business?.name || context.organizationName
  const missingSummary = readiness.missingItems.map((m) => m.label).join('، ')
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const hoursSummary = (hours ?? [])
    .map((h) => `${dayNames[h.day_of_week]}: ${h.open_time?.slice(0, 5)}–${h.close_time?.slice(0, 5)}`)
    .join('، ')

  const systemInstruction = `أنت المساعد الذكي لتدريب وتجهيز وكيل الذكاء الاصطناعي لنشاط «${businessName}».
مهمتك:
إجراء حوار تفاعلي ذكي وسلس مع صاحب النشاط لاستخراج وتأكيد وترتيب معلومات شركته بدقة، ليتمكن الوكيل لاحقاً من خدمة عملاء الشركة (مثلاً عبر WhatsApp والهاتف).

قواعد السلوك والحوار:
1. التحدث باللغة العربية الطبيعية، بأسلوب مرحّب، ذكي، وودود يفهم اللهجات العربية العامية.
2. اطرح سؤالاً واحداً أو سؤالين مترابطين في كل رسالة فقط (لا تغرق المستخدم بأسئلة متعددة).
3. أظهر فهمك لكلام المستخدم وشجعه بكلمات طيبة، ثم اسأله عن المعلومة الناقصة التالية.
4. افصل بدقة بين:
   - سياق الحوار والمجاملات (مثل: أهلاً، شكراً، تمام) -> لا تحفظه كمعرفة.
   - المعرفة المؤكدة للشركة -> احفظها بدقة في extractedFacts.
   - المعلومات غير المؤكدة أو الغامضة أو المتناقضة -> لا تحفظها، بل اسأل صاحب الشركة للتأكيد والتوضيح أولاً.

المعلومات المعروفة حالياً عن الشركة:
- اسم النشاط: ${businessName}
- المجال: ${profile?.industry || 'غير محدد'}
- الخدمات المسجلة: ${(services ?? []).map((s) => s.name).join('، ') || 'لا توجد خدمات بعد'}
- أوقات العمل المسجلة: ${hoursSummary || 'غير محددة بعد'}
- الجاهزية الحالية: ${readiness.score}%
- أبرز النواقص التي يُنصح بالسؤال عنها: ${missingSummary || 'اكتملت المعلومات الأساسية'}

طريقة الإخراج الإلزامية:
أولاً: اكتب ردك العربي المباشر لصاحب الشركة بشكل طبيعي جداً.
ثم في نهاية الرد تماماً ضع السطر التالي بالضبط:
${KNOWLEDGE_DELIMITER}
ثم اكتب كتلة JSON بهذه البنية:
\`\`\`json
{
  "extractedFacts": [
    {
      "title": "عنوان موجز للمعلومة المؤكدة (مثال: هوية ونشاط الشركة، أوقات العمل الرسمية، سياسة الإلغاء، أسعار تنظيم الأعراس)",
      "category": "business_info" | "service_info" | "pricing" | "policy" | "faq" | "general",
      "content": "شرح المعلومة بالتفصيل والوضوح كما ذكرها المستخدم"
    }
  ],
  "newServices": [
    {
      "name": "اسم الخدمة",
      "price": 100,
      "currency": "SAR",
      "durationMinutes": 60,
      "description": "وصف الخدمة"
    }
  ],
  "systemPromptAddition": "أي توجيهات أسلوب أو نبرة أو سياسات تحويل لموظف إن ذكرت"
}
\`\`\`

إذا لم يذكر المستخدم في رسالته الأخيرة أي معلومة جديدة مؤكدة للشركة، اجعل extractedFacts مصفوفة فارغة [].`

  const normalizedContents = normalizeGeminiMessages(body.messages)
  if (normalizedContents.length === 0) {
    return NextResponse.json({ error: 'messages_empty' }, { status: 400 })
  }

  const candidateModels = Array.from(
    new Set([
      process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
    ])
  )

  // If streaming is requested:
  if (body.stream) {
    let geminiRes: Response | null = null
    let lastStreamError = ''

    for (const model of candidateModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:streamGenerateContent?alt=sse`

      try {
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents: normalizedContents,
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.3,
            },
          }),
        })

        if (res.ok && res.body) {
          geminiRes = res
          break
        }

        const errJson = await res.json().catch(() => ({}))
        lastStreamError = errJson?.error?.message || res.statusText
        continue
      } catch (e) {
        lastStreamError = e instanceof Error ? e.message : String(e)
        continue
      }
    }

    if (!geminiRes || !geminiRes.body) {
      return NextResponse.json({ error: 'gemini_stream_failed', details: lastStreamError }, { status: 502 })
    }

    const encoder = new TextEncoder()
    const reader = geminiRes.body.getReader()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        let fullAccumulated = ''
        let reachedDelimiter = false

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunkStr = decoder.decode(value, { stream: true })
            const lines = chunkStr.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataJson = line.slice(6).trim()
                if (dataJson === '[DONE]') continue
                try {
                  const parsedChunk = JSON.parse(dataJson)
                  const textPart =
                    parsedChunk?.candidates?.[0]?.content?.parts?.[0]?.text || ''

                  if (textPart) {
                    fullAccumulated += textPart

                    if (!reachedDelimiter) {
                      const delimIdx = fullAccumulated.indexOf(KNOWLEDGE_DELIMITER)
                      if (delimIdx !== -1) {
                        reachedDelimiter = true
                        // Emit the remaining visible text before the delimiter
                        const beforeDelim = fullAccumulated.slice(0, delimIdx)
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'token_reset', content: beforeDelim.trim() })}\n\n`
                          )
                        )
                      } else {
                        // Stream token to client
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'token', content: textPart })}\n\n`
                          )
                        )
                      }
                    }
                  }
                } catch {
                  // Skip invalid JSON lines
                }
              }
            }
          }

          // Complete response received: parse and persist knowledge
          const { reply, extraction } = parseExtractionBlock(fullAccumulated)

          let savedFacts: Array<{ title: string; category: string }> = []

          // Persist confirmed facts via Knowledge Layer
          if (extraction.extractedFacts && extraction.extractedFacts.length > 0) {
            const persisted = await saveValidatedKnowledge(
              supabase,
              context.organizationId,
              extraction.extractedFacts
            )
            savedFacts = persisted.map((p) => ({ title: p.title, category: p.category }))
          }

          // Persist services if any
          if (extraction.newServices && extraction.newServices.length > 0) {
            const persistedServices = await saveValidatedServices(
              supabase,
              context.organizationId,
              extraction.newServices
            )
            for (const s of persistedServices) {
              savedFacts.push({ title: `خدمة: ${s.name}`, category: 'service_info' })
            }
          }

          // Persist system prompt additions if any
          if (extraction.systemPromptAddition && extraction.systemPromptAddition.trim()) {
            const addition = extraction.systemPromptAddition.trim()
            const currentAddition = profile?.system_prompt_addition || ''
            const merged = currentAddition ? `${currentAddition}\n${addition}` : addition

            await supabase
              .from('business_profiles')
              .update({
                system_prompt_addition: merged,
                updated_at: new Date().toISOString(),
              })
              .eq('organization_id', context.organizationId)

            await supabase.rpc('publish_agent_prompt', {
              p_agent_id: agent.id,
              p_system_prompt_addition: merged,
            })
          }

          // Recalculate agent readiness
          const updatedReadiness = await calculateAgentReadiness(supabase, context.organizationId)

          // Send final completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                reply: reply || fullAccumulated.trim(),
                savedFacts,
                readiness: updatedReadiness,
              })}\n\n`
            )
          )
        } catch (streamErr) {
          console.error('Error during training stream handling:', streamErr)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: 'حدث انقطاع في المعالجة.',
              })}\n\n`
            )
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  // Non-streaming fallback
  let rawText = ''
  let lastError = ''

  for (const model of candidateModels) {
    const nonStreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`

    try {
      const response = await fetch(nonStreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: normalizedContents,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.3,
          },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        break
      } else {
        const errJson = await response.json().catch(() => ({}))
        lastError = errJson?.error?.message || response.statusText
        if (response.status === 429 || response.status === 503) {
          continue
        }
        return NextResponse.json({ error: 'gemini_error', details: lastError }, { status: 502 })
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!rawText) {
    return NextResponse.json({ error: 'ai_request_failed', details: lastError }, { status: 502 })
  }

  const { reply, extraction } = parseExtractionBlock(rawText)
  let savedFacts: Array<{ title: string; category: string }> = []

  // Persist confirmed facts via Knowledge Layer
  if (extraction.extractedFacts && extraction.extractedFacts.length > 0) {
    const persisted = await saveValidatedKnowledge(
      supabase,
      context.organizationId,
      extraction.extractedFacts
    )
    savedFacts = persisted.map((p) => ({ title: p.title, category: p.category }))
  }

  // Persist services if any
  if (extraction.newServices && extraction.newServices.length > 0) {
    const persistedServices = await saveValidatedServices(
      supabase,
      context.organizationId,
      extraction.newServices
    )
    for (const s of persistedServices) {
      savedFacts.push({ title: `خدمة: ${s.name}`, category: 'service_info' })
    }
  }

  // Persist system prompt additions if any
  if (extraction.systemPromptAddition && extraction.systemPromptAddition.trim()) {
    const addition = extraction.systemPromptAddition.trim()
    const currentAddition = profile?.system_prompt_addition || ''
    const merged = currentAddition ? `${currentAddition}\n${addition}` : addition

    await supabase
      .from('business_profiles')
      .update({
        system_prompt_addition: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', context.organizationId)

    await supabase.rpc('publish_agent_prompt', {
      p_agent_id: agent.id,
      p_system_prompt_addition: merged,
    })
  }

  // Recalculate agent readiness
  const updatedReadiness = await calculateAgentReadiness(supabase, context.organizationId)

  return NextResponse.json({
    reply: reply || rawText.trim(),
    savedFacts,
    readiness: updatedReadiness,
  })
}
