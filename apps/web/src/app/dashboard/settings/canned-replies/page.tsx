import { redirect } from 'next/navigation'
import { requireAdminCapability, CapabilityDisabledError, NotAuthorizedError } from '@/lib/capabilities/guard'
import { listCannedReplies } from '@/lib/canned-replies'
import { CreateCannedReplyForm } from './form'

export default async function CannedRepliesPage() {
  let ctx
  try {
    ctx = await requireAdminCapability('inbox')
  } catch (error) {
    if (error instanceof CapabilityDisabledError || error instanceof NotAuthorizedError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-text">
          إدارة الردود الجاهزة متاحة للمسؤول مع تفعيل صندوق المحادثات.
        </div>
      )
    }
    redirect('/login')
  }

  const replies = await listCannedReplies(ctx.supabase, ctx.organizationId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الردود الجاهزة</h1>
        <p className="mt-1 text-sm text-text-muted">
          قوالب يستخدمها الفريق عند الرد اليدوي — لا تُرسل تلقائيًا.
        </p>
      </div>

      <CreateCannedReplyForm />

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {!replies.length ? (
          <div className="p-8 text-center text-sm text-text-muted">لا توجد ردود جاهزة.</div>
        ) : (
          <ul className="divide-y divide-border">
            {replies.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="font-medium text-text">
                  {r.title}
                  {r.shortcut ? (
                    <span className="ms-2 text-xs text-text-muted">/{r.shortcut}</span>
                  ) : null}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
