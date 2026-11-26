import type { DbClient } from '@/lib/db/client'

/** Campaigns are a commercial billing feature, not a personal assistant tool.
 * Check both sector records; never infer access from legacy lead capabilities.
 */
export async function assertCampaignBusiness(db: DbClient, organizationId: string): Promise<void> {
  const [org, profile] = await Promise.all([
    db.from('organizations').select('business_type').eq('id', organizationId).maybeSingle(),
    db.from('business_profiles').select('business_type_id').eq('organization_id', organizationId).maybeSingle(),
  ])
  if (org.error || profile.error || !org.data || !profile.data || !profile.data.business_type_id) {
    throw new Error('تعذّر التحقق من قطاع النشاط. حاول مجدداً.')
  }
  if (org.data.business_type === 'personal_assistant' || profile.data.business_type_id === 'personal_assistant') {
    throw new Error('الحملات التسويقية غير متاحة في مساحة المساعد الشخصي.')
  }
}
