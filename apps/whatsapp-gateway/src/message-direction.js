// Pure helpers that decide what to do with a Baileys messages.upsert entry.
// Kept free of I/O so they can be unit-tested without a WhatsApp socket.

const SENT_TTL_MS = 30 * 60 * 1000
const MAX_TRACKED = 5000
// "append" upserts include history replays; only near-real-time ones are
// manual owner messages that should appear in the inbox.
const APPEND_MAX_AGE_MS = 10 * 60 * 1000

export function createSentMessageRegistry({ ttlMs = SENT_TTL_MS, now = () => Date.now() } = {}) {
  const entries = new Map()
  const key = (channelId, id) => channelId + ':' + id
  function prune() {
    const cutoff = now() - ttlMs
    for (const [entry, at] of entries) {
      if (at >= cutoff && entries.size <= MAX_TRACKED) break
      entries.delete(entry)
    }
  }
  return {
    add(channelId, id) { if (id) { entries.set(key(channelId, id), now()); prune() } },
    delete(channelId, id) { entries.delete(key(channelId, id)) },
    has(channelId, id) {
      const at = entries.get(key(channelId, id))
      return typeof at === 'number' && now() - at <= ttlMs
    },
  }
}

function timestampMs(message) {
  const raw = message?.messageTimestamp
  const seconds = typeof raw === 'number' ? raw : Number(raw?.low ?? raw ?? 0)
  return seconds > 0 ? seconds * 1000 : null
}

/**
 * @returns {{kind:'ignore', reason:string}|{kind:'customer'}|{kind:'owner_manual'}}
 */
/**
 * @param {any} message
 * @param {string} upsertType
 * @param {{ isBotSent?: (id: string) => boolean, now?: number }} [options]
 */
export function classifyUpsertMessage(message, upsertType, { isBotSent, now = Date.now() } = {}) {
  const remoteJid = message?.key?.remoteJid
  const altJid = message?.key?.remoteJidAlt
  const messageId = message?.key?.id
  if (!remoteJid || !messageId) return { kind: 'ignore', reason: 'missing_key' }
  const isUnsupported = (jid) =>
    typeof jid === 'string' &&
    (jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast'))
  if (isUnsupported(remoteJid) || isUnsupported(altJid)) {
    return { kind: 'ignore', reason: 'unsupported_chat' }
  }
  if (message.key.fromMe) {
    if (isBotSent?.(messageId)) return { kind: 'ignore', reason: 'bot_echo' }
    if (upsertType === 'append') {
      const at = timestampMs(message)
      if (!at || now - at > APPEND_MAX_AGE_MS) return { kind: 'ignore', reason: 'history_replay' }
    }
    return { kind: 'owner_manual' }
  }
  if (upsertType !== 'notify') return { kind: 'ignore', reason: 'not_realtime' }
  return { kind: 'customer' }
}
