import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { DbClient } from '@/lib/db/client'
import { saveValidatedKnowledge, type ValidatedFact } from '@/lib/knowledge/layer'
import { savePersonalMemory } from '@/lib/personal-assistant/memory-retrieval'
import { extractTrainingDraft, itemToText, stripInjection, type GenerateFn } from './extract'
import { loadReadiness, loadVerticalId } from './router'
import { trainingChecklist } from './checklists'

export type LookupFn = (hostname: string) => Promise<Array<{ address: string }>>

export type WebsiteFetchDeps = {
  fetchImpl?: typeof fetch
  lookup?: LookupFn
  timeoutMs?: number
  maxBytes?: number
}

export type WebsiteTrainingResult = {
  ok: true
  organizationId: string
  url: string
  pageTitle: string
  target: 'knowledge' | 'memory'
  insertedCount: number
  duplicateCount: number
  savedTitles: string[]
  flagged: boolean
  readinessPercent: number
  reply: string
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 3
const ALLOWED_PORTS = new Set(['', '80', '443'])
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  '0.0.0.0',
  '::',
  '::1',
])

const OWNER_ROLES = new Set(['owner', 'admin'])

function parseIpv4Parts(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums
}

function isBlockedIpv4(parts: number[]): boolean {
  const [a, b, c] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

/** Checks IPv4, IPv6, and IPv4-mapped IPv6 addresses against private, loopback, link-local, and metadata ranges. */
export function isBlockedIpAddress(rawIp: string): boolean {
  const normalized = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase()
  const kind = isIP(normalized)
  if (kind === 4) {
    const parts = parseIpv4Parts(normalized)
    return parts ? isBlockedIpv4(parts) : true
  }
  if (kind !== 6) return true

  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // fc00::/7 ULA
  if (/^fe[89ab]/.test(normalized)) return true // fe80::/10 link-local
  if (normalized.startsWith('ff')) return true // ff00::/8 multicast

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:0001)
  if (normalized.startsWith('::ffff:')) {
    const tail = normalized.slice('::ffff:'.length)
    const v4 = parseIpv4Parts(tail)
    if (v4) return isBlockedIpv4(v4)
    const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail)
    if (hexMatch) {
      const hi = Number.parseInt(hexMatch[1], 16)
      const lo = Number.parseInt(hexMatch[2], 16)
      return isBlockedIpv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff])
    }
    return true
  }

  // 6to4 / Teredo / discard prefixes
  if (normalized.startsWith('2002:') || normalized.startsWith('2001:') || normalized.startsWith('100::')) {
    return true
  }

  return false
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string }>> {
  return dnsLookup(hostname, { all: true })
}

/** Validates a URL against SSRF (scheme, credentials, ports, internal hostnames, private/metadata IPs, DNS). */
export async function validatePublicWebsiteUrl(rawUrl: string, deps: { lookup?: LookupFn } = {}): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('invalid_website_url')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_url_protocol')
  }
  if (parsed.username || parsed.password) {
    throw new Error('url_credentials_forbidden')
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new Error('ssrf_blocked_port')
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localdomain')
  ) {
    throw new Error('ssrf_blocked_host')
  }

  if (isIP(host) !== 0) {
    if (isBlockedIpAddress(host)) throw new Error('ssrf_blocked_ip')
    return parsed
  }

  const lookup = deps.lookup ?? defaultLookup
  let records: Array<{ address: string }>
  try {
    records = await lookup(host)
  } catch {
    throw new Error('website_dns_failed')
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('website_dns_failed')
  }
  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new Error('ssrf_blocked_ip')
    }
  }

  return parsed
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => {
      const cp = Number(n)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
}

export function extractWebsiteTextFromHtml(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const metaDescMatch =
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i.exec(html) ??
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i.exec(html)

  const title = decodeHtmlEntities((titleMatch?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 160)
  const metaDesc = decodeHtmlEntities((metaDescMatch?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 300)

  const bodyOnly = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  const cleaned = decodeHtmlEntities(bodyOnly)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  const combined = [metaDesc, cleaned].filter(Boolean).join('\n\n').slice(0, 24_000)
  return { title, text: combined }
}

/** Fetches a public webpage safely (SSRF-checked initial URL & redirects, strict timeout, bounded size). */
export async function fetchPublicWebsiteContent(
  rawUrl: string,
  deps: WebsiteFetchDeps = {}
): Promise<{ finalUrl: string; title: string; text: string; flagged: boolean }> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = Math.min(Math.max(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS, 200), 15_000)
  const maxBytes = Math.min(Math.max(deps.maxBytes ?? DEFAULT_MAX_BYTES, 1024), 3_000_000)

  let currentUrl = (await validatePublicWebsiteUrl(rawUrl, { lookup: deps.lookup })).toString()
  let response: Response | null = null

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9',
          'User-Agent': 'KayanAI-TrainerBot/1.0',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('website_fetch_timeout')
      }
      throw new Error('website_fetch_failed')
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || hop === MAX_REDIRECTS) throw new Error('website_too_many_redirects')
      const resolved = new URL(location, currentUrl).toString()
      currentUrl = (await validatePublicWebsiteUrl(resolved, { lookup: deps.lookup })).toString()
      continue
    }
    break
  }

  if (!response || !response.ok) {
    throw new Error('website_http_error')
  }

  const contentType = (response.headers.get('content-type') ?? 'text/html').split(';')[0].trim().toLowerCase()
  if (
    contentType &&
    !['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown'].includes(contentType)
  ) {
    throw new Error('unsupported_website_content_type')
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('website_content_too_large')
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > maxBytes) {
    throw new Error('website_content_too_large')
  }

  const rawText = buffer.toString('utf8')
  const extracted =
    contentType === 'text/plain' || contentType === 'text/markdown'
      ? { title: new URL(currentUrl).hostname, text: rawText.slice(0, 24_000) }
      : extractWebsiteTextFromHtml(rawText)

  const sanitized = stripInjection(extracted.text)
  const titleClean = stripInjection(extracted.title)
  if (!sanitized.text || sanitized.text.length < 15) {
    throw new Error('website_content_empty')
  }

  return {
    finalUrl: currentUrl,
    title: titleClean.text || new URL(currentUrl).hostname,
    text: sanitized.text,
    flagged: sanitized.flagged || titleClean.flagged,
  }
}

