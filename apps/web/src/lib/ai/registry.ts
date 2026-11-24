/**
 * Tool governance registry — the single source of truth for what an agent may do.
 *
 * Every tool declares, in one place:
 *   capability            the feature switch that must be enabled for the organization
 *   risk                  read or write
 *   requiresConfirmation  whether a pending customer confirmation is mandatory
 *   allowedActors         who may invoke it; any other actor is refused by the runtime
 *   tenantScope           the boundary every query inside the tool must respect
 *   auditClass            how the invocation is classified for audit purposes
 *
 * lib/ai/tools.ts enforces these declarations; nothing else may widen them.
 */
export type ToolRisk = 'read' | 'write'
export type ToolActor = 'agent' | 'staff' | 'system'
export type TenantScope = 'organization' | 'conversation' | 'channel'
export type AuditClass = 'read' | 'sensitive_write'

export type ToolPolicy = {
  name: string
  description: string
  capability: string | null
  risk: ToolRisk
  requiresConfirmation: boolean
  allowedActors: readonly ToolActor[]
  tenantScope: TenantScope
  auditClass: AuditClass
  inputSchema: Record<string, unknown>
}

/** أسماء وأوصاف العرض العربية؛ تبقى أسماء الأدوات البرمجية داخلية للتوافق الخلفي. */
export const TOOL_LABELS_AR: Record<string, { label: string; description: string }> = {
  get_customer: { label: 'البحث عن العميل', description: 'البحث عن العميل برقم الهاتف وعرض ملفه ومواعيده القادمة.' },
  find_available_slots: { label: 'البحث عن المواعيد المتاحة', description: 'عرض الأوقات المتاحة لخدمة في تاريخ محدد.' },
  create_appointment: { label: 'إنشاء حجز', description: 'إنشاء موعد بعد تأكيد العميل للوقت المقترح.' },
  create_lead: { label: 'استقطاب عميل محتمل', description: 'تسجيل استفسار مؤهل كعميل محتمل مع اهتمامه.' },
  search_knowledge: { label: 'البحث في قاعدة المعرفة', description: 'البحث في معلومات النشاط قبل الإجابة عن الأسئلة.' },
  request_human_handoff: { label: 'التحويل إلى موظف', description: 'تحويل المحادثة إلى موظف وإيقاف الأتمتة مؤقتاً.' },
  create_quote: { label: 'إنشاء عرض سعر', description: 'إنشاء مسودة عرض سعر للعميل.' },
  create_order: { label: 'إنشاء طلب', description: 'إنشاء مسودة طلب للعميل.' },
  convert_quote_to_order: { label: 'تحويل العرض إلى طلب', description: 'تحويل عرض سعر مقبول إلى طلب.' },
  cancel_appointment: { label: 'إلغاء حجز', description: 'إلغاء حجز العميل بعد التأكيد.' },
  search_products: { label: 'البحث في المنتجات والخدمات', description: 'البحث في كتالوج النشاط وأسعاره.' },
  track_order: { label: 'متابعة الطلب', description: 'عرض حالة طلب العميل.' },
  send_packages: { label: 'عرض الباقات', description: 'البحث عن معلومات الباقات المعتمدة.' },
  send_brochure: { label: 'إرسال الملف التعريفي', description: 'إرجاع رابط الملف التعريفي العام للنشاط.' },
}

