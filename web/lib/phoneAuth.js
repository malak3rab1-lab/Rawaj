// رواج · الدخول برقم الجوال (Supabase Auth · SMS OTP) — الدورة 2
// وحدة مستقلة عن الواجهة: الواجهة تستدعي هذه الدوال فقط، وتُربط بالشاشات في الدورة 3.
// تحتاج: @supabase/supabase-js v2، ومتغيرين عامين فقط: NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY.
// لا يوجد هنا أي مفتاح سري.

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;      // انتظار قبل إعادة الإرسال (يطابق إعداد Supabase الافتراضي)

// يحوّل أي صيغة يكتبها المستخدم إلى E.164 سعودي: +9665XXXXXXXX
// يقبل: 05XXXXXXXX، 5XXXXXXXX، 9665XXXXXXXX، +9665XXXXXXXX، 009665XXXXXXXX، وأرقام عربية (٠٥..)
export function normalizeSaudiPhone(input) {
  const digits = String(input || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[^\d+]/g, '');
  let n = digits.replace(/^\+/, '').replace(/^00/, '');
  if (n.startsWith('966')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return /^5\d{8}$/.test(n) ? '+966' + n : null;
}

// رسائل عربية لأخطاء Supabase Auth المعروفة
const ERRORS = {
  invalid_phone: 'اكتب رقم جوال سعودي صحيح يبدأ بـ 05',
  otp_expired: 'انتهت صلاحية الرمز أو الرمز غير صحيح. اطلب رمز جديد',
  over_sms_send_rate_limit: 'طلبت رموز كثيرة. انتظر شوي وحاول مرة ثانية',
  over_request_rate_limit: 'محاولات كثيرة. انتظر دقيقة وحاول مرة ثانية',
  sms_send_failed: 'ما قدرنا نرسل الرسالة. تأكد من الرقم وحاول مرة ثانية',
  phone_provider_disabled: 'الدخول بالجوال غير مفعّل حالياً',
  saudi_mobile_only: 'التسجيل متاح لأرقام الجوال السعودية فقط',
  network: 'تأكد من اتصالك بالإنترنت',
};
export function authErrorMessage(err) {
  if (!err) return '';
  const code = err.code || '';
  if (ERRORS[code]) return ERRORS[code];
  const msg = String(err.message || '');
  if (/saudi_mobile_only|Database error saving new user/i.test(msg)) return ERRORS.saudi_mobile_only;
  if (/expired|invalid.*(otp|token)/i.test(msg)) return ERRORS.otp_expired;
  if (/rate limit|too many/i.test(msg)) return ERRORS.over_request_rate_limit;
  if (/fetch|network/i.test(msg)) return ERRORS.network;
  return 'صار خطأ، حاول مرة ثانية';
}

// الخطوة 1: إرسال الرمز
export async function sendOtp(supabase, rawPhone) {
  const phone = normalizeSaudiPhone(rawPhone);
  if (!phone) return { ok: false, error: ERRORS.invalid_phone };
  const { error } = await supabase.auth.signInWithOtp({ phone });   // ينشئ المستخدم إن كان جديداً
  if (error) return { ok: false, error: authErrorMessage(error) };
  return { ok: true, phone, resendAt: Date.now() + RESEND_SECONDS * 1000 };
}

// الخطوة 2: التحقق من الرمز ثم معرفة وجهة المستخدم
// النتيجة: next = 'onboarding' (جديد، ما أكمل ملفه) | 'app' (موجود) | 'suspended'
export async function verifyOtp(supabase, phone, token) {
  const code = String(token || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
  if (code.length !== OTP_LENGTH) return { ok: false, error: `الرمز ${OTP_LENGTH} أرقام` };
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
  if (error || !data?.user) return { ok: false, error: authErrorMessage(error || { code: 'otp_expired' }) };
  // صف accounts ينشأ تلقائياً بالـ trigger. profiles ينشأ في شاشة إكمال البيانات.
  const { data: profile, error: pErr } = await supabase
    .from('profiles').select('id, role, verif, is_admin').eq('id', data.user.id).maybeSingle();
  if (pErr) return { ok: false, error: authErrorMessage(pErr) };
  if (!profile) return { ok: true, user: data.user, next: 'onboarding' };
  if (profile.verif === 'suspended') return { ok: true, user: data.user, profile, next: 'suspended' };
  return { ok: true, user: data.user, profile, next: 'app' };
}

export async function signOut(supabase) {
  await supabase.auth.signOut();
}
