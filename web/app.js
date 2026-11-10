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

/* ============ أيقونات ============ */
const I = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  deals:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.3 0 4 1.3 4.6 4"/></svg>',
  bank:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 12 4l9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4 3 11l6 2.5L11.5 20z" transform="scale(-1 1) translate(-23 0)"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  store:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>',
  coins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
  admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><circle cx="12" cy="11" r="2.5"/><path d="M8 17c.8-1.6 2.2-2.5 4-2.5s3.2.9 4 2.5"/></svg>',
};
const VF = '<svg class="vf" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#12A26B"/><path d="m7 12.5 3.2 3L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GHOST = 'M12 3.6c-2.6 0-4.5 2-4.5 4.6v2.1c-.5.1-1 .1-1.3.3-.3.2 0 .6.4.8l.9.4c-.5 1.4-1.6 2.7-3 3.2-.3.1-.3.5 0 .6.6.3 1.3.4 1.9.6.2.4.1 1 .5 1.1.6.1 1.3-.2 2 0 .9.3 1.7 1.3 3.1 1.3s2.2-1 3.1-1.3c.7-.2 1.4.1 2 0 .4-.1.3-.7.5-1.1.6-.2 1.3-.3 1.9-.6.3-.1.3-.5 0-.6-1.4-.5-2.5-1.8-3-3.2l.9-.4c.4-.2.7-.6.4-.8-.3-.2-.8-.2-1.3-.3V8.2c0-2.6-1.9-4.6-4.5-4.6z';
const NOTE = 'M13 5h2.4c.3 1.7 1.5 2.9 3.2 3.1v2.4c-1.2 0-2.3-.4-3.2-1v5.3a4.2 4.2 0 1 1-4.2-4.2v2.4a1.8 1.8 0 1 0 1.8 1.8z';
let igN = 0;
const PL = {
  snapchat:() => `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#FFFC00"/><path d="${GHOST}" fill="#fff" stroke="#111" stroke-width="1"/></svg>`,
  instagram:() => { const id = 'ig' + (++igN); return `<svg viewBox="0 0 24 24"><defs><radialGradient id="${id}" cx="28%" cy="105%" r="140%"><stop offset="0" stop-color="#FDF497"/><stop offset=".08" stop-color="#FDF497"/><stop offset=".45" stop-color="#FD5949"/><stop offset=".62" stop-color="#D6249F"/><stop offset=".92" stop-color="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="6" fill="url(#${id})"/><rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1.05" fill="#fff"/></svg>`; },
  tiktok:() => `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="${NOTE}" fill="#25F4EE" transform="translate(-.8 -.6)"/><path d="${NOTE}" fill="#FE2C55" transform="translate(.8 .6)"/><path d="${NOTE}" fill="#fff"/></svg>`,
};
const pl = (k, title = true) => PL[k] ? `<span class="pl"${title ? ` title="${PLATFORMS[k]}"` : ''}>${PL[k]()}</span>` : '';
const LOGO = (s = 96) => `<svg width="${s}" height="${s}" viewBox="0 0 140 140" role="img" aria-label="شعار رواج"><circle cx="70" cy="70" r="66" fill="#26282C"/><circle cx="70" cy="70" r="59" fill="none" stroke="#C6FF00" stroke-width="2.5"/><rect x="36" y="80" width="16" height="27" rx="5" fill="#E4E6E8"/><rect x="62" y="63" width="16" height="44" rx="5" fill="#E4E6E8"/><rect x="88" y="46" width="16" height="61" rx="5" fill="#C6FF00"/><path d="M96 20 L99.2 28.8 L108 32 L99.2 35.2 L96 44 L92.8 35.2 L84 32 L92.8 28.8 Z" fill="#C6FF00"/></svg>`;


/* ============ الحالة ============ */
const S = {
  phase:'boot', sb:null, uid:null, profile:null, profiles:{}, offers:[], deals:[], payouts:[], wallet:null,
  events:[], msgs:[], openDeal:null, mode:null, tab:'home', stack:[], onbStep:0, form:{}, sheet:null, toast:null,
  busy:false, online:navigator.onLine, phone:'', resendAt:0, realtime:'off',
};
const LS = { get(k){ try { return localStorage.getItem('rawaj.' + k); } catch { return null; } }, set(k, v){ try { localStorage.setItem('rawaj.' + k, v); } catch {} } };
const me = () => S.profile;
const isAdmin = () => !!(S.profile && S.profile.is_admin);
const view = () => S.stack[S.stack.length - 1] || { v:S.tab };
const nameOf = uid => (S.profiles[uid] && S.profiles[uid].display_name) || 'مستخدم';
const vstatus = uid => (S.profiles[uid] && S.profiles[uid].verif) || 'pending';
const isVerified = uid => vstatus(uid) === 'verified';
const isSuspended = uid => vstatus(uid) === 'suspended';
const offerOf = id => S.offers.find(o => o.id === id);
const dealOf = id => S.deals.find(d => d.id === id);
const myDeals = () => S.deals.filter(d => S.mode === 'brand' ? d.brand_id === S.uid : d.marketer_id === S.uid);
const myRoleIn = d => S.mode === 'admin' ? 'admin' : S.mode === 'brand' && d.brand_id === S.uid ? 'brand' : S.mode === 'marketer' && d.marketer_id === S.uid ? 'marketer' : null;
const isFirstDealFor = brandId => !S.deals.some(d => d.brand_id === brandId && d.funded_at);

const STATUS = {
  proposed:{ t:'تفاوض', c:'b-warn' }, agreed:{ t:'بانتظار الدفع', c:'b-warn' }, funded:{ t:'قيد التنفيذ', c:'b-neon' },
  delivered:{ t:'بانتظار الاعتماد', c:'b-neon' }, completed:{ t:'مكتملة', c:'b-ok' }, disputed:{ t:'نزاع', c:'b-bad' },
  rejected:{ t:'مرفوضة', c:'' }, cancelled:{ t:'ملغاة', c:'' }, refunded:{ t:'مستردة', c:'b-bad' },
};
const ACTIVE = ['proposed','agreed','funded','delivered','disputed'];
const stBadge = s => `<span class="badge ${STATUS[s]?.c || ''}">${STATUS[s]?.t || esc(s)}</span>`;
const vBadge = uid => { const s = vstatus(uid); return s === 'verified' ? '<span class="badge b-ok">موثّق</span>' : s === 'rejected' ? '<span class="badge b-bad">التوثيق مرفوض</span>' : s === 'suspended' ? '<span class="badge b-bad">موقوف</span>' : '<span class="badge b-warn">قيد التوثيق</span>'; };
function needsMe(d){
  if (S.mode === 'brand' && d.brand_id === S.uid) return (d.status === 'proposed' && d.turn === 'brand') || d.status === 'agreed' || d.status === 'delivered';
  if (S.mode === 'marketer' && d.marketer_id === S.uid) return (d.status === 'proposed' && d.turn === 'marketer') || d.status === 'funded';
  return false;
}

/* ============ الأخطاء ============ */
const ERR = {
  not_your_turn:'مو دورك في التفاوض الحين', price_below_minimum:'أقل سعر 100 ر.س', budget_below_minimum:'أقل ميزانية 100 ر.س',
  offer_not_open:'الحملة مغلقة', marketers_only:'هذي العملية للمسوقين فقط', account_suspended:'حسابك موقوف',
  brand_not_verified:'لازم توثّق الإدارة السجل التجاري قبل الدفع', marketer_not_verified:'لازم توثّق الإدارة رخصة المسوق قبل الدفع',
  not_agreed:'الصفقة مو في مرحلة الدفع', not_allowed:'ما تقدر تسوي هذي العملية', invalid_url:'الرابط غير صحيح',
  reason_required:'اشرح المشكلة', admins_only:'للإدارة فقط', not_in_escrow:'المبلغ مو في الضمان', invalid_decision:'قرار غير معروف',
  not_cancellable:'ما تنلغي في هذي المرحلة', invalid_amount:'المبلغ أكبر من المتاح أو أقل من الحد الأدنى', already_done:'الطلب منتهي من قبل',
  cannot_withdraw:'ما تقدر تسحب العرض الحين', deal_not_found:'الصفقة غير موجودة', brand_immutable:'ما ينفع تغيير صاحب الحملة',
};
const isAuthErr = e => !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || /jwt|token.*expired/i.test(e.message || ''));
function errText(e){
  if (!S.online || /fetch|network|Failed to fetch/i.test(e?.message || '')) return 'تأكد من اتصالك بالإنترنت';
  if (isAuthErr(e)) return 'انتهت الجلسة، سجّل دخولك مرة ثانية';
  if (e?.code === '42501') return 'ما عندك صلاحية لهذه العملية';
  if (e?.code === '23505') return 'هذا الطلب موجود من قبل';
  if (e?.code === '23514') return 'بعض البيانات غير صحيحة، راجعها';
  const key = Object.keys(ERR).find(k => (e?.message || '').includes(k));
  return key ? ERR[key] : 'صار خطأ، حاول مرة ثانية';
}

/* ============ التشغيل ============ */
async function boot(){
  render();
  window.addEventListener('online', () => { S.online = true; render(); refreshAll(); });
  window.addEventListener('offline', () => { S.online = false; render(); });
  if (!CFG.supabaseUrl || !CFG.supabaseKey || !window.supabase){ S.phase = 'nocfg'; return render(); }
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, CFG.clientOptions || {});
  S.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') resetToLogin(); });
  let user = null;
  try { const { data } = await S.sb.auth.getSession(); user = data?.session?.user || null; } catch {}
  if (user) await afterLogin(user); else { S.phase = 'login'; render(); }
}
function resetToLogin(msg){
  stopRealtime();
  Object.assign(S, { phase:'login', uid:null, profile:null, profiles:{}, offers:[], deals:[], payouts:[], wallet:null, stack:[], form:{}, sheet:null });
  render(); if (msg) toast(msg);
}
async function afterLogin(user){
  S.uid = user.id; S.phase = 'loading'; render();
  const { data, error } = await S.sb.from('profiles').select('*').eq('id', S.uid).maybeSingle();
  if (error){ if (isAuthErr(error)) return resetToLogin('انتهت الجلسة، سجّل دخولك مرة ثانية'); S.phase = 'error'; S.fatal = errText(error); return render(); }
  if (!data){ S.phase = 'onboard'; S.onbStep = 0; return render(); }
  enterApp(data);
}
async function enterApp(profile){
  S.profile = profile;
  if (profile.verif === 'suspended' && !profile.is_admin){ S.phase = 'suspended'; return render(); }
  S.mode = profile.is_admin ? (LS.get('mode') === profile.role ? profile.role : 'admin') : profile.role;
  S.tab = defaultTab(); S.phase = 'app';
  await refreshAll(); startRealtime(); render();
}
const defaultTab = () => S.mode === 'admin' ? 'dash' : S.mode === 'brand' ? 'home' : 'explore';

