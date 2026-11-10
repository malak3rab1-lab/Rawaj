# PROJECT_STATE.md — رواج · Rawaj

آخر تحديث: 2026-11-10 · الدورة 2 (قيد التنفيذ: الملفات جاهزة ومختبرة محلياً، وتنتظر مشروع Supabase من M.A)

## الفكرة
منصة سعودية تربط البراندات بالمسوقين وصناع المحتوى (سناب شات، انستقرام، تيك توك). كل صفقة تمشي كالتالي: حملة، ثم تفاوض (قبول/رفض/عرض مضاد)، ثم اتفاق، ثم دفع في الضمان، ثم تسليم، ثم اعتماد أو تحرير تلقائي بعد 72 ساعة، ثم سحب الأرباح للآيبان. وفيه ثلاث واجهات: المدير والبراند والمسوق.

## القرارات المعتمدة (لا تتغير إلا بطلب صريح من M.A)
- رسوم البراند 5٪ + ضريبة 15٪ على الرسوم. عمولة المسوق 10٪ للجميع، والمشاهير ضمناً.
- أقل رسوم إجمالية للصفقة 25 ر.س، والفرق يُكمَّل من جهة المسوق.
- أول صفقة للبراند تاخذ خصم 50٪ من رسوم البراند فقط، والرسوم ما تكون صفر أبداً. الاشتراكات ما تخفض العمولة.
- التحرير التلقائي بعد 72 ساعة من التسليم. الدفع ممنوع إلا بعد ما توثّق الإدارة البراند (السجل التجاري) والمسوق (رخصة موثوق).
- الهوية البصرية: شعار #4، ونظام الألوان #8 (رمادي فاتح #E4E6E8، فحمي #26282C، نيون #C6FF00).
- **قاعدة العمل:** أي تعديل على الواجهات الحالية يحتاج ضوء أخضر من M.A. المهام الجديدة اللي تطلبها هي بنفسها تُنفَّذ مباشرة.

## الوحدات وحالتها
| الوحدة | الحالة | الملفات | ملاحظات |
|---|---|---|---|
| التطبيق الحي (Artifact) | مكتمل، وقيد التجربة | `web/rawaj-live.html` → https://claude.ai/artifact/DHCRms1zzJ5Lxqc7FUxZoG | ملف HTML واحد مع قاعدة بيانات Artifact مشتركة. يُشارك بدعوة Editor بالإيميل فقط |
| نموذج العرض v10 | مكتمل (للعرض) | https://claude.ai/artifact/2KZTrQH2Tq1s76QzES576E | بيانات تجريبية، ما يتغير |
| نموذج Expo القديم | متوقف | `/mnt/project-files/app` | اسمه القديم «wasit» وعمولته من طرف واحد. مرجع فقط |
| قاعدة بيانات الإنتاج | **مكتمل، ومُختبَر محلياً** | `supabase/migrations/0001_init.sql` | جداول + RLS + كل انتقالات الصفقة كدوال RPC + سجل مالي ما يتعدّل |
| اختبارات قاعدة البيانات | مكتمل | `supabase/tests/0001_flow_test.sql`, `_local_auth_stub.sql` | الدورة كاملة + الحد الأدنى للرسوم + التحرير التلقائي + منع رفع الصلاحية |
| الدخول بالجوال + accounts + تدقيق الإدارة + الجدولة + تقوية الصلاحيات | جاهز ومُختبَر محلياً، ولم يُطبَّق بعد | `supabase/migrations/0002_auth_admin_cron.sql`, `web/lib/phoneAuth.js`, `supabase/tests/0002_security_test.sql` | التطبيق على Supabase والتحقق ينتظرون المشروع |
| ملف اللصق والتحقق على Supabase | جاهز | `supabase/APPLY_IN_SQL_EDITOR.sql`, `supabase/tests/verify_on_supabase.sql` | التحقق يتراجع تلقائياً بدون أثر |
| واجهة الويب على Supabase (PWA) | لم يبدأ | — | نقل `web/rawaj-live.html` من قاعدة Artifact إلى Supabase |
| الاستضافة العامة | لم يبدأ | — | Vercel باسم M.A |
| بوابة الدفع Tap (webhook → `fund_deal`) | لم يبدأ | — | تنتظر قبول طلب التاجر |
| التحرير التلقائي المجدول | قيد التحقق | `auto_release_due()` | الدالة جاهزة، والجدولة (pg_cron) تتفعل عند إنشاء المشروع |
| تطبيقات المتاجر (Expo) | لم يبدأ | — | بعد ما يثبت الويب |
| السجل التجاري / الضريبة / المحامي | عند M.A | — | خارج الكود |

**نسبة الإنجاز التقديرية للإطلاق العام:** 35٪

