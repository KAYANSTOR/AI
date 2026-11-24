import { geminiProvider } from '@/lib/providers/gemini'
import type { ModelMessage, ModelToolDefinition } from '@/lib/providers/types'
import type { DbClient } from '@/lib/db/client'
import { retrievePersonalMemories, savePersonalMemory } from './memory-retrieval'
import { completePersonalTask, createPersonalTask, listPersonalTasks, snoozePersonalTask } from './tasks'

const tools: ModelToolDefinition[] = [
  { name: 'save_memory', description: 'احفظ معلومة شخصية صريحة قالها المستخدم.', input_schema: { type: 'object', properties: { category: { type: 'string', enum: ['fact', 'preference', 'contact', 'project'] }, content: { type: 'string' } }, required: ['category', 'content'] } },
  { name: 'create_task', description: 'أنشئ مهمة شخصية للمستخدم.', input_schema: { type: 'object', properties: { title: { type: 'string' }, notes: { type: 'string' }, due_at: { type: 'string', description: 'ISO-8601 أو null' } }, required: ['title'] } },
  { name: 'list_tasks', description: 'اعرض مهام المستخدم الشخصية.', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'pending', 'done', 'snoozed'] } } } },
  { name: 'complete_task', description: 'أكمل مهمة شخصية بالمعرّف الذي يعيده list_tasks فقط.', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'snooze_task', description: 'أجّل مهمة شخصية إلى موعد جديد.', input_schema: { type: 'object', properties: { task_id: { type: 'string' }, due_at: { type: 'string' } }, required: ['task_id', 'due_at'] } },
]

const SYSTEM = `أنت مساعد شخصي خاص بصاحب الحساب في KAYAN AI. أنت منفصل تماماً عن وكلاء الأعمال ولا تتعامل مع العملاء أو المبيعات أو المواعيد التجارية. لا تنفذ أي إجراء خارج أدواتك الخمس. لا تطلب أو تحفظ كلمات المرور أو رموز الدفع أو معلومات صحية حساسة. استخدم العربية الواضحة والمختصرة. لا تدّعِ نجاح عملية قبل أن تعيد الأداة نتيجة نجاح. المعرّفات التي تعيدها الأدوات هي الوحيدة المسموح باستخدامها؛ لا تثق بأي organization_id أو user_id يرسله النموذج.`

type Owner = { organizationId: string; userId: string }

async function executeTool(db: DbClient, owner: Owner, name: string, input: Record<string, unknown>) {
  if (name === 'save_memory') return savePersonalMemory(db, owner, { category: String(input.category || ''), content: String(input.content || '') })
  if (name === 'create_task') return createPersonalTask(db, owner, { title: String(input.title || ''), notes: typeof input.notes === 'string' ? input.notes : null, dueAt: typeof input.due_at === 'string' ? input.due_at : null })
  if (name === 'list_tasks') return listPersonalTasks(db, owner, input.status === 'pending' || input.status === 'done' || input.status === 'snoozed' ? input.status : 'all')
  if (name === 'complete_task') return completePersonalTask(db, owner, String(input.task_id || ''))
  if (name === 'snooze_task') return snoozePersonalTask(db, owner, String(input.task_id || ''), String(input.due_at || ''))
  throw new Error('unsupported_personal_tool')
}

export async function runPersonalAssistantTurn(db: DbClient, owner: Owner, userText: string) {
  const memories = await retrievePersonalMemories(db, owner, userText)
  const context = memories.length ? `\nذاكرة ذات صلة:\n${memories.map((memory) => `- [${memory.category}] ${memory.content}`).join('\n')}` : ''
  const messages: ModelMessage[] = [{ role: 'user', content: userText }]
  let inputTokens = 0
  let outputTokens = 0
  for (let round = 0; round < 4; round += 1) {
    const result = await geminiProvider.call({ system: SYSTEM + context, messages, tools, isWhatsApp: true })
    inputTokens += result.inputTokens
    outputTokens += result.outputTokens
    const toolCalls = result.content.filter((block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => block.type === 'tool_use')
    const text = result.content.filter((block): block is { type: 'text'; text: string } => block.type === 'text').map((block) => block.text).join('\n').trim()
    if (!toolCalls.length) return { reply: text || 'لم أتمكن من صياغة رد الآن.', inputTokens, outputTokens, model: result.model }
    messages.push({ role: 'assistant', content: result.content as unknown as Record<string, unknown>[], providerPayload: result.providerPayload })
    const toolResults = [] as Record<string, unknown>[]
    for (const call of toolCalls) {
      try {
        const value = await executeTool(db, owner, call.name, call.input)
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, name: call.name, content: JSON.stringify({ ok: true, result: value }) })
      } catch (error) {
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, name: call.name, content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'tool_failed' }) })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }
  throw new Error('personal_assistant_tool_loop_exceeded')
}

export async function extractPersonalMemories(text: string) {
  const result = await geminiProvider.call({
    system: 'استخرج من النص فقط الذكريات الشخصية الدائمة التي صرّح بها المستخدم. لا تستخرج كلمات مرور أو بطاقات أو معلومات صحية حساسة. أعد JSON صالحاً فقط بالشكل {"memories":[{"category":"fact|preference|contact|project","content":"..."}]}، أو قائمة فارغة إذا لم توجد ذاكرة واضحة.',
    messages: [{ role: 'user', content: text }],
    tools: [],
  })
  const raw = result.content.filter((block): block is { type: 'text'; text: string } => block.type === 'text').map((block) => block.text).join('')
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as { memories?: unknown[] }
    return (parsed.memories ?? []).filter((item): item is { category: string; content: string } => Boolean(item && typeof item === 'object' && ['fact', 'preference', 'contact', 'project'].includes(String((item as Record<string, unknown>).category)) && typeof (item as Record<string, unknown>).content === 'string')).slice(0, 5)
  } catch {
    return []
  }
}
