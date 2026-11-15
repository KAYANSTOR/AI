'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'

const pageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  path: z.string().trim().regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/, 'اكتب مساراً يبدأ بشرطة مائلة وبأحرف إنجليزية صغيرة.'),
  title: z.string().trim().max(180),
  description: z.string().trim().max(2000),
  status: z.enum(['published', 'draft', 'scheduled']),
})

export type WebsitePageActionResult = { ok: true } | { ok: false; error: string }

async function requireWebsiteAdmin() {
  const org = await getCurrentOrg()
  if (!org || (org.role !== 'owner' && org.role !== 'admin')) return null
  return org
}

export async function createWebsitePageAction(input: z.input<typeof pageSchema>): Promise<WebsitePageActionResult> {
  const org = await requireWebsiteAdmin()
  if (!org) return { ok: false, error: 'إدارة صفحات الموقع متاحة لمالك النشاط أو المسؤول فقط.' }
  const parsed = pageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'راجع بيانات الصفحة.' }

  const db = await createClient()
  const { error } = await db.from('website_pages').insert({
    organization_id: org.organizationId,
    ...parsed.data,
    title: parsed.data.title || null,
    description: parsed.data.description || null,
  })
  if (error?.code === '23505') return { ok: false, error: 'هذا المسار مستخدم بالفعل في مساحة العمل.' }
  if (error) return { ok: false, error: 'تعذّر حفظ الصفحة. حاول مرة أخرى.' }
  revalidatePath('/dashboard/website-pages')
  return { ok: true }
}

export async function deleteWebsitePageAction(id: string): Promise<WebsitePageActionResult> {
  const org = await requireWebsiteAdmin()
  if (!org) return { ok: false, error: 'إدارة صفحات الموقع متاحة لمالك النشاط أو المسؤول فقط.' }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'معرّف الصفحة غير صالح.' }
  const db = await createClient()
  const { error } = await db.from('website_pages').delete().eq('id', id).eq('organization_id', org.organizationId)
  if (error) return { ok: false, error: 'تعذّر حذف الصفحة.' }
  revalidatePath('/dashboard/website-pages')
  return { ok: true }
}
