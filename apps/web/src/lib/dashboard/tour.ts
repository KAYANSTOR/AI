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
