import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(a:string,b:string){
  const aa=Buffer.from(a);const bb=Buffer.from(b)
  return aa.length===bb.length && timingSafeEqual(aa,bb)
}

export function verifyVapiRequest(headers:Headers,expectedSecret=process.env.VAPI_WEBHOOK_SECRET){
  // Fail closed like the Meta and Twilio verifiers: an unconfigured secret means
  // "reject everything", never "accept everything".
  if(!expectedSecret) return false
  const direct=headers.get('x-vapi-secret')
  if(direct && safeEqual(direct,expectedSecret)) return true
  const authorization=headers.get('authorization')
  return authorization?.startsWith('Bearer ') ? safeEqual(authorization.slice(7),expectedSecret) : false
}

export function verifyMetaSignature(rawBody:string,headers:Headers){
  const secret=process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET
  const signature=headers.get('x-hub-signature-256')
  if(!secret || !signature?.startsWith('sha256=')) return false
  const expected=createHmac('sha256',secret).update(rawBody,'utf8').digest('hex')
  return safeEqual(signature.slice(7),expected)
}

export function verifyTwilioSignature(rawUrl:string,params:Record<string,string>,signature:string|null,authToken=process.env.TWILIO_AUTH_TOKEN){
  if(!authToken || !signature) return false
  const data=rawUrl+Object.keys(params).sort().map(key=>key+params[key]).join('')
  const expected=createHmac('sha1',authToken).update(data,'utf8').digest('base64')
  return safeEqual(signature,expected)
}

/** Never expose provider, SQL, or credential errors to webhook callers. */
export function publicWebhookError(fallback = 'webhook_processing_failed') {
  return fallback
}

/** Stable fallback for payloads that do not contain a provider event identifier. */
export function stablePayloadEventId(provider: string, payload: unknown) {
  const serialized = JSON.stringify(payload)
  return `${provider}:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`
}
