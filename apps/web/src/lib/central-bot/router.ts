import { randomInt } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'
import { normalizeE164 } from '@/lib/channels/contacts'
import { appendThreadMessage, threadHasExternalMessage } from '@/lib/personal-assistant/thread'
import { decideApproval, setKillSwitch, type EngineDeps } from '@/lib/personal-assistant/executive/engine'
import { appBaseUrl } from './config'
import { routeTrainerInbound, type TrainerDeps } from '@/lib/trainer/router'

/**
 * Multi-tenant router for the central Kayan AI number.
 *
 * Trust boundary: `from` is the only identity WhatsApp gives us. It is mapped to exactly
 * one verified personal_assistant_links row; every downstream query is scoped by that
 * row's org_id + user_id, never by anything inside the message text.
 */
export type CentralInbound = {
  from: string
  messageId: string
  type: 'text' | 'audio' | 'image' | 'document' | 'button' | 'other'
  text?: string
  audioId?: string
  /** Media id for audio/image/document (Meta Media API). */
  mediaId?: string
  mimeType?: string
  fileName?: string
  caption?: string
  buttonId?: string
}

export type Owner = { organizationId: string; userId: string }

export type CentralDeps = {
  now?: () => Date
  hasAccess: (db: DbClient, organizationId: string) => Promise<boolean>
  sendText: (to: string, text: string) => Promise<void>
  sendButtons: (to: string, text: string, buttons: { id: string; title: string }[]) => Promise<void>
  transcribe: (mediaId: string) => Promise<string>
  runTurn: (db: DbClient, owner: Owner, text: string) => Promise<{ reply: string }>
  signupUrl?: string
  engine?: EngineDeps
  /** «مدرب كيان» training mode on the central number (batch 3B). */
  trainer?: TrainerDeps
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const CODE_TTL_MINUTES = 15
export const ACTIVATION_RE = /^\s*تفعيل[_\s-]?([A-Za-z0-9]{4,12})\s*$/u
const KILL_RE = /^\s*(?:إيقاف|ايقاف)\s+فوري\s*$/u
const RESUME_RE = /^\s*(?:استئناف|تشغيل)(?:\s+(?:المساعد|المهام))?\s*$/u

function nowOf(deps: { now?: () => Date }) { return deps.now ? deps.now() : new Date() }

export function generateActivationCode(length = CODE_LENGTH) {
  let code = ''
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

export function activationLink(displayNumber: string, code: string) {
  const digits = displayNumber.replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`تفعيل_${code}`)}` : ''
}

/** Dashboard side of one-tap linking: a short, single-use, 15-minute code. */
export async function createLinkCode(db: DbClient, owner: Owner, options: { now?: () => Date; displayNumber: string }) {
  const expiresAt = new Date(nowOf(options).getTime() + CODE_TTL_MINUTES * 60_000).toISOString()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateActivationCode()
    const { data, error } = await db.from('personal_assistant_links').upsert({
      org_id: owner.organizationId, user_id: owner.userId,
      verification_token: code, token_expires_at: expiresAt,
    }, { onConflict: 'org_id,user_id' }).select('id').single()
    if (error?.code === '23505') continue
    if (error || !data) throw new Error('link_code_failed')
    return { code, waLink: activationLink(options.displayNumber, code), expiresAt, configured: Boolean(options.displayNumber) }
  }
  throw new Error('link_code_failed')
}

async function reply(db: DbClient, owner: Owner | null, to: string, text: string, deps: CentralDeps) {
  if (owner) await appendThreadMessage(db, owner, { direction: 'outbound', source: 'whatsapp', content: text })
  await deps.sendText(to, text)
}

async function activate(db: DbClient, phone: string, code: string, msg: CentralInbound, deps: CentralDeps) {
  const token = code.toUpperCase()
  const { data: link, error: lookupError } = await db.from('personal_assistant_links')
    .select('id, org_id, user_id, token_expires_at').eq('verification_token', token).maybeSingle()
  if (lookupError) {
    await deps.sendText(msg.from, 'تعذّر التحقق من رمز التفعيل الآن. حاول مرة أخرى بعد قليل.')
    return 'activation_failed'
  }
  const expires = link?.token_expires_at ? new Date(String(link.token_expires_at)).getTime() : NaN
  const expired = !link || !Number.isFinite(expires) || expires <= nowOf(deps).getTime()
  if (expired) {
    await deps.sendText(msg.from, 'رمز التفعيل غير صحيح أو انتهت صلاحيته. أنشئ رمزاً جديداً من لوحة كيان ثم أعد المحاولة.')
    return 'activation_invalid'
  }
  const owner = { organizationId: String(link.org_id), userId: String(link.user_id) }
  if (!(await deps.hasAccess(db, owner.organizationId))) {
    await deps.sendText(msg.from, `المساعد الشخصي غير مفعّل في حسابك. فعّله من هنا: ${appBaseUrl()}/dashboard/billing`)
    return 'not_eligible'
  }
  // The database rechecks the exact owner, token and expiry under lock. No separate unlink.
  const { data: consumed, error } = await db.rpc('consume_central_link_activation', {
    p_link_id: String(link.id), p_org_id: owner.organizationId, p_user_id: owner.userId,
    p_token: token, p_phone: phone,
  })
  if (error) {
    await deps.sendText(msg.from, 'تعذّر ربط الرقم الآن. حاول مرة أخرى بعد قليل.')
    return 'activation_failed'
  }
  if (consumed !== true) {
    await deps.sendText(msg.from, 'رمز التفعيل غير صحيح أو انتهت صلاحيته. أنشئ رمزاً جديداً من لوحة كيان ثم أعد المحاولة.')
    return 'activation_invalid'
  }
  await appendThreadMessage(db, owner, { direction: 'inbound', source: 'whatsapp', content: 'طلب تفعيل الربط', externalMessageId: msg.messageId })
  await reply(db, owner, msg.from, 'أهلاً بك. تم تفعيل Kayan AI مساعدك الشخصي على واتساب.\nاكتب أو أرسل رسالة صوتية بما تريد، وسأنفذ وأرسل لك محضراً بما تم.\nللإيقاف الفوري لكل المهام أرسل: إيقاف فوري', deps)
  return 'activated'
}

export async function handleCentralInbound(db: DbClient, msg: CentralInbound, deps: CentralDeps): Promise<string> {
  const phone = normalizeE164(msg.from)
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return 'invalid_sender'
  const text = (msg.text ?? '').trim()

  const activation = msg.type === 'text' ? ACTIVATION_RE.exec(text) : null
  if (activation) return activate(db, phone, activation[1], msg, deps)

  if (deps.trainer) {
    const routed = await routeTrainerInbound(db, msg, deps.trainer, 'central')
    if (routed) return routed
  }

  const { data: link } = await db.from('personal_assistant_links').select('*').eq('whatsapp_phone', phone).maybeSingle()
  if (!link || !link.verified_at) {
    if (deps.trainer) {
      const { data: trainerLink } = await db.from('whatsapp_trainer_links').select('id, verified_at').eq('whatsapp_phone', phone).maybeSingle()
      if (trainerLink?.verified_at) {
        await deps.sendText(msg.from, 'رقمك مرتبط بمدرب كيان. أرسل «وضع التدريب» لبدء تدريب وكيلك وتحديث قاعدة المعرفة.')
        return 'trainer_hint'
      }
    }
    const signup = deps.signupUrl ?? `${appBaseUrl()}/signup`
    await deps.sendText(msg.from, `مرحباً، أنا Kayan AI — مساعد شخصي ينفّذ مهامك من واتساب.\nهذا الرقم غير مرتبط بحساب. اشترك من هنا ثم فعّل الربط من لوحة التحكم: ${signup}`)
    return 'intro'
  }
  const owner: Owner = { organizationId: String(link.org_id), userId: String(link.user_id) }
  // Safety first: the emergency stop is honoured even if billing lapsed.
  if (msg.type === 'text' && KILL_RE.test(text)) {
    const appended = await appendThreadMessage(db, owner, { direction: 'inbound', source: 'whatsapp', content: text, externalMessageId: msg.messageId })
    if ('duplicate' in appended) return 'duplicate'
    const result = await setKillSwitch(db, owner, true, deps.engine ?? {})
    await reply(db, owner, msg.from, `تم الإيقاف الفوري. أُلغيت ${result.cancelled} مهمة جارية، ولن تُنفذ مهام جديدة حتى ترسل: استئناف`, deps)
    return 'kill_switch_on'
  }
  if (!(await deps.hasAccess(db, owner.organizationId))) {
    await deps.sendText(msg.from, `انتهى اشتراك المساعد الشخصي في حسابك. جدّده من هنا: ${appBaseUrl()}/dashboard/billing`)
    return 'not_eligible'
  }
  if (await threadHasExternalMessage(db, msg.messageId)) return 'duplicate'

  // Approval buttons: approve:<approvalId>:<sha256> / reject:<approvalId>
  if (msg.type === 'button' && msg.buttonId) {
    const [action, approvalId, hash] = msg.buttonId.split(':')
    if ((action === 'approve' || action === 'reject') && approvalId) {
      const appended = await appendThreadMessage(db, owner, { direction: 'inbound', source: 'whatsapp', type: 'approval', content: action === 'approve' ? 'تأكيد التنفيذ' : 'رفض', externalMessageId: msg.messageId })
      if ('duplicate' in appended) return 'duplicate'
      const decision = await decideApproval(db, owner, { approvalId, decision: action, providedHash: action === 'approve' ? (hash ?? '') : null, via: 'whatsapp' }, deps.engine ?? {})
      const message = {
        approved: 'تم التأكيد. جارٍ التنفيذ وسيصلك المحضر.',
        rejected: decision.reason === 'hash_mismatch' ? 'رُفض الطلب تلقائياً لأن محتواه تغيّر بعد إنشائه.' : decision.reason === 'kill_switch_active' ? 'الإيقاف الفوري مفعّل؛ لم يُنفذ شيء.' : 'تم الرفض. لم يُنفذ أي شيء.',
        expired: 'انتهت صلاحية طلب الموافقة؛ لم يُنفذ شيء.',
        not_found: 'طلب الموافقة غير موجود.',
        already_decided: 'تم البت في هذا الطلب مسبقاً.',
      }[decision.status]
      await reply(db, owner, msg.from, message, deps)
      return `approval_${decision.status}`
    }
  }

  let content = text
  let type: 'text' | 'voice' = 'text'
  if (msg.type === 'audio' && msg.audioId) {
    type = 'voice'
    try {
      content = await deps.transcribe(msg.audioId)
    } catch (error) {
      console.error('central_transcription_failed', { reason: error instanceof Error ? error.message : 'unknown' })
      content = ''
    }
    if (!content) {
      await reply(db, owner, msg.from, 'لم أتمكن من فهم الرسالة الصوتية. أعد إرسالها أو اكتبها نصاً.', deps)
      return 'voice_unclear'
    }
  }
  if (!content) {
    await reply(db, owner, msg.from, 'أرسل لي نصاً أو رسالة صوتية.', deps)
    return 'unsupported'
  }

  const appended = await appendThreadMessage(db, owner, { direction: 'inbound', source: 'whatsapp', type, content: type === 'voice' ? `[رسالة صوتية] ${content}` : content, externalMessageId: msg.messageId })
  if ('duplicate' in appended) return 'duplicate'

  if (KILL_RE.test(content)) {
    const result = await setKillSwitch(db, owner, true, deps.engine ?? {})
    await reply(db, owner, msg.from, `تم الإيقاف الفوري. أُلغيت ${result.cancelled} مهمة جارية، ولن تُنفذ مهام جديدة حتى ترسل: استئناف`, deps)
    return 'kill_switch_on'
  }
  if (RESUME_RE.test(content) && link.kill_switch_active === true) {
    await setKillSwitch(db, owner, false, deps.engine ?? {})
    await reply(db, owner, msg.from, 'تم الاستئناف. يمكنني تنفيذ المهام من جديد.', deps)
    return 'kill_switch_off'
  }

  let answer: string
  try {
    answer = (await deps.runTurn(db, owner, content)).reply
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    answer = code === 'kill_switch_active'
      ? 'الإيقاف الفوري مفعّل. أرسل «استئناف» لتفعيل التنفيذ.'
      : code === 'entitlement_exceeded' || (error as { code?: string })?.code === 'entitlement_exceeded'
        ? 'وصلت إلى حد باقتك لهذا الشهر.'
        : 'حدث خطأ مؤقت. حاول مرة أخرى بعد قليل.'
    if (!['kill_switch_active'].includes(code)) console.error('central_turn_failed', { reason: code.slice(0, 120) })
  }
  await reply(db, owner, msg.from, answer, deps)
  return 'replied'
}