## هيكل الملفات
```
/mnt/project-files/rawaj/
├── PROJECT_STATE.md
├── supabase/
│   ├── migrations/0001_init.sql        # المخطط الكامل (Postgres 15+/Supabase)
│   └── tests/
│       ├── _local_auth_stub.sql        # محاكاة auth.* للاختبار المحلي فقط
│       └── 0001_flow_test.sql          # اختبار الدورة الكاملة
└── web/
    └── rawaj-live.html                 # مصدر التطبيق الحي الحالي
/mnt/project-files/app/                 # نموذج Expo القديم (مرجع، لا يُعدَّل)
```

## التقنيات
- الحالي: HTML وJS بدون مكتبات، خط IBM Plex Sans Arabic، وقاعدة بيانات Artifact (contract 0.2.96).
- الإنتاج: PostgreSQL 16 (اختُبر محلياً) على Supabase، مع Supabase Auth وpgcrypto. المقترح بعدها: Next.js (PWA) على Vercel، وبعدين Expo للمتاجر، وNestJS + BullMQ لما يكبر الحمل (حسب المخطط التقني).
- المبالغ كلها بالهللة (integer).

## المتغيرات البيئية (أسماء فقط)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (للخادم وwebhook الدفع فقط)
- `TAP_SECRET_KEY`, `TAP_WEBHOOK_SECRET` (لاحقاً)

## واجهة RPC (كل تغيير على الصفقات والمال يمر من هنا)
`apply_to_offer` · `counter_offer` · `accept_deal` · `reject_deal` · `withdraw_deal` · `fund_deal` · `deliver_deal` · `approve_deal` · `open_dispute` · `admin_resolve` · `admin_cancel` · `auto_release_due` · `request_payout` · `admin_set_payout` · `admin_verify`
ومساعدات: `brand_fees` · `creator_cut` · `is_first_deal` · `is_admin` · `setting`

## المهام المتبقية (بالأولوية)
1. **[يحتاج M.A]** إنشاء مشروع Supabase (المنطقة الأقرب) وحساب Vercel، ثم مشاركة رابط المشروع والمفتاح العام anon. المفتاح السري ما يُرسل في المحادثة.
2. تطبيق `0001_init.sql` على Supabase، وتفعيل pg_cron لـ `auto_release_due()` كل 15 دقيقة، وتعيين M.A كمشرفة (`is_admin = true`).
3. نقل واجهة `web/rawaj-live.html` إلى Supabase: تسجيل الدخول برقم الجوال، وقراءة البيانات من الجداول، والتغييرات عبر RPC، والتحديث اللحظي عبر Realtime.
4. نشر الواجهة على Vercel كـ PWA بنطاق خاص.
5. ربط Tap: صفحة الدفع، ثم webhook يستدعي `fund_deal(..., sandbox => false)`.
6. إشعارات (SMS/بريد) للأحداث المهمة.
7. تطبيقات المتاجر عبر Expo.

## سجل التغييرات
- `[2026-10-21]` اختيار الاسم رواج · `[2026-10-22]` الشعار #4 والألوان #8.
- `[2026-11-10]` نموذج العرض v10: التعديلات الأربعة المعلقة + الرسوم المعتمدة.
- `[2026-11-10]` التطبيق الحي متعدد المستخدمين بثلاث واجهات، واختُبر بثلاث حسابات · `web/rawaj-live.html`.
- `[2026-11-10 / الدورة 2]` 0002: جدول accounts مع trigger على auth.users (أرقام سعودية فقط)، وadmin_audit + grant_admin، وpg_cron كل 15 دقيقة، وسد ثغرة صلاحيات Supabase الافتراضية (الدوال الداخلية وauto_release_due وanon)، وfund_deal يتحقق من service_role فعلياً. الاختبارات الثلاثة نجحت محلياً بصلاحيات تحاكي Supabase.
- `[2026-11-10 / الدورة 1]` قاعدة بيانات الإنتاج + RLS + دوال انتقال الصفقة + اختبار كامل نجح على PostgreSQL 16 · `supabase/migrations/0001_init.sql`, `supabase/tests/*`.

## أخطاء ونقاط توقف معروفة
- الوقوف الحالي: انتهت الدورة 1 بنجاح، والخطوة الجاية تنتظر حسابَي Supabase وVercel من M.A.
- التطبيق الحي (Artifact): الكتابة متاحة بس للمدعوين بصلاحية Editor بالإيميل، وأعضاء المشروع يعتبرهم مالكين فتفتح لهم واجهة المدير. الأمان فيه على مستوى الواجهة فقط، وهذا سبب الانتقال لـ Supabase.
- نموذج Expo القديم و`/mnt/project-files/app/docs/schema.sql` ما يطابقون القرارات الحالية. المرجع الصحيح هو `supabase/migrations/0001_init.sql`.

## طريقة تشغيل الاختبار محلياً
```
psql -d rawaj -v ON_ERROR_STOP=1 -f supabase/tests/_local_auth_stub.sql -f supabase/migrations/0001_init.sql
psql -d rawaj -f supabase/tests/0001_flow_test.sql   # يطبع ALL TESTS PASSED
```
