/** Arabic RTL transactional e-mails in the KAYAN identity (#D8E2D0 / #1F3B22 / #F2D600). */
const BRAND = { primary: '#D8E2D0', secondary: '#1F3B22', accent: '#F2D600' }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

function layout(input: { title: string; intro: string; cta: string; url: string; note: string }): string {
  const url = escapeHtml(input.url)
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.primary};">
<div dir="rtl" style="max-width:560px;margin:0 auto;padding:32px 16px;font-family:Tahoma,Arial,sans-serif;text-align:right;color:${BRAND.secondary};">
  <div style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${BRAND.secondary}22;">
    <div style="background:${BRAND.secondary};padding:22px 24px;">
      <span style="color:${BRAND.primary};font-size:20px;font-weight:800;letter-spacing:.5px;">KAYAN AI</span>
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${BRAND.accent};margin-right:8px;"></span>
    </div>
    <div style="padding:28px 24px;line-height:1.9;font-size:15px;">
      <h1 style="margin:0 0 12px;font-size:21px;color:${BRAND.secondary};">${escapeHtml(input.title)}</h1>
      <p style="margin:0 0 22px;">${escapeHtml(input.intro)}</p>
      <p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;background:${BRAND.secondary};color:${BRAND.primary};text-decoration:none;font-weight:700;padding:13px 26px;border-radius:12px;border-bottom:3px solid ${BRAND.accent};">${escapeHtml(input.cta)}</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:${BRAND.secondary}cc;">${escapeHtml(input.note)}</p>
      <p style="margin:0;font-size:12px;color:${BRAND.secondary}99;word-break:break-all;" dir="ltr">${url}</p>
    </div>
  </div>
  <p style="text-align:center;font-size:12px;color:${BRAND.secondary}aa;margin-top:16px;">إذا لم تطلب هذه الرسالة يمكنك تجاهلها بأمان.</p>
</div></body></html>`
}

export function renderVerifyEmail(input: { url: string }) {
  const subject = 'تأكيد بريدك الإلكتروني في KAYAN AI'
  const note = 'الرابط صالح لمدة 24 ساعة ويُستخدم مرة واحدة فقط.'
  return {
    subject,
    html: layout({ title: 'أكّد بريدك الإلكتروني', intro: 'مرحباً بك في KAYAN AI. اضغط الزر لتأكيد بريدك وتفعيل حماية حسابك.', cta: 'تأكيد البريد الإلكتروني', url: input.url, note }),
    text: `${subject}\n\n${input.url}\n\n${note}`,
  }
}

export function renderPasswordResetEmail(input: { url: string }) {
  const subject = 'إعادة تعيين كلمة المرور في KAYAN AI'
  const note = 'ينتهي الرابط خلال 30 دقيقة ويُستخدم مرة واحدة فقط.'
  return {
    subject,
    html: layout({ title: 'إعادة تعيين كلمة المرور', intro: 'وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر لاختيار كلمة مرور جديدة.', cta: 'تعيين كلمة مرور جديدة', url: input.url, note }),
    text: `${subject}\n\n${input.url}\n\n${note}`,
  }
}
