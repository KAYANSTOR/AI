import { getVertical, type VerticalId } from '@/lib/verticals/registry'

/**
 * Vertical-aware training checklists for the WhatsApp trainer ("مدرب كيان").
 *
 * Each of the 24 sectors gets its own list of the knowledge a customer agent needs.
 * Coverage is measured from approved training submissions (exact checklist key) and
 * from existing knowledge/memory text (keyword evidence), so knowledge entered on the
 * web counts too.
 */
export type KnowledgeCategory = 'general' | 'faq' | 'policy' | 'business_info' | 'service_info'
export type MemoryCategory = 'fact' | 'preference' | 'contact' | 'project' | 'document'
export type TrainingTarget = 'knowledge' | 'memory'

export type ChecklistItem = {
  key: string
  label: string
  /** One short, friendly question the bot asks on WhatsApp. */
  question: string
  keywords: readonly string[]
  category: KnowledgeCategory | MemoryCategory
}

const item = (key: string, label: string, question: string, keywords: string[], category: ChecklistItem['category']): ChecklistItem =>
  ({ key, label, question, keywords, category })

const hours = item('hours', 'ساعات العمل', 'ما أيام وساعات العمل لديكم؟ وهل توجد عطل ثابتة؟', ['ساعات', 'الدوام', 'نفتح', 'مفتوح', 'يوميا', 'العطله', 'من الساعه'], 'business_info')
const location = item('location', 'الموقع والتواصل', 'أين موقعكم أو فروعكم؟ وما أرقام التواصل؟', ['الموقع', 'العنوان', 'فرع', 'شارع', 'خرائط', 'رقم التواصل'], 'business_info')
const payment = item('payment', 'طرق الدفع', 'ما طرق الدفع المتاحة لديكم (نقداً، تحويل، محافظ)؟', ['الدفع', 'نقدا', 'تحويل', 'محفظه', 'كاش', 'بطاقه'], 'policy')
const cancellation = item('cancellation', 'سياسة الإلغاء', 'ما سياسة الإلغاء أو تغيير الموعد لديكم؟', ['الغاء', 'الإلغاء', 'تاجيل', 'تغيير الموعد', 'استرداد'], 'policy')
const faq = item('faq', 'الأسئلة الشائعة', 'ما أكثر سؤال يتكرر من عملائكم؟ وما إجابته؟', ['سؤال', 'الاسئله', 'شائع', 'يتكرر'], 'faq')

function booking(services: [string, string, string[]], extra: ChecklistItem[] = []): ChecklistItem[] {
  return [
    item('services', services[0], services[1], services[2], 'service_info'),
    item('prices', 'الأسعار', 'كم أسعار خدماتكم الأساسية؟', ['سعر', 'الاسعار', 'ريال', 'تكلفه', 'رسوم'], 'service_info'),
    ...extra,
    item('appointments', 'آلية الحجز', 'كيف يحجز العميل موعداً؟ وكم مدة الموعد عادة؟', ['حجز', 'موعد', 'المواعيد', 'احجز'], 'policy'),
    hours, cancellation, location,
  ]
}

function commerce(catalog: [string, string, string[]], extra: ChecklistItem[] = []): ChecklistItem[] {
  return [
    item('catalog', catalog[0], catalog[1], catalog[2], 'service_info'),
    item('prices', 'الأسعار', 'ما أسعار أهم الأصناف لديكم؟', ['سعر', 'الاسعار', 'ريال', 'تكلفه'], 'service_info'),
    ...extra,
    item('delivery', 'التوصيل والشحن', 'هل لديكم توصيل؟ ما مناطقه ورسومه ومدته؟', ['توصيل', 'التوصيل', 'شحن', 'مناطق', 'رسوم التوصيل'], 'policy'),
    hours, payment, location,
  ]
}

