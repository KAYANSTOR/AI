export type BaseEngine = 'booking_engine' | 'commerce_engine' | 'event_engine' | 'lead_engine'
export type VerticalId =
  | 'personal_assistant'
  | 'clinic' | 'dental_beauty' | 'salon_barber' | 'legal_consulting' | 'maintenance_workshop' | 'gym_fitness'
  | 'ecommerce_store' | 'restaurant_cafe' | 'bakery_sweets' | 'pharmacy' | 'fashion_tailoring' | 'wholesale'
  | 'event_hall' | 'artist_entertainment' | 'photography' | 'hotel_chalet' | 'car_rental'
  | 'real_estate' | 'travel_agency' | 'education_courses' | 'agency_services' | 'shipping_logistics' | 'custom'

export type VerticalLabels = {
  appointments: string
  orders: string
  leads: string
  services: string
  contacts: string
  quotes: string
}

export type KnowledgeTemplate = {
  id: string
  title: string
  category: 'faq' | 'policy' | 'business_info' | 'service_info'
  prompt: string
}

export type VerticalDefinition = {
  id: VerticalId
  baseEngine: BaseEngine
  nameAr: string
  icon: string
  labels: VerticalLabels
  enabledModules: readonly string[]
  enabledTools: readonly string[]
  defaultSystemPrompt: string
  kbTemplates: readonly KnowledgeTemplate[]
  requiredFields: readonly string[]
}

const bookingModules = ['appointments', 'lead_capture', 'knowledge_base', 'inbox', 'follow_up'] as const
const commerceModules = ['orders', 'quotes', 'lead_capture', 'knowledge_base', 'inbox', 'follow_up'] as const
const eventModules = ['appointments', 'quotes', 'lead_capture', 'knowledge_base', 'inbox', 'follow_up'] as const
const leadModules = ['lead_capture', 'quotes', 'knowledge_base', 'inbox', 'follow_up'] as const

const bookingTools = ['check_slots', 'book_appointment', 'cancel_appointment'] as const
const commerceTools = ['search_products', 'create_order', 'track_order'] as const
const eventTools = ['check_date_availability', 'book_reservation', 'send_packages'] as const
const leadTools = ['capture_lead', 'schedule_call', 'send_brochure'] as const

const commonTemplates: readonly KnowledgeTemplate[] = [
  { id: 'hours', title: 'ساعات العمل ومواعيد استقبال العملاء', category: 'business_info', prompt: 'أدخل أيام وساعات العمل والإجازات.' },
  { id: 'cancellation', title: 'سياسة الإلغاء والاسترجاع', category: 'policy', prompt: 'متى وكيف يمكن للعميل الإلغاء أو الاسترجاع؟' },
]

function sectorPrompt(name: string, focus: string) {
  return `أنت مساعد ${name}. ${focus} التزم بالمعلومات المعتمدة ولا تخمّن الأسعار أو التوافر. رد واتساب في 2–4 أسطر وأقل من 60 كلمة، إلا إذا طلب العميل تفصيلاً. اسأل سؤالاً أو سؤالين فقط في كل رسالة، وتجنب الحشو وتكرار الترحيب. عند اكتمال البيانات نفّذ الإجراء المناسب فوراً ولا تسأل إن كان يريد تسجيلها. استخدم تنسيق واتساب بنجمة واحدة للعريض، ولا تستخدم عناوين Markdown.`
}

function templatesFor(name: string, serviceLabel: string): KnowledgeTemplate[] {
  return [
    ...commonTemplates,
    { id: 'catalog', title: `الخدمات أو المنتجات في ${name}`, category: 'service_info', prompt: `أضف أسماء ${serviceLabel} ووصفها وأسعارها وشروطها.` },
    { id: 'faq', title: 'الأسئلة الشائعة', category: 'faq', prompt: 'أضف الأسئلة المتكررة وإجاباتها الدقيقة.' },
  ]
}

function define(
  id: VerticalId,
  baseEngine: BaseEngine,
  nameAr: string,
  icon: string,
  serviceLabel: string,
  labels: Partial<VerticalLabels>,
  focus: string,
  requiredFields: string[]
): VerticalDefinition {
  const engine = {
    booking_engine: { modules: bookingModules, tools: bookingTools },
    commerce_engine: { modules: commerceModules, tools: commerceTools },
    event_engine: { modules: eventModules, tools: eventTools },
    lead_engine: { modules: leadModules, tools: leadTools },
  }[baseEngine]
  return {
    id,
    baseEngine,
    nameAr,
    icon,
    labels: {
      appointments: 'المواعيد', orders: 'الطلبات', leads: 'العملاء المحتملون',
      services: 'الخدمات', contacts: 'جهات الاتصال', quotes: 'عروض الأسعار',
      ...labels,
    },
    enabledModules: engine.modules,
    enabledTools: engine.tools,
    defaultSystemPrompt: sectorPrompt(nameAr, focus),
    kbTemplates: templatesFor(nameAr, serviceLabel),
    requiredFields,
  }
}

