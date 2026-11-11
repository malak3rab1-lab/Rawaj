// يولّد web/config.js وقت البناء من المتغيرات العامة فقط.
// ممنوع تمرير SUPABASE_SERVICE_ROLE_KEY أو أي مفتاح سري هنا: البناء يفشل لو المفتاح ليس عاماً.
import { writeFileSync } from 'node:fs';
// قفل: هذه الدورة معاينة مقفلة فقط. أي نشر إنتاج (رابط عام) يفشل عمداً.
if (process.env.VERCEL_ENV === 'production' && process.env.RAWAJ_ALLOW_PRODUCTION !== 'yes') {
  console.error('رفض البناء: النشر العام (production) مقفل. المسموح فقط معاينة فرع preview.');
  process.exit(1);
}
// القيم الافتراضية عامة بطبيعتها (رابط المشروع + المفتاح العام publishable)، وليست أسراراً. المتغيرات تتقدم عليها.
const DEFAULT_URL = 'https://mruaivukfssjnnibdfid.supabase.co';
const DEFAULT_PUBLIC_KEY = 'sb_publishable_8zM0TsLmoF5ZKQLAfuyTmQ_Z7hzi53e';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_PUBLIC_KEY;
const otpMode = process.env.NEXT_PUBLIC_OTP_MODE === 'live' ? 'live' : 'test';
function role(k){ try { return JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; } catch { return null; } }
if (key.startsWith('sb_secret_') || role(key) === 'service_role') { console.error('رفض البناء: المفتاح سري. استخدم المفتاح العام (anon / publishable) فقط.'); process.exit(1); }
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) { console.error('رفض البناء: رابط Supabase غير صحيح'); process.exit(1); }
const cfg = { supabaseUrl:url, supabaseKey:key, otpMode };
writeFileSync(new URL('../web/config.js', import.meta.url), `window.RAWAJ_CONFIG = ${JSON.stringify(cfg)};\n`);
console.log('web/config.js written · otpMode=' + otpMode + ' · url=' + (url ? 'set' : 'missing') + ' · key=' + (key ? 'set (public)' : 'missing'));