function events(offer: [string, string, string[]], extra: ChecklistItem[] = []): ChecklistItem[] {
  return [
    item('packages', offer[0], offer[1], offer[2], 'service_info'),
    item('prices', 'الأسعار', 'كم أسعار باقاتكم أو خدماتكم؟', ['سعر', 'الاسعار', 'ريال', 'تكلفه', 'باقه'], 'service_info'),
    item('booking', 'الحجز والعربون', 'كيف يتم الحجز؟ وهل يلزم عربون مقدم؟', ['حجز', 'عربون', 'مقدم', 'تاكيد الحجز'], 'policy'),
    ...extra,
    cancellation, payment, location,
  ]
}

function leads(offer: [string, string, string[]], extra: ChecklistItem[] = []): ChecklistItem[] {
  return [
    item('offerings', offer[0], offer[1], offer[2], 'service_info'),
    item('prices', 'الأسعار أو نطاقها', 'ما الأسعار أو نطاقها التقريبي لخدماتكم؟', ['سعر', 'الاسعار', 'ريال', 'تكلفه', 'ميزانيه'], 'service_info'),
    ...extra,
    item('process', 'خطوات العمل', 'ما خطوات العمل مع العميل من أول تواصل حتى التسليم؟', ['خطوات', 'مراحل', 'التسليم', 'نبدا'], 'policy'),
    hours, location, faq,
  ]
}

