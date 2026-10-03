import type { SupabaseClient } from '@supabase/supabase-js'

export type KnowledgeCategoryGroup = {
  id: string
  title: string
  icon: string
  description: string
  items: Array<{
    id: string
    title: string
    content: string
    category: string
    isActive: boolean
    updatedAt: string
  }>
}

export type ReadinessResult = {
  score: number
  summary: {
    totalItems: number
    activeItems: number
    categoriesCovered: number
    totalCategories: number
  }
  missingItems: Array<{
    id: string
    label: string
    category: string
    promptHint: string
  }>
  categories: KnowledgeCategoryGroup[]
}

export async function calculateAgentReadiness(
  supabase: SupabaseClient,
  organizationId: string
): Promise<ReadinessResult> {
  const [
    { data: knowledge },
    { data: services },
    { data: hours },
    { data: profile },
    { data: business },
  ] = await Promise.all([
    supabase
      .from('knowledge_base')
      .select('id, title, content, category, is_active, updated_at')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('services')
      .select('id, name, price_amount, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
    supabase
      .from('business_hours')
      .select('day_of_week, is_closed, open_time, close_time')
      .eq('organization_id', organizationId)
      .eq('is_closed', false),
    supabase
      .from('business_profiles')
      .select('setup_description, system_prompt_addition, public_phone_number, industry')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('name')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const kbItems = (knowledge ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    category: String(row.category ?? 'general'),
    isActive: Boolean(row.is_active),
    updatedAt: String(row.updated_at ?? ''),
  }))

  const allContentLower = kbItems
    .map((item) => `${item.title} ${item.content}`)
    .join(' ')
    .toLowerCase()

  // 1. Company Profile & Activity (15%)
  const hasCompanyInfo =
    Boolean(business?.name) &&
    (Boolean(profile?.setup_description) ||
      kbItems.some((item) => item.category === 'business_info' || item.category === 'general'))

  // 2. Services & Products (20%)
  const hasServices =
    (services && services.length > 0) ||
    kbItems.some((item) => item.category === 'service_info' || allContentLower.includes('خدم'))

  // 3. Pricing & Currency (15%)
  const hasPricing =
    (services && services.some((s) => s.price_amount != null && Number(s.price_amount) > 0)) ||
    allContentLower.includes('سعر') ||
    allContentLower.includes('ريال') ||
    allContentLower.includes('تكلفة') ||
    allContentLower.includes('دولار')

  // 4. Working Hours & Days Off (15%)
  const hasHours =
    (hours && hours.length > 0) ||
    allContentLower.includes('ساعات العمل') ||
    allContentLower.includes('أوقات العمل') ||
    allContentLower.includes('دوام')

  // 5. Booking & Cancellation Policies (15%)
  const hasBookingPolicy =
    kbItems.some((item) => item.category === 'policy') ||
    allContentLower.includes('حجز') ||
    allContentLower.includes('إلغاء') ||
    allContentLower.includes('شروط') ||
    allContentLower.includes('استرجاع')

  // 6. Contact & Branches (10%)
  const hasContactInfo =
    Boolean(profile?.public_phone_number) ||
    allContentLower.includes('هاتف') ||
    allContentLower.includes('جوال') ||
    allContentLower.includes('موقع') ||
    allContentLower.includes('فرع') ||
    allContentLower.includes('عنوان')

  // 7. FAQs & Handoff / Tone (10%)
  const hasFaqAndHandoff =
    kbItems.some((item) => item.category === 'faq') ||
    Boolean(profile?.system_prompt_addition) ||
    allContentLower.includes('سؤال') ||
    allContentLower.includes('تحويل') ||
    allContentLower.includes('موظف')

  let score = 0
  if (hasCompanyInfo) score += 15
  if (hasServices) score += 20
  if (hasPricing) score += 15
  if (hasHours) score += 15
  if (hasBookingPolicy) score += 15
  if (hasContactInfo) score += 10
  if (hasFaqAndHandoff) score += 10

  const missingItems: ReadinessResult['missingItems'] = []

  if (!hasCompanyInfo) {
    missingItems.push({
      id: 'missing_company_info',
      label: 'وصف نشاط الشركة ورسالتها',
      category: 'business_info',
      promptHint: 'أريد تزويدك بنبذة عن الشركة ونشاطها الرئيسي وما يميزنا',
    })
  }

  if (!hasServices) {
    missingItems.push({
      id: 'missing_services',
      label: 'قائمة الخدمات أو المنتجات بالتفصيل',
      category: 'service_info',
      promptHint: 'أريد توضيح الخدمات والمنتجات التي نقدمها لعملائنا بالتفصيل',
    })
  }

  if (!hasPricing) {
    missingItems.push({
      id: 'missing_pricing',
      label: 'الأسعار والعملة المعتمدة وعروض الباقات',
      category: 'pricing',
      promptHint: 'أريد توضيح أسعار الخدمات والعملة المعتمدة وكيفية الدفع',
    })
  }

  if (!hasHours) {
    missingItems.push({
      id: 'missing_hours',
      label: 'أوقات العمل وساعات الدوام وأيام العطلة',
      category: 'hours',
      promptHint: 'أريد تحديد أوقات وساعات العمل الرسمية وأيام العطلة الأسبوعية',
    })
  }

  if (!hasBookingPolicy) {
    missingItems.push({
      id: 'missing_policy',
      label: 'سياسة الحجز وشروط الإلغاء والاسترجاع',
      category: 'policy',
      promptHint: 'أريد تحديد سياسة الحجز وشروط الإلغاء أو التأجيل والاسترجاع',
    })
  }

  if (!hasContactInfo) {
    missingItems.push({
      id: 'missing_contact',
      label: 'عناوين الفروع وأرقام التواصل وروابط الحسابات',
      category: 'contact',
      promptHint: 'أريد تزويدك بمواقع الفروع وأرقام التواصل وحسابات التواصل الاجتماعي',
    })
  }

  if (!hasFaqAndHandoff) {
    missingItems.push({
      id: 'missing_faq',
      label: 'الأسئلة الشائعة وحالات التحويل للموظف البشري',
      category: 'faq',
      promptHint: 'أريد توضيح أهم الأسئلة الشائعة للعملاء ومتى يتم تحويل العميل لموظف بشري',
    })
  }

  // Organize knowledge items into thematic categories
  const categoryDefinitions: Array<{
    id: string
    title: string
    icon: string
    description: string
    match: (item: (typeof kbItems)[number]) => boolean
  }> = [
    {
      id: 'business_info',
      title: 'معلومات ونشاط الشركة',
      icon: 'Building2',
      description: 'هوية النشاط، الوصف العام، والرسالة',
      match: (item) => item.category === 'business_info' || item.category === 'general',
    },
    {
      id: 'service_info',
      title: 'الخدمات والمنتجات',
      icon: 'Briefcase',
      description: 'تفاصيل الخدمات ومميزاتها',
      match: (item) => item.category === 'service_info',
    },
    {
      id: 'pricing',
      title: 'الأسعار والعملات',
      icon: 'Tag',
      description: 'تكاليف الخدمات، الباقات، والدفع',
      match: (item) => item.category === 'pricing' || item.title.includes('سعر') || item.content.includes('سعر'),
    },
    {
      id: 'policy',
      title: 'السياسات وطرق الحجز',
      icon: 'ShieldAlert',
      description: 'شروط الحجز، الإلغاء، الاسترجاع، والضمان',
      match: (item) => item.category === 'policy',
    },
    {
      id: 'faq',
      title: 'الأسئلة الشائعة',
      icon: 'HelpCircle',
      description: 'أبرز استفسارات العملاء وإجاباتها النموذجية',
      match: (item) => item.category === 'faq',
    },
  ]

  const categories: KnowledgeCategoryGroup[] = categoryDefinitions.map((cat) => ({
    id: cat.id,
    title: cat.title,
    icon: cat.icon,
    description: cat.description,
    items: kbItems.filter(cat.match),
  }))

  // Any items that didn't fit into defined categories go into general
  const categorizedIds = new Set(categories.flatMap((c) => c.items.map((i) => i.id)))
  const uncategorized = kbItems.filter((i) => !categorizedIds.has(i.id))
  if (uncategorized.length > 0) {
    const generalGroup = categories.find((c) => c.id === 'business_info')
    if (generalGroup) {
      generalGroup.items.push(...uncategorized)
    }
  }

  const activeItemsCount = kbItems.filter((i) => i.isActive).length
  const coveredCategoriesCount = categories.filter((c) => c.items.length > 0).length

  return {
    score: Math.min(100, Math.max(0, score)),
    summary: {
      totalItems: kbItems.length,
      activeItems: activeItemsCount,
      categoriesCovered: coveredCategoriesCount,
      totalCategories: categoryDefinitions.length,
    },
    missingItems,
    categories,
  }
}
