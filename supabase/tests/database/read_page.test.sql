begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','time@tally.test');
insert into public.tally_profiles(user_id,data) values ('11111111-1111-4111-8111-111111111111','{"userId":"11111111-1111-4111-8111-111111111111","schemaVersion":1,"accountStatus":"active"}');
insert into auth.sessions(id,user_id,created_at,updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',now(),now());
insert into public.tally_activities(user_id,id,data) values
 ('11111111-1111-4111-8111-111111111111','a','{"userId":"11111111-1111-4111-8111-111111111111","schemaVersion":1,"recordedAt":"2026-10-09T00:00:00.000000Z"}'),
 ('11111111-1111-4111-8111-111111111111','b','{"userId":"11111111-1111-4111-8111-111111111111","schemaVersion":1,"recordedAt":"2026-10-09T08:00:00.000+08:00"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select is(jsonb_array_length(public.tally_read_page('activities','{"limit":10,"ranges":[{"field":"recordedAt","comparison":"greaterThanOrEqual","value":"2026-10-09T00:00:00.000Z"}]}')),2,'Timestamp ranges compare instants, independent of fraction and offset');
select is(public.tally_read_page('activities','{"limit":1,"order":[{"field":"recordedAt","descending":false}]}')->0->>'id','a','Equal timestamp ordering uses ID as a stable tie breaker');
select * from finish();
rollback;
