import { randomInt } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { normalizeE164 } from '@/lib/channels/contacts'
import type { CentralInbound } from '@/lib/central-bot/router'
import { computeReadiness, trainingChecklist, type Readiness, type TrainingTarget } from './checklists'
import { draftPreview, extractTrainingDraft, type ExtractInput, type GenerateFn } from './extract'
import { validateMedia, type MediaKind } from './media'
import {
  approveSubmission,
  cancelSubmission,
  createSubmission,
  loadOwnedSubmission,
  replaceDraft,
  type IndexDeps,
  type InputType,
  type Owner,
} from './submissions'

/**
 * «مدرب كيان» — the WhatsApp trainer.
 *
 * Two entry points share this router:
 *  - channel 'trainer': a dedicated number (KAYAN_TRAINER_WA_*); every message is training.
 *  - channel 'central': the Kayan AI number; training is a 30-minute (sliding) mode opened
 *    with «وضع التدريب» / «#تدريب» / تدريب_CODE and closed with «إنهاء التدريب».
 * Identity is the verified sender phone -> exactly one (org_id, user_id); the member must
 * still be owner/admin on every message. Returns null when the message is not training
 * traffic so the central router continues with the personal assistant.
 */
export type TrainerChannel = 'central' | 'trainer'

export type TrainerDeps = IndexDeps & {
  sendText: (to: string, text: string) => Promise<void>
  sendButtons: (to: string, text: string, buttons: { id: string; title: string }[]) => Promise<void>
  downloadMedia: (mediaId: string) => Promise<{ bytes: Buffer; mimeType: string }>
  transcribe: (media: { bytes: Buffer; mimeType: string }) => Promise<string>
  readDocument?: (media: { bytes: Buffer; mimeType: string }) => Promise<string>
  generate?: GenerateFn
  /** usage_ledger plan check (ai_messages). Throws when the limit is reached. */
  assertLimit?: (db: DbClient, organizationId: string) => Promise<void>
  recordUsage?: (db: DbClient, organizationId: string) => Promise<void>
}

