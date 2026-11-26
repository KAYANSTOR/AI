import { hasBusinessNavigationCapability, isPersonalWorkspace, type NavigationAccess } from './navigation-policy'

export const TOUR_VERSION = 1
export type TourTrack = 'commercial' | 'personal' | 'personal_unavailable'
export type TourStatus = 'active' | 'paused' | 'completed'
export type TourProgress = { stepId: string; status: TourStatus }
export type TourAccess = NavigationAccess & { setupComplete: boolean }
export type TourStep = { id: string; title: string; description: string }

const navigation: TourStep = { id: 'navigation', title: 'تنقّل بين وظائفك اليومية', description: 'الشريط السفلي يوصلك إلى الوظائف المناسبة لقطاعك وصلاحياتك. ارجع إلى الرئيسية في أي وقت لمتابعة الجولة.' }
const account: TourStep = { id: 'account', title: 'حسابك ومساعدتك', description: 'من رمز الحساب تصل إلى بياناتك وإعداداتك ورابط دليل الاستخدام. يمكنك العودة إلى هذه الجولة متى احتجت إليها.' }

export function dashboardTour(access: TourAccess): { track: TourTrack; steps: TourStep[] } {
  if (isPersonalWorkspace(access)) {
    if (!access.personalAssistantEnabled) return { track: 'personal_unavailable', steps: [
      { id: 'personal_main', title: 'راجع إتاحة مساعدك', description: 'تجد رابط الباقات في البطاقة الرئيسية. راجع خطة الحساب قبل استخدام المساعد.' },
      navigation, account,
    ] }
    return { track: 'personal', steps: [
      { id: 'personal_main', title: 'ابدأ محادثة مع مساعدك', description: 'اضغط زر المحادثة واسأل مساعدك عما تريد، أو اطلب منه تنظيم مهمة.' },
      { id: 'personal_tools', title: 'مهامك وذاكرتك وأدواتك', description: 'اختر البطاقة المناسبة لمراجعة التذكيرات أو الذاكرة أو الموصلات. يمكنك العودة دون إنهاء الجولة.' },
      navigation, account,
    ] }
  }
  const steps: TourStep[] = []
  if (!access.setupComplete && ['owner', 'admin'].includes(access.role)) steps.push({
    id: 'setup', title: 'أكمل تجهيز النشاط', description: 'اضغط متابعة لاستكمال تعريف النشاط وربط القناة وإعداد الوكيل واختباره قبل التشغيل. هذه الجولة لا تفعّل الوكيل نيابة عنك.',
  })
  steps.push({ id: 'business_services', title: 'أدوات نشاطك في مكان واحد', description: 'تجد هنا خدمات مساحة العمل حسب الميزات المتاحة لنشاطك. اختر البطاقة التي تحتاجها.' })
  if (hasBusinessNavigationCapability(access, 'appointments')) steps.push({ id: 'appointments', title: 'تابع المواعيد', description: 'تفتح هذه البطاقة قائمة المواعيد. إضافة المواعيد متاحة للأدوار التي تملك صلاحية التعديل.' })
  if (hasBusinessNavigationCapability(access, 'orders')) steps.push({ id: 'orders', title: 'تابع الطلبات', description: 'من بطاقة الطلبات يمكنك متابعة طلبات العملاء حسب صلاحيات حسابك.' })
  if (hasBusinessNavigationCapability(access, 'inbox')) steps.push({ id: 'inbox', title: 'تابع محادثات العملاء', description: 'صندوق الوارد يجمع المحادثات الواردة من القنوات المرتبطة بنشاطك.' })
  steps.push(navigation, account)
  return { track: 'commercial', steps }
}

export function parseTourProgress(value: unknown, steps: readonly TourStep[]): TourProgress | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const status = row.status
  if (status !== 'active' && status !== 'paused' && status !== 'completed') return null
  if (typeof row.stepId !== 'string' || !steps.some(step => step.id === row.stepId)) return null
  return { stepId: row.stepId, status }
}

export function restoreTourProgress(value: unknown, steps: readonly TourStep[]): TourProgress {
  const parsed = parseTourProgress(value, steps)
  if (parsed) return parsed
  const status = value && typeof value === 'object' && 'status' in value ? value.status : null
  return { stepId: steps[0].id, status: status === 'completed' || status === 'paused' ? status : 'active' }
}