/**
 * Trains the agent directly from a public website URL: SSRF check -> fetch -> sanitize ->
 * extract structured facts -> index into knowledge_base (or user_memories) inside `organizationId`.
 */
export async function trainAgentFromWebsiteUrl(
  db: DbClient,
  owner: { organizationId: string; userId: string },
  input: { url: string; category?: ValidatedFact['category'] | null },
  deps: WebsiteFetchDeps & { generate?: GenerateFn; now?: () => Date } = {}
): Promise<WebsiteTrainingResult> {
  if (!owner.organizationId || !owner.userId) throw new Error('owner_permission_required')
  const { data: member, error: memberError } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .maybeSingle()
  if (memberError) throw new Error('owner_lookup_failed')
  if (!OWNER_ROLES.has(String(member?.role ?? ''))) throw new Error('owner_permission_required')

  const page = await fetchPublicWebsiteContent(input.url, deps)
  const verticalId = await loadVerticalId(db, owner.organizationId)
  const { target } = trainingChecklist(verticalId)

  const draft = await extractTrainingDraft(
    { kind: 'document', text: `${page.title}\n\n${page.text}` },
    { verticalId, target },
    { generate: deps.generate }
  )

  const flagged = page.flagged || draft.flagged
  let insertedCount = 0
  let duplicateCount = 0
  const savedTitles: string[] = []

  if (target === 'memory') {
    for (const entry of draft.items) {
      const content = itemToText(entry).slice(0, 500)
      if (!content) continue
      await savePersonalMemory(db, owner, { category: 'document', content })
      insertedCount += 1
      savedTitles.push(entry.title)
    }
  } else {
    const candidates: ValidatedFact[] = draft.items
      .map((entry) => {
        const content = itemToText(entry).trim()
        const title = (entry.title || page.title || content.slice(0, 60)).slice(0, 200)
        const category: ValidatedFact['category'] =
          input.category && ['business_info', 'service_info', 'pricing', 'policy', 'faq', 'general'].includes(input.category)
            ? input.category
            : (['business_info', 'service_info', 'pricing', 'policy', 'faq', 'general'].includes(entry.category)
                ? (entry.category as ValidatedFact['category'])
                : 'business_info')
        return { title, category, content, confidence: 'confirmed' as const }
      })
      .filter((fact) => fact.content.length >= 5)

    const saved = await saveValidatedKnowledge(db, owner.organizationId, candidates)
    for (const item of saved) {
      if (item.action === 'inserted') {
        insertedCount += 1
        savedTitles.push(item.title)
      } else {
        duplicateCount += 1
      }
    }
  }

  const readiness = await loadReadiness(db, owner, verticalId)

  try {
    await db.from('audit_events').insert({
      organization_id: owner.organizationId,
      actor_type: 'user',
      actor_id: owner.userId,
      action: 'central_bot.website_trained',
      entity_type: target === 'memory' ? 'user_memories' : 'knowledge_base',
      entity_id: owner.organizationId,
      metadata: {
        url: page.finalUrl,
        insertedCount,
        duplicateCount,
        flagged,
      },
    })
  } catch (error) {
    console.warn('website_training_audit_failed', { reason: error instanceof Error ? error.message : 'unknown' })
  }

  const lines = [
    insertedCount > 0
      ? `تم تدريب الوكيل من الموقع (${page.title}) وحفظ ${insertedCount} معلومة جديدة في ${target === 'memory' ? 'ذاكرتك' : 'قاعدة المعرفة'}.`
      : `محتوى الموقع (${page.title}) محفوظ مسبقاً في قاعدة المعرفة.`,
    ...savedTitles.slice(0, 5).map((t) => `• ${t}`),
    flagged ? 'تنبيه أمني: تم تجاهل أوامر مشبوهة داخل صفحة الموقع ولم تُحفظ.' : '',
    `جاهزية المعرفة الحالية: ${readiness.percent}٪.`,
  ].filter(Boolean)

  return {
    ok: true,
    organizationId: owner.organizationId,
    url: page.finalUrl,
    pageTitle: page.title,
    target,
    insertedCount,
    duplicateCount,
    savedTitles,
    flagged,
    readinessPercent: readiness.percent,
    reply: lines.join('\n'),
  }
}
