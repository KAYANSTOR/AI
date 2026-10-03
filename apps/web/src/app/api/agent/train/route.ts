import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { calculateAgentReadiness } from '@/lib/ai/readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  agentId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(5000),
      })
    )
    .min(1)
    .max(50),
})

type ExtractedFact = {
  title: string
  category: 'business_info' | 'service_info' | 'pricing' | 'policy' | 'faq' | 'general'
  content: string
}

type NewServiceDraft = {
  name: string
  price?: number | null
  currency?: string | null
  durationMinutes?: number | null
  description?: string | null
}

type ModelTrainingOutput = {
  reply: string
  extractedFacts?: ExtractedFact[]
  newServices?: NewServiceDraft[]
  systemPromptAddition?: string | null
}

function parseModelJson(rawText: string): ModelTrainingOutput {
  const clean = rawText.trim()

  // Match ```json ... ``` block
  const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = jsonMatch ? jsonMatch[1] : clean

  try {
    const parsed = JSON.parse(candidate)
    if (parsed && typeof parsed.reply === 'string') {
      return {
        reply: parsed.reply,
        extractedFacts: Array.isArray(parsed.extractedFacts) ? parsed.extractedFacts : [],
        newServices: Array.isArray(parsed.newServices) ? parsed.newServices : [],
        systemPromptAddition:
          typeof parsed.systemPromptAddition === 'string' ? parsed.systemPromptAddition : null,
      }
    }
  } catch {
    // If not JSON, use the raw text as the conversational reply
  }

  return {
    reply: clean.replace(/```(?:json)?[\s\S]*?```/g, '').trim() || clean,
    extractedFacts: [],
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
        .select('setup_description, system_prompt_addition, public_phone_number')
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

  const systemInstruction = `أنت المساعد الذكي لتدريب وتجهيز وكيل الذكاء الاصطناعي الخاص بنشاط «${businessName}».
مهمتك:
إجراء حوار ودي، ذكي، وسلس جداً مع صاحب النشاط لاستخراج وترتيب معلومات شركته، لكي يتمكن الوكيل لاحقاً من الرد على عملاء الشركة عبر قنوات التواصل (مثل WhatsApp والهاتف).

قواعد الحوار والشخصية:
1. التحدث باللغة العربية الطبيعية، بأسلوب ودود، حبوب، محترم، وذكي. تفهم اللهجات العامية والأخطاء الإملائية.
2. لا تسأل المستخدم عن كل شيء دفعة واحدة أبداً! اسأل سؤالاً واحداً أو سؤالين مترابطين في كل رسالة فقط.
3. تفاعل مع إجابة المستخدم: أظهر فهمك للمعلومة وشجعه بكلمات طيبة، ثم انتقل بسلاسة إلى النقطة التالية الأكثر أهمية.
4. اكتشف المعلومات الناقصة تلقائياً واطلبها في الوقت المناسب (اسم الشركة ووصفها، الخدمات والمنتجات، الأسعار، أوقات العمل وأيام الإجازة، الفروع والمواقع، أرقام التواصل، طرق وشروط الحجز والإلغاء، الأسئلة الشائعة، متى يتم التحويل لموظف بشري، ونبرة التعامل).
5. إذا كانت هناك معلومات معروفة مسبقاً، لا تعيد السؤال عنها إلا للتأكيد أو التفصيل.

المعلومات المعروفة حالياً عن الشركة:
- اسم النشاط: ${businessName}
- الخدمات المسجلة: ${(services ?? []).map((s) => s.name).join('، ') || 'لا توجد خدمات مسجلة بعد'}
- أوقات العمل المسجلة: ${hoursSummary || 'غير محددة بعد'}
- الجاهزية الحالية: ${readiness.score}%
- أبرز المعلومات الناقصة حالياً: ${missingSummary || 'اكتملت المعلومات الأساسية'}

صيغة الإخراج المطلوبة:
يجب أن ترجع النتيجة ككتلة JSON داخل علامات \`\`\`json ... \`\`\` بالهيكل التالي:
{
  "reply": "نص ردك العربي الودود والمحاور، يرحب بالإجابة ويطرح السؤال التالي",
  "extractedFacts": [
    {
      "title": "عنوان واضح وموجز للمعلومة المستخلصة من رسالة المستخدم الأخيرة (مثل: أوقات العمل الرسمية، سياسة الإلغاء، خدمة التنظيف الشامل، عنوان الفرع الرئيسي)",
      "category": "business_info" | "service_info" | "pricing" | "policy" | "faq" | "general",
      "content": "شرح المعلومة المستخلصة بالتفصيل والصيغة الدقيقة المرتبة"
    }
  ],
  "newServices": [
    {
      "name": "اسم الخدمة إن ذكرت خدمة جديدة",
      "price": 150,
      "currency": "SAR",
      "durationMinutes": 60,
      "description": "وصف الخدمة"
    }
  ],
  "systemPromptAddition": "أي توجيهات أسلوب ونبرة أو قواعد تحويل لموظف بشري إن ذكرت في الحوار"
}

إذا لم تتضمن رسالة المستخدم الأخيرة أي معلومة جديدة قابلة للحفظ (مثلاً مجرد تحية أو استفسار)، اجعل extractedFacts مصفوفة فارغة [] وركز على السؤال التالي.`

  const modelMessages = [
    {
      role: 'user',
      parts: [{ text: systemInstruction }],
    },
    {
      role: 'model',
      parts: [
        {
          text: '```json\n{"reply": "أهلاً بك 👋 أنا مساعدك الذكي لشركتك. سأساعدك في تجهيز معلومات شركتك حتى أتمكن من الرد على عملائك بطريقة صحيحة وطبيعية. سأطرح عليك بعض الأسئلة، وأثناء حديثنا سأكتشف المعلومات التي أحتاجها وأرتبها تلقائيًا. ما اسم شركتك وما الخدمة أو النشاط الرئيسي الذي تقدمونه؟", "extractedFacts": []}\n```',
        },
      ],
    },
    ...body.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ]

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
  let rawText = ''
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: modelMessages,
          generationConfig: {
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      console.error('Gemini training call error:', response.status, errJson)
      return NextResponse.json(
        { error: 'gemini_error', details: errJson?.error?.message || response.statusText },
        { status: 502 }
      )
    }

    const data = await response.json()
    rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } catch (err) {
    console.error('Gemini training request failed:', err)
    return NextResponse.json({ error: 'ai_request_failed' }, { status: 502 })
  }

  const parsed = parseModelJson(rawText)
  const savedFacts: Array<{ title: string; category: string }> = []

  // Persist extracted facts into knowledge_base
  if (parsed.extractedFacts && parsed.extractedFacts.length > 0) {
    for (const fact of parsed.extractedFacts) {
      if (!fact.title || !fact.content) continue
      const title = fact.title.trim().slice(0, 255)
      const content = fact.content.trim()
      const category = ['business_info', 'service_info', 'pricing', 'policy', 'faq', 'general'].includes(
        fact.category
      )
        ? fact.category
        : 'general'

      // Check for existing item with identical or very similar title in this org
      const { data: existing } = await supabase
        .from('knowledge_base')
        .select('id')
        .eq('organization_id', context.organizationId)
        .ilike('title', title)
        .maybeSingle()

      if (existing?.id) {
        await supabase
          .from('knowledge_base')
          .update({
            content,
            category,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('knowledge_base').insert({
          organization_id: context.organizationId,
          title,
          content,
          category,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
      }
      savedFacts.push({ title, category })
    }
  }

  // Persist new services if extracted
  if (parsed.newServices && parsed.newServices.length > 0) {
    for (const s of parsed.newServices) {
      if (!s.name || !s.name.trim()) continue
      const name = s.name.trim()

      const { data: existingSvc } = await supabase
        .from('services')
        .select('id')
        .eq('organization_id', context.organizationId)
        .ilike('name', name)
        .maybeSingle()

      if (!existingSvc) {
        await supabase.from('services').insert({
          organization_id: context.organizationId,
          name,
          description: s.description || null,
          price_amount: s.price != null ? Number(s.price) : null,
          price_currency: s.currency || 'SAR',
          duration_minutes: s.durationMinutes != null ? Number(s.durationMinutes) : 30,
          is_active: true,
        })
        savedFacts.push({ title: `خدمة جديدة: ${name}`, category: 'service_info' })
      }
    }
  }

  // Persist system prompt additions if provided
  if (parsed.systemPromptAddition && parsed.systemPromptAddition.trim()) {
    const addition = parsed.systemPromptAddition.trim()
    const currentAddition = profile?.system_prompt_addition || ''
    const merged = currentAddition ? `${currentAddition}\n${addition}` : addition

    await supabase
      .from('business_profiles')
      .update({
        system_prompt_addition: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', context.organizationId)

    // Publish to agent prompt versions
    await supabase.rpc('publish_agent_prompt', {
      p_agent_id: agent.id,
      p_system_prompt_addition: merged,
    })
  }

  // Recalculate agent readiness after any new data has been saved
  const updatedReadiness = await calculateAgentReadiness(supabase, context.organizationId)

  return NextResponse.json({
    reply: parsed.reply,
    savedFacts,
    readiness: updatedReadiness,
  })
}
