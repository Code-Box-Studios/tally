begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id, email) values
 ('11111111-1111-4111-8111-111111111111', 'alice@tally.test'),
 ('22222222-2222-4222-8222-222222222222', 'bob@tally.test');
insert into public.tally_profiles(user_id, data) values
 ('11111111-1111-4111-8111-111111111111', '{"userId":"11111111-1111-4111-8111-111111111111","schemaVersion":1,"accountStatus":"active"}'),
 ('22222222-2222-4222-8222-222222222222', '{"userId":"22222222-2222-4222-8222-222222222222","schemaVersion":1,"accountStatus":"active"}');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',now(),now());
insert into public.tally_contacts(user_id, id, data) values
 ('11111111-1111-4111-8111-111111111111', 'alice-person', '{"userId":"11111111-1111-4111-8111-111111111111","schemaVersion":1,"displayName":"Alice contact"}'),
 ('22222222-2222-4222-8222-222222222222', 'bob-person', '{"userId":"22222222-2222-4222-8222-222222222222","schemaVersion":1,"displayName":"Bob contact"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select is((select count(*)::integer from public.tally_contacts), 1, 'RLS returns only the active owner');
select is((select id from public.tally_contacts), 'alice-person', 'RLS never returns another owner contact');
select throws_ok($$insert into public.tally_contacts(user_id,id,data) values ('11111111-1111-4111-8111-111111111111','forged','{}')$$, '42501', null, 'Clients cannot forge canonical rows');
select throws_ok($$select public.tally_commit_command('11111111-1111-4111-8111-111111111111','forged','createObligation','hash',0,'[]','{}')$$, '42501', null, 'Clients cannot invoke the trusted commit API');
reset role;
update public.tally_profiles set data = data || '{"accountStatus":"deleting"}' where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select is((select count(*)::integer from public.tally_contacts), 0, 'Accepted deletion fences a still-valid owner JWT');
reset role;
set local role anon;
select throws_ok($$select * from public.tally_contacts$$, '42501', null, 'Anonymous callers cannot read private financial tables');
reset role;
select throws_ok($$insert into public.tally_contacts(user_id,id,data) values ('11111111-1111-4111-8111-111111111111','wrong-owner','{"userId":"22222222-2222-4222-8222-222222222222","schemaVersion":1}')$$, '23514', null, 'Stored ownership cannot disagree with the row owner');
select throws_ok($$insert into public.tally_contacts(user_id,id,data) values ('33333333-3333-4333-8333-333333333333','unknown','{"userId":"33333333-3333-4333-8333-333333333333","schemaVersion":1}')$$, '23503', null, 'Private rows require an existing owner profile');
select is((select count(*)::integer from public.tally_contacts where user_id='22222222-2222-4222-8222-222222222222'), 1, 'Deletion fence leaves another owner intact');
select * from finish();
rollback;
