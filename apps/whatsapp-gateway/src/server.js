import http from 'node:http'
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import postgres from 'postgres'
import QRCode from 'qrcode'
import makeWASocket, { Browsers, BufferJSON, DisconnectReason, initAuthCreds } from '@whiskeysockets/baileys'

const PORT = Number(process.env.WHATSAPP_GATEWAY_PORT || 3001)
const DATABASE_URL = requiredEnv('DATABASE_URL')
const GATEWAY_TOKEN = requiredEnv('WHATSAPP_GATEWAY_TOKEN')
const APP_INTERNAL_URL = (process.env.WHATSAPP_APP_INTERNAL_URL?.trim() || 'http://127.0.0.1:' + (process.env.PORT || 8080)).replace(/\/+$/, '')
const SESSION_KEY = readEncryptionKey(requiredEnv('WHATSAPP_SESSION_ENCRYPTION_KEY'))
const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: isPrivateDatabaseUrl(DATABASE_URL) ? false : 'require',
})
const sockets = new Map()

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error('missing_required_environment_' + name)
  return value
}
function isPrivateDatabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.railway.internal')
  } catch { return false }
}
function readEncryptionKey(value) {
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('WHATSAPP_SESSION_ENCRYPTION_KEY_must_decode_to_32_bytes')
  return key
}
function encryptText(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', SESSION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':')
}
function decryptText(payload) {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('invalid_encrypted_session_payload')
  const decipher = createDecipheriv('aes-256-gcm', SESSION_KEY, Buffer.from(parts[0], 'base64'))
  decipher.setAuthTag(Buffer.from(parts[1], 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64')), decipher.final()]).toString('utf8')
}
function encryptJson(value) { return encryptText(JSON.stringify(value, BufferJSON.replacer)) }
function decryptJson(value) { return JSON.parse(decryptText(value), BufferJSON.reviver) }
function safeEqual(left, right) {
  const a = Buffer.from(String(left)), b = Buffer.from(String(right))
  return a.length === b.length && timingSafeEqual(a, b)
}
function authorized(request) {
  const header = request.headers.authorization || ''
  return header.startsWith('Bearer ') && safeEqual(header.slice(7), GATEWAY_TOKEN)
}
async function query(text, values = []) { return sql.unsafe(text, values) }
async function readJson(request, maxBytes = 256 * 1024) {
  let raw = ''
  for await (const chunk of request) {
    raw += chunk.toString()
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw Object.assign(new Error('payload_too_large'), { status: 413 })
  }
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }) }
}
function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(body))
}
function publicStatus(row) {
  if (!row) return { status: 'not_configured' }
  return {
    status: row.status,
    phoneNumber: row.phone_number,
    qrDataUrl: row.qr_data_url ? decryptText(row.qr_data_url) : null,
    pairingCode: row.pairing_code ? decryptText(row.pairing_code) : null,
    connectedAt: row.connected_at,
    lastError: row.last_error,
  }
}
async function ensureSchema() {
  await query("CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_sessions (channel_id uuid PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE, phone_number text NOT NULL, status text NOT NULL DEFAULT 'starting' CHECK (status IN ('starting','qr_required','pairing_code','connected','reconnecting','disconnected','failed')), qr_data_url text, pairing_code text, auth_creds_ciphertext text, connected_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())")
  await query("CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_auth_keys (channel_id uuid NOT NULL REFERENCES public.whatsapp_gateway_sessions(channel_id) ON DELETE CASCADE, key_type text NOT NULL, key_id text NOT NULL, encrypted_value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(channel_id,key_type,key_id))")
}
async function persistSocketState(session) {
  await query("UPDATE public.whatsapp_gateway_sessions SET status=$2,qr_data_url=$3,pairing_code=$4,connected_at=$5,last_error=$6,updated_at=now() WHERE channel_id=$1",
    [session.channelId, session.status, session.qrDataUrl ? encryptText(session.qrDataUrl) : null, session.pairingCode ? encryptText(session.pairingCode) : null, session.connectedAt, session.lastError])
}
async function saveCreds(session) {
  await query("UPDATE public.whatsapp_gateway_sessions SET auth_creds_ciphertext=$2,updated_at=now() WHERE channel_id=$1",
    [session.channelId, encryptJson(session.creds)])
}
function createKeyStore(channelId) {
  return {
    async get(type, ids) {
      if (!ids.length) return {}
      const rows = await query("SELECT key_id,encrypted_value FROM public.whatsapp_gateway_auth_keys WHERE channel_id=$1 AND key_type=$2 AND key_id=ANY($3::text[])",
        [channelId, type, ids])
      const result = {}
      for (const row of rows) result[row.key_id] = decryptJson(row.encrypted_value)
      return result
    },
    async set(data) {
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries || {})) {
          if (value === null || typeof value === 'undefined') {
            await query("DELETE FROM public.whatsapp_gateway_auth_keys WHERE channel_id=$1 AND key_type=$2 AND key_id=$3", [channelId, type, id])
          } else {
            await query("INSERT INTO public.whatsapp_gateway_auth_keys(channel_id,key_type,key_id,encrypted_value,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(channel_id,key_type,key_id) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,updated_at=now()",
              [channelId, type, id, encryptJson(value)])
          }
        }
      }
    },
    async clear() { await query("DELETE FROM public.whatsapp_gateway_auth_keys WHERE channel_id=$1", [channelId]) },
  }
}
function messageText(message) {
  const value = message?.message
  if (!value) return ''
  return String(value.conversation || value.extendedTextMessage?.text ||
    value.imageMessage?.caption || value.videoMessage?.caption ||
    value.documentMessage?.caption || value.buttonsResponseMessage?.selectedDisplayText ||
    value.templateButtonReplyMessage?.selectedDisplayText || '').trim()
}
async function forwardInbound(session, message) {
  const remoteJid = message?.key?.remoteJid
  const messageId = message?.key?.id
  if (!remoteJid || !messageId || message.key.fromMe) return
  if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) return
  const text = messageText(message)
  if (!text) return
  const senderJid = message.key.remoteJidAlt || remoteJid
  const senderPhone = senderJid.endsWith('@s.whatsapp.net') ? senderJid.split('@')[0].replace(/\D/g, '') : null
  try {
    const response = await fetch(APP_INTERNAL_URL + '/api/whatsapp/qr/inbound', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + GATEWAY_TOKEN },
      body: JSON.stringify({
        channelId: session.channelId,
        externalEventId: 'qr:' + session.channelId + ':' + messageId,
        senderJid, senderPhone, displayName: message.pushName || null, text: text.slice(0, 8000),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const reason = await response.text().catch(() => '')
      console.error('whatsapp_qr_inbound_forward_failed', { channelId: session.channelId, status: response.status, reason: reason.slice(0, 120) })
    }
  } catch (error) {
    console.error('whatsapp_qr_inbound_forward_failed', { channelId: session.channelId, reason: error instanceof Error ? error.message : 'network_error' })
  }
}
async function startSocket(channelId, options = {}) {
  const existingSocket = sockets.get(channelId)
  if (existingSocket) return existingSocket
  const channelRows = await query("SELECT id,organization_id,business_id,provider_account_id,external_identifier,connection_mode FROM public.channels WHERE id=$1 AND channel_type='whatsapp' LIMIT 1", [channelId])
  const channel = channelRows[0]
  if (!channel || channel.connection_mode !== 'qr_unofficial') throw Object.assign(new Error('qr_channel_not_configured'), { status: 409 })
  const sessionRows = await query("SELECT * FROM public.whatsapp_gateway_sessions WHERE channel_id=$1 LIMIT 1", [channelId])
  const stored = sessionRows[0]
  if (!stored) throw Object.assign(new Error('qr_session_not_found'), { status: 404 })
  const creds = stored.auth_creds_ciphertext ? decryptJson(stored.auth_creds_ciphertext) : initAuthCreds()
  const session = {
    channelId, phoneNumber: stored.phone_number, mode: options.mode || 'qr',
    retries: options.retries || 0, creds, status: 'starting', qrDataUrl: null,
    pairingCode: null, connectedAt: stored.connected_at || null, lastError: null, sock: null,
  }
  const sock = makeWASocket({
    auth: { creds, keys: createKeyStore(channelId) },
    browser: Browsers.ubuntu('Kayan AI'),
    printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false,
  })
  session.sock = sock
  sockets.set(channelId, session)
  await persistSocketState(session)
  await saveCreds(session)
  sock.ev.on('creds.update', async update => {
    Object.assign(session.creds, update)
    try { await saveCreds(session) } catch (error) {
      console.error('whatsapp_qr_credentials_persist_failed', { channelId, reason: error instanceof Error ? error.message : 'storage_error' })
    }
  })
  // WhatsApp now rotates the companion ADV secret after a QR scan.
  // Baileys rc14 acknowledges this notification but does not update the secret,
  // which makes the phone reject the link and eventually exhaust QR refs.
  const refreshPairingSecret = async node => {
    if (session.stopping || session.creds.me || session.creds.registered) return
    const children = Array.isArray(node?.content) ? node.content : []
    if (!children.some(child => ['companion_reg_refresh', 'pair-device-rotate-qr'].includes(child?.tag))) return
    try {
      session.creds.advSecretKey = randomBytes(32).toString('base64')
      await saveCreds(session)
      if (typeof session.qrRaw === 'string') {
        const parts = session.qrRaw.split(',')
        if (parts.length === 5) {
          parts[3] = session.creds.advSecretKey
          session.qrRaw = parts.join(',')
          session.qrDataUrl = await QRCode.toDataURL(session.qrRaw, { width: 320, margin: 1 })
          await persistSocketState(session)
        }
      }
      console.info('whatsapp_qr_pairing_secret_refreshed', { channelId })
    } catch (error) {
      console.error('whatsapp_qr_pairing_secret_refresh_failed', {
        channelId,
        reason: error instanceof Error ? error.message : 'secret_refresh_failed',
      })
    }
  }
  sock.ws?.on?.('CB:notification,type:companion_reg_refresh', refreshPairingSecret)
  sock.ev.on('connection.update', async update => {
    try {
      if (session.mode === 'pairing_code' && !session.creds.registered &&
          (update.connection === 'connecting' || Boolean(update.qr)) &&
          !session.pairingRequested) {
        session.pairingRequested = true
        try {
          const code = await sock.requestPairingCode(session.phoneNumber.replace(/\D/g, ''))
          session.status = 'pairing_code'
          session.pairingCode = code
          session.qrDataUrl = null
          session.lastError = null
          await persistSocketState(session)
        } catch (error) {
          session.pairingRequested = false
          session.status = 'failed'
          session.lastError = 'pairing_code_request_failed'
          await persistSocketState(session)
          await query("UPDATE public.channels SET is_active=false,verification_status='failed',updated_at=now() WHERE id=$1 AND connection_mode='qr_unofficial'", [channelId])
          console.error('whatsapp_qr_pairing_code_request_failed', { channelId, reason: error instanceof Error ? error.message : 'pairing_error' })
        }
      }

      if (update.qr && session.mode !== 'pairing_code') {
        session.status = 'qr_required'
        const parts = update.qr.split(',')
        if (parts.length === 5 && typeof session.creds.advSecretKey === 'string' && !session.creds.me) {
          parts[3] = session.creds.advSecretKey
        }
        session.qrRaw = parts.join(',')
        session.qrDataUrl = await QRCode.toDataURL(session.qrRaw, { width: 320, margin: 1 })
        session.pairingCode = null
        session.lastError = null
        await persistSocketState(session)
      }
      if (update.connection === 'open') {
        session.status = 'connected'
        session.qrDataUrl = null
        session.pairingCode = null
        session.connectedAt = new Date().toISOString()
        session.lastError = null
        await persistSocketState(session)
        await query("UPDATE public.channels SET verification_status='verified',updated_at=now() WHERE id=$1 AND channel_type='whatsapp' AND connection_mode='qr_unofficial' AND provider_account_id=$2",
          [channelId, session.phoneNumber])
      }
      if (update.connection === 'close') {
        if (session.stopping) {
          if (sockets.get(channelId)?.sock === sock) sockets.delete(channelId)
          return
        }
        const code = update.lastDisconnect?.error?.output?.statusCode || 0
        const loggedOut = code === DisconnectReason.loggedOut
        session.status = loggedOut ? 'disconnected' : 'reconnecting'
        session.qrDataUrl = null
        session.pairingCode = null
        session.lastError = 'connection_closed_' + String(code || 'unknown')
        await persistSocketState(session)
        if (sockets.get(channelId)?.sock === sock) sockets.delete(channelId)
        if (loggedOut) {
          await query("UPDATE public.whatsapp_gateway_sessions SET auth_creds_ciphertext=NULL,updated_at=now() WHERE channel_id=$1", [channelId])
          await query("DELETE FROM public.whatsapp_gateway_auth_keys WHERE channel_id=$1", [channelId])
          await query("UPDATE public.channels SET is_active=false,verification_status='failed',updated_at=now() WHERE id=$1 AND connection_mode='qr_unofficial'", [channelId])
        } else if (session.retries < 5) {
          const wait = Math.min(15_000, 2_000 * (session.retries + 1))
          setTimeout(() => startSocket(channelId, { mode: session.mode, retries: session.retries + 1, resume: true }).catch(error => {
            console.error('whatsapp_qr_reconnect_failed', { channelId, reason: error instanceof Error ? error.message : 'reconnect_error' })
          }), wait).unref?.()
        } else {
          session.status = 'failed'
          session.lastError = 'reconnect_attempts_exhausted'
          await persistSocketState(session)
          await query("UPDATE public.channels SET is_active=false,verification_status='failed',updated_at=now() WHERE id=$1 AND connection_mode='qr_unofficial'", [channelId])
        }
      }
    } catch (error) {
      console.error('whatsapp_qr_connection_update_failed', { channelId, reason: error instanceof Error ? error.message : 'state_update_error' })
    }
  })
  sock.ev.on('messages.upsert', async event => {
    if (event.type !== 'notify') return
    for (const message of event.messages || []) await forwardInbound(session, message)
  })

  return session
}
async function startSession(input) {
  const channelId = String(input.channelId || '')
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) throw Object.assign(new Error('invalid_channel_id'), { status: 400 })
  const phoneNumber = String(input.phoneNumber || '')
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw Object.assign(new Error('invalid_phone_number'), { status: 400 })
  if (!['qr', 'pairing_code'].includes(input.method)) throw Object.assign(new Error('invalid_connection_method'), { status: 400 })
  const channelRows = await query("SELECT id,organization_id,provider_account_id,external_identifier,connection_mode FROM public.channels WHERE id=$1 AND organization_id=$2 AND channel_type='whatsapp' LIMIT 1",
    [channelId, String(input.organizationId || '')])
  const channel = channelRows[0]
  if (!channel || channel.connection_mode !== 'qr_unofficial' || channel.provider_account_id !== phoneNumber || channel.external_identifier !== phoneNumber) {
    throw Object.assign(new Error('qr_channel_not_owned_or_not_configured'), { status: 403 })
  }
  const previous = sockets.get(channelId)
  if (previous && previous.phoneNumber === phoneNumber &&
      ['starting', 'qr_required', 'pairing_code', 'connected', 'reconnecting'].includes(previous.status)) return previous
  if (previous) {
    previous.stopping = true
    sockets.delete(channelId)
    try { previous.sock.end(undefined) } catch {}
  }
  const oldRows = await query("SELECT phone_number,status,auth_creds_ciphertext FROM public.whatsapp_gateway_sessions WHERE channel_id=$1 LIMIT 1", [channelId])
  const storedCreds = oldRows[0]?.auth_creds_ciphertext
    ? decryptJson(oldRows[0].auth_creds_ciphertext)
    : null
  const phoneChanged = Boolean(oldRows[0] && oldRows[0].phone_number !== phoneNumber)
  // A failed phone-code attempt can persist creds.me before WhatsApp accepts the
  // companion registration. Never reuse that half-registered identity on retry.
  const incompleteAuth = Boolean(oldRows[0] && storedCreds?.registered !== true)
  if (phoneChanged || incompleteAuth) {
    await query("DELETE FROM public.whatsapp_gateway_auth_keys WHERE channel_id=$1", [channelId])
    await query("UPDATE public.whatsapp_gateway_sessions SET auth_creds_ciphertext=NULL WHERE channel_id=$1", [channelId])
  }
  await query("INSERT INTO public.whatsapp_gateway_sessions(channel_id,phone_number,status,qr_data_url,pairing_code,last_error,updated_at) VALUES($1,$2,'starting',NULL,NULL,NULL,now()) ON CONFLICT(channel_id) DO UPDATE SET phone_number=EXCLUDED.phone_number,status='starting',qr_data_url=NULL,pairing_code=NULL,last_error=NULL,updated_at=now()",
    [channelId, phoneNumber])
  return startSocket(channelId, { mode: input.method, retries: 0 })
}
async function sessionStatus(channelId) {
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) throw Object.assign(new Error('invalid_channel_id'), { status: 400 })
  const rows = await query("SELECT * FROM public.whatsapp_gateway_sessions WHERE channel_id=$1 LIMIT 1", [channelId])
  return publicStatus(rows[0])
}
async function sendText(channelId, input) {
  const session = sockets.get(channelId)
  if (!session || session.status !== 'connected') throw Object.assign(new Error('whatsapp_session_not_connected'), { status: 409 })
  const recipient = String(input.recipient || '').trim()
  const digits = recipient.replace(/\D/g, '')
  const jid = recipient.includes('@') ? recipient : (digits.length >= 7 && digits.length <= 15 ? digits + '@s.whatsapp.net' : '')
  const text = String(input.text || '').trim()
  if (!jid || !text || text.length > 8000) throw Object.assign(new Error('invalid_outbound_message'), { status: 400 })
  const result = await session.sock.sendMessage(jid, { text })
  return { messageId: result?.key?.id || null }
}
async function logoutSession(channelId) {
  const session = sockets.get(channelId)
  if (session) {
    sockets.delete(channelId)
    session.stopping = true
    try { await session.sock.logout() } catch {}
  }
  await query("DELETE FROM public.whatsapp_gateway_sessions WHERE channel_id=$1", [channelId])
  await query("UPDATE public.channels SET is_active=false,verification_status='disabled',updated_at=now() WHERE id=$1 AND channel_type='whatsapp' AND connection_mode='qr_unofficial'", [channelId])
  return { status: 'disconnected' }
}
async function restoreSessions() {
  const rows = await query("SELECT s.channel_id FROM public.whatsapp_gateway_sessions s JOIN public.channels c ON c.id=s.channel_id WHERE s.status IN ('connected','reconnecting') AND s.auth_creds_ciphertext IS NOT NULL AND c.channel_type='whatsapp' AND c.connection_mode='qr_unofficial'")
  for (const row of rows) {
    startSocket(row.channel_id, { mode: 'qr', retries: 0, resume: true }).catch(error => {
      console.error('whatsapp_qr_session_restore_failed', { channelId: row.channel_id, reason: error instanceof Error ? error.message : 'restore_error' })
    })
  }
}
async function handleRequest(request, response) {
  const url = new URL(request.url || '/', 'http://localhost')
  if (request.method === 'GET' && url.pathname === '/health') {
    await query('SELECT 1')
    return sendJson(response, 200, { ok: true, service: 'whatsapp-gateway', activeSessions: sockets.size })
  }
  if (!authorized(request)) return sendJson(response, 401, { error: 'unauthorized' })
  if (request.method === 'POST' && url.pathname === '/sessions/start') {
    const input = await readJson(request)
    const session = await startSession(input)
    return sendJson(response, 200, { session: { status: session.status, phoneNumber: session.phoneNumber, qrDataUrl: session.qrDataUrl, pairingCode: session.pairingCode } })
  }
  const match = /^\/sessions\/([0-9a-f-]{36})\/(status|send|logout)$/i.exec(url.pathname)
  if (!match) return sendJson(response, 404, { error: 'not_found' })
  const channelId = match[1], action = match[2]
  if (request.method === 'GET' && action === 'status') return sendJson(response, 200, { session: await sessionStatus(channelId) })
  if (request.method === 'POST' && action === 'send') return sendJson(response, 200, { ok: true, ...(await sendText(channelId, await readJson(request))) })
  if (request.method === 'POST' && action === 'logout') return sendJson(response, 200, await logoutSession(channelId))
  return sendJson(response, 405, { error: 'method_not_allowed' })
}
async function main() {
  await ensureSchema()
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch(error => {
      const status = Number(error?.status || 500)
      const safeMessage = status < 500 ? String(error?.message || 'request_failed') : 'gateway_operation_failed'
      if (!response.headersSent) sendJson(response, status, { error: safeMessage })
      else response.destroy()
      if (status >= 500) console.error('whatsapp_gateway_request_failed', { reason: error instanceof Error ? error.message : 'unknown_error' })
    })
  })
  server.listen(PORT, '127.0.0.1', () => console.log('whatsapp_gateway_listening', { port: PORT, scope: 'loopback' }))
  await restoreSessions()
}
main().catch(error => {
  console.error('whatsapp_gateway_startup_failed', { reason: error instanceof Error ? error.message : 'startup_error' })
  process.exit(1)
})
process.on('SIGTERM', async () => {
  for (const session of sockets.values()) { try { session.sock.end(undefined) } catch {} }
  await sql.end({ timeout: 5 }).catch(() => undefined)
  process.exit(0)
})
