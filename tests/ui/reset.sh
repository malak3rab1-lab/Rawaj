su postgres -c "psql -h /tmp -p 5544 -d rawaj_ui -qc 'truncate auth.users, accounts, profiles, offers, deals, deal_events, messages, payout_requests, admin_audit cascade'" 2>&1 | grep -v NOTICE
su postgres -c "psql -h /tmp -p 5544 -d rawaj_ui -qc 'alter table ledger disable trigger user; truncate ledger; alter table ledger enable trigger user'" 2>&1 | grep -v NOTICE
