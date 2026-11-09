/** Arabic messages for the account screens. */
export const AUTH_MESSAGES = {
  invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  emailTaken: 'هذا البريد مسجّل بالفعل. سجّل الدخول بدلاً من ذلك.',
  invalidEmail: 'صيغة البريد الإلكتروني غير صحيحة.',
  weakPassword: 'كلمة المرور قصيرة: 8 أحرف على الأقل.',
  companyRequired: 'اكتب اسم الشركة (حرفان على الأقل).',
  tooManyAttempts: 'محاولات كثيرة خلال وقت قصير. انتظر بضع دقائق ثم حاول مجددًا.',
  accountSuspended: 'هذا الحساب موقوف. تواصل مع الدعم.',
  notConfigured: 'خدمة الحسابات غير مهيأة على الخادم بعد.',
  wrongCurrentPassword: 'كلمة المرور الحالية غير صحيحة.',
  generic: 'تعذّر إتمام العملية. تأكّد من بياناتك وحاول مرة أخرى.',
  network: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم حاول مرة أخرى.',
} as const

export const NETWORK_ERROR_MESSAGE = AUTH_MESSAGES.network
