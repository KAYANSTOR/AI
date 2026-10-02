import type { SupabaseClient } from '@supabase/supabase-js'

export type IdempotencyResult =
  | { status: 'duplicate' }
  | { status: 'acquired'; eventRowId: string }
  | { status: 'error'; message: string }

/**
 * Insert webhook_events with UNIQUE(provider, external_event_id).
 * First writer wins; duplicates are ignored safely.
 */
export async function acquireWebhookEvent(
  supabase: SupabaseClient,
  provider: string,
  externalEventId: string,
  payload: unknown
): Promise<IdempotencyResult> {
  const normalizedEventId = externalEventId.trim()
  if (!normalizedEventId) return { status: 'error', message: 'missing_provider_event_id' }
  const { data, error } = await supabase
    .from('webhook_events')
    .insert({
      provider,
      external_event_id: normalizedEventId,
      payload: payload as Record<string, unknown>,
      processing_status: 'pending',
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return { status: 'duplicate' }
    }
    return { status: 'error', message: sanitizeStoredError(error.message) }
  }

  if (!data?.id) {
    return { status: 'duplicate' }
  }

  return { status: 'acquired', eventRowId: data.id }
}

export async function markWebhookProcessed(
  supabase: SupabaseClient,
  eventRowId: string,
  status: 'processed' | 'failed',
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('webhook_events')
    .update({
      processing_status: status,
      error_message: errorMessage ? sanitizeStoredError(errorMessage) : null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventRowId)
}

function sanitizeStoredError(message: string) {
  if (/^[a-z0-9][a-z0-9_.:-]{0,119}$/i.test(message)) return message
  return 'webhook_processing_failed'
}
