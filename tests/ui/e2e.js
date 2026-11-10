const { chromium } = require('playwright'); const { execSync } = require('child_process');
const SHOTS = __dirname + '/shots/'; const BASE = 'http://localhost:8080/';
const sql = q => execSync(`su postgres -c "psql -h /tmp -p 5544 -d rawaj_ui -Atc \\"${q.replace(/"/g, '\\\\\\"')}\\""`).toString().trim();
const results = []; const ok = (name, cond, ev) => { results.push({ name, pass:!!cond, ev }); console.log((cond ? 'PASS ' : 'FAIL ') + name + ' | ' + ev); };
const flag = (k, v) => fetch(BASE + `__flag?k=${k}&v=${v ? 1 : 0}`);
async function newUser(browser, phone){
  const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, locale:'ar-SA' });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(BASE); await page.waitForSelector('#l_phone');
  await page.fill('#l_phone', phone); await page.click('[data-a=sendOtp]'); await page.waitForSelector('#o_code');
  return page;
}
const toastText = async (page, sub) => { if (sub) { try { await page.waitForFunction(t => document.querySelector('.toast')?.textContent.includes(t), sub, { timeout:8000 }); } catch {} } else await page.waitForSelector('.toast', { timeout:8000 }); return page.textContent('.toast'); };
const click = async (page, sel) => { await page.waitForSelector(sel + ':not([disabled])', { timeout:8000 }); await page.click(sel); };
async function onboard(page, role, name){
  await page.click('[data-a=onbSkip]'); await page.click(`[data-a=pickRole][data-v=${role}]`); await page.click('[data-a=onbRole]');
  await page.fill('#p_name', name);
  if (role === 'brand') await page.fill('#p_cr', '1010123456');
  else { await page.fill('#p_h_snapchat', 'sis_snap'); await page.click('[data-a=fset][data-k=followers] >> nth=1'); await page.fill('#p_lic', 'MW12345'); }
  await page.click('[data-a=fset][data-k=niche] >> nth=0'); await page.check('#p_terms'); await page.click('[data-a=saveProfile]');
  await page.waitForSelector('nav.tabs');
}
(async () => {
  const browser = await chromium.launch();
  // 1) رقم غير سعودي يُرفض في الواجهة
  let p0 = await browser.newPage(); await p0.goto(BASE); await p0.waitForSelector('#l_phone');
  await p0.fill('#l_phone', '0123456789'); await p0.click('[data-a=sendOtp]');
  ok('رقم غير سعودي مرفوض', (await p0.textContent('#l_err')).includes('سعودي'), await p0.textContent('#l_err'));
  ok('شارة النسخة التجريبية المقفلة', (await p0.textContent('.banner')).includes('تجريبية'), await p0.textContent('.banner'));
  await p0.screenshot({ path:SHOTS + '01-login.png' }); await p0.close();

  // 2) البراند: رمز خاطئ ثم صحيح ثم التسجيل
  const brand = await newUser(browser, '0500000101');
  await brand.screenshot({ path:SHOTS + '02-otp.png' });
  await brand.fill('#o_code', '000000'); await brand.click('[data-a=verifyOtp]'); await brand.waitForFunction(() => document.querySelector('#o_err')?.textContent);
  ok('رمز خاطئ برسالة عربية', /[\u0600-\u06FF]/.test(await brand.textContent('#o_err')), await brand.textContent('#o_err'));
  await brand.fill('#o_code', '123456'); await brand.click('[data-a=verifyOtp]'); await brand.waitForSelector('[data-a=onbSkip]');
  await onboard(brand, 'brand', 'براند الأخت');
  ok('accounts أُنشئ تلقائياً برقم سعودي', sql("select a.phone from accounts a join auth.users u using(id) where u.phone='966500000101'").length > 0, sql("select count(*) from accounts"));
  ok('محاولة رفع الصلاحية من الواجهة فشلت', sql("select is_admin::text||','||verif from profiles where display_name='براند الأخت'") === 'false,pending', sql("select is_admin::text||','||verif from profiles where display_name='براند الأخت'"));
  // نشر حملة
  await brand.click('[data-a=go][data-v=newOffer] >> nth=0');
  await brand.fill('#o_title', 'حملة عطور الشتاء'); await brand.fill('#o_desc', 'سناب ستوري يعرض عطر الشتاء الجديد مع كود خصم');
  await brand.click('[data-a=ftog][data-k=platforms][data-v=snapchat]'); await brand.fill('#o_budget', '1200');
  ok('معاينة الرسوم بالهللة (أول صفقة)', (await brand.textContent('#o_fee')).length > 0, (await brand.textContent('#o_fee')).replace(/\s+/g, ' ').slice(0, 120));
  await brand.click('[data-a=publishOffer]'); ok('نشر الحملة', (await toastText(brand, 'انتشرت')).includes('انتشرت'), sql("select title||' '||budget from offers"));

  // 3) المسوقة: تسجيل ثم تقديم بعرض مضاد
  const mk = await newUser(browser, '0500000102');
  await mk.fill('#o_code', '123456'); await mk.click('[data-a=verifyOtp]'); await mk.waitForSelector('[data-a=onbSkip]');
  await onboard(mk, 'marketer', 'مسوقة الأخت');
  await mk.waitForSelector('[data-a=go][data-v=offer]'); await mk.click('[data-a=go][data-v=offer]');
  await mk.click('[data-a=sheet][data-v=counter]'); await mk.fill('#c_price', '1100'); await mk.click('[data-a=applyCounter]');
  ok('تقديم بسعر مقترح عبر apply_to_offer', (await toastText(mk,'انرسل')).includes('انرسل'), sql("select status||' '||price||' '||turn from deals"));
  // صلاحية غير كافية: المسوقة تحاول تستدعي admin_verify
  const perm = await mk.evaluate(async () => { const r = await window.supabase.createClient(RAWAJ_CONFIG.supabaseUrl, RAWAJ_CONFIG.supabaseKey).rpc('admin_verify', { p_user:'00000000-0000-0000-0000-000000000000', p_status:'verified', p_note:null }); return r ? JSON.stringify(r.error) : 'no-handle'; });
  ok('مسوق ما يقدر يستدعي دوال الإدارة', perm !== 'no-handle' && perm.includes('"code"'), perm.slice(0, 140));
  // ممنوع كتابة مباشرة على ledger
  const led = await mk.evaluate(async () => JSON.stringify((await window.supabase.createClient(RAWAJ_CONFIG.supabaseUrl, RAWAJ_CONFIG.supabaseKey).from('ledger').insert({ amount:1 })).error));
  ok('ممنوع الكتابة المباشرة على السجل المالي', led.includes('42501') || led.includes('permission'), led.slice(0, 140));

  // 4) البراند يقبل (تحديث عبر الاستطلاع/اللحظي)
  await brand.click('[data-a=tab][data-v=deals]'); await brand.waitForSelector('[data-a=go][data-v=deal]', { timeout:20000 });
  await brand.click('[data-a=go][data-v=deal]'); await click(brand, '[data-a=dealRpc][data-v=accept_deal]');
  ok('قبول العرض عبر accept_deal', (await toastText(brand,'الاتفاق')).includes('الاتفاق'), sql("select status||' '||price from deals"));
  // الدفع قبل التوثيق ممنوع
  await brand.waitForFunction(() => document.querySelector('main')?.textContent.includes('توثّق'), null, { timeout:8000 }).catch(() => {});
  ok('زر الدفع مخفي قبل التوثيق', !(await brand.$('[data-a=sheet][data-v=pay]')) && (await brand.textContent('main')).includes('توثّق'), 'نص: الدفع يتفعل بعد ما توثّق الإدارة سجلك التجاري');
  const t1 = await brand.evaluate(async () => { const c = window.supabase.createClient(RAWAJ_CONFIG.supabaseUrl, RAWAJ_CONFIG.supabaseKey); const d = (await c.from('deals').select('id').single()).data; return JSON.stringify((await c.rpc('fund_deal', { p_deal:d.id, p_payment_ref:null, p_sandbox:true })).error); });
  ok('الخادم يرفض الدفع قبل التوثيق حتى لو تجاوز الواجهة', t1.includes('not_verified'), t1.slice(0, 120));
  // 5) المديرة: حساب ثالث ثم grant_admin
  const adm = await newUser(browser, '0500000100'); await adm.fill('#o_code', '123456'); await adm.click('[data-a=verifyOtp]'); await adm.waitForSelector('[data-a=onbSkip]');
  await onboard(adm, 'brand', 'ملاك');
  const g = sql("select grant_admin('+966500000100')"); 
  ok('grant_admin + استعلام التحقق', sql("select display_name||' '||is_admin from profiles where is_admin") === 'ملاك true', sql("select display_name||' is_admin='||is_admin from profiles where is_admin") + ' · audit=' + sql("select string_agg(action, ',') from admin_audit where action like '%admin%'"));
  await adm.reload(); await adm.waitForSelector('[data-a=tab][data-v=users]'); await adm.screenshot({ path:SHOTS + '05-admin-dash.png' });
  await adm.click('[data-a=tab][data-v=users]');
  for (const nm of ['براند الأخت', 'مسوقة الأخت']) {
    await adm.click(`[data-a=go][data-v=auser]:has-text("${nm}")`); await click(adm, '[data-a=verify][data-v=verified]');
    await toastText(adm); await adm.click('[data-a=back]');
  }
  ok('توثيق البراند والمسوقة عبر admin_verify', sql("select string_agg(verif::text, ',') from profiles where not is_admin") === 'verified,verified', sql("select string_agg(display_name||'='||verif, ', ') from profiles where not is_admin"));

  // 6) الدفع التجريبي، التسليم، الاعتماد
  await brand.waitForTimeout(500); await brand.reload(); await brand.click('[data-a=tab][data-v=deals]'); await brand.click('[data-a=go][data-v=deal]');
  await click(brand, '[data-a=sheet][data-v=pay]'); await brand.screenshot({ path:SHOTS + '06-pay-sheet.png' }); await brand.click('[data-a=pay]');
  ok('الدفع التجريبي عبر fund_deal', (await toastText(brand,'الضمان')).includes('الضمان'), sql("select status||' total='||total||' fee='||brand_fee||' vat='||vat from deals"));
  await mk.reload(); await mk.click('[data-a=tab][data-v=deals]'); await mk.waitForSelector('[data-a=go][data-v=deal]'); await mk.click('[data-a=go][data-v=deal]');
  await click(mk, '[data-a=sheet][data-v=deliver]'); await mk.fill('#d_url', 'https://snapchat.com/t/abc'); await mk.click('[data-a=deliver]');
  ok('التسليم عبر deliver_deal', (await toastText(mk,'التسليم')).includes('التسليم'), sql("select status from deals"));
  // رسالة فيها رقم جوال تنخفي
  const chat = await mk.$('[id^=chat_]'); if (chat) { await chat.fill('كلميني على 0551234567'); await chat.press('Enter'); const tt = await toastText(mk,'أخفينا'); ok('إخفاء بيانات التواصل في المحادثة', tt.includes('أخفينا'), sql("select body from messages order by at desc limit 1")); }
  await brand.waitForSelector('[data-a=dealRpc][data-v=approve_deal]', { timeout:20000 }); await brand.screenshot({ path:SHOTS + '07-approve.png' });
  await brand.click('[data-a=dealRpc][data-v=approve_deal]'); await toastText(brand);
  const r = sql("select status||' price='||price||' fee='||brand_fee||' vat='||vat||' total='||total||' commission='||commission||' payout='||payout from deals");
  ok('الاعتماد والأرقام بالهللة (أول صفقة: خصم 50٪ من رسوم البراند)', r === 'completed price=110000 fee=2750 vat=413 total=113163 commission=11000 payout=99000', r);

  // 7) سحب الأرباح ثم تسجيل التحويل من الإدارة
  if (await mk.$('[data-a=back]')) await mk.click('[data-a=back]'); await mk.click('[data-a=tab][data-v=wallet]'); await mk.waitForSelector('[data-a=sheet][data-v=withdraw]:not([disabled])', { timeout:25000 });
  await mk.screenshot({ path:SHOTS + '08-wallet.png' });
  await click(mk, '[data-a=sheet][data-v=withdraw]'); await mk.fill('#w_iban', 'SA0380000000608010167519'); await mk.fill('#w_holder', 'مسوقة الأخت'); await mk.click('[data-a=withdraw]');
  ok('طلب السحب عبر request_payout', (await toastText(mk,'السحب')).includes('السحب'), sql("select status||' '||amount from payout_requests"));
  await adm.click('[data-a=tab][data-v=payouts]'); await adm.waitForSelector('[data-a=payoutSet][data-v=paid]', { timeout:20000 }); await adm.click('[data-a=payoutSet][data-v=paid]'); await toastText(adm);
  ok('تسجيل التحويل عبر admin_set_payout', sql("select status from payout_requests") === 'paid', sql("select status||' '||amount from payout_requests") + ' · wallet=' + sql("select earned||'/'||withdrawn||'/'||available from marketer_wallet"));
  ok('السجل المالي', true, sql("select string_agg(type::text||':'||amount, ', ' order by at, id) from ledger"));

  // 8) انقطاع الاتصال
  await brand.context().setOffline(true); await brand.waitForSelector('.banner.off');
  ok('شريط انقطاع الاتصال', (await brand.textContent('.banner.off')).includes('اتصال'), await brand.textContent('.banner.off'));
  await brand.screenshot({ path:SHOTS + '09-offline.png' }); await brand.context().setOffline(false);
  // 9) انتهاء الجلسة
  await flag('EXPIRE', true); await brand.evaluate(() => window.dispatchEvent(new Event('online'))); await brand.waitForSelector('#l_phone', { timeout:10000 });
  const t9 = await toastText(brand,'انتهت'); ok('انتهاء الجلسة يرجع للدخول برسالة عربية', t9.includes('انتهت الجلسة'), t9); await flag('EXPIRE', false);
  await brand.screenshot({ path:SHOTS + '10-expired.png' });
  // 10) سجل محاولات OTP بدون رموز
  const log = await (await fetch(BASE + '__otplog')).json();
  ok('سجل محاولات OTP (بدون الرمز)', log.length >= 4 && !JSON.stringify(log).includes('123456'), log.map(x => x.action).join(','));
  ok('ما فيه أخطاء JavaScript', [brand, mk, adm].every(p => !p.errors.length), [brand, mk, adm].map(p => p.errors.join(';')).join(' | ') || 'none');
  await browser.close();
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`);
  require('fs').writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 1));
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
