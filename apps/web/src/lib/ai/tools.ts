import type { SupabaseClient } from '@supabase/supabase-js'
import { createAppointmentRecord, findAvailableSlots } from '@/lib/calendar/slots'
import { resolveContactByPhone } from '@/lib/channels/contacts'

export const TOOL_NAMES = [
  'get_customer',
  'find_available_slots',
  'create_appointment',
  'request_human_handoff',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export type ToolContext = {
  organizationId: string
  supabase: SupabaseClient
}

export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case 'get_customer':
        return { ok: true, result: await toolGetCustomer(ctx, rawArgs) }
      case 'find_available_slots':
        return { ok: true, result: await toolFindSlots(ctx, rawArgs) }
      case 'create_appointment':
        return { ok: true, result: await toolCreateAppointment(ctx, rawArgs) }
      case 'request_human_handoff':
        return { ok: true, result: await toolHandoff(ctx, rawArgs) }
      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tool execution failed'
    return { ok: false, error: message }
  }
}

async function toolGetCustomer(ctx: ToolContext, args: Record<string, unknown>) {
  const phone = String(args.phone ?? '').trim()
  if (!phone) throw new Error('phone is required')

  const contact = await resolveContactByPhone(ctx.supabase, ctx.organizationId, phone)

  const { data: upcoming } = await ctx.supabase
    .from('appointments')
    .select('id, starts_at, status, services(name)')
    .eq('organization_id', ctx.organizationId)
    .eq('contact_id', contact.contactId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(3)

  return {
    contactId: contact.contactId,
    fullName: contact.fullName,
    phone: contact.phone,
    isNew: contact.isNew,
    upcomingAppointments: upcoming ?? [],
  }
}

async function toolFindSlots(ctx: ToolContext, args: Record<string, unknown>) {
  const date = String(args.date ?? '').trim()
  const serviceName = String(args.service_name ?? args.service ?? '').trim()

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must be YYYY-MM-DD')
  }

  let serviceId = args.service_id ? String(args.service_id) : ''

  if (!serviceId) {
    if (!serviceName) throw new Error('service_name or service_id is required')
    const { data: svc } = await ctx.supabase
      .from('services')
      .select('id, name, duration_minutes, price_amount, price_currency')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .ilike('name', `%${serviceName}%`)
      .limit(1)
      .maybeSingle()

    if (!svc) {
      return { slots: [], message: `No active service matching "${serviceName}"` }
    }
    serviceId = svc.id
  }

  const slots = await findAvailableSlots(ctx.supabase, ctx.organizationId, serviceId, date)
  return { serviceId, date, slots }
}

async function toolCreateAppointment(ctx: ToolContext, args: Record<string, unknown>) {
  const phone = String(args.phone ?? '').trim()
  const serviceId = String(args.service_id ?? '').trim()
  const startsAt = String(args.starts_at ?? args.slot ?? '').trim()
  const name = args.name ? String(args.name) : null

  if (!phone || !serviceId || !startsAt) {
    throw new Error('phone, service_id, and starts_at are required')
  }

  const contact = await resolveContactByPhone(ctx.supabase, ctx.organizationId, phone, name)

  const { data: service } = await ctx.supabase
    .from('services')
    .select('id, duration_minutes, name')
    .eq('id', serviceId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!service) throw new Error('Service not found')

  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) throw new Error('Invalid starts_at')
  const end = new Date(start.getTime() + (service.duration_minutes ?? 60) * 60_000)

  const appointment = await createAppointmentRecord(ctx.supabase, {
    organizationId: ctx.organizationId,
    contactId: contact.contactId,
    serviceId: service.id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  })

  await ctx.supabase.from('leads').insert({
    organization_id: ctx.organizationId,
    contact_id: contact.contactId,
    status: 'booked',
    intent: service.name,
  })

  return {
    appointmentId: appointment.id,
    service: service.name,
    startsAt: appointment.starts_at,
    status: appointment.status,
    contactId: contact.contactId,
  }
}

async function toolHandoff(ctx: ToolContext, args: Record<string, unknown>) {
  const reason = String(args.reason ?? 'customer_requested')
  return {
    handoff: true,
    reason,
    organizationId: ctx.organizationId,
    message: 'A human team member will follow up shortly.',
  }
}

export const toolDefinitions = [
  {
    name: 'get_customer',
    description: 'Look up or create a customer by phone number and return profile + upcoming appointments.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'E.164 or local phone number' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'find_available_slots',
    description: 'List open appointment slots for a service on a given date (YYYY-MM-DD).',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD' },
        service_name: { type: 'string' },
        service_id: { type: 'string' },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_appointment',
    description: 'Book a confirmed appointment for a customer.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        name: { type: 'string' },
        service_id: { type: 'string' },
        starts_at: { type: 'string', description: 'ISO-8601 start time' },
      },
      required: ['phone', 'service_id', 'starts_at'],
    },
  },
  {
    name: 'request_human_handoff',
    description: 'Escalate the conversation to a human agent.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  },
]
