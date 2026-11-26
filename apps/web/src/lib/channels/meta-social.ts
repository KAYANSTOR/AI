import { createAdminClient } from '@/lib/db/admin'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'
import { bindMetaChannel } from './meta-binding'
import {
  createEmbeddedSignupOAuthState,
  debugMetaAccessToken,
  ensureBusinessId,
  exchangeMetaCode,
  fetchMeta,
  getMetaGraphBaseUrl,
} from './embedded-signup'
import { MetaLinkError, metaLinkStatusFromGraph, selectMetaPage, type MetaPage, type MetaSocialChannel } from './meta-connection'

const commonPermissions = ['pages_show_list', 'pages_manage_metadata']
const permissions: Record<MetaSocialChannel, string[]> = {
  instagram: [...commonPermissions, 'pages_read_engagement', 'instagram_basic', 'instagram_manage_messages'],
  messenger: [...commonPermissions, 'pages_messaging'],
}

type SocialTarget = { channel: MetaSocialChannel; pageId: string | null }

export async function createMetaSocialAuthorizationUrl(organizationId: string, target: SocialTarget) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim()
  if (!appId) throw new Error('ربط إنستغرام وماسنجر غير متاح حاليًا.')

  const { state, redirectUri } = await createEmbeddedSignupOAuthState(organizationId, undefined, target)
  const version = /\/v\d+\.\d+$/.exec(getMetaGraphBaseUrl())?.[0] ?? '/v26.0'
  const url = new URL(`https://www.facebook.com${version}/dialog/oauth`)
  url.search = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    auth_type: 'rerequest',
  }).toString()
  const configId = process.env.META_SOCIAL_CONFIG_ID?.trim()
  if (configId) url.searchParams.set('config_id', configId)
  else url.searchParams.set('scope', permissions[target.channel].join(','))
  return url.toString()
}

type GraphError = { error?: { code?: number } }

async function readGraph<T>(response: Response): Promise<T & GraphError> {
  const body = await response.json().catch(() => null) as (T & GraphError) | null
  if (!response.ok || !body || body.error) {
    throw new MetaLinkError(metaLinkStatusFromGraph(body?.error?.code, response.status))
  }
  return body
}

export async function verifyInstagramMetaAccount(accountId: string, token: string): Promise<void> {
  if (!/^\d{1,40}$/.test(accountId)) throw new MetaLinkError('meta_account')
  const response = await fetchMeta(`${getMetaGraphBaseUrl()}/${encodeURIComponent(accountId)}?fields=id`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const account = await readGraph<{ id?: string }>(response)
  if (account.id !== accountId) throw new MetaLinkError('meta_permission')
}

async function getLongLivedUserToken(token: string) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim()
  const secret = process.env.META_APP_SECRET?.trim()
  if (!appId || !secret) throw new MetaLinkError('meta_error')
  const url = new URL(getMetaGraphBaseUrl() + '/oauth/access_token')
  url.search = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: token,
  }).toString()
  const body = await readGraph<{ access_token?: string }>(await fetchMeta(url))
  if (!body.access_token) throw new MetaLinkError('meta_permission')
  return Buffer.from(body.access_token, 'utf8')
}

async function getGrantedPages(token: string, { channel, pageId }: SocialTarget) {
  const url = new URL(getMetaGraphBaseUrl() + '/me/accounts')
  url.searchParams.set('fields', channel === 'instagram'
    ? 'id,access_token,tasks,instagram_business_account'
    : 'id,access_token,tasks')
  url.searchParams.set('limit', '100')
  const pages: MetaPage[] = []
  const visited = new Set<string>()
  while (true) {
    const body = await readGraph<{
      data?: MetaPage[]
      paging?: { next?: string; cursors?: { after?: string } }
    }>(await fetchMeta(url, { headers: { Authorization: `Bearer ${token}` } }))
    pages.push(...(body.data ?? []))
    if (pageId && pages.some((page) => page.id === pageId)) return pages
    if (!pageId && pages.filter((page) => selectMetaPage([page], channel, null)).length > 1) return pages
    if (!body.paging?.next) return pages
    const cursor = body.paging.cursors?.after
    if (!cursor || visited.has(cursor) || visited.size >= 9) throw new MetaLinkError('meta_account')
    visited.add(cursor)
    url.searchParams.set('after', cursor)
  }
}

export async function completeMetaSocialLink(input: {
  organizationId: string
  organizationName: string
  target: SocialTarget
  code: string
  redirectUri: string
}) {
  const { organizationId, organizationName, target, code, redirectUri } = input
  const codeToken = await exchangeMetaCode(code, redirectUri)
  let longLivedToken: Buffer | null = null
  try {
    await debugMetaAccessToken(codeToken, permissions[target.channel])
    longLivedToken = await getLongLivedUserToken(codeToken.toString('utf8'))
    const pages = await getGrantedPages(longLivedToken.toString('utf8'), target)
    const page = selectMetaPage(pages, target.channel, target.pageId)
    if (!page) throw new MetaLinkError('meta_account')
    if (target.channel === 'instagram') await verifyInstagramMetaAccount(page.assetId, page.accessToken)

    const db = createAdminClient()
    const { data: existing, error } = await db.from('channels').select('id')
      .eq('organization_id', organizationId)
      .eq('channel_type', target.channel)
      .maybeSingle()
    if (error) throw new MetaLinkError('meta_error')
    if (!existing) await assertWithinLimit(db, organizationId, 'channels', 1)
    const businessId = await ensureBusinessId(db, organizationId, null, organizationName)

    const url = new URL(`${getMetaGraphBaseUrl()}/${encodeURIComponent(page.pageId)}/subscribed_apps`)
    const headers = { Authorization: `Bearer ${page.accessToken}` }
    const subscriptions = await readGraph<{ data?: Array<{ id?: string; subscribed_fields?: string[] }> }>(
      await fetchMeta(url, { headers }),
    )
    const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim()
    const subscribedFields = subscriptions.data?.find((app) => app.id === appId)?.subscribed_fields ?? []
    if (!subscribedFields.includes('messages')) {
      url.searchParams.set('subscribed_fields', [...subscribedFields, 'messages'].join(','))
      const subscribed = await readGraph<{ success?: boolean }>(await fetchMeta(url, { method: 'POST', headers }))
      if (subscribed.success !== true) throw new MetaLinkError('meta_permission')
    }

    await bindMetaChannel(db, {
      organizationId, businessId, channelType: target.channel,
      assetId: page.assetId, accessToken: page.accessToken,
    })
  } catch (error) {
    if (error instanceof EntitlementExceededError) throw new MetaLinkError('meta_limit')
    throw error
  } finally {
    codeToken.fill(0)
    longLivedToken?.fill(0)
  }
}