export const TRAINING_CHECKLISTS: Record<VerticalId, readonly ChecklistItem[]> = {
  personal_assistant: [
    item('preferences', 'التفضيلات', 'ما أهم تفضيلاتك في العمل والتواصل (أوقات الاجتماعات، أسلوب الرد)؟', ['افضل', 'أفضّل', 'احب', 'لا احب', 'تفضيل'], 'preference'),
    item('routine', 'الروتين اليومي', 'كيف يبدو يومك المعتاد؟ ومتى تفضّل أن أذكّرك بالمهام؟', ['روتين', 'يومي', 'صباح', 'مساء', 'استيقظ', 'كل يوم'], 'fact'),
    item('contacts', 'جهات الاتصال المهمة', 'من أهم الأشخاص الذين تتواصل معهم (الاسم والصفة)؟', ['اخي', 'زوجتي', 'مديري', 'شريكي', 'رقم', 'صديقي'], 'contact'),
    item('rules', 'القواعد الشخصية', 'هل لديك قواعد ثابتة تريدني أن ألتزم بها دائماً؟', ['لا ترسل', 'دائما', 'ابدا', 'قاعده', 'ممنوع'], 'preference'),
    item('projects', 'المشاريع الحالية', 'ما المشاريع أو الأهداف التي تعمل عليها الآن؟', ['مشروع', 'هدف', 'اعمل على', 'خطه'], 'project'),
  ],
  clinic: booking(['التخصصات والخدمات', 'ما التخصصات والخدمات الطبية التي تقدمها العيادة؟', ['تخصص', 'التخصصات', 'باطنيه', 'اطفال', 'خدمات طبيه']], [
    item('doctors', 'الأطباء', 'من الأطباء لديكم؟ وما تخصص كل طبيب ومواعيده؟', ['دكتور', 'الدكتور', 'طبيب', 'الاطباء', 'د.'], 'service_info'),
  ]).map((entry) => entry.key === 'prices'
    ? { ...entry, key: 'consultation_fees', label: 'أسعار الكشف', question: 'كم سعر الكشف والمراجعة لكل تخصص؟', keywords: ['كشف', 'الكشف', 'مراجعه', 'سعر', 'ريال'] }
    : entry.key === 'services' ? { ...entry, key: 'specialties', label: 'التخصصات' } : entry),
  dental_beauty: booking(['العلاجات والجلسات', 'ما العلاجات والجلسات التي تقدمونها؟', ['تقويم', 'تبييض', 'حشو', 'جلسه', 'ليزر', 'علاج']], [
    item('doctors', 'الأطباء والأخصائيون', 'من الأطباء أو الأخصائيون لديكم؟', ['دكتور', 'الدكتوره', 'اخصائي', 'طبيب'], 'service_info'),
  ]),
  salon_barber: booking(['الخدمات', 'ما الخدمات التي يقدمها الصالون (قص، صبغة، عناية)؟', ['قص', 'حلاقه', 'صبغه', 'تسريحه', 'عنايه', 'مكياج']], [
    item('staff', 'فريق العمل', 'هل يمكن للعميل اختيار الحلاق أو المختصة؟ من هم؟', ['الحلاق', 'المختصه', 'الكوافيره', 'فريق'], 'service_info'),
  ]),
  legal_consulting: booking(['مجالات الاستشارة', 'ما مجالات القضايا والاستشارات التي تغطونها؟', ['تجاري', 'جنائي', 'احوال شخصيه', 'عقود', 'قضيه', 'استشاره']], [
    item('documents', 'المستندات المطلوبة', 'ما المستندات التي يحضرها العميل لأول استشارة؟', ['مستندات', 'وثائق', 'هويه', 'عقد', 'اوراق'], 'policy'),
  ]),
  maintenance_workshop: booking(['أعمال الصيانة', 'ما أعمال الصيانة والإصلاح التي تقدمونها؟', ['صيانه', 'اصلاح', 'زيت', 'فحص', 'كهرباء', 'ميكانيك']], [
    item('warranty', 'الضمان', 'هل يوجد ضمان على الإصلاح؟ وما مدته؟', ['ضمان', 'الضمان', 'كفاله'], 'policy'),
  ]),
  gym_fitness: booking(['البرامج والحصص', 'ما البرامج والحصص التدريبية لديكم؟', ['حصه', 'برنامج', 'تمارين', 'لياقه', 'كارديو', 'مدرب']], [
    item('memberships', 'الاشتراكات', 'ما أنواع الاشتراكات ومدتها؟', ['اشتراك', 'شهري', 'سنوي', 'عضويه'], 'service_info'),
  ]),
  ecommerce_store: commerce(['المنتجات', 'ما أهم المنتجات أو الأقسام في متجركم؟', ['منتج', 'المنتجات', 'قسم', 'موديل', 'ماركه']], [
    item('returns', 'الاستبدال والاسترجاع', 'ما سياسة الاستبدال والاسترجاع ومدتها؟', ['استبدال', 'استرجاع', 'ارجاع', 'الاسترجاع'], 'policy'),
  ]),
  restaurant_cafe: commerce(['المنيو', 'ما الأصناف الرئيسية في المنيو؟ يمكنك إرسال صورة المنيو.', ['المنيو', 'منيو', 'قائمه الطعام', 'اطباق', 'وجبات', 'مشروبات', 'شاورما', 'برجر']], [
    item('offers', 'العروض', 'هل لديكم عروض أو وجبات عائلية حالياً؟', ['عرض', 'عروض', 'خصم', 'وجبه عائليه'], 'service_info'),
  ]).map((entry) => entry.key === 'catalog' ? { ...entry, key: 'menu' } : entry),
  bakery_sweets: commerce(['الأصناف', 'ما أصناف المخبوزات والحلويات لديكم؟', ['كيك', 'حلويات', 'معجنات', 'خبز', 'تورته']], [
    item('custom_orders', 'الطلبات الخاصة', 'هل تقبلون طلبات خاصة (تورتات مناسبات)؟ وكم مدة التجهيز؟', ['طلب خاص', 'مناسبات', 'تورته', 'قبلها', 'تجهيز'], 'policy'),
  ]),
  pharmacy: commerce(['الأدوية والمستلزمات', 'ما أهم الأقسام لديكم (أدوية، مستلزمات، تجميل)؟', ['ادويه', 'مستلزمات', 'فيتامينات', 'تجميل', 'صيدليه']], [
    item('prescriptions', 'الوصفات الطبية', 'كيف تتعاملون مع الأدوية التي تحتاج وصفة طبية؟', ['وصفه', 'روشته', 'صيدلي'], 'policy'),
  ]),
  fashion_tailoring: commerce(['المنتجات والخدمات', 'ما القطع أو خدمات التفصيل التي تقدمونها؟', ['فستان', 'تفصيل', 'عبايه', 'تطريز', 'قماش', 'ثوب']], [
    item('sizes', 'المقاسات والتعديل', 'كيف يتم أخذ المقاسات؟ وكم مدة التفصيل أو التعديل؟', ['مقاس', 'المقاسات', 'تعديل', 'تفصيل'], 'policy'),
  ]),
  wholesale: commerce(['الأصناف', 'ما الأصناف التي توردونها بالجملة؟', ['جمله', 'اصناف', 'كرتون', 'توريد']], [
    item('minimum_order', 'الحد الأدنى للطلب', 'ما الحد الأدنى للطلب بالجملة؟', ['الحد الادنى', 'اقل كميه', 'كميه'], 'policy'),
  ]),
  event_hall: events(['القاعات والباقات', 'ما القاعات والباقات المتاحة؟ وكم سعتها؟', ['قاعه', 'باقه', 'سعه', 'ضيف', 'كوشه']], [
    item('services', 'الخدمات المرافقة', 'ما الخدمات المرافقة (ضيافة، تصوير، كوشة)؟', ['ضيافه', 'بوفيه', 'كوشه', 'تصوير', 'خدمات'], 'service_info'),
  ]),
  artist_entertainment: events(['الفقرات والباقات', 'ما الفقرات الفنية أو الباقات التي تقدمونها؟', ['فقره', 'حفله', 'زفه', 'دي جي', 'فرقه']], [
    item('coverage', 'مناطق التغطية', 'في أي مدن أو مناطق تقدمون الحفلات؟', ['مدينه', 'مناطق', 'خارج', 'نغطي'], 'policy'),
  ]),
  photography: events(['أنواع التصوير والباقات', 'ما أنواع التصوير والباقات لديكم؟', ['تصوير', 'جلسه', 'فيديو', 'البوم', 'باقه']], [
    item('delivery_time', 'مدة التسليم', 'كم مدة تسليم الصور أو الفيديو؟', ['تسليم', 'مده', 'يوم', 'اسبوع'], 'policy'),
  ]),
  hotel_chalet: events(['الغرف والمرافق', 'ما أنواع الغرف أو الوحدات والمرافق المتاحة؟', ['غرفه', 'جناح', 'شاليه', 'مسبح', 'مرافق']], [
    item('check_in', 'الدخول والمغادرة', 'ما مواعيد الدخول والمغادرة؟', ['الدخول', 'المغادره', 'تشيك', 'الساعه'], 'policy'),
  ]),
  car_rental: events(['السيارات والمعدات', 'ما فئات السيارات أو المعدات المتاحة للتأجير؟', ['سياره', 'سيارات', 'معدات', 'فئه', 'موديل']], [
    item('requirements', 'شروط التأجير', 'ما شروط التأجير والمستندات المطلوبة والتأمين؟', ['رخصه', 'تامين', 'شروط', 'هويه', 'ضمان'], 'policy'),
  ]),
  real_estate: leads(['العقارات المعروضة', 'ما العقارات أو العروض المتاحة لديكم حالياً؟', ['شقه', 'فيلا', 'ارض', 'عماره', 'عقار', 'للبيع', 'للايجار']], [
    item('areas', 'المناطق', 'في أي مناطق تتوفر عقاراتكم؟', ['منطقه', 'حي', 'المناطق', 'شارع'], 'business_info'),
    item('terms', 'شروط الإيجار والبيع', 'ما شروط الإيجار أو البيع (المقدم، العمولة، العقد)؟', ['شروط', 'عموله', 'مقدم', 'عقد', 'ايجار'], 'policy'),
  ]),
  travel_agency: leads(['الرحلات والبرامج', 'ما الرحلات والبرامج السياحية المتاحة؟', ['رحله', 'برنامج', 'عمره', 'حج', 'تذاكر', 'فيزا']], [
    item('visa', 'التأشيرات والمستندات', 'ما المستندات المطلوبة للتأشيرات والحجز؟', ['فيزا', 'تاشيره', 'جواز', 'مستندات'], 'policy'),
  ]),
  education_courses: leads(['الدورات والبرامج', 'ما الدورات والبرامج التي تقدمونها؟', ['دوره', 'دورات', 'برنامج', 'كورس', 'دبلوم']], [
    item('schedule', 'المواعيد والمدة', 'ما مواعيد الدورات ومدتها؟ وهل هي حضورية أو عن بُعد؟', ['مده', 'اسابيع', 'حضوري', 'اونلاين', 'عن بعد'], 'service_info'),
  ]),
  agency_services: leads(['الخدمات والحلول', 'ما الخدمات التي تقدمها شركتكم؟', ['برمجه', 'تسويق', 'تصميم', 'موقع', 'تطبيق', 'خدمات']], [
    item('portfolio', 'الأعمال السابقة', 'ما أبرز أعمالكم أو عملائكم السابقين؟', ['اعمال', 'عملاء', 'مشاريع سابقه', 'بورتفوليو'], 'business_info'),
  ]),
  shipping_logistics: leads(['خدمات الشحن', 'ما خدمات الشحن التي تقدمونها (داخلي، دولي، سريع)؟', ['شحن', 'داخلي', 'دولي', 'سريع', 'طرد']], [
    item('routes', 'المسارات والمدد', 'ما المدن أو الدول التي تشحنون إليها؟ وكم المدة؟', ['مدينه', 'دول', 'مسار', 'مده', 'ايام'], 'service_info'),
  ]),
  custom: leads(['الخدمات أو المنتجات', 'ما الخدمات أو المنتجات التي يقدمها نشاطك؟', ['خدمه', 'منتج', 'نقدم', 'لدينا']], [
    payment,
  ]),
}