export const VERTICALS: readonly VerticalDefinition[] = [
  define('personal_assistant', 'lead_engine', 'المساعد الشخصي', 'Bot', 'المهام والمعلومات الشخصية', { leads: 'المهام الشخصية', services: 'المعلومات الشخصية' }, 'أدر مهام صاحب الحساب ومعلوماته الخاصة بأمان، ولا تتعامل مع العملاء أو المبيعات أو المواعيد التجارية.', ['task', 'due_date']),
  define('clinic', 'booking_engine', 'عيادة ومركز طبي', 'Stethoscope', 'التخصصات والخدمات الطبية', { appointments: 'المواعيد الطبية', services: 'الخدمات الطبية' }, 'رتّب الاستفسارات والمواعيد دون تشخيص أو وصف علاج.', ['service_id', 'date', 'patient_name']),
  define('dental_beauty', 'booking_engine', 'عيادات الأسنان والتجميل', 'Smile', 'العلاجات والجلسات', { appointments: 'مواعيد العلاجات', services: 'العلاجات والجلسات' }, 'ساعد في اختيار موعد وقدم معلومات الخدمات المعتمدة دون تشخيص.', ['service_id', 'date', 'patient_name']),
  define('salon_barber', 'booking_engine', 'صالون تجميل وحلاقة', 'Scissors', 'الخدمات والجلسات', { appointments: 'الحجوزات', services: 'الخدمات والجلسات' }, 'وجّه العميل إلى الخدمة والموعد المناسبين.', ['service_id', 'date']),
  define('legal_consulting', 'booking_engine', 'مكاتب المحاماة والاستشارات', 'Scale', 'الخدمات الاستشارية', { appointments: 'الاستشارات', services: 'مجالات الاستشارة' }, 'لا تقدم رأياً قانونياً؛ اجمع ملخص الطلب ورتّب استشارة.', ['consultation_type', 'date', 'client_name']),
  define('maintenance_workshop', 'booking_engine', 'مراكز الصيانة وورش السيارات', 'Wrench', 'الخدمات وأعمال الصيانة', { appointments: 'مواعيد الصيانة', services: 'أعمال الصيانة' }, 'اجمع نوع العطل والمنتج أو المركبة ثم نسّق موعداً.', ['service_id', 'date', 'item_or_vehicle']),
  define('gym_fitness', 'booking_engine', 'الأندية الرياضية والمدربون', 'Dumbbell', 'الحصص والخدمات التدريبية', { appointments: 'الحصص والجلسات', services: 'الحصص والبرامج' }, 'ساعد في حجز حصة أو جلسة تدريب بناء على الجدول المعتمد.', ['service_id', 'date']),
  define('ecommerce_store', 'commerce_engine', 'متجر إلكتروني / تجزئة', 'ShoppingBag', 'المنتجات', { orders: 'طلبات الشراء', services: 'المنتجات' }, 'تحقق من كتالوج المنتجات والمخزون المسجل قبل تأكيد الطلب.', ['items', 'delivery_location', 'customer_name']),
  define('restaurant_cafe', 'commerce_engine', 'مطعم أو مقهى', 'Utensils', 'الأطباق والمشروبات', { orders: 'طلبات الطعام', services: 'القائمة' }, 'اعرض القائمة المعتمدة واجمع الأصناف وطريقة الاستلام.', ['items', 'pickup_or_delivery']),
  define('bakery_sweets', 'commerce_engine', 'مخبز وحلويات', 'CakeSlice', 'الأصناف والطلبات الخاصة', { orders: 'طلبات المخبوزات', services: 'الأصناف' }, 'وضّح أحجام الطلبات والموعد المطلوب قبل تسجيله.', ['items', 'quantity', 'pickup_date']),
  define('pharmacy', 'commerce_engine', 'صيدلية ومستلزمات طبية', 'Pill', 'الأدوية والمستلزمات', { orders: 'طلبات الصرف والتوصيل', services: 'الأدوية والمستلزمات' }, 'لا تشخّص ولا تصف دواء؛ تحقق من توفر الصنف المسجل وأحل الوصفات للصيدلي.', ['items', 'prescription_if_required']),
  define('fashion_tailoring', 'commerce_engine', 'الأزياء والتطريز والخياطة', 'Shirt', 'القطع وخدمات التفصيل', { orders: 'طلبات الشراء والتفصيل', services: 'المنتجات والخدمات' }, 'اجمع المقاس واللون والتعديلات المطلوبة قبل تسجيل الطلب.', ['item', 'size', 'color']),
  define('wholesale', 'commerce_engine', 'تجارة الجملة والموردين', 'Boxes', 'الأصناف وأسعار الجملة', { orders: 'طلبات التوريد', services: 'الأصناف' }, 'اجمع الكميات ومعلومات المنشأة قبل طلب عرض أو توريد.', ['items', 'quantity', 'company_name']),
  define('event_hall', 'event_engine', 'قاعات المناسبات والأعراس', 'PartyPopper', 'القاعات والباقات', { appointments: 'زيارات القاعات', quotes: 'الباقات والعروض', services: 'القاعات والباقات' }, 'اجمع تاريخ المناسبة وعدد الضيوف ثم اعرض الباقات المعتمدة.', ['event_date', 'guest_count', 'hall']),
  define('artist_entertainment', 'event_engine', 'الفنانون ومنسقو الحفلات', 'Music', 'الفقرات والباقات', { appointments: 'مواعيد المناسبات', quotes: 'الباقات الفنية', services: 'الفقرات الفنية' }, 'تحقق من تاريخ المناسبة ونوع الفقرة قبل إعداد عرض.', ['event_date', 'event_type', 'location']),
  define('photography', 'event_engine', 'المصورون والاستوديوهات', 'Camera', 'جلسات التصوير والباقات', { appointments: 'جلسات التصوير', quotes: 'باقات التصوير', services: 'أنواع التصوير' }, 'اجمع نوع التصوير والتاريخ والموقع قبل ترشيح الباقة.', ['shoot_type', 'date', 'location']),
  define('hotel_chalet', 'event_engine', 'الفنادق والشاليهات والاستراحات', 'BedDouble', 'الغرف والمرافق', { appointments: 'الإقامة', quotes: 'الباقات', services: 'الغرف والمرافق' }, 'تحقق من تواريخ الإقامة وعدد النزلاء ولا تؤكد التوفر إلا بنتيجة النظام.', ['check_in', 'check_out', 'guest_count']),
  define('car_rental', 'event_engine', 'تأجير السيارات والمعدات', 'Car', 'السيارات والمعدات', { appointments: 'فترات التأجير', quotes: 'باقات التأجير', services: 'السيارات والمعدات' }, 'اجمع فترة التأجير والفئة المطلوبة وموقع الاستلام.', ['item_type', 'start_date', 'end_date']),
  define('real_estate', 'lead_engine', 'العقارات والتسويق العقاري', 'House', 'العقارات والعروض', { leads: 'العملاء المهتمون', services: 'العقارات' }, 'اجمع نوع العقار والمنطقة والميزانية ثم رتّب تواصلاً مع المستشار.', ['property_type', 'area', 'budget']),
  define('travel_agency', 'lead_engine', 'وكالات السفر والسياحة', 'Plane', 'الرحلات والبرامج السياحية', { leads: 'طلبات السفر', services: 'الرحلات والبرامج' }, 'اجمع الوجهة والتواريخ وعدد المسافرين لتجهيز عرض مناسب.', ['destination', 'travel_dates', 'travellers']),
  define('education_courses', 'lead_engine', 'الأكاديميات والمعاهد والدورات', 'GraduationCap', 'الدورات والبرامج', { leads: 'طلبات التسجيل', services: 'الدورات والبرامج' }, 'اجمع الدورة والمستوى والموعد ثم وجّه المتقدم للتسجيل.', ['course', 'level', 'learner_name']),
  define('agency_services', 'lead_engine', 'شركات البرمجة والتسويق والخدمات', 'BriefcaseBusiness', 'الخدمات والحلول', { leads: 'الفرص والاستفسارات', services: 'الخدمات والحلول' }, 'اكتشف هدف المشروع والميزانية والموعد ثم نسق مكالمة.', ['service_need', 'budget', 'timeline']),
  define('shipping_logistics', 'lead_engine', 'شركات الشحن والتوصيل', 'Truck', 'خدمات الشحن والتوصيل', { leads: 'طلبات الشحن', services: 'مسارات الشحن' }, 'اجمع مدينتي الإرسال والاستلام ونوع الشحنة لتوجيهها للموظف.', ['origin', 'destination', 'shipment_type']),
  define('custom', 'lead_engine', 'نشاط تجاري عام / مخصص', 'Building2', 'الخدمات أو المنتجات', {}, 'افهم استفسار العميل واجمع البيانات تدريجياً ثم أحله إلى القسم المناسب.', ['customer_intent']),
]