// أسماء قديمة لها نفس التنفيذ الحديث. إخفاؤها من لوحة التحكم لا يغيّر التوافق مع المحادثات القائمة.
export const HIDDEN_TOOL_NAMES = new Set([
  'check_slots', 'check_date_availability', 'book_appointment', 'book_reservation', 'schedule_call', 'capture_lead',
])

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  get_customer: {
    name: 'get_customer',
    description: 'Look up a customer by phone number and return profile and upcoming appointments.',
    capability: 'lead_capture',
    risk: 'read',
    requiresConfirmation: false,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'read',
    inputSchema: {
      type: 'object',
      properties: { phone: { type: 'string' } },
      required: ['phone'],
      additionalProperties: false,
    },
  },
  find_available_slots: {
    name: 'find_available_slots',
    description: 'Find available appointment slots for a service on a specific date.',
    capability: 'appointments',
    risk: 'read',
    requiresConfirmation: false,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        service_name: { type: 'string' },
        service_id: { type: 'string' },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  create_appointment: {
    name: 'create_appointment',
    description: 'Create an appointment after explicit customer confirmation of the proposed slot.',
    capability: 'appointments',
    risk: 'write',
    requiresConfirmation: true,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'sensitive_write',
    inputSchema: {
      type: 'object',
      properties: {
        starts_at: { type: 'string', description: 'ISO-8601 in the business timezone (relative Arabic accepted).' },
        service_name: { type: 'string' },
        service_id: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string', description: 'Only if the customer asked to use another number.' },
        notes: { type: 'string' },
      },
      required: ['starts_at'],
      additionalProperties: false,
    },
  },
  create_lead: {
    name: 'create_lead',
    description: 'Record a qualified enquiry as a lead with its intent and estimated value.',
    capability: 'lead_capture',
    risk: 'write',
    requiresConfirmation: false,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'sensitive_write',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        name: { type: 'string' },
        intent: { type: 'string' },
        estimated_value: { type: 'number' },
        notes: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  search_knowledge: {
    name: 'search_knowledge',
    description:
      'Search the business knowledge base (FAQs, policies, business information). Use it before answering a question about policy or business facts, and say you do not know when nothing matches.',
    capability: 'knowledge_base',
    risk: 'read',
    requiresConfirmation: false,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  request_human_handoff: {
    name: 'request_human_handoff',
    description: 'Transfer the conversation to a human and pause AI automation.',
    // Deliberately not gated on a capability: reaching a human is a safety valve that must
    // stay available even when the inbox capability is switched off.
    capability: null,
    risk: 'write',
    requiresConfirmation: false,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'conversation',
    auditClass: 'sensitive_write',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      additionalProperties: false,
    },
  },
  create_quote: {
    name: 'create_quote',
    description: 'Create a new draft quote for a customer. Requires items with quantities and unit prices. Never use for dummy quotes.',
    capability: 'quotes',
    risk: 'write',
    requiresConfirmation: true,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'sensitive_write',
    inputSchema: {
      type: 'object',
      properties: {
        notes: { type: 'string', description: 'Additional terms or notes for the quote.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
              discount: { type: 'number' }
            },
            required: ['name', 'quantity', 'unit_price']
          }
        }
      },
      required: ['items'],
      additionalProperties: false
    }
  },
  create_order: {
    name: 'create_order',
    description: 'Create a new draft order for a customer. Requires items with quantities and unit prices.',
    capability: 'orders',
    risk: 'write',
    requiresConfirmation: true,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'sensitive_write',
    inputSchema: {
      type: 'object',
      properties: {
        notes: { type: 'string', description: 'Additional terms or notes for the order.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
              discount: { type: 'number' }
            },
            required: ['name', 'quantity', 'unit_price']
          }
        }
      },
      required: ['items'],
      additionalProperties: false
    }
  },
  convert_quote_to_order: {
    name: 'convert_quote_to_order',
    description: 'Convert an accepted quote into a draft order.',
    capability: 'orders',
    risk: 'write',
    requiresConfirmation: true,
    allowedActors: ['agent', 'staff'],
    tenantScope: 'organization',
    auditClass: 'sensitive_write',
    inputSchema: {
      type: 'object',
      properties: {
        quote_id: { type: 'string', description: 'The ID of the quote to convert.' }
      },
      required: ['quote_id'],
      additionalProperties: false
    }
  },
  check_slots: {
    name: 'check_slots',
    description: 'Check available service appointment slots for a date.',
    capability: 'appointments', risk: 'read', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'read',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, service_id: { type: 'string' }, service_name: { type: 'string' } }, required: ['date'], additionalProperties: false },
  },
  book_appointment: {
    name: 'book_appointment',
    description: 'Book an appointment after the customer confirms the proposed time.',
    capability: 'appointments', risk: 'write', requiresConfirmation: true,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'sensitive_write',
    inputSchema: { type: 'object', properties: { starts_at: { type: 'string', description: 'ISO-8601 in the business timezone, e.g. 2026-11-25T15:00:00+03:00 (relative Arabic like «غداً 3 عصراً» is also accepted).' }, service_name: { type: 'string' }, service_id: { type: 'string' }, name: { type: 'string', description: 'Customer name if they gave it.' }, phone: { type: 'string', description: 'Only if the customer asked to use a number other than the known one.' }, notes: { type: 'string' } }, required: ['starts_at'], additionalProperties: false },
  },
  cancel_appointment: {
    name: 'cancel_appointment',
    description: 'Cancel the requesting customer’s own appointment after confirmation.',
    capability: 'appointments', risk: 'write', requiresConfirmation: true,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'sensitive_write',
    inputSchema: { type: 'object', properties: { appointment_id: { type: 'string' }, reason: { type: 'string' } }, required: ['appointment_id'], additionalProperties: false },
  },
  search_products: {
    name: 'search_products',
    description: 'Search the business catalog for active products or services and their configured prices.',
    capability: 'orders', risk: 'read', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'read',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  track_order: {
    name: 'track_order',
    description: 'Check the status of an order belonging to the requesting customer.',
    capability: 'orders', risk: 'read', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'read',
    inputSchema: { type: 'object', properties: { order_number: { type: 'string' } }, required: ['order_number'], additionalProperties: false },
  },
  check_date_availability: {
    name: 'check_date_availability',
    description: 'Check available booking slots on a requested date.',
    capability: 'appointments', risk: 'read', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'read',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD or «اليوم»/«غداً».' }, service_id: { type: 'string' }, service_name: { type: 'string' } }, required: ['date'], additionalProperties: false },
  },
  book_reservation: {
    name: 'book_reservation',
    description: 'Create a reservation using the organization’s configured booking calendar after customer confirmation.',
    capability: 'appointments', risk: 'write', requiresConfirmation: true,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'sensitive_write',
    inputSchema: { type: 'object', properties: { starts_at: { type: 'string', description: 'ISO-8601 in the business timezone, e.g. 2026-11-25T15:00:00+03:00 (relative Arabic like «غداً 3 عصراً» is also accepted).' }, service_name: { type: 'string' }, service_id: { type: 'string' }, name: { type: 'string', description: 'Customer name if they gave it.' }, phone: { type: 'string', description: 'Only if the customer asked to use a number other than the known one.' }, notes: { type: 'string' } }, required: ['starts_at'], additionalProperties: false },
  },
  send_packages: {
    name: 'send_packages',
    description: 'Find approved package information in this business’s knowledge base.',
    capability: 'quotes', risk: 'read', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'read',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  capture_lead: {
    name: 'capture_lead',
    description: 'Capture a qualified customer enquiry as a lead.',
    capability: 'lead_capture', risk: 'write', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'sensitive_write',
    inputSchema: { type: 'object', properties: { phone: { type: 'string' }, name: { type: 'string' }, intent: { type: 'string' }, estimated_value: { type: 'number' }, notes: { type: 'string' } }, required: [], additionalProperties: false },
  },
  schedule_call: {
    name: 'schedule_call',
    description: 'Schedule a consultation call in the configured appointment calendar after confirmation.',
    capability: 'appointments', risk: 'write', requiresConfirmation: true,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'sensitive_write',
    inputSchema: { type: 'object', properties: { starts_at: { type: 'string', description: 'ISO-8601 in the business timezone, e.g. 2026-11-25T15:00:00+03:00 (relative Arabic like «غداً 3 عصراً» is also accepted).' }, service_name: { type: 'string' }, service_id: { type: 'string' }, name: { type: 'string', description: 'Customer name if they gave it.' }, phone: { type: 'string', description: 'Only if the customer asked to use a number other than the known one.' }, notes: { type: 'string' } }, required: ['starts_at'], additionalProperties: false },
  },
  send_brochure: {
    name: 'send_brochure',
    description: 'Return the configured public brochure link for the business, if one is available.',
    capability: 'lead_capture', risk: 'read', requiresConfirmation: false,
    allowedActors: ['agent', 'staff'], tenantScope: 'organization', auditClass: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
}


export function getToolPolicy(name: string): ToolPolicy | null {
  return TOOL_POLICIES[name] ?? null
}

export const TOOL_NAMES = Object.keys(TOOL_POLICIES)

/** True when the actor is allowed to invoke this tool at all. */
export function isActorAllowed(policy: ToolPolicy, actor: ToolActor): boolean {
  return policy.allowedActors.includes(actor)
}