/** Normalizes Arabic for matching: diacritics, tatweel, alef/ya/ta-marbuta variants. */
export function normalizeArabic(text: string): string {
  return text.toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}

export function trainingChecklist(verticalId: string | null | undefined) {
  const vertical = getVertical(verticalId)
  return {
    vertical,
    items: TRAINING_CHECKLISTS[vertical.id],
    target: (vertical.id === 'personal_assistant' ? 'memory' : 'knowledge') as TrainingTarget,
  }
}

export type ReadinessItem = ChecklistItem & { done: boolean }
export type Readiness = {
  percent: number
  items: ReadinessItem[]
  done: ReadinessItem[]
  missing: ReadinessItem[]
  next: ReadinessItem | null
}

export function computeReadiness(verticalId: string | null | undefined, evidence: { texts: readonly string[]; coveredKeys: readonly string[] }): Readiness {
  const { items } = trainingChecklist(verticalId)
  const haystack = normalizeArabic(evidence.texts.join('\n'))
  const covered = new Set(evidence.coveredKeys)
  const evaluated = items.map((entry) => ({
    ...entry,
    done: covered.has(entry.key) || entry.keywords.some((keyword) => haystack.includes(normalizeArabic(keyword))),
  }))
  const done = evaluated.filter((entry) => entry.done)
  const missing = evaluated.filter((entry) => !entry.done)
  return {
    percent: items.length ? Math.round((done.length / items.length) * 100) : 0,
    items: evaluated,
    done,
    missing,
    next: missing[0] ?? null,
  }
}

/** Best checklist item for a new piece of content (used to tag a submission). */
export function matchChecklistItem(verticalId: string | null | undefined, text: string): string | null {
  const normalized = normalizeArabic(text)
  for (const entry of trainingChecklist(verticalId).items) {
    if (entry.keywords.some((keyword) => normalized.includes(normalizeArabic(keyword)))) return entry.key
  }
  return null
}
