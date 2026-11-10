# اختبار الواجهة كاملة محلياً (الدورة 3)
يشغّل الواجهة الحقيقية `web/` على Postgres محلي فيه 0001 + 0002، عبر PostgREST v12 وخادم يحاكي Supabase Auth (أرقام اختبار، الرمز 123456). للاختبار فقط، وسرّ JWT هنا محلي ووهمي.
1. Postgres على المنفذ 5544 مع قاعدة `rawaj_ui` (stub + 0001 + 0002) ودور `authenticator`.
2. `postgrest postgrest.conf` ثم `node server.js` ثم `web/config.js` يشير إلى `http://localhost:8080`.
3. `bash reset.sh && node e2e.js` ← يطبع `26/26 passed`.
