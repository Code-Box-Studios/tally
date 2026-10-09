begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'tally_%' and c.relkind='r' and has_table_privilege('anon',c.oid,'TRUNCATE')),0,'Anonymous role has no financial TRUNCATE privilege');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'tally_%' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'TRUNCATE')),0,'Signed-in role has no financial TRUNCATE privilege');
select ok(not has_table_privilege('authenticated','public.tally_notification_devices','SELECT'),'Raw device tokens remain server-only; clients receive sanitized device views');
select * from finish();
rollback;
