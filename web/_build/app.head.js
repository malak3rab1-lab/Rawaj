/* ============================================================
   رواج · واجهة الإنتاج على Supabase (الدورة 3)
   - القراءة من الجداول حسب RLS بالمفتاح العام فقط (لا service_role أبداً)
   - كل تغيير على الصفقات والمال عبر RPC الموجودة في 0001/0002
   - المبالغ بالهللة (integer) في كل الحسابات، والتحويل للريال للعرض فقط
   هذا الملف يُجمَّع من web/_build/*.js بالأمر: node scripts/assemble.mjs
   ============================================================ */
import { sendOtp, verifyOtp, signOut, normalizeSaudiPhone, OTP_LENGTH, RESEND_SECONDS } from './lib/phoneAuth.js';

const CFG = window.RAWAJ_CONFIG || {};
const OTP_MODE = CFG.otpMode === 'live' ? 'live' : 'test';   // من NEXT_PUBLIC_OTP_MODE وقت البناء

/* ============ الإعدادات المعتمدة (للعرض فقط؛ الحساب الملزم في الخادم) ============ */
const SET = { brand_fee_bps:500, creator_fee_bps:1000, min_fee_halalas:2500, first_deal_off_bps:5000, vat_bps:1500, auto_release_hours:72, min_budget_halalas:10000, min_withdraw_halalas:5000 };
const PLATFORMS = { snapchat:'سناب شات', instagram:'انستقرام', tiktok:'تيك توك' };
const NICHES = ['أزياء','تجميل','مطاعم وكافيهات','تقنية','سفر وسياحة','صحة ورياضة','عائلة وأطفال','سيارات','عقار','ألعاب','تعليم','أخرى'];
const FOLLOWERS = ['أقل من 10 آلاف','10–50 ألف','50–100 ألف','100–500 ألف','500 ألف – مليون','أكثر من مليون'];
const CONTENT = ['سناب ستوري','ريلز','فيديو تيك توك','بوست','زيارة وتغطية','بث مباشر'];
const CITIES = ['الرياض','جدة','مكة','المدينة','الدمام','الخبر','أبها','تبوك','القصيم','أخرى'];

/* ============ أدوات ============ */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sar = h => ((Number(h) || 0) / 100).toLocaleString('en-US', { maximumFractionDigits:2 }) + ' ر.س';   // h بالهللة
const toHalalas = v => { const n = Number(String(v ?? '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN; };
const ts = v => v ? new Date(v).getTime() : 0;
const ago = v => { const t = ts(v); const d = (Date.now() - t) / 6e4; if (d < 1) return 'الآن'; if (d < 60) return `قبل ${Math.floor(d)} د`; if (d < 1440) return `قبل ${Math.floor(d / 60)} س`; return new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day:'numeric', month:'short' }); };
const dt = v => new Date(ts(v)).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' });
const initial = s => (String(s || '؟').trim()[0] || '؟');
const bps = (x, b) => Math.round(x * b / 10000);   // يطابق round() في Postgres للأعداد الموجبة
function brandFees(price, first){ const full = bps(price, SET.brand_fee_bps); let fee = first ? bps(full, 10000 - SET.first_deal_off_bps) : full; if (price > 0 && fee < 1) fee = 1; const vat = bps(fee, SET.vat_bps); return { full, fee, vat, total:price + fee + vat }; }
function creatorCut(price, brandFee){ let c = bps(price, SET.creator_fee_bps); if (price > 0 && c + (brandFee || 0) < SET.min_fee_halalas) c = Math.min(price, SET.min_fee_halalas - (brandFee || 0)); return { commission:c, payout:price - c }; }
