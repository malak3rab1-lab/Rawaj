-- تعيين M.A مشرفة. الشرط المسبق: تكون سجّلت دخول بجوالها من الواجهة الجديدة وأكملت ملفها (اختيار براند أو مسوق + البيانات).
-- 1) التحقق من الشرط (لازم يرجع صف واحد فيه has_profile = true):
select a.phone, (p.id is not null) as has_profile, p.display_name, p.is_admin
from accounts a left join profiles p on p.id = a.id
where a.phone in ('+9665XXXXXXXX', '9665XXXXXXXX');

-- 2) الأمر (استبدلي XXXXXXXX برقمك):
select grant_admin('+9665XXXXXXXX');

-- 3) الإثبات (لازم يظهر اسمك و is_admin = true، وسطر grant_admin في سجل الإدارة):
select id, display_name, role, is_admin, verif from profiles where is_admin;
select at, action, target, detail from admin_audit where action = 'grant_admin' order by at desc limit 5;
