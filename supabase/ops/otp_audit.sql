-- قراءة فقط: آخر 50 محاولة دخول بالجوال (طلب رمز، دخول، فشل). لا يحتوي الرموز.
select created_at,
       payload->>'action'          as action,     -- user_confirmation_requested / login / user_recovery_requested ...
       payload->>'actor_username'  as phone,
       ip_address
from auth.audit_log_entries
order by created_at desc
limit 50;