let refreshing = null, again = false;
async function refreshAll(){
  if (!S.uid || !S.sb || !S.online) return;
  if (refreshing){ again = true; return refreshing; }
  refreshing = (async () => {
    const q = [
      S.sb.from('profiles').select('*'),
      S.sb.from('offers').select('*').order('created_at', { ascending:false }),
      S.sb.from('deals').select('*').order('updated_at', { ascending:false }),
      S.sb.from('payout_requests').select('*').order('created_at', { ascending:false }),
      S.profile?.role === 'marketer' ? S.sb.from('marketer_wallet').select('*').eq('marketer_id', S.uid).maybeSingle() : Promise.resolve({ data:null }),
    ];
    const [p, o, d, w, wal] = await Promise.all(q);
    const err = [p, o, d, w, wal].find(r => r.error)?.error;
    if (err){ if (isAuthErr(err)) return resetToLogin('انتهت الجلسة، سجّل دخولك مرة ثانية'); toast(errText(err)); return; }
    S.profiles = {}; p.data.forEach(r => S.profiles[r.id] = r);
    if (S.profiles[S.uid]) S.profile = S.profiles[S.uid];
    S.offers = o.data; S.deals = d.data; S.payouts = w.data; S.wallet = wal.data;
    if (S.openDeal) await loadDealDetail(S.openDeal);
  })().finally(() => { refreshing = null; render(); if (again){ again = false; refreshAll(); } });
  return refreshing;
}
async function loadDealDetail(id){
  const [e, m] = await Promise.all([
    S.sb.from('deal_events').select('*').eq('deal_id', id).order('at', { ascending:true }),
    S.sb.from('messages').select('*').eq('deal_id', id).order('at', { ascending:true }),
  ]);
  if (S.openDeal !== id) return;
  S.events = e.data || []; S.msgs = m.data || [];
}

/* ============ التحديث اللحظي ============ */
let channel = null, pollT = null, soonT = null;
const refreshSoon = () => { clearTimeout(soonT); soonT = setTimeout(refreshAll, 250); };
function startRealtime(){
  stopRealtime();
  if (!S.sb.channel) return startPolling();
  channel = S.sb.channel('rawaj-' + S.uid);
  for (const table of ['deals', 'offers', 'profiles', 'payout_requests', 'messages', 'deal_events'])
    channel.on('postgres_changes', { event:'*', schema:'public', table }, refreshSoon);
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED'){ S.realtime = 'on'; stopPolling(); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){ S.realtime = 'poll'; startPolling(); }
  });
}
function startPolling(){ if (!pollT) pollT = setInterval(refreshAll, 15000); }
function stopPolling(){ clearInterval(pollT); pollT = null; }
function stopRealtime(){ stopPolling(); if (channel && S.sb){ S.sb.removeChannel(channel); } channel = null; S.realtime = 'off'; }
window.addEventListener('pagehide', stopRealtime);
setInterval(() => { if (view().v === 'deal') render(); }, 30000);   // تحديث العد التنازلي

/* ============ الكتابة ============ */
async function guard(fn, okMsg){
  if (S.busy) return false;
  if (!S.online){ toast('تأكد من اتصالك بالإنترنت'); return false; }
  S.busy = true; render();
  try { await fn(); if (okMsg) toast(okMsg); refreshSoon(); return true; }
  catch (e){ console.error(e?.code, e?.message); if (isAuthErr(e)) resetToLogin('انتهت الجلسة، سجّل دخولك مرة ثانية'); else toast(errText(e)); return false; }
  finally { S.busy = false; render(); }
}
async function rpc(name, args){ const { data, error } = await S.sb.rpc(name, args); if (error) throw error; return data; }
async function must(p){ const { data, error } = await p; if (error) throw error; return data; }

/* ============ التنقل ============ */
let lastKey = '';
function go(v, p = {}){ S.stack.push({ v, ...p }); onView(); render(); document.querySelector('main')?.scrollTo(0, 0); }
function back(){ S.stack.pop(); onView(); render(); }
function setTab(t){ S.tab = t; S.stack = []; onView(); render(); }
async function onView(){
  const v = view(); const id = v.v === 'deal' ? v.id : null;
  if (id === S.openDeal) return;
  S.openDeal = id; S.events = []; S.msgs = [];
  if (id){ await loadDealDetail(id); render(); document.getElementById('msgs')?.scrollIntoView({ block:'end' }); }
}
let toastT;
function toast(t){ S.toast = t; clearTimeout(toastT); toastT = setTimeout(() => { S.toast = null; render(); }, 2800); render(); }

/* ============ الرسم ============ */
function render(){
  const app = document.getElementById('app');
  const key = S.phase + '|' + S.mode + '|' + S.tab + '|' + JSON.stringify(view()) + '|' + (S.sheet && S.sheet.k) + '|' + S.onbStep;
  const keep = {}; let focus = null, scroll = 0;
  if (key === lastKey){
    app.querySelectorAll('input[id],textarea[id],select[id]').forEach(el => keep[el.id] = el.type === 'checkbox' ? el.checked : el.value);
    focus = document.activeElement && document.activeElement.id;
    scroll = app.querySelector('main')?.scrollTop || 0;
  }
  igN = 0;
  const banner = !S.online ? '<div class="banner off">لا يوجد اتصال بالإنترنت. التغييرات متوقفة لين يرجع الاتصال.</div>'
    : OTP_MODE === 'test' && S.phase !== 'boot' ? '<div class="banner">نسخة تجريبية مقفلة</div>' : '';
  app.innerHTML = banner + screen() + (S.sheet ? `<div class="sheet-wrap" data-a="closeSheet"><div class="sheet" data-stop>${sheet()}</div></div>` : '') + (S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : '');
  if (key === lastKey){
    for (const [id, v] of Object.entries(keep)){ const el = document.getElementById(id); if (el){ if (el.type === 'checkbox') el.checked = v; else el.value = v; } }
    if (focus){ const el = document.getElementById(focus); if (el){ el.focus(); try { const n = el.value.length; el.setSelectionRange(n, n); } catch {} } }
    const m = app.querySelector('main'); if (m) m.scrollTop = scroll;
  }
  lastKey = key;
}
function screen(){
  switch (S.phase){
    case 'boot': case 'loading': return `<div class="splash">${LOGO(104)}<h2>رواج</h2><p class="m">${S.phase === 'loading' ? 'جاري التحميل…' : ''}</p></div>`;
    case 'nocfg': return `<div class="splash" style="padding:24px">${LOGO(88)}<h2>رواج</h2><p class="m">إعدادات الاتصال ناقصة في هذه النسخة.</p></div>`;
    case 'error': return `<div class="splash" style="padding:24px">${LOGO(88)}<h2>رواج</h2><p class="m">${esc(S.fatal)}</p><button class="btn sm" data-a="reload">حاول مرة ثانية</button></div>`;
    case 'login': return loginScreen();
    case 'otp': return otpScreen();
    case 'onboard': return onboard();
    case 'suspended': return `<div class="splash" style="padding:24px">${LOGO(80)}<h2>الحساب موقوف</h2><p class="m">تم إيقاف حسابك من إدارة رواج. تواصل مع الدعم.</p><button class="btn sm o" data-a="logout">تسجيل الخروج</button></div>`;
    case 'app': return appShell();
  }
  return '';
}

/* ---------- الدخول بالجوال ---------- */
function loginScreen(){
  return `<div class="onb"><div class="ill" style="min-height:220px">${LOGO(96)}<h2>أهلاً بك في رواج</h2><p>سجّل دخولك أو أنشئ حساب جديد برقم جوالك.</p></div>
    <label class="f">رقم الجوال<div class="ph"><span class="cc">+966</span><input class="in" id="l_phone" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="5X XXX XXXX" maxlength="14"></div></label>
    <div class="err" id="l_err"></div>
    <button class="btn" data-a="sendOtp" ${S.busy ? 'disabled' : ''}>أرسل رمز التحقق</button>
    ${OTP_MODE === 'test' ? '<p class="s" style="text-align:center">نسخة تجريبية: الرسائل النصية غير مفعّلة، والدخول بأرقام الاختبار اللي تحددها الإدارة.</p>' : ''}</div>`;
}
function otpScreen(){
  const left = Math.max(0, Math.ceil((S.resendAt - Date.now()) / 1000));
  return `<div class="onb"><div class="ill" style="min-height:200px"><div class="bigic">${I.shield}</div><h2>أدخل رمز التحقق</h2><p>أرسلنا رمز من ${OTP_LENGTH} أرقام إلى <b dir="ltr">${esc(S.phone)}</b></p></div>
    <input class="in otp" id="o_code" inputmode="numeric" autocomplete="one-time-code" maxlength="${OTP_LENGTH}" dir="ltr">
    <div class="err" id="o_err"></div>
    <button class="btn" data-a="verifyOtp" ${S.busy ? 'disabled' : ''}>تحقق</button>
    <div class="btns"><button class="btn o" data-a="resendOtp" ${left || S.busy ? 'disabled' : ''}>${left ? `إعادة الإرسال بعد ${left} ث` : 'إعادة إرسال الرمز'}</button><button class="btn o" data-a="changePhone">تغيير الرقم</button></div></div>`;
}
let otpTick = null;
function startOtpTick(){ clearInterval(otpTick); otpTick = setInterval(() => { if (S.phase !== 'otp' || Date.now() > S.resendAt + 1000){ clearInterval(otpTick); } render(); }, 1000); }

