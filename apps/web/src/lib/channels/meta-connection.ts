export type MetaSocialChannel = 'instagram' | 'messenger'
export type MetaChannelType = 'whatsapp' | MetaSocialChannel

export function isMetaSocialChannel(value: unknown): value is MetaSocialChannel {
  return value === 'instagram' || value === 'messenger'
}

export function isMetaChannel(value: unknown): value is MetaChannelType {
  return value === 'whatsapp' || isMetaSocialChannel(value)
}

export function canManageMetaChannels(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export const META_LINK_NOTICES = {
  meta_success: 'تم حفظ ربط القناة. يمكنك مراجعة حالتها في بطاقة القناة.',
  meta_cancelled: 'أُلغيت نافذة الربط قبل اكتمال التفويض. افتح بطاقة القناة لبدء الربط مجددًا.',
  meta_permission: 'لم تمنح ميتا الصلاحيات اللازمة. أعد الربط ووافق على الصلاحيات واختر الحساب المطلوب.',
  meta_expired: 'انتهت صلاحية التفويض لدى ميتا. أعد ربط القناة من بطاقتها.',
  meta_forbidden: 'ربط القنوات متاح لمالك النشاط أو المسؤول فقط.',
  meta_account: 'تعذّر تحديد الحساب. تأكد من اختيار صفحة تديرها، وأدخل معرّفها إذا كنت تدير أكثر من صفحة.',
  meta_conflict: 'هذا الحساب مرتبط بنشاط آخر بالفعل.',
  meta_limit: 'بلغت الحد الأقصى للقنوات في باقتك.',
  meta_error: 'تعذّر إكمال ربط القناة مع ميتا. أعد المحاولة من بطاقة القناة.',
} as const

export type MetaLinkStatus = keyof typeof META_LINK_NOTICES

export class MetaLinkError extends Error {
  constructor(readonly status: MetaLinkStatus) {
    super(META_LINK_NOTICES[status])
  }
}

export function metaLinkStatusFromGraph(code?: number, status?: number): MetaLinkStatus {
  if (code === 190 || code === 102 || status === 401) return 'meta_expired'
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299) || status === 403) {
    return 'meta_permission'
  }
  return 'meta_error'
}

export type MetaPage = {
  id?: string
  access_token?: string
  tasks?: string[]
  instagram_business_account?: { id?: string }
}

export function selectMetaPage(pages: MetaPage[], channel: MetaSocialChannel, pageId: string | null) {
  const matches = pages.flatMap((page) => {
    if (pageId && page.id !== pageId) return []
    const assetId = channel === 'instagram' ? page.instagram_business_account?.id : page.id
    if (!page.id || !/^\d{1,40}$/.test(page.id) || !assetId || !/^\d{1,40}$/.test(assetId) || !page.access_token) return []
    if (!page.tasks?.some((task) => task === 'MESSAGING' || task === 'MANAGE' || task === 'PROFILE_PLUS_MESSAGING' || task === 'PROFILE_PLUS_FULL_CONTROL')) return []
    return [{ pageId: page.id, assetId, accessToken: page.access_token }]
  })
  return matches.length === 1 ? matches[0] : null
}
