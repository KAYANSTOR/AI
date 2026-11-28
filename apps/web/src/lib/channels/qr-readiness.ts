/**
 * OPS-001 — the exact conditions behind `channel_unavailable` on the QR inbound
 * route. Extracted so the readiness gate is regression-tested on its own instead of
 * being an untested filter chain inside the route.
 *
 * A gateway-authenticated delivery is accepted only for an existing, bound
 * `qr_unofficial` channel whose gateway reconciliation has proved it usable.
 */
export type QrChannelReadinessRow = {
  id?: string | null
  organization_id?: string | null
  business_id?: string | null
  channel_type?: string | null
  connection_mode?: string | null
  verification_status?: string | null
  is_active?: boolean | null
}

export type QrChannelReadiness =
  | { ready: true }
  | { ready: false; reason: 'channel_not_bound' | 'channel_not_ready' }

export function evaluateQrChannelReadiness(row: QrChannelReadinessRow | null | undefined): QrChannelReadiness {
  if (!row?.id || !row.organization_id || !row.business_id) {
    return { ready: false, reason: 'channel_not_bound' }
  }
  if (row.channel_type !== 'whatsapp' || row.connection_mode !== 'qr_unofficial') {
    return { ready: false, reason: 'channel_not_bound' }
  }
  if (row.verification_status !== 'verified' || row.is_active !== true) {
    return { ready: false, reason: 'channel_not_ready' }
  }
  return { ready: true }
}