export const SESSION_MINUTES = 30
const CODE_TTL_MINUTES = 15
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TRAINING_ACTIVATION_RE = /^\s*تدريب[_\s-]([A-Za-z0-9]{4,12})\s*$/u
export const TRAINING_MODE_RE = /^\s*(?:#\s*تدريب|وضع\s+التدريب|تدريب)\s*$/u
export const TRAINING_END_RE = /^\s*(?:إنهاء|انهاء|إيقاف|ايقاف|خروج\s+من)\s+التدريب\s*$/u
const PASS_THROUGH_RE = /^\s*(?:(?:إيقاف|ايقاف)\s+فوري|تفعيل[_\s-]?[A-Za-z0-9]{4,12})\s*$/u

const INPUT_LABEL: Record<InputType, string> = { text: 'نص', voice: 'رسالة صوتية', image: 'صورة', document: 'ملف' }

function nowOf(deps: { now?: () => Date }) { return deps.now ? deps.now() : new Date() }
function sessionUntil(deps: { now?: () => Date }) { return new Date(nowOf(deps).getTime() + SESSION_MINUTES * 60_000).toISOString() }

export function trainerLinkUrl(displayNumber: string, code: string) {
  const digits = displayNumber.replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`تدريب_${code}`)}` : ''
}

/** Dashboard side: a single-use, 15-minute code bound to the signed-in owner/admin. */
export async function createTrainerLinkCode(db: DbClient, owner: Owner, options: { now?: () => Date; displayNumber: string }) {
  const expiresAt = new Date(nowOf(options).getTime() + CODE_TTL_MINUTES * 60_000).toISOString()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let code = ''
    for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    const { data: existing } = await db.from('whatsapp_trainer_links').select('id')
      .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
    const patch = { verification_token: code, token_expires_at: expiresAt }
    const { error } = existing
      ? await db.from('whatsapp_trainer_links').update(patch).eq('id', String(existing.id))
      : await db.from('whatsapp_trainer_links').insert({ org_id: owner.organizationId, user_id: owner.userId, ...patch })
    if (error?.code === '23505') continue
    if (error) throw new Error('trainer_code_failed')
    return { code, waLink: trainerLinkUrl(options.displayNumber, code), expiresAt, configured: Boolean(options.displayNumber) }
  }
  throw new Error('trainer_code_failed')
}

export async function isTrainerAdmin(db: DbClient, organizationId: string, userId: string) {
  const { data } = await db.from('organization_members').select('role')
    .eq('organization_id', organizationId).eq('user_id', userId).maybeSingle()
  return data?.role === 'owner' || data?.role === 'admin'
}

export async function loadVerticalId(db: DbClient, organizationId: string): Promise<string | null> {
  const [{ data: profile }, { data: org }] = await Promise.all([
    db.from('business_profiles').select('business_type_id').eq('organization_id', organizationId).maybeSingle(),
    db.from('organizations').select('business_type').eq('id', organizationId).maybeSingle(),
  ])
  return (profile?.business_type_id as string | null | undefined) ?? (org?.business_type as string | null | undefined) ?? null
}

/** Readiness from what the agent can actually use today. */
export async function loadReadiness(db: DbClient, owner: Owner, verticalId: string | null): Promise<Readiness> {
  const { target } = trainingChecklist(verticalId)
  const [{ data: texts }, { data: covered }] = await Promise.all([
    target === 'memory'
      ? db.from('user_memories').select('content').eq('organization_id', owner.organizationId).eq('user_id', owner.userId).limit(300)
      : db.from('knowledge_base').select('title, content').eq('organization_id', owner.organizationId).eq('is_active', true).limit(300),
    db.from('whatsapp_training_submissions').select('checklist_key, user_id, target')
      .eq('org_id', owner.organizationId).eq('status', 'indexed').limit(300),
  ])
  return computeReadiness(verticalId, {
    texts: ((texts ?? []) as Record<string, unknown>[]).map((row) => `${row.title ?? ''} ${row.content ?? ''}`),
    coveredKeys: ((covered ?? []) as Record<string, unknown>[])
      .filter((row) => row.target !== 'memory' || String(row.user_id) === owner.userId)
      .map((row) => String(row.checklist_key ?? ''))
      .filter(Boolean),
  })
}

function readinessLine(readiness: Readiness) {
  return readiness.next
    ? `جاهزية المعرفة: ${readiness.percent}٪.\nالتالي: ${readiness.next.question}`
    : `جاهزية المعرفة: ${readiness.percent}٪. اكتملت العناصر الأساسية، ويمكنك إضافة أي تحديث متى شئت.`
}

async function linkByPhone(db: DbClient, phone: string) {
  const { data } = await db.from('whatsapp_trainer_links').select('*').eq('whatsapp_phone', phone).maybeSingle()
  return data && data.verified_at ? data as Record<string, unknown> : null
}

async function startSession(db: DbClient, link: Record<string, unknown>, to: string, channel: TrainerChannel, deps: TrainerDeps) {
  const owner = { organizationId: String(link.org_id), userId: String(link.user_id) }
  await db.from('whatsapp_trainer_links').update({ session_expires_at: sessionUntil(deps), awaiting_edit_submission_id: null }).eq('id', String(link.id))
  const verticalId = await loadVerticalId(db, owner.organizationId)
  const { vertical, target } = trainingChecklist(verticalId)
  const readiness = await loadReadiness(db, owner, verticalId)
  const scope = target === 'memory' ? 'مساعدك الشخصي' : `قطاع ${vertical.nameAr}`
  await deps.sendText(to, [
    `أهلاً بك في *مدرب كيان* — ${scope}.`,
    'أرسل نصاً أو رسالة صوتية أو صورة (منيو، قائمة أسعار) أو ملف PDF، وسأحوّله إلى معرفة منظمة بعد موافقتك.',
    readinessLine(readiness),
    channel === 'central' ? `تنتهي الجلسة بعد ${SESSION_MINUTES} دقيقة من آخر رسالة. للخروج أرسل: إنهاء التدريب` : '',
  ].filter(Boolean).join('\n'))
  return 'training_started'
}

async function activate(db: DbClient, phone: string, code: string, to: string, channel: TrainerChannel, deps: TrainerDeps) {
  const { data: link } = await db.from('whatsapp_trainer_links').select('*').eq('verification_token', code.toUpperCase()).maybeSingle()
  const valid = link && link.token_expires_at && new Date(String(link.token_expires_at)).getTime() >= nowOf(deps).getTime()
  if (!valid) {
    await deps.sendText(to, 'رمز التدريب غير صحيح أو انتهت صلاحيته. افتح «قاعدة المعرفة» في لوحة كيان واضغط «درّب وكيلك عبر واتساب» من جديد.')
    return 'activation_invalid'
  }
  if (!(await isTrainerAdmin(db, String(link.org_id), String(link.user_id)))) {
    await db.from('whatsapp_trainer_links').update({ verification_token: null, token_expires_at: null }).eq('id', String(link.id))
    await deps.sendText(to, 'تدريب الوكيل متاح لمالك النشاط أو المدير فقط.')
    return 'forbidden'
  }
  const { data: previous } = await db.from('whatsapp_trainer_links').select('id').eq('whatsapp_phone', phone).maybeSingle()
  if (previous && String(previous.id) !== String(link.id)) {
    await db.from('whatsapp_trainer_links').update({ whatsapp_phone: null, verified_at: null, session_expires_at: null }).eq('id', String(previous.id))
  }
  const { error } = await db.from('whatsapp_trainer_links').update({
    whatsapp_phone: phone,
    verified_at: nowOf(deps).toISOString(),
    verification_token: null,
    token_expires_at: null,
  }).eq('id', String(link.id)).eq('verification_token', code.toUpperCase())
  if (error) {
    await deps.sendText(to, 'تعذّر ربط الرقم الآن. حاول مرة أخرى بعد قليل.')
    return 'activation_failed'
  }
  return startSession(db, { ...link, whatsapp_phone: phone }, to, channel, deps)
}

/** «وضع التدريب» from a phone already verified for the personal assistant. */
async function adoptAssistantLink(db: DbClient, phone: string, deps: TrainerDeps) {
  const { data: pa } = await db.from('personal_assistant_links').select('org_id, user_id, verified_at').eq('whatsapp_phone', phone).maybeSingle()
  if (!pa || !pa.verified_at) return null
  const owner = { org_id: String(pa.org_id), user_id: String(pa.user_id) }
  const { data: existing } = await db.from('whatsapp_trainer_links').select('*').eq('org_id', owner.org_id).eq('user_id', owner.user_id).maybeSingle()
  const patch = { whatsapp_phone: phone, verified_at: nowOf(deps).toISOString() }
  if (existing) {
    await db.from('whatsapp_trainer_links').update(patch).eq('id', String(existing.id))
    return { ...existing, ...patch } as Record<string, unknown>
  }
  const { data } = await db.from('whatsapp_trainer_links').insert({ ...owner, ...patch }).select('*').single()
  return (data as Record<string, unknown> | null) ?? null
}

async function sendDraftPreview(deps: TrainerDeps, to: string, id: string, hash: string, preview: string) {
  await deps.sendButtons(to, `${preview}\nاضغط «اعتماد وحفظ» لحفظها في المعرفة.`, [
    { id: `tr:a:${id}:${hash}`, title: 'اعتماد وحفظ' },
    { id: `tr:e:${id}`, title: 'تعديل' },
    { id: `tr:c:${id}`, title: 'إلغاء' },
  ])
}

async function handleButton(db: DbClient, owner: Owner, link: Record<string, unknown>, buttonId: string, to: string, deps: TrainerDeps) {
  const [, action, id, hash] = buttonId.split(':')
  if (action === 'a') {
    const result = await approveSubmission(db, owner, { id, hash: hash ?? '', via: 'whatsapp' }, deps)
    if (result.status === 'indexed') {
      const readiness = await loadReadiness(db, owner, await loadVerticalId(db, owner.organizationId))
      const where = result.target === 'memory' ? 'ذاكرتك الشخصية' : 'قاعدة المعرفة، وبدأ وكيلك باستخدامها الآن'
      await deps.sendText(to, `تم الحفظ في ${where}.\n${readinessLine(readiness)}`)
    } else {
      await deps.sendText(to, {
        not_found: 'لم أجد هذه المسودة.',
        hash_mismatch: 'لم يُحفظ شيء: محتوى المسودة تغيّر بعد إرسالها. استخدم أحدث رسالة معاينة.',
        already_decided: 'تم البت في هذه المسودة مسبقاً.',
        failed: 'تعذّر الحفظ الآن. يمكنك اعتمادها لاحقاً من صفحة قاعدة المعرفة.',
      }[result.status])
    }
    return `approval_${result.status}`
  }
  if (action === 'c') {
    const result = await cancelSubmission(db, owner, id, 'whatsapp', deps)
    await deps.sendText(to, result === 'cancelled' ? 'تم الإلغاء، ولم يُحفظ شيء.' : 'تم البت في هذه المسودة مسبقاً.')
    return `cancel_${result}`
  }
  if (action === 'e') {
    const row = await loadOwnedSubmission(db, owner, id)
    if (!row || row.status !== 'pending') {
      await deps.sendText(to, 'لا يمكن تعديل هذه المسودة.')
      return 'edit_unavailable'
    }
    await db.from('whatsapp_trainer_links').update({ awaiting_edit_submission_id: id, session_expires_at: sessionUntil(deps) }).eq('id', String(link.id))
    await deps.sendText(to, 'أرسل النص المصحّح الآن، وسأحدّث المسودة.')
    return 'awaiting_edit'
  }
  return 'unknown_button'
}

async function buildInput(msg: CentralInbound, deps: TrainerDeps): Promise<{ input: ExtractInput; inputType: InputType; mime: string | null } | { error: string; reply: string }> {
  const text = (msg.text ?? '').trim()
  if (msg.type === 'text') return text ? { input: { kind: 'text', text }, inputType: 'text', mime: null } : { error: 'unsupported', reply: 'أرسل نصاً أو صوتاً أو صورة أو ملفاً.' }
  const kind: MediaKind | null = msg.type === 'audio' ? 'audio' : msg.type === 'image' ? 'image' : msg.type === 'document' ? 'document' : null
  const mediaId = msg.mediaId ?? msg.audioId
  if (!kind || !mediaId) return { error: 'unsupported', reply: 'هذا النوع غير مدعوم. أرسل نصاً أو رسالة صوتية أو صورة أو ملف PDF.' }
  const media = await deps.downloadMedia(mediaId)
  const check = validateMedia(kind, media)
  if (!check.ok) return { error: 'media_rejected', reply: check.reply }
  if (kind === 'audio') {
    const transcript = (await deps.transcribe(media)).trim()
    return transcript ? { input: { kind: 'voice', text: transcript }, inputType: 'voice', mime: media.mimeType } : { error: 'voice_unclear', reply: 'لم أتمكن من فهم الرسالة الصوتية. أعد إرسالها أو اكتبها نصاً.' }
  }
  if (kind === 'image') return { input: { kind: 'image', image: media, text: msg.caption ?? '' }, inputType: 'image', mime: media.mimeType }
  const documentText = deps.readDocument ? (await deps.readDocument(media)).trim() : ''
  if (!documentText) return { error: 'document_empty', reply: 'لم أجد نصاً قابلاً للقراءة في الملف.' }
  return { input: { kind: 'document', text: `${msg.caption ? `${msg.caption}\n` : ''}${documentText}` }, inputType: 'document', mime: media.mimeType }
}

export async function routeTrainerInbound(db: DbClient, msg: CentralInbound, deps: TrainerDeps, channel: TrainerChannel): Promise<string | null> {
  const phone = normalizeE164(msg.from)
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return channel === 'trainer' ? 'invalid_sender' : null
  const text = (msg.text ?? '').trim()
  const isText = msg.type === 'text'
  if (isText && channel === 'central' && PASS_THROUGH_RE.test(text)) return null

  const activation = isText ? TRAINING_ACTIVATION_RE.exec(text) : null
  if (activation) return activate(db, phone, activation[1], msg.from, channel, deps)

  const isTrainerButton = msg.type === 'button' && (msg.buttonId ?? '').startsWith('tr:')
  let link = await linkByPhone(db, phone)

  if (isText && TRAINING_MODE_RE.test(text)) {
    link = link ?? await adoptAssistantLink(db, phone, deps)
    if (!link) {
      await deps.sendText(msg.from, 'هذا الرقم غير مرتبط بمدرب كيان. افتح «قاعدة المعرفة» في لوحة كيان واضغط «درّب وكيلك عبر واتساب» لربط رقمك.')
      return 'trainer_not_linked'
    }
  }
  if (!link) {
    if (channel === 'central' && !isTrainerButton) return null
    await deps.sendText(msg.from, 'مرحباً، هذا رقم *مدرب كيان* لتدريب وكلاء كيان. افتح «قاعدة المعرفة» في لوحة كيان واضغط «درّب وكيلك عبر واتساب» لربط رقمك.')
    return 'trainer_not_linked'
  }

  const owner: Owner = { organizationId: String(link.org_id), userId: String(link.user_id) }
  const sessionActive = channel === 'trainer' || new Date(String(link.session_expires_at ?? 0)).getTime() > nowOf(deps).getTime()
  const wantsTraining = (isText && TRAINING_MODE_RE.test(text)) || isTrainerButton
  if (!sessionActive && !wantsTraining) return null

  // Authorization is re-checked on every message: a demoted member stops immediately.
  if (!(await isTrainerAdmin(db, owner.organizationId, owner.userId))) {
    await db.from('whatsapp_trainer_links').update({ session_expires_at: null, awaiting_edit_submission_id: null }).eq('id', String(link.id))
    await deps.sendText(msg.from, 'تدريب الوكيل متاح لمالك النشاط أو المدير فقط.')
    return 'forbidden'
  }
  if (isText && TRAINING_MODE_RE.test(text)) return startSession(db, link, msg.from, channel, deps)
  if (isTrainerButton) return handleButton(db, owner, link, msg.buttonId ?? '', msg.from, deps)

  if (isText && TRAINING_END_RE.test(text)) {
    await db.from('whatsapp_trainer_links').update({ session_expires_at: null, awaiting_edit_submission_id: null }).eq('id', String(link.id))
    const readiness = await loadReadiness(db, owner, await loadVerticalId(db, owner.organizationId))
    await deps.sendText(msg.from, `انتهت جلسة التدريب. جاهزية المعرفة: ${readiness.percent}٪.\nللعودة أرسل: وضع التدريب`)
    return 'training_ended'
  }
  await db.from('whatsapp_trainer_links').update({ session_expires_at: sessionUntil(deps) }).eq('id', String(link.id))

  try {
    await deps.assertLimit?.(db, owner.organizationId)
  } catch {
    await deps.sendText(msg.from, 'وصلت إلى حد استهلاك الذكاء الاصطناعي في باقتك لهذا الشهر. يمكنك الترقية من صفحة الباقات.')
    return 'limit_reached'
  }

  let built
  try {
    built = await buildInput(msg, deps)
  } catch (error) {
    console.error('trainer_media_failed', { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
    built = { error: 'media_failed', reply: 'تعذّر تنزيل الملف الآن. أعد إرساله بعد قليل.' }
  }
  if ('error' in built) {
    await deps.sendText(msg.from, built.reply)
    return built.error
  }

  const verticalId = await loadVerticalId(db, owner.organizationId)
  const { target } = trainingChecklist(verticalId)
  const draft = await extractTrainingDraft(built.input, { verticalId, target: target as TrainingTarget }, { generate: deps.generate })
  if (deps.generate || built.inputType === 'voice') await deps.recordUsage?.(db, owner.organizationId)
  if (!draft.items.length) {
    await deps.sendText(msg.from, 'لم أجد معلومة واضحة لحفظها. أرسلها بصيغة أوضح، مثل: «رسوم التوصيل داخل المدينة 1000 ريال».')
    return 'nothing_extracted'
  }

  const excerpt = built.input.text ?? ''
  const editingId = link.awaiting_edit_submission_id ? String(link.awaiting_edit_submission_id) : null
  if (editingId && isText) {
    const updated = await replaceDraft(db, owner, editingId, draft, excerpt)
    await db.from('whatsapp_trainer_links').update({ awaiting_edit_submission_id: null }).eq('id', String(link.id))
    if (updated) {
      await sendDraftPreview(deps, msg.from, updated.id, updated.hash, draftPreview(draft, 'تعديل'))
      return 'draft_updated'
    }
  }

  const created = await createSubmission(db, owner, {
    channel: channel === 'trainer' ? 'whatsapp_trainer' : 'whatsapp_central',
    inputType: built.inputType,
    target,
    draft,
    externalMessageId: msg.messageId,
    sourceExcerpt: excerpt,
    mediaMime: built.mime,
    fileName: msg.fileName ?? null,
  })
  if ('duplicate' in created) return 'duplicate'
  await sendDraftPreview(deps, msg.from, created.id, created.hash, draftPreview(draft, INPUT_LABEL[built.inputType]))
  return 'draft_created'
}