export type ScreenTourGuide = {
  screenKey: string
  title: string
  summary: string
  steps: TourStep[]
}

const MAX_EXPLORED_SCREENS = 60

export function shouldShowHomeTour(
  progress: TourProgress | null,
  options: { dismissed?: boolean; reopenRequested?: boolean } = {}
): boolean {
  if (options.dismissed) return false
  if (options.reopenRequested) return true
  if (!progress) return false
  return progress.status === 'active'
}

export function parseExploredScreens(raw: string | null): Set<string> {
  if (!raw) return new Set<string>()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
  } catch {
    return new Set<string>()
  }
}

export function markScreenExplored(explored: ReadonlySet<string>, screenKey: string): string[] {
  const next = new Set(explored)
  if (screenKey.trim()) next.add(screenKey.trim())
  return [...next].slice(-MAX_EXPLORED_SCREENS)
}

function normalizeDashboardPath(pathname: string): string {
  const clean = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '')
  return clean || '/dashboard'
}

/**
 * Returns a concise Arabic tour for any inner `/dashboard/...` screen so every section
 * is guided on first visit without needing permanent clutter after exploration.
 */
export function screenTourGuide(pathname: string, access: TourAccess): ScreenTourGuide | null {
  const path = normalizeDashboardPath(pathname)
  if (path === '/dashboard' || !path.startsWith('/dashboard/')) return null

  const admin = ['owner', 'admin'].includes(access.role)
  const editable = ['owner', 'admin', 'manager', 'member'].includes(access.role)

  const matchPrefix = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

  if (matchPrefix('/dashboard/assistant/memories')) {
    return {
      screenKey: 'assistant_memories',
      title: 'ذاكرة المساعد الشخصي',
      summary: 'راجع الحقائق والتفضيلات المحفوظة لتبقى إجابات «كيان» دقيقة وشخصية.',
      steps: [
        {
          id: 'memories_review',
          title: 'تصفّح أو نقّح الذاكرة',
          description: 'يمكنك استعراض التفضيلات والمشاريع المحفوظة وحذف أي معلومة لم تعد مناسبة.',
        },
        {
          id: 'memories_tone',
          title: 'خصص الأسلوب والنبرة',
          description: 'اطلب من المساعد تغيير لهجته أو لقبه وسيحفظ تفضيلك هنا معزولاً لحسابك فقط.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/assistant/tasks')) {
    return {
      screenKey: 'assistant_tasks',
      title: 'المهام الخلفية والتنفيذية',
      summary: 'تابع المهام طويلة المدى، تصدير الملفات، وحالة التنفيذ خطوة بخطوة.',
      steps: [
        {
          id: 'tasks_track',
          title: 'راقب حالة التنفيذ',
          description: 'تظهر كل مهمة مع حالتها (قيد الانتظار، قيد التنفيذ، مكتملة) وسجل الإيصال.',
        },
        {
          id: 'tasks_export',
          title: 'تصدير مخرجات منظمة',
          description: 'شغّل مهام التحليل والتلخيص ونزّل المخرجات مباشرة بصيغة Markdown أو CSV أو JSON.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/assistant')) {
    return {
      screenKey: 'assistant',
      title: 'مساعدك الشخصي «كيان»',
      summary: access.personalAssistantEnabled
        ? 'مساعد تنفيذي يتحدث بسلاسة ويدعم البحث الحي وتخصيص النبرة والمهام الخلفية.'
        : 'اطّلع على مزايا المساعد الشخصي وفعّله من خطتك عند الحاجة.',
      steps: [
        {
          id: 'assistant_chat',
          title: 'محادثة طبيعية معزولة',
          description: 'اسأل بطبيعتك أو اطلب البحث الحي والتلخيص؛ محادثاتك هنا خاصة ومعزولة عن العملاء.',
        },
        {
          id: 'assistant_controls',
          title: 'نبرة مخصصة وتقارير سريعة',
          description: 'غيّر لهجة الرد أو اطلب تقرير قطاعك أو تدريب الوكيل مباشرة من نفس المحادثة.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/conversations')) {
    return {
      screenKey: 'conversations',
      title: 'صندوق محادثات العملاء',
      summary: 'تابع رسائل العملاء الواردة عبر القنوات وتدخّل يدوياً متى شئت.',
      steps: [
        {
          id: 'conv_list',
          title: 'فرز المحادثات النشطة',
          description: 'اختر أي محادثة لعرض سياقها وحالة تعامل الوكيل معها.',
        },
        {
          id: 'conv_reply',
          title: 'الرد أو التحويل السلس',
          description: editable
            ? 'أرسل رداً مباشراً أو أوقف رد الوكيل مؤقتاً أثناء متابعتك للعميل.'
            : 'يمكنك قراءة تفاصيل المحادثات حسب صلاحية العرض لحسابك.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/appointments')) {
    return {
      screenKey: 'appointments',
      title: 'إدارة المواعيد والحجوزات',
      summary: 'استعرض المواعيد القادمة وتابع حالات التأكيد والإلغاء من مكان واحد.',
      steps: [
        {
          id: 'appt_status',
          title: 'تصفية حسب الحالة واليوم',
          description: 'راقب المواعيد المؤكدة والمعلّقة لتنظيم جدول فريقك بوضوح.',
        },
        {
          id: 'appt_action',
          title: 'تحديث الموعد',
          description: editable
            ? 'يمكنك إضافة موعد أو تعديل حالته وسيراعي الوكيل الساعات المتاحة تلقائياً.'
            : 'تظهر تفاصيل المواعيد للعرض وفق صلاحية دورك الحالي.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/services')) {
    return {
      screenKey: 'services',
      title: 'الخدمات والأسعار',
      summary: 'عرّف خدماتك ومدتها وأسعارها ليعتمدها الوكيل بدقة مع العملاء.',
      steps: [
        {
          id: 'services_list',
          title: 'بيانات منظمة للوكيل',
          description: 'كل خدمة واضحة الاسم والسعر تمنع الأخطاء عند استفسارات العملاء.',
        },
        {
          id: 'services_edit',
          title: 'إضافة وتحديث فوري',
          description: admin ? 'أضف خدمة جديدة أو عدّل تفاصيلها لتنعكس مباشرة في ردود البوت.' : 'تواصل مع المدير عند الحاجة لتحديث الأسعار.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/orders')) {
    return {
      screenKey: 'orders',
      title: 'متابعة الطلبات',
      summary: 'راقب طلبات العملاء الجديدة ومراحل تجهيزها حتى الاكتمال.',
      steps: [
        {
          id: 'orders_flow',
          title: 'حالات الطلب لحظة بلحظة',
          description: 'تظهر الطلبات الواردة من الوكيل أو الفريق مرتبة بالأحدث.',
        },
        {
          id: 'orders_update',
          title: 'تحديث الحالة',
          description: editable ? 'غيّر حالة الطلب فور التنفيذ ليبقى السجل والتقرير دقيقين.' : 'عرض حالات الطلبات متاح وفق صلاحياتك.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/quotes')) {
    return {
      screenKey: 'quotes',
      title: 'عروض الأسعار',
      summary: 'نظّم طلبات التسعير وأصدر عروضك للعملاء بوضوح.',
      steps: [
        {
          id: 'quotes_review',
          title: 'متابعة طلبات التسعير',
          description: 'راجع تفاصيل كل طلب وتاريخ صلاحية العرض قبل الإرسال.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/contacts')) {
    return {
      screenKey: 'contacts',
      title: 'دليل العملاء وجهات الاتصال',
      summary: 'ابحث عن أي عميل وراجع تاريخ تواصله ومواعيده وطلباته.',
      steps: [
        {
          id: 'contacts_search',
          title: 'ملف موحّد لكل عميل',
          description: 'افتح بطاقة العميل لمعرفة سجل المحادثات والملاحظات المعتمدة.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/leads')) {
    return {
      screenKey: 'leads',
      title: 'العملاء المحتملون والفرص',
      summary: 'تتبّع العملاء المهتمين وحوّلهم من استفسار أولي إلى حجز أو طلب.',
      steps: [
        {
          id: 'leads_qualify',
          title: 'ترتيب الأولويات',
          description: 'ركّز على الفرص الجديدة وحدّث مرحلة المتابعة بعد كل تواصل.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/agent')) {
    return {
      screenKey: 'agent',
      title: 'إعداد وتوجيه الوكيل',
      summary: 'تحكّم في أسلوب وكيل العملاء، تعليماته التشغيلية، وجاهزيته قبل الإطلاق.',
      steps: [
        {
          id: 'agent_directives',
          title: 'توجيهات واضحة للوكيل',
          description: admin
            ? 'أضف قواعد السلوك والرد، واختبر الوكيل قبل تفعيله للعملاء.'
            : 'اعرض إعدادات الوكيل الحالي؛ التعديل محصور بمالك النشاط والمدير.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/knowledge')) {
    return {
      screenKey: 'knowledge',
      title: 'قاعدة المعرفة والتدريب',
      summary: 'غذِّ الوكيل بمعلومات نشاطك عبر النصوص أو روابط المواقع الموثوقة.',
      steps: [
        {
          id: 'kb_sources',
          title: 'نصوص وروابط عامة آمنة',
          description: 'أضف إجابات متكررة أو زوّد الوكيل برابط موقعك العام لاستخراج الحقائق وتنقيتها تلقائياً.',
        },
        {
          id: 'kb_readiness',
          title: 'مؤشر الجاهزية',
          description: 'كل معلومة موثقة ترفع جاهزية الوكيل وتقلّل الحاجة لتدخل بشري.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/channels')) {
    return {
      screenKey: 'channels',
      title: 'القنوات المرتبطة',
      summary: 'اربط قنوات التواصل مثل واتساب وتحقق من سلامة الربط قبل التشغيل.',
      steps: [
        {
          id: 'channels_status',
          title: 'مراقبة الاتصال',
          description: 'تأكد من حالة كل قناة واختبر الاستقبال بعد ربط الحساب التجاري.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/campaigns')) {
    return {
      screenKey: 'campaigns',
      title: 'الحملات التسويقية',
      summary: 'صمّم حملات تواصل مستهدفة وتابع نتائج الإرسال والتفاعل.',
      steps: [
        {
          id: 'campaigns_plan',
          title: 'إرسال منظّم وفق الشريحة',
          description: 'اختر الفئة المناسبة وراجع نص الرسالة قبل الاعتماد والإرسال.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/workflows')) {
    return {
      screenKey: 'workflows',
      title: 'الأتمتة وسير العمل',
      summary: 'اضبط القواعد التلقائية للتصعيد، المتابعة، وتنبيهات الفريق.',
      steps: [
        {
          id: 'workflows_rules',
          title: 'تنفيذ منضبط وآمن',
          description: 'حدّد المحفّز والإجراء المطلوب وراقب سجل التشغيل للتأكد من الدقة.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/analytics')) {
    return {
      screenKey: 'analytics',
      title: 'التحليلات ومؤشرات الأداء',
      summary: 'افهم حجم المحادثات ومعدل الاستجابة والأوقات الأكثر نشاطاً.',
      steps: [
        {
          id: 'analytics_read',
          title: 'قراءة سريعة للأرقام',
          description: 'استخدم المؤشرات لتحديد أكثر استفسارات العملاء وتحديث المعرفة وفقها.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/reports')) {
    return {
      screenKey: 'reports',
      title: 'التقارير التشغيلية',
      summary: 'ملخصات جاهزة لقطاع نشاطك مع إمكانية التصدير إلى ملفات منظمة.',
      steps: [
        {
          id: 'reports_period',
          title: 'اختر الفترة ثم صدّر',
          description: 'استعرض تقرير اليوم أو الأسبوع أو الشهر وشارك ملخصه مع الإدارة.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/billing')) {
    return {
      screenKey: 'billing',
      title: 'الباقة والاستهلاك',
      summary: 'تابع حدود خطتك الحالية، الاستهلاك الشهري، وخيارات الترقية.',
      steps: [
        {
          id: 'billing_usage',
          title: 'شفافية الاستهلاك',
          description: 'راجع الحصة المتبقية من الرسائل والمزايا المفعّلة لنشاطك.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/team')) {
    return {
      screenKey: 'team',
      title: 'الفريق والصلاحيات',
      summary: 'أضف أعضاء الفريق واضبط دور كل عضو لحماية بيانات نشاطك.',
      steps: [
        {
          id: 'team_roles',
          title: 'تحديد الأدوار بدقة',
          description: 'الأدوار التشغيلية تحدّد من يستطيع تعديل المعرفة أو الموافقة على الإجراءات الحساسة.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/hours')) {
    return {
      screenKey: 'hours',
      title: 'ساعات العمل',
      summary: 'اضبط أوقات الدوام الرسمية ليخبر الوكيل العملاء بمواعيد التوفر بدقة.',
      steps: [
        {
          id: 'hours_save',
          title: 'التزام تلقائي بالمواعيد',
          description: 'تنعكس التعديلات مباشرة على رسائل الوكيل واقتراحات الحجز.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/locations')) {
    return {
      screenKey: 'locations',
      title: 'الفروع والمواقع',
      summary: 'أضف عناوين الفروع وروابط الخرائط لتوجيه العملاء لأقرب فرع.',
      steps: [
        {
          id: 'locations_list',
          title: 'بيانات فروع موحدة',
          description: 'تأكد من وضوح العنوان وأرقام التواصل لكل فرع.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/notifications')) {
    return {
      screenKey: 'notifications',
      title: 'إعدادات التنبيهات',
      summary: 'تحكّم بالتنبيهات الفورية والملخصات التي تصلك على البوت المركزي أو التطبيق.',
      steps: [
        {
          id: 'notifications_prefs',
          title: 'تنبيهات بدون إزعاج',
          description: 'فعّل الإشعارات المهمة للمواعيد والحالات العاجلة فقط.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/copilot')) {
    return {
      screenKey: 'copilot',
      title: 'مساعد العمل الذكي',
      summary: 'اختصارات سريعة لصياغة الردود وتلخيص المحادثات للفريق.',
      steps: [
        {
          id: 'copilot_use',
          title: 'دعم فوري داخل سير العمل',
          description: 'استخدم الاقتراحات الجاهزة مع مراجعتها قبل الاعتماد.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/integrations')) {
    return {
      screenKey: 'integrations',
      title: 'الربط والتكاملات',
      summary: 'صل نشاطك بالأدوات الخارجية وراقب حالة الموصلات النشطة.',
      steps: [
        {
          id: 'integrations_check',
          title: 'ربط آمن ومعزول',
          description: 'تُربط كل أداة بصلاحيات نشاطك فقط مع سجل واضح للاستخدام.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/website-pages')) {
    return {
      screenKey: 'website_pages',
      title: 'صفحات الموقع العام',
      summary: 'أنشئ صفحتك التعريفية المتصلة بوكيل نشاطك لمشاركتها مع العملاء.',
      steps: [
        {
          id: 'pages_publish',
          title: 'معاينة ونشر سريع',
          description: 'راجع المحتوى ومعلومات التواصل قبل مشاركة الرابط العام.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/tasks')) {
    return {
      screenKey: 'tasks',
      title: 'مهام الفريق',
      summary: 'نظّم المهام الداخلية وتابع إنجازها بين أعضاء النشاط.',
      steps: [
        {
          id: 'team_tasks',
          title: 'متابعة التقدم',
          description: 'حدّث حالة المهمة فور إتمامها لإبقاء الفريق على اطلاع.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/settings')) {
    return {
      screenKey: 'settings',
      title: 'مركز الإعدادات',
      summary: 'بوابة واحدة لضبط ساعات العمل، الفروع، الفريق، الإشعارات، والتكاملات.',
      steps: [
        {
          id: 'settings_hub',
          title: 'انتقل للقسم المطلوب',
          description: 'اختر أي بطاقة إعدادات لتحديث تفاصيل نشاطك بأمان.',
        },
      ],
    }
  }

  if (matchPrefix('/dashboard/account')) {
    return {
      screenKey: 'account',
      title: 'حسابك وأمان الدخول',
      summary: 'حدّث بيانات ملفك الشخصي أو أعد تشغيل جولة البداية متى أردت.',
      steps: [
        {
          id: 'account_manage',
          title: 'بيانات الحساب والدليل',
          description: 'ستجد هنا رابط إعادة فتح دليل الاستخدام في أي وقت.',
        },
      ],
    }
  }

  return null
}