/* ---------- الترحيب والتسجيل ---------- */
const SLIDES = [
  { ic:LOGO(110), h:'أهلاً بك في رواج', p:'المكان اللي يجمع البراندات بالمسوقين وصناع المحتوى على سناب شات وانستقرام وتيك توك.' },
  { ic:`<div class="bigic">${I.shield}</div>`, h:'فلوسك محفوظة بالضمان', p:'مبلغ الحملة ينحجز عند رواج أول ما يتم الاتفاق، وما يتحرر للمسوق إلا بعد التنفيذ والاعتماد، أو تلقائياً بعد 72 ساعة من التسليم بدون اعتراض.' },
  { ic:`<div class="bigic">${I.coins}</div>`, h:'رسوم واضحة للجميع', p:'5٪ على البراند و10٪ على المسوق، نفس النسبة للكل. أول صفقة للبراند برسوم مخفضة للنصف.' },
];
function onboard(){
  const st = S.onbStep;
  if (st < SLIDES.length){
    const s = SLIDES[st];
    return `<div class="onb"><div style="display:flex;justify-content:flex-end"><button class="lnk" data-a="onbSkip">تخطي</button></div>
      <div class="ill">${s.ic}<h2>${s.h}</h2><p>${s.p}</p></div>
      <div class="dots">${SLIDES.map((_, i) => `<i class="${i === st ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn" data-a="onbNext">${st === SLIDES.length - 1 ? 'ابدأ' : 'التالي'}</button></div>`;
  }
  if (st === SLIDES.length){
    const r = S.form.role;
    return `<div class="onb"><div><h2>وش تبي تسوي في رواج؟</h2><p>اختر نوع حسابك. ما تقدر تغيّره بعدين.</p></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="role ${r === 'brand' ? 'on' : ''}" data-a="pickRole" data-v="brand"><span class="ic">${I.store}</span><span><b>براند أو متجر</b><br><span class="m">أنشر حملات وأتعامل مع مسوقين</span></span></button>
        <button class="role ${r === 'marketer' ? 'on' : ''}" data-a="pickRole" data-v="marketer"><span class="ic">${I.mic}</span><span><b>مسوق أو صانع محتوى</b><br><span class="m">أستقبل عروض وأنفذ حملات بمقابل</span></span></button>
      </div><div style="flex:1"></div>
      <button class="btn" data-a="onbRole" ${r ? '' : 'disabled'}>متابعة</button></div>`;
  }
  return `<div class="onb" style="padding:0"><header class="bar"><button class="ib" data-a="onbBack" aria-label="رجوع">${I.back}</button><h1>${S.form.role === 'brand' ? 'بيانات البراند' : 'بيانات المسوق'}</h1></header><main>${profileForm(S.form.role, null)}</main></div>`;
}
function profileForm(role, e){
  const F = S.form; e = e || {};
  if (!F.init){ F.init = true; F.niche = e.niche || ''; F.followers = e.followers_range || ''; F.city = e.city || ''; }
  const chips = (list, k) => list.map(n => `<button class="chip ${F[k] === n ? 'on' : ''}" data-a="fset" data-k="${k}" data-v="${esc(n)}">${esc(n)}</button>`).join('');
  const common = `<label class="f">المدينة</label><div class="chips">${chips(CITIES, 'city')}</div>
    <label class="f">نبذة <small>(اختياري)</small><textarea class="in" id="p_bio" maxlength="400">${esc(e.bio || '')}</textarea></label>`;
  const terms = e.id ? '' : `<label class="check"><input type="checkbox" id="p_terms"><span>أوافق على شروط رواج: الدفع والتواصل يكون داخل التطبيق فقط، ورسوم المنصة 5٪ على البراند و10٪ على المسوق من كل صفقة.</span></label>`;
  const btn = `<div class="err" id="p_err"></div><button class="btn" data-a="saveProfile" data-v="${role}" ${S.busy ? 'disabled' : ''}>${e.id ? 'حفظ التعديلات' : 'إنشاء الحساب'}</button>`;
  if (role === 'brand') return `<div class="card">
    <label class="f">اسم البراند أو المتجر<input class="in" id="p_name" maxlength="60" value="${esc(e.display_name || '')}" autocomplete="organization"></label>
    <label class="f">رقم السجل التجاري <small>10 أرقام، نراجعه يدوياً قبل أول دفعة</small><input class="in" id="p_cr" inputmode="numeric" maxlength="10" value="${esc(e.cr_number || '')}" dir="ltr"></label>
    <label class="f">المجال</label><div class="chips">${chips(NICHES, 'niche')}</div>${common}${terms}${btn}</div>`;
  const h = e.handles || {};
  return `<div class="card">
    <label class="f">الاسم الظاهر<input class="in" id="p_name" maxlength="60" value="${esc(e.display_name || '')}"></label>
    <label class="f">حساباتك <small>اسم المستخدم لكل منصة تستخدمها (واحدة على الأقل)</small></label>
    ${Object.keys(PLATFORMS).map(k => `<div class="who">${pl(k)}<input class="in" id="p_h_${k}" placeholder="${PLATFORMS[k]}" dir="ltr" maxlength="40" value="${esc(h[k] || '')}"></div>`).join('')}
    <label class="f">عدد المتابعين في أكبر حساب</label><div class="chips">${chips(FOLLOWERS, 'followers')}</div>
    <label class="f">رقم رخصة موثوق <small>مطلوبة للإعلان المدفوع، نراجعها يدوياً</small><input class="in" id="p_lic" maxlength="20" value="${esc(e.mawthooq_license || '')}" dir="ltr"></label>
    <label class="f">مجال المحتوى</label><div class="chips">${chips(NICHES, 'niche')}</div>${common}${terms}${btn}</div>`;
}

/* ---------- الهيكل ---------- */
const TABS = {
  brand:[['home','الرئيسية',I.home],['deals','الصفقات',I.deals],['wallet','المحفظة',I.wallet],['me','حسابي',I.user]],
  marketer:[['explore','اكتشف',I.search],['deals','صفقاتي',I.deals],['wallet','المحفظة',I.wallet],['me','حسابي',I.user]],
  admin:[['dash','اللوحة',I.chart],['users','المستخدمون',I.users],['adeals','الصفقات',I.deals],['payouts','التحويلات',I.bank],['me','حسابي',I.user]],
};
const pendingPayouts = () => S.payouts.filter(r => r.status === 'pending');
function tabBadge(t){
  if (t === 'deals') return myDeals().filter(needsMe).length;
  if (t === 'users') return Object.keys(S.profiles).filter(u => vstatus(u) === 'pending').length;
  if (t === 'adeals') return S.deals.filter(d => d.status === 'disputed').length;
  if (t === 'payouts') return pendingPayouts().length;
  return 0;
}
function appShell(){
  const v = view(); const sub = S.stack.length > 0;
  const [title, body] = page(v);
  return `<header class="bar">${sub ? `<button class="ib" data-a="back" aria-label="رجوع">${I.back}</button>` : `<span style="display:flex">${LOGO(34)}</span>`}<h1>${title}</h1></header>
    <main>${body}</main>
    ${sub ? '' : `<nav class="tabs">${TABS[S.mode].map(([k, l, ic]) => { const n = tabBadge(k); return `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${ic}<span>${l}</span>${n ? `<i class="bdg">${n}</i>` : ''}</button>`; }).join('')}</nav>`}`;
}
function page(v){
  switch (v.v){
    case 'home': return brandHome();
    case 'explore': return explore();
    case 'deals': return dealsList();
    case 'wallet': return S.mode === 'brand' ? brandWallet() : mktWallet();
    case 'me': return mePage();
    case 'newOffer': return newOffer();
    case 'offer': return offerPage(v.id);
    case 'deal': return dealPage(v.id);
    case 'editProfile': return ['تعديل الملف', profileForm(me().role, me())];
    case 'dash': return adminDash();
    case 'users': return adminUsers();
    case 'auser': return adminUser(v.id);
    case 'adeals': return adminDeals();
    case 'payouts': return adminPayouts();
    case 'profile': return publicProfile(v.id);
  }
  return ['رواج', ''];
}
const empty = (ic, h, p, btn = '') => `<div class="empty">${ic}<b>${h}</b><span>${p}</span>${btn}</div>`;

/* ---------- البراند ---------- */
function brandHome(){
  const mine = S.offers.filter(o => o.brand_id === S.uid);
  const act = myDeals().filter(needsMe);
  let h = `<div class="card"><div class="who"><div class="av">${esc(initial(me().display_name))}</div><div><b>أهلاً ${esc(me().display_name)}</b><div class="s">${isVerified(S.uid) ? 'حسابك موثّق' : 'سجلك التجاري قيد المراجعة'}</div></div></div></div>`;
  if (act.length) h += `<div class="sec">يحتاج إجراء منك</div>` + act.map(dealCard).join('');
  h += `<div class="hd" style="align-items:center"><div class="sec">حملاتي</div><button class="btn sm" data-a="go" data-v="newOffer">${I.plus} حملة جديدة</button></div>`;
  h += mine.length ? mine.map(offerCardBrand).join('') : empty(I.inbox, 'ما عندك حملات للحين', 'أنشر أول حملة وخل المسوقين يقدمون عليها.', `<button class="btn sm" data-a="go" data-v="newOffer">${I.plus} أنشر حملة</button>`);
  return ['الرئيسية', h];
}
function offerCardBrand(o){
  const ds = S.deals.filter(d => d.offer_id === o.id);
  const pend = ds.filter(d => d.status === 'proposed' && d.turn === 'brand').length;
  return `<div class="card tap" data-a="go" data-v="offer" data-id="${o.id}"><div class="hd"><p class="t">${esc(o.title)}</p>${o.status === 'open' ? '<span class="badge b-ok">مفتوحة</span>' : '<span class="badge">مغلقة</span>'}</div>
    <div class="hd" style="align-items:center"><div class="pls">${o.platforms.map(k => pl(k)).join('')}</div><b>${sar(o.budget)}</b></div>
    <div class="s">${ds.length ? `${ds.length} طلب${pend ? ` · ${pend} بانتظار ردك` : ''}` : 'ما وصلت طلبات للحين'} · ${ago(o.created_at)}</div></div>`;
}
function feeNote(b){
  const f = brandFees(b, isFirstDealFor(S.uid));
  return b >= SET.min_budget_halalas ? `عند الاتفاق تدفع لكل مسوق: ${sar(b)} + رسوم المنصة ${sar(f.fee)}${f.fee < f.full ? ' (أول صفقة بنص الرسوم)' : ''} + ضريبة ${sar(f.vat)} = <b>${sar(f.total)}</b>` : `الحد الأدنى للميزانية ${sar(SET.min_budget_halalas)}. المبلغ النهائي يتحدد بعد التفاوض مع كل مسوق.`;
}
function newOffer(){
  const F = S.form; if (!F.init){ F.init = true; F.platforms = []; F.content = []; }
  return ['حملة جديدة', `<div class="card">
    <label class="f">عنوان الحملة<input class="in" id="o_title" maxlength="80"></label>
    <label class="f">وش المطلوب من المسوق؟ <small>اشرح المنتج، الرسالة، والممنوعات</small><textarea class="in" id="o_desc" maxlength="1500"></textarea></label>
    <label class="f">المنصات</label><div class="chips">${Object.keys(PLATFORMS).map(k => `<button class="chip ${F.platforms.includes(k) ? 'on' : ''}" data-a="ftog" data-k="platforms" data-v="${k}">${pl(k, false)}${PLATFORMS[k]}</button>`).join('')}</div>
    <label class="f">نوع المحتوى</label><div class="chips">${CONTENT.map(k => `<button class="chip ${F.content.includes(k) ? 'on' : ''}" data-a="ftog" data-k="content" data-v="${k}">${k}</button>`).join('')}</div>
    <div class="split"><label class="f">الميزانية لكل مسوق (ر.س)<input class="in" id="o_budget" inputmode="decimal" dir="ltr" data-in="budget"></label>
    <label class="f">عدد المسوقين<input class="in" id="o_slots" inputmode="numeric" value="1" dir="ltr"></label></div>
    <label class="f">مدة التنفيذ بعد الدفع (أيام)<input class="in" id="o_days" inputmode="numeric" value="7" dir="ltr"></label>
    <div class="note" id="o_fee">${feeNote(F.budgetPreview || 0)}</div><div class="err" id="o_err"></div>
    <button class="btn" data-a="publishOffer" ${S.busy ? 'disabled' : ''}>نشر الحملة</button></div>`];
}
function offerPage(id){
  const o = offerOf(id); if (!o) return ['الحملة', empty(I.inbox, 'الحملة غير موجودة', '')];
  const owner = o.brand_id === S.uid && S.mode === 'brand';
  let h = `<div class="card"><div class="hd"><p class="t">${esc(o.title)}</p>${o.status === 'open' ? '<span class="badge b-ok">مفتوحة</span>' : '<span class="badge">مغلقة</span>'}</div>
    ${owner ? '' : `<button class="who lnk" style="text-decoration:none;color:inherit" data-a="go" data-v="profile" data-id="${o.brand_id}"><div class="av">${esc(initial(nameOf(o.brand_id)))}</div><div style="text-align:right"><b>${esc(nameOf(o.brand_id))}</b>${isVerified(o.brand_id) ? VF : ''}<div class="s">${esc(S.profiles[o.brand_id]?.niche || '')}</div></div></button>`}
    <p class="m" style="white-space:pre-wrap;color:var(--text)">${esc(o.description)}</p>
    <div class="row"><span class="l">المنصات</span><span class="pls">${o.platforms.map(k => pl(k)).join('')}</span></div>
    ${o.content_types?.length ? `<div class="row"><span class="l">المحتوى</span><span class="v">${o.content_types.map(esc).join('، ')}</span></div>` : ''}
    <div class="row"><span class="l">الميزانية لكل مسوق</span><span class="v">${sar(o.budget)}</span></div>
    <div class="row"><span class="l">المسوقين المطلوبين</span><span class="v">${o.slots}</span></div>
    <div class="row"><span class="l">مدة التنفيذ</span><span class="v">${o.days} أيام بعد الدفع</span></div>
    ${S.mode === 'marketer' ? `<div class="row"><span class="l">صافي لك بعد عمولة 10٪</span><span class="v">${sar(creatorCut(o.budget, bps(o.budget, SET.brand_fee_bps)).payout)}</span></div>` : ''}</div>`;
  if (owner){
    const ds = S.deals.filter(d => d.offer_id === id);
    h += `<div class="sec">الطلبات (${ds.length})</div>` + (ds.length ? ds.map(dealCard).join('') : empty(I.inbox, 'ما وصلت طلبات للحين', 'بتظهر هنا أول ما يقدم مسوق على الحملة.'));
    h += `<button class="btn o" data-a="offerStatus" data-id="${id}" data-v="${o.status === 'open' ? 'closed' : 'open'}">${o.status === 'open' ? 'إغلاق الحملة' : 'إعادة فتح الحملة'}</button>`;
  } else if (S.mode === 'marketer'){
    const mine = S.deals.find(d => d.offer_id === id && d.marketer_id === S.uid && ACTIVE.includes(d.status));
    if (mine) h += `<div class="note">قدمت على هذه الحملة. <button class="lnk" data-a="go" data-v="deal" data-id="${mine.id}">افتح الصفقة</button></div>`;
    else if (o.status !== 'open') h += `<div class="note">هذه الحملة مغلقة.</div>`;
    else h += `<div class="btns"><button class="btn" data-a="apply" data-id="${id}" ${S.busy ? 'disabled' : ''}>أقبل بالميزانية</button><button class="btn o" data-a="sheet" data-v="counter" data-id="${id}">أقترح سعر</button></div>`;
  }
  return ['تفاصيل الحملة', h];
}

/* ---------- المسوق ---------- */
function explore(){
  const pf = S.form.pf || 'all';
  const list = S.offers.filter(o => o.status === 'open' && o.brand_id !== S.uid && !isSuspended(o.brand_id) && (pf === 'all' || o.platforms.includes(pf)));
  let h = `<div class="filter"><button class="chip ${pf === 'all' ? 'on' : ''}" data-a="fset" data-k="pf" data-v="all">الكل</button>${Object.keys(PLATFORMS).map(k => `<button class="chip ${pf === k ? 'on' : ''}" data-a="fset" data-k="pf" data-v="${k}">${pl(k, false)}${PLATFORMS[k]}</button>`).join('')}</div>`;
  if (!isVerified(S.uid)) h += `<div class="warn">رخصة موثوق حقتك قيد المراجعة. تقدر تقدم على الحملات الحين، والبراند ما يقدر يدفع إلا بعد توثيقك.</div>`;
  h += list.length ? list.map(o => {
    const applied = S.deals.some(d => d.offer_id === o.id && d.marketer_id === S.uid && ACTIVE.includes(d.status));
    return `<div class="card tap" data-a="go" data-v="offer" data-id="${o.id}"><div class="who"><div class="av">${esc(initial(nameOf(o.brand_id)))}</div><div><b>${esc(nameOf(o.brand_id))}</b>${isVerified(o.brand_id) ? VF : ''}<div class="s">${ago(o.created_at)}</div></div></div>
      <p class="t">${esc(o.title)}</p><div class="hd" style="align-items:center"><div class="pls">${o.platforms.map(k => pl(k)).join('')}</div><b>${sar(o.budget)}</b></div>${applied ? '<span class="badge b-neon">قدمت عليها</span>' : ''}</div>`;
  }).join('') : empty(I.search, 'ما فيه حملات مفتوحة حالياً', 'أول ما ينشر براند حملة بتظهر لك هنا مباشرة.');
  return ['اكتشف الحملات', h];
}

/* ---------- الصفقات ---------- */
function dealCard(d){
  const o = offerOf(d.offer_id) || { title:'حملة' };
  const other = S.mode === 'brand' ? nameOf(d.marketer_id) : S.mode === 'marketer' ? nameOf(d.brand_id) : `${nameOf(d.brand_id)} ← ${nameOf(d.marketer_id)}`;
  const need = needsMe(d);
  return `<div class="card tap" data-a="go" data-v="deal" data-id="${d.id}" ${need ? 'style="border-color:var(--text)"' : ''}><div class="hd"><div><p class="t">${esc(o.title)}</p><div class="s">${esc(other)}</div></div>${stBadge(d.status)}</div>
    <div class="hd" style="align-items:center"><span class="s">${need ? '<b style="color:var(--text)">● بانتظارك</b>' : ago(d.updated_at)}</span><b>${sar(d.price)}</b></div></div>`;
}
function dealsList(){
  const f = S.form.df || 'active';
  const list = myDeals().filter(d => f === 'active' ? ACTIVE.includes(d.status) : !ACTIVE.includes(d.status));
  return [S.mode === 'brand' ? 'الصفقات' : 'صفقاتي', `<div class="filter"><button class="chip ${f === 'active' ? 'on' : ''}" data-a="fset" data-k="df" data-v="active">الجارية</button><button class="chip ${f === 'done' ? 'on' : ''}" data-a="fset" data-k="df" data-v="done">المنتهية</button></div>`
    + (list.length ? list.map(dealCard).join('') : empty(I.deals, f === 'active' ? 'ما عندك صفقات جارية' : 'ما فيه صفقات منتهية', S.mode === 'brand' ? 'لما يقدم مسوق على حملتك بتظهر الصفقة هنا.' : 'قدم على حملة من صفحة اكتشف وبتظهر الصفقة هنا.'))];
}
const STEPS = ['proposed','agreed','funded','delivered','completed'];
function dealPage(id){
  const d = dealOf(id); if (!d) return ['الصفقة', empty(I.deals, 'الصفقة غير موجودة', '')];
  const o = offerOf(d.offer_id) || { title:'حملة', platforms:[], days:7 };
  const role = myRoleIn(d);
  const si = STEPS.indexOf(d.status);
  let h = `<div class="card"><div class="hd"><p class="t">${esc(o.title)}</p>${stBadge(d.status)}</div>
    <div class="track">${STEPS.map((s, i) => `<i class="${si > i || d.status === 'completed' ? 'on' : si === i ? 'cur' : ''}"></i>`).join('')}</div>
    <div class="row"><span class="l">البراند</span><button class="lnk" data-a="go" data-v="profile" data-id="${d.brand_id}">${esc(nameOf(d.brand_id))}</button></div>
    <div class="row"><span class="l">المسوق</span><button class="lnk" data-a="go" data-v="profile" data-id="${d.marketer_id}">${esc(nameOf(d.marketer_id))}</button></div>
    <div class="row"><span class="l">${d.status === 'proposed' ? 'السعر المقترح' : 'السعر المتفق عليه'}</span><span class="v">${sar(d.price)}</span></div>
    <div class="row"><span class="l">المنصات</span><span class="pls">${(o.platforms || []).map(k => pl(k)).join('')}</span></div></div>`;
  h += actionBox(d, role, o) + money(d, role);
  h += `<div class="sec">المحادثة</div><div class="card"><div class="msgs">${S.msgs.length ? S.msgs.map(m => !m.sender_id ? `<div class="msg sys">${esc(m.body)}</div>` : `<div class="msg ${m.sender_id === S.uid ? 'me' : 'them'}">${esc(m.body)}<span class="s">${m.sender_id === d.brand_id || m.sender_id === d.marketer_id ? esc(nameOf(m.sender_id)) : 'إدارة رواج'} · ${ago(m.at)}</span></div>`).join('') : '<p class="s" style="text-align:center">ابدأ المحادثة. أرقام الجوال والإيميلات تنخفى لحماية الطرفين.</p>'}<span id="msgs"></span></div>
    <div class="comp"><textarea class="in" id="chat_${d.id}" rows="1" maxlength="1000" placeholder="اكتب رسالة…"></textarea><button class="send" data-a="sendMsg" data-id="${d.id}" aria-label="إرسال">${I.send}</button></div></div>`;
  h += `<div class="sec">سجل الصفقة</div><div class="card tl">${S.events.slice().reverse().map(l => `<div><span>${esc(l.action)}${l.amount ? ` · ${sar(l.amount)}` : ''}${l.note ? `<br><span class="s">${esc(l.note)}</span>` : ''}</span><span class="s">${dt(l.at)}</span></div>`).join('') || '<p class="s">جاري التحميل…</p>'}</div>`;
  return ['الصفقة', h];
}
function countdown(d){ const ms = Math.max(0, ts(d.delivered_at) + SET.auto_release_hours * 36e5 - Date.now()); const hh = Math.floor(ms / 36e5), mm = Math.floor(ms % 36e5 / 6e4); return ms ? `${hh} ساعة و${mm} دقيقة` : 'دقائق (التحرير التلقائي يشتغل كل 15 دقيقة)'; }
function actionBox(d, role, o){
  const B = S.busy ? 'disabled' : '';
  const box = (txt, btns = '') => `<div class="card" style="border-color:var(--text)"><p class="m" style="color:var(--text)">${txt}</p>${btns}</div>`;
  const wait = txt => `<div class="note">${txt}</div>`;
  const other = role === 'brand' ? nameOf(d.marketer_id) : nameOf(d.brand_id);
  if (role === 'admin'){
    if (d.status === 'disputed') return box(`<b>نزاع مفتوح</b> من ${d.dispute_by === d.brand_id ? 'البراند' : 'المسوق'}: ${esc(d.dispute_reason || '')}`, `<div class="btns"><button class="btn" data-a="adminResolve" data-id="${d.id}" data-v="release" ${B}>تحرير للمسوق</button><button class="btn d" data-a="adminResolve" data-id="${d.id}" data-v="refund" ${B}>استرداد للبراند</button></div>`);
    if (['funded','delivered'].includes(d.status)) return box('إجراءات الإدارة على مبلغ محجوز في الضمان.', `<div class="btns"><button class="btn o" data-a="adminResolve" data-id="${d.id}" data-v="release" ${B}>تحرير الآن</button><button class="btn d" data-a="adminResolve" data-id="${d.id}" data-v="refund" ${B}>استرداد</button></div>`);
    if (['proposed','agreed'].includes(d.status)) return box('الصفقة ما زالت قبل الدفع.', `<button class="btn d" data-a="adminCancel" data-id="${d.id}" ${B}>إلغاء الصفقة</button>`);
    return '';
  }
  if (!role) return '';
  switch (d.status){
    case 'proposed':
      if (d.turn === role) return box(`<b>${esc(other)}</b> اقترح سعر <b>${sar(d.price)}</b>${d.last_note ? `<br>«${esc(d.last_note)}»` : ''}`,
        `<div class="btns"><button class="btn" data-a="dealRpc" data-v="accept_deal" data-id="${d.id}" ${B}>قبول</button><button class="btn o" data-a="sheet" data-v="recounter" data-id="${d.id}">عرض مضاد</button></div><button class="btn d" data-a="dealRpc" data-v="reject_deal" data-id="${d.id}" ${B}>رفض</button>`);
      return wait(`بانتظار رد ${esc(other)} على سعر ${sar(d.price)}.`) + `<button class="btn o" data-a="dealRpc" data-v="withdraw_deal" data-id="${d.id}" ${B}>سحب العرض</button>`;
    case 'agreed':
      if (role === 'brand'){
        if (!isVerified(d.brand_id)) return box('تم الاتفاق. الدفع يتفعل بعد ما توثّق الإدارة سجلك التجاري.');
        if (!isVerified(d.marketer_id)) return box('تم الاتفاق. الدفع يتفعل بعد ما توثّق الإدارة رخصة موثوق حقت المسوق.');
        return box(`تم الاتفاق على ${sar(d.price)}. ادفع عشان ينحجز المبلغ في الضمان ويبدأ المسوق التنفيذ. الإجمالي <b>${sar(brandFees(d.price, isFirstDealFor(d.brand_id)).total)}</b>.`, `<button class="btn" data-a="sheet" data-v="pay" data-id="${d.id}">ادفع وأودع في الضمان</button>`);
      }
      return wait(`تم الاتفاق على ${sar(d.price)}. بانتظار دفع البراند، وبعدها تبدأ التنفيذ.${isVerified(d.marketer_id) ? '' : ' لازم تتوثق رخصتك قبل الدفع.'}`);
    case 'funded':
      if (role === 'marketer') return box(`المبلغ محجوز في الضمان. نفّذ المطلوب خلال ${o.days || 7} أيام ثم أرسل رابط المنشور.`, `<button class="btn" data-a="sheet" data-v="deliver" data-id="${d.id}">تسليم المحتوى</button>`) + `<button class="lnk" data-a="sheet" data-v="dispute" data-id="${d.id}">فتح نزاع</button>`;
      return wait('المبلغ محجوز في الضمان والمسوق يشتغل على المحتوى.') + `<button class="lnk" data-a="sheet" data-v="dispute" data-id="${d.id}">فتح نزاع</button>`;
    case 'delivered': {
      const safe = /^https?:\/\//i.test(d.proof_url || '') ? d.proof_url : '#';
      const proof = `<div class="row"><span class="l">رابط المنشور</span><a href="${esc(safe)}" target="_blank" rel="noopener noreferrer" dir="ltr" style="overflow:hidden;text-overflow:ellipsis;max-width:60%;white-space:nowrap">${esc(d.proof_url)}</a></div>${d.proof_note ? `<p class="m">${esc(d.proof_note)}</p>` : ''}`;
      if (role === 'brand') return box(`سلّم المسوق المحتوى. راجعه واعتمده، أو اعترض إذا فيه مشكلة. يتحرر تلقائياً بعد <b class="cd">${countdown(d)}</b>.${proof}`, `<button class="btn" data-a="dealRpc" data-v="approve_deal" data-id="${d.id}" ${B}>اعتماد وتحرير المبلغ</button><button class="btn d" data-a="sheet" data-v="dispute" data-id="${d.id}">اعتراض</button>`);
      return wait(`سلّمت المحتوى. بانتظار اعتماد البراند، أو يتحرر تلقائياً بعد <b class="cd">${countdown(d)}</b>.`) + `<div class="card">${proof}</div>`;
    }
    case 'disputed': return wait(`فيه نزاع مفتوح: «${esc(d.dispute_reason || '')}». إدارة رواج تراجع المحادثة والإثباتات وترد عليكم هنا.`);
    case 'completed': return role === 'marketer' ? box(`تمت الصفقة، وأضفنا <b>${sar(d.payout)}</b> لمحفظتك.`) : box('تمت الصفقة وتحرر المبلغ للمسوق. شكراً لك.');
    case 'refunded': return wait(role === 'brand' ? `تم استرداد ${sar(d.refund)} لك.` : 'انتهت الصفقة باسترداد المبلغ للبراند.');
    case 'rejected': return wait('تم رفض العرض.');
    case 'cancelled': return wait('تم إلغاء الصفقة.');
  }
  return '';
}
function money(d, role){
  if (!d.funded_at) return '';
  let h = `<div class="sec">المبالغ</div><div class="card">`;
  if (role !== 'marketer') h += `<div class="row"><span class="l">قيمة الحملة</span><span class="v">${sar(d.price)}</span></div><div class="row"><span class="l">رسوم المنصة على البراند${d.first_deal ? ' (خصم أول صفقة)' : ''}</span><span class="v">${sar(d.brand_fee)}</span></div><div class="row"><span class="l">ضريبة القيمة المضافة</span><span class="v">${sar(d.vat)}</span></div><div class="row tot"><span>دفع البراند</span><b>${sar(d.total)}</b></div>`;
  if (role !== 'brand'){
    const c = d.status === 'completed' ? { commission:d.commission, payout:d.payout } : creatorCut(d.price, d.brand_fee || 0);
    h += `<div class="row"><span class="l">قيمة الحملة</span><span class="v">${sar(d.price)}</span></div><div class="row"><span class="l">عمولة رواج من المسوق</span><span class="v">− ${sar(c.commission)}</span></div><div class="row tot"><span>صافي المسوق</span><b>${sar(c.payout)}</b></div>`;
  }
  return h + `${d.sandbox ? '<p class="s">دفعة تجريبية: ما انخصم مبلغ حقيقي.</p>' : ''}</div>`;
}

/* ---------- المحفظة ---------- */
const maskIban = s => s ? s.slice(0, 4) + ' •••• ' + s.slice(-4) : '';
function mktWallet(){
  const w = S.wallet || { earned:0, withdrawn:0, available:0 };
  const escrow = S.deals.filter(d => d.marketer_id === S.uid && ['funded','delivered','disputed'].includes(d.status)).reduce((s, d) => s + creatorCut(d.price, d.brand_fee || 0).payout, 0);
  const reqs = S.payouts.filter(r => r.marketer_id === S.uid);
  const done = S.deals.filter(d => d.marketer_id === S.uid && d.status === 'completed');
  let h = `<div class="kpis"><div class="kpi hero"><span class="s">متاح للسحب</span><b style="font-size:28px">${sar(w.available)}</b></div>
    <div class="kpi"><span class="s">في الضمان</span><b>${sar(escrow)}</b></div><div class="kpi"><span class="s">إجمالي الأرباح</span><b>${sar(w.earned)}</b></div></div>
    <button class="btn" data-a="sheet" data-v="withdraw" ${w.available >= SET.min_withdraw_halalas ? '' : 'disabled'}>سحب إلى حسابي البنكي</button>
    ${w.available < SET.min_withdraw_halalas ? `<p class="s" style="text-align:center">الحد الأدنى للسحب ${sar(SET.min_withdraw_halalas)}</p>` : ''}`;
  if (reqs.length) h += `<div class="sec">طلبات السحب</div><div class="card tl">${reqs.map(r => `<div><span>${sar(r.amount)} <span class="s" dir="ltr">${esc(maskIban(r.iban))}</span></span><span>${r.status === 'paid' ? '<span class="badge b-ok">تم التحويل</span>' : r.status === 'rejected' ? '<span class="badge b-bad">مرفوض</span>' : '<span class="badge b-warn">قيد التحويل</span>'}</span></div>`).join('')}</div>`;
  h += `<div class="sec">الأرباح</div>` + (done.length ? `<div class="card tl">${done.map(d => `<div><span>${esc(offerOf(d.offer_id)?.title || 'حملة')}<br><span class="s">${esc(nameOf(d.brand_id))}</span></span><span style="text-align:left"><b>+ ${sar(d.payout)}</b><br><span class="s">${ago(d.completed_at)}</span></span></div>`).join('')}</div>` : empty(I.wallet, 'محفظتك فاضية للحين', 'أرباحك من الصفقات المكتملة بتظهر هنا.'));
  return ['المحفظة', h];
}
function brandWallet(){
  const ds = S.deals.filter(d => d.brand_id === S.uid && d.funded_at);
  const paid = ds.reduce((s, d) => s + (d.total || 0), 0);
  const held = ds.filter(d => ['funded','delivered','disputed'].includes(d.status)).reduce((s, d) => s + d.price, 0);
  const refunded = ds.filter(d => d.status === 'refunded').reduce((s, d) => s + (d.refund || 0), 0);
  return ['المحفظة', `<div class="kpis"><div class="kpi hero"><span class="s">محجوز في الضمان الآن</span><b style="font-size:28px">${sar(held)}</b></div>
    <div class="kpi"><span class="s">إجمالي المدفوع</span><b>${sar(paid)}</b></div><div class="kpi"><span class="s">المسترد</span><b>${sar(refunded)}</b></div></div>
    <div class="sec">المدفوعات</div>` + (ds.length ? `<div class="card tl">${ds.map(d => `<div><span>${esc(offerOf(d.offer_id)?.title || 'حملة')}<br><span class="s">${esc(nameOf(d.marketer_id))} · ${STATUS[d.status].t}</span></span><span style="text-align:left"><b>${sar(d.total)}</b><br><span class="s">${ago(d.funded_at)}</span></span></div>`).join('')}</div>` : empty(I.wallet, 'ما فيه مدفوعات للحين', 'لما تدفع لأول صفقة بتظهر هنا.'))];
}

/* ---------- حسابي ---------- */
function mePage(){
  const p = me();
  let h = '';
  if (isAdmin()) h += `<div class="card"><p class="t">طريقة العرض</p><p class="m">كمشرفة تقدرين تتنقلين بين لوحة المدير وحسابك كـ${p.role === 'brand' ? 'براند' : 'مسوق'}.</p><div class="chips">
      ${[['admin','المدير'],[p.role, p.role === 'brand' ? 'براند' : 'مسوق']].map(([k, l]) => `<button class="chip ${S.mode === k ? 'on' : ''}" data-a="switchMode" data-v="${k}">${l}</button>`).join('')}</div></div>`;
  h += `<div class="card" style="align-items:center;text-align:center"><div class="av lg">${esc(initial(p.display_name))}</div><p class="t">${esc(p.display_name)}</p>${vBadge(S.uid)}
    <p class="m">${p.role === 'brand' ? `سجل تجاري: <span dir="ltr">${esc(p.cr_number)}</span>` : `رخصة موثوق: <span dir="ltr">${esc(p.mawthooq_license)}</span>`}</p>
    ${p.role === 'marketer' ? `<div class="pls">${Object.keys(p.handles || {}).filter(k => p.handles[k]).map(k => pl(k)).join('')}</div>` : ''}
    <button class="btn o" data-a="go" data-v="editProfile">تعديل الملف</button></div>`;
  if (p.verif === 'rejected') h += `<div class="warn">رفضت الإدارة التوثيق${p.verif_note ? `: ${esc(p.verif_note)}` : ''}. عدّل الرقم من «تعديل الملف» وبيرجع للمراجعة تلقائياً.</div>`;
  h += `<div class="card"><p class="t">الرسوم</p><div class="row"><span class="l">رسوم البراند</span><span class="v">5٪ + ضريبة</span></div><div class="row"><span class="l">عمولة المسوق</span><span class="v">10٪</span></div><div class="row"><span class="l">أقل رسوم للصفقة</span><span class="v">25 ر.س</span></div><div class="row"><span class="l">أول صفقة للبراند</span><span class="v">نص الرسوم</span></div><div class="row"><span class="l">التحرير التلقائي</span><span class="v">بعد 72 ساعة من التسليم</span></div></div>
    <div class="note">الدفع حالياً تجريبي لين تتفعل بوابة الدفع. الحجز والتحرير يشتغلون بنفس القواعد بدون خصم حقيقي.</div>
    <button class="btn o" data-a="logout">تسجيل الخروج</button>`;
  return ['حسابي', h];
}
function publicProfile(uid){
  const p = S.profiles[uid]; if (!p) return ['الملف', empty(I.user, 'الملف غير موجود', '')];
  const done = S.deals.filter(d => (d.brand_id === uid || d.marketer_id === uid) && d.status === 'completed').length;
  return [esc(p.display_name), `<div class="card" style="align-items:center;text-align:center"><div class="av lg">${esc(initial(p.display_name))}</div><p class="t">${esc(p.display_name)}${isVerified(uid) ? VF : ''}</p>
    <p class="m">${[p.niche, p.city, p.role === 'marketer' && p.followers_range ? p.followers_range + ' متابع' : ''].filter(Boolean).map(esc).join(' · ')}</p>
    ${p.role === 'marketer' ? `<div class="pls">${Object.keys(p.handles || {}).filter(k => p.handles[k]).map(k => pl(k)).join('')}</div>` : ''}
    ${p.bio ? `<p class="m" style="white-space:pre-wrap">${esc(p.bio)}</p>` : ''}<div class="s">${done} صفقة مكتملة</div></div>`];
}

/* ---------- المدير ---------- */
function adminDash(){
  const users = Object.values(S.profiles);
  const pendV = users.filter(p => p.verif === 'pending').length;
  const funded = S.deals.filter(d => d.funded_at);
  const gmv = funded.reduce((s, d) => s + (d.total || 0), 0);
  const rev = S.deals.filter(d => d.status === 'completed').reduce((s, d) => s + (d.brand_fee || 0) + (d.commission || 0), 0);
  const held = S.deals.filter(d => ['funded','delivered','disputed'].includes(d.status)).reduce((s, d) => s + d.price, 0);
  const disputes = S.deals.filter(d => d.status === 'disputed').length;
  const pp = pendingPayouts();
  let h = `<div class="kpis"><div class="kpi hero"><span class="s">إيرادات المنصة (صفقات مكتملة)</span><b style="font-size:28px">${sar(rev)}</b></div>
    <div class="kpi"><span class="s">حجم التداول</span><b>${sar(gmv)}</b></div><div class="kpi"><span class="s">في الضمان الآن</span><b>${sar(held)}</b></div>
    <div class="kpi tap" data-a="tab" data-v="users"><span class="s">البراندات</span><b>${users.filter(p => p.role === 'brand').length}</b></div><div class="kpi tap" data-a="tab" data-v="users"><span class="s">المسوقين</span><b>${users.filter(p => p.role === 'marketer').length}</b></div>
    <div class="kpi"><span class="s">حملات مفتوحة</span><b>${S.offers.filter(o => o.status === 'open').length}</b></div><div class="kpi tap" data-a="tab" data-v="adeals"><span class="s">صفقات جارية</span><b>${S.deals.filter(d => ACTIVE.includes(d.status)).length}</b></div></div>`;
  const todo = [];
  if (pendV) todo.push(`<div class="card tap" data-a="tab" data-v="users"><div class="hd"><b>طلبات توثيق</b><span class="badge b-warn">${pendV}</span></div><span class="s">سجلات تجارية ورخص موثوق بانتظار مراجعتك</span></div>`);
  if (disputes) todo.push(`<div class="card tap" data-a="tab" data-v="adeals"><div class="hd"><b>نزاعات مفتوحة</b><span class="badge b-bad">${disputes}</span></div><span class="s">المبالغ موقوفة لين تقررين</span></div>`);
  if (pp.length) todo.push(`<div class="card tap" data-a="tab" data-v="payouts"><div class="hd"><b>طلبات سحب</b><span class="badge b-warn">${pp.length}</span></div><span class="s">بإجمالي ${sar(pp.reduce((s, r) => s + r.amount, 0))}</span></div>`);
  h += `<div class="sec">مهامك</div>` + (todo.length ? todo.join('') : `<div class="note">ما فيه شي ينتظرك حالياً.</div>`);
  h += `<p class="s" style="text-align:center">${S.realtime === 'on' ? '● التحديث اللحظي شغال' : S.realtime === 'poll' ? '● تحديث كل 15 ثانية' : ''}</p>`;
  return ['لوحة المدير', h];
}
function adminUsers(){
  const f = S.form.uf || 'all';
  const list = Object.values(S.profiles).filter(p => f === 'all' || (f === 'pending' ? p.verif === 'pending' : p.role === f)).sort((a, b) => ts(b.created_at) - ts(a.created_at));
  return ['المستخدمون', `<div class="filter">${[['all','الكل'],['pending','بانتظار التوثيق'],['brand','البراندات'],['marketer','المسوقين']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="fset" data-k="uf" data-v="${k}">${l}</button>`).join('')}</div>`
    + (list.length ? list.map(p => `<div class="card tap" data-a="go" data-v="auser" data-id="${p.id}"><div class="hd"><div class="who"><div class="av">${esc(initial(p.display_name))}</div><div><b>${esc(p.display_name)}</b><div class="s">${p.role === 'brand' ? 'براند' : 'مسوق'} · ${ago(p.created_at)}${p.id === S.uid ? ' · أنتِ' : ''}</div></div></div>${vBadge(p.id)}</div></div>`).join('') : empty(I.users, 'ما فيه مستخدمين هنا', ''))];
}
function adminUser(uid){
  const p = S.profiles[uid]; if (!p) return ['المستخدم', ''];
  const B = S.busy ? 'disabled' : '';
  let h = `<div class="card"><div class="hd"><p class="t">${esc(p.display_name)}</p><span class="badge">${p.role === 'brand' ? 'براند' : 'مسوق'}</span></div>
    ${p.role === 'brand' ? `<div class="row"><span class="l">السجل التجاري</span><span class="v" dir="ltr">${esc(p.cr_number)}</span></div>` : `<div class="row"><span class="l">رخصة موثوق</span><span class="v" dir="ltr">${esc(p.mawthooq_license)}</span></div>${Object.keys(p.handles || {}).filter(k => p.handles[k]).map(k => `<div class="row"><span class="l">${pl(k)}</span><span class="v" dir="ltr">@${esc(String(p.handles[k]).replace(/^@/, ''))}</span></div>`).join('')}<div class="row"><span class="l">المتابعين</span><span class="v">${esc(p.followers_range)}</span></div>`}
    <div class="row"><span class="l">المجال</span><span class="v">${esc(p.niche)}</span></div><div class="row"><span class="l">المدينة</span><span class="v">${esc(p.city)}</span></div>${p.bio ? `<p class="m">${esc(p.bio)}</p>` : ''}</div>
    <div class="card"><div class="hd"><b>حالة الحساب</b>${vBadge(uid)}</div>
    <p class="m">${p.role === 'brand' ? 'تحقق من السجل التجاري في منصة المركز السعودي للأعمال.' : 'تحقق من رخصة موثوق في منصة موثوق.'}</p>
    <label class="f">ملاحظة للمستخدم <small>(تظهر له عند الرفض)</small><input class="in" id="v_note" maxlength="200"></label>
    <div class="btns"><button class="btn" data-a="verify" data-id="${uid}" data-v="verified" ${B}>توثيق</button><button class="btn o" data-a="verify" data-id="${uid}" data-v="rejected" ${B}>رفض</button></div>
    ${uid !== S.uid ? (p.verif === 'suspended' ? `<button class="btn o" data-a="verify" data-id="${uid}" data-v="pending" ${B}>رفع الإيقاف</button>` : `<button class="btn d" data-a="verify" data-id="${uid}" data-v="suspended" ${B}>إيقاف الحساب</button>`) : ''}</div>`;
  const ds = S.deals.filter(d => d.brand_id === uid || d.marketer_id === uid);
  return ['المستخدم', h + `<div class="sec">الصفقات (${ds.length})</div>` + (ds.length ? ds.map(dealCard).join('') : '<p class="s">ما عنده صفقات.</p>')];
}
function adminDeals(){
  const f = S.form.af || 'active';
  const list = S.deals.filter(d => f === 'all' || (f === 'active' ? ACTIVE.includes(d.status) && d.status !== 'disputed' : f === 'disputed' ? d.status === 'disputed' : !ACTIVE.includes(d.status)));
  return ['كل الصفقات', `<div class="filter">${[['active','جارية'],['disputed','نزاعات'],['done','منتهية'],['all','الكل']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="fset" data-k="af" data-v="${k}">${l}</button>`).join('')}</div>`
    + (list.length ? list.map(dealCard).join('') : empty(I.deals, 'ما فيه صفقات هنا', ''))];
}
function adminPayouts(){
  const B = S.busy ? 'disabled' : '';
  return ['طلبات السحب', `<div class="note">التحويل حالياً يدوي من حساب رواج البنكي، وبعد تفعيل بوابة الدفع يصير آلي.</div>` + (S.payouts.length ? S.payouts.map(r => `<div class="card"><div class="hd"><div><b>${sar(r.amount)}</b><div class="s">${esc(nameOf(r.marketer_id))} · ${ago(r.created_at)}</div></div>${r.status === 'paid' ? '<span class="badge b-ok">تم التحويل</span>' : r.status === 'rejected' ? '<span class="badge b-bad">مرفوض</span>' : '<span class="badge b-warn">جديد</span>'}</div>
      <div class="row"><span class="l">الآيبان</span><span class="v" dir="ltr">${esc(r.iban)}</span></div><div class="row"><span class="l">اسم صاحب الحساب</span><span class="v">${esc(r.holder)}</span></div>
      ${r.status === 'pending' ? `<label class="f">رقم الحوالة <small>(اختياري)</small><input class="in" id="ref_${r.id}" dir="ltr" maxlength="40"></label><div class="btns"><button class="btn" data-a="payoutSet" data-id="${r.id}" data-v="paid" ${B}>تم التحويل</button><button class="btn o" data-a="payoutSet" data-id="${r.id}" data-v="rejected" ${B}>رفض</button></div>` : ''}</div>`).join('')
    : empty(I.bank, 'ما فيه طلبات سحب', 'لما يطلب مسوق سحب أرباحه يظهر الطلب هنا مع الآيبان.'))];
}

/* ---------- النوافذ ---------- */
function sheet(){
  const s = S.sheet; const B = S.busy ? 'disabled' : '';
  if (s.k === 'counter' || s.k === 'recounter'){
    const ref = s.k === 'counter' ? offerOf(s.id)?.budget : dealOf(s.id)?.price;
    return `<p class="t">${s.k === 'counter' ? 'اقترح سعرك' : 'عرض مضاد'}</p><p class="m">السعر الحالي ${sar(ref)}</p>
      <label class="f">سعرك (ر.س)<input class="in" id="c_price" inputmode="decimal" dir="ltr"></label>
      <label class="f">رسالة <small>(اختياري)</small><textarea class="in" id="c_note" maxlength="300"></textarea></label><div class="err" id="c_err"></div>
      <button class="btn" data-a="${s.k === 'counter' ? 'applyCounter' : 'sendCounter'}" data-id="${s.id}" ${B}>إرسال</button><button class="btn o" data-a="closeSheet">إلغاء</button>`;
  }
  if (s.k === 'pay'){
    const d = dealOf(s.id); const f = brandFees(d.price, isFirstDealFor(d.brand_id));
    return `<p class="t">الدفع والإيداع في الضمان</p>
      <div class="row"><span class="l">قيمة الحملة</span><span class="v">${sar(d.price)}</span></div>
      <div class="row"><span class="l">رسوم رواج 5٪</span><span class="v">${f.fee < f.full ? `<s class="s">${sar(f.full)}</s> ` : ''}${sar(f.fee)}</span></div>
      <div class="row"><span class="l">ضريبة القيمة المضافة 15٪ على الرسوم</span><span class="v">${sar(f.vat)}</span></div>
      <div class="row tot"><span>الإجمالي</span><b>${sar(f.total)}</b></div>
      <div class="warn"><b>وضع تجريبي:</b> بوابة الدفع ما تفعلت للحين، فما راح ينخصم أي مبلغ. المبلغ النهائي يحسبه الخادم.</div>
      <button class="btn" data-a="pay" data-id="${d.id}" ${B}>تأكيد الدفع التجريبي ${sar(f.total)}</button><button class="btn o" data-a="closeSheet">إلغاء</button>`;
  }
  if (s.k === 'deliver') return `<p class="t">تسليم المحتوى</p><p class="m">حط رابط المنشور بعد النشر. البراند عنده 72 ساعة يعتمد أو يعترض، وبعدها يتحرر المبلغ تلقائياً.</p>
      <label class="f">رابط المنشور<input class="in" id="d_url" dir="ltr" inputmode="url" placeholder="https://"></label>
      <label class="f">ملاحظة <small>(اختياري)</small><textarea class="in" id="d_note" maxlength="500"></textarea></label><div class="err" id="d_err"></div>
      <button class="btn" data-a="deliver" data-id="${s.id}" ${B}>تسليم</button><button class="btn o" data-a="closeSheet">إلغاء</button>`;
  if (s.k === 'dispute') return `<p class="t">فتح نزاع</p><p class="m">المبلغ بيتوقف في الضمان لين تراجع إدارة رواج المحادثة والإثباتات.</p>
      <label class="f">وش المشكلة؟<textarea class="in" id="x_reason" maxlength="500"></textarea></label><div class="err" id="x_err"></div>
      <button class="btn d" data-a="dispute" data-id="${s.id}" ${B}>فتح النزاع</button><button class="btn o" data-a="closeSheet">إلغاء</button>`;
  if (s.k === 'withdraw'){ const w = S.wallet || { available:0 };
    return `<p class="t">سحب الأرباح</p><p class="m">المتاح ${sar(w.available)}</p>
      <label class="f">المبلغ (ر.س)<input class="in" id="w_amt" inputmode="decimal" dir="ltr" value="${w.available / 100}"></label>
      <label class="f">رقم الآيبان<input class="in" id="w_iban" dir="ltr" placeholder="SA" maxlength="34"></label>
      <label class="f">اسم صاحب الحساب<input class="in" id="w_holder" maxlength="80"></label><div class="err" id="w_err"></div>
      <button class="btn" data-a="withdraw" ${B}>طلب السحب</button><button class="btn o" data-a="closeSheet">إلغاء</button>`; }
  return '';
}

/* ============ الأحداث ============ */
const val = id => (document.getElementById(id)?.value || '').trim();
const setErr = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; return false; };
document.addEventListener('input', e => {
  if (e.target.dataset.in === 'budget'){ S.form.budgetPreview = toHalalas(e.target.value) || 0; const el = document.getElementById('o_fee'); if (el) el.innerHTML = feeNote(S.form.budgetPreview); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey || !e.target.id) return;
  if (e.target.id.startsWith('chat_')){ e.preventDefault(); A.sendMsg(e.target.id.slice(5)); }
  else if (e.target.id === 'l_phone'){ e.preventDefault(); A.sendOtp(); }
  else if (e.target.id === 'o_code'){ e.preventDefault(); A.verifyOtp(); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.dataset.a === 'closeSheet' && e.target.closest('[data-stop]') && !e.target.closest('button')) return;
  const fn = A[el.dataset.a]; if (fn){ e.preventDefault(); fn(el.dataset.id, el.dataset.v, el); }
});
const A = {
  back, reload:() => location.reload(), tab:(_, v) => setTab(v),
  go:(id, v) => { if (v === 'newOffer' || v === 'editProfile') S.form = {}; go(v, { id }); },
  fset:(_, v, el) => { const k = el.dataset.k; S.form[k] = S.form[k] === v && !['pf','df','uf','af'].includes(k) ? '' : v; render(); },
  ftog:(_, v, el) => { const a = S.form[el.dataset.k] || (S.form[el.dataset.k] = []); const i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); render(); },
  sheet:(id, v) => { S.sheet = { k:v, id }; render(); },
  closeSheet:() => { S.sheet = null; render(); },
  onbNext:() => { S.onbStep++; render(); }, onbSkip:() => { S.onbStep = SLIDES.length; render(); },
  onbBack:() => { S.onbStep = SLIDES.length; render(); },
  pickRole:(_, v) => { S.form.role = v; render(); },
  onbRole:() => { S.form = { role:S.form.role }; S.onbStep = SLIDES.length + 1; render(); },
  switchMode:(_, v) => { S.mode = v; LS.set('mode', v); S.tab = defaultTab(); S.stack = []; S.form = {}; onView(); render(); },
  logout:async () => { try { await signOut(S.sb); } catch {} resetToLogin(); },

  // الدخول
  sendOtp:async () => {
    if (S.busy) return; const raw = val('l_phone');
    if (!normalizeSaudiPhone(raw)) return setErr('l_err', 'اكتب رقم جوال سعودي صحيح يبدأ بـ 05');
    if (!S.online) return setErr('l_err', 'تأكد من اتصالك بالإنترنت');
    S.busy = true; render();
    const r = await sendOtp(S.sb, raw); S.busy = false;
    if (!r.ok){ render(); return setErr('l_err', r.error); }
    S.phone = r.phone; S.resendAt = r.resendAt; S.phase = 'otp'; render(); startOtpTick(); document.getElementById('o_code')?.focus();
  },
  resendOtp:async () => {
    if (S.busy || Date.now() < S.resendAt) return;
    S.busy = true; render(); const r = await sendOtp(S.sb, S.phone); S.busy = false;
    if (!r.ok){ render(); return setErr('o_err', r.error); }
    S.resendAt = r.resendAt; render(); startOtpTick(); toast('أرسلنا رمز جديد');
  },
  changePhone:() => { S.phase = 'login'; render(); },
  verifyOtp:async () => {
    if (S.busy) return; S.busy = true; render();
    const r = await verifyOtp(S.sb, S.phone, val('o_code')); S.busy = false;
    if (!r.ok){ render(); return setErr('o_err', r.error); }
    if (r.next === 'onboarding'){ S.uid = r.user.id; S.phase = 'onboard'; S.onbStep = 0; S.form = {}; return render(); }
    if (r.next === 'suspended'){ S.uid = r.user.id; S.phase = 'suspended'; return render(); }
    S.uid = r.user.id; enterApp(r.profile);
  },

  saveProfile:(_, role) => {
    const F = S.form; const existing = me();
    const name = val('p_name');
    if (name.length < 2) return setErr('p_err', 'اكتب الاسم');
    const x = { display_name:name, niche:F.niche || null, city:F.city || null, bio:val('p_bio') || null };
    if (role === 'brand'){ x.cr_number = val('p_cr').replace(/\D/g, ''); if (!/^\d{10}$/.test(x.cr_number)) return setErr('p_err', 'رقم السجل التجاري لازم يكون 10 أرقام'); }
    else {
      x.handles = {}; for (const k of Object.keys(PLATFORMS)){ const h = val('p_h_' + k).replace(/^@/, ''); if (h) x.handles[k] = h; }
      if (!Object.keys(x.handles).length) return setErr('p_err', 'أضف حساب واحد على الأقل');
      x.followers_range = F.followers || ''; if (!x.followers_range) return setErr('p_err', 'اختر عدد المتابعين');
      x.mawthooq_license = val('p_lic'); if (x.mawthooq_license.length < 4) return setErr('p_err', 'اكتب رقم رخصة موثوق');
    }
    if (!x.niche) return setErr('p_err', 'اختر المجال');
    if (!existing && !document.getElementById('p_terms')?.checked) return setErr('p_err', 'لازم توافق على الشروط');
    guard(async () => {
      const row = existing
        ? await must(S.sb.from('profiles').update(x).eq('id', S.uid).select().single())
        : await must(S.sb.from('profiles').insert({ id:S.uid, role, ...x }).select().single());
      S.stack = []; S.form = {};
      if (!existing) await enterApp(row); else S.profile = row;
    }, existing ? 'انحفظت التعديلات' : 'أهلاً بك في رواج!');
  },
  publishOffer:() => {
    const F = S.form;
    const o = { title:val('o_title'), description:val('o_desc'), platforms:F.platforms || [], content_types:F.content || [], budget:toHalalas(val('o_budget')),
      slots:Math.max(1, Math.min(50, parseInt(val('o_slots'), 10) || 1)), days:Math.max(1, Math.min(60, parseInt(val('o_days'), 10) || 7)) };
    if (o.title.length < 4) return setErr('o_err', 'اكتب عنوان الحملة');
    if (o.description.length < 10) return setErr('o_err', 'اشرح المطلوب بتفصيل أكثر');
    if (!o.platforms.length) return setErr('o_err', 'اختر منصة واحدة على الأقل');
    if (!(o.budget >= SET.min_budget_halalas)) return setErr('o_err', `الحد الأدنى للميزانية ${sar(SET.min_budget_halalas)}`);
    guard(async () => { await must(S.sb.from('offers').insert({ ...o, brand_id:S.uid })); S.stack = []; S.tab = 'home'; S.form = {}; }, 'انتشرت الحملة');
  },
  offerStatus:(id, v) => guard(() => must(S.sb.from('offers').update({ status:v }).eq('id', id)), v === 'open' ? 'انفتحت الحملة' : 'انقفلت الحملة'),
  apply:id => createDeal(id, null, null),
  applyCounter:id => { const p = toHalalas(val('c_price')); if (!(p >= SET.min_budget_halalas)) return setErr('c_err', `أقل سعر ${sar(SET.min_budget_halalas)}`); createDeal(id, p, val('c_note') || null); },
  sendCounter:id => {
    const p = toHalalas(val('c_price')); if (!(p >= SET.min_budget_halalas)) return setErr('c_err', `أقل سعر ${sar(SET.min_budget_halalas)}`);
    guard(async () => { await rpc('counter_offer', { p_deal:id, p_price:p, p_note:val('c_note') || null }); S.sheet = null; }, 'انرسل العرض');
  },
  dealRpc:(id, fn) => {
    const ok = { accept_deal:'تم الاتفاق', reject_deal:'تم الرفض', withdraw_deal:'انسحب العرض', approve_deal:'تحرر المبلغ للمسوق' }[fn];
    if (!ok) return;
    guard(() => rpc(fn, { p_deal:id }), ok);
  },
  pay:id => guard(async () => { await rpc('fund_deal', { p_deal:id, p_payment_ref:null, p_sandbox:true }); S.sheet = null; }, 'انحجز المبلغ في الضمان'),
  deliver:id => {
    const url = val('d_url'); if (!/^https?:\/\/\S+\.\S+/.test(url)) return setErr('d_err', 'حط رابط صحيح يبدأ بـ https://');
    guard(async () => { await rpc('deliver_deal', { p_deal:id, p_url:url, p_note:val('d_note') || null }); S.sheet = null; }, 'تم التسليم');
  },
  dispute:id => { const r = val('x_reason'); if (r.length < 5) return setErr('x_err', 'اشرح المشكلة'); guard(async () => { await rpc('open_dispute', { p_deal:id, p_reason:r }); S.sheet = null; }, 'انفتح النزاع'); },
  adminResolve:(id, v) => { if (!confirm(v === 'release' ? 'تحرير المبلغ للمسوق؟' : 'استرداد كامل المبلغ للبراند؟')) return; guard(() => rpc('admin_resolve', { p_deal:id, p_decision:v }), v === 'release' ? 'تم التحرير' : 'تم الاسترداد'); },
  adminCancel:id => { if (!confirm('إلغاء الصفقة؟')) return; guard(() => rpc('admin_cancel', { p_deal:id }), 'انلغت'); },
  verify:(uid, v) => guard(() => rpc('admin_verify', { p_user:uid, p_status:v, p_note:val('v_note') || null }), v === 'verified' ? 'تم التوثيق' : v === 'suspended' ? 'انوقف الحساب' : 'تم التحديث'),
  withdraw:() => {
    const w = S.wallet || { available:0 }; const amt = toHalalas(val('w_amt')); const iban = val('w_iban').replace(/\s/g, '').toUpperCase(); const holder = val('w_holder');
    if (!(amt >= SET.min_withdraw_halalas) || amt > w.available) return setErr('w_err', `المبلغ لازم يكون بين ${sar(SET.min_withdraw_halalas)} و ${sar(w.available)}`);
    if (!/^SA\d{22}$/.test(iban)) return setErr('w_err', 'الآيبان السعودي يبدأ بـ SA وبعده 22 رقم');
    if (holder.length < 3) return setErr('w_err', 'اكتب اسم صاحب الحساب');
    guard(async () => { await rpc('request_payout', { p_amount:amt, p_iban:iban, p_holder:holder }); S.sheet = null; }, 'انرسل طلب السحب');
  },
  payoutSet:(id, v) => guard(() => rpc('admin_set_payout', { p_id:id, p_status:v, p_bank_ref:val('ref_' + id) || null }), v === 'paid' ? 'تم تسجيل التحويل' : 'انرفض الطلب'),
  sendMsg:async id => {
    const el = document.getElementById('chat_' + id); const body = (el?.value || '').trim(); if (!body) return;
    if (!S.online) return toast('تأكد من اتصالك بالإنترنت');
    el.value = '';
    const { data, error } = await S.sb.from('messages').insert({ deal_id:id, sender_id:S.uid, body }).select('masked').single();
    if (error){ el.value = body; return toast(errText(error)); }
    if (data?.masked) toast('أخفينا بيانات التواصل. التعامل داخل رواج يحمي حقك.');
    await loadDealDetail(id); render(); document.getElementById('msgs')?.scrollIntoView({ block:'end' });
  },
};
function createDeal(offerId, price, note){
  guard(async () => {
    const id = await rpc('apply_to_offer', { p_offer:offerId, p_price:price, p_note:note });
    S.sheet = null; await refreshAll(); S.stack = []; S.tab = 'deals'; go('deal', { id });
  }, 'انرسل طلبك للبراند');
}

boot();