export const VERTICAL_GROUPS: readonly { id: BaseEngine; nameAr: string; verticals: readonly VerticalDefinition[] }[] = [
  { id: 'booking_engine', nameAr: 'المواعيد والخدمات', verticals: VERTICALS.filter((v) => v.baseEngine === 'booking_engine') },
  { id: 'commerce_engine', nameAr: 'الطلبات والمتاجر', verticals: VERTICALS.filter((v) => v.baseEngine === 'commerce_engine') },
  { id: 'event_engine', nameAr: 'التواريخ والمرافق والفعاليات', verticals: VERTICALS.filter((v) => v.baseEngine === 'event_engine') },
  { id: 'lead_engine', nameAr: 'المبيعات والاستفسارات', verticals: VERTICALS.filter((v) => v.baseEngine === 'lead_engine') },
]

const LEGACY_VERTICAL_MAP: Record<string, VerticalId> = {
  appointments: 'clinic', sales: 'ecommerce_store', weddings_events: 'event_hall',
  home_services: 'maintenance_workshop', it_technology: 'agency_services',
}

export function getVertical(id: string | null | undefined): VerticalDefinition {
  const resolved = id ? (LEGACY_VERTICAL_MAP[id] ?? id) : 'custom'
  return VERTICALS.find((vertical) => vertical.id === resolved) ?? VERTICALS.find((vertical) => vertical.id === 'custom')!
}
