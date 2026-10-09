begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','commit@tally.test');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.tally_bootstrap('11111111-1111-4111-8111-111111111111','Alice',null,'{}');
select is(public.tally_commit_command('11111111-1111-4111-8111-111111111111','create-category','saveCatalog',repeat('a',64),1,
 '[{"kind":"create","collection":"categories","id":"custom","data":{"name":"Travel","active":true,"revision":1}}]',
 '{"id":"custom","revision":1}'), '{"id":"custom","revision":1}'::jsonb, 'Atomic commit returns the protected receipt');
select is(public.tally_commit_command('11111111-1111-4111-8111-111111111111','create-category','saveCatalog',repeat('a',64),1,'[]','{}'),
 '{"id":"custom","revision":1}'::jsonb, 'Lost-response retry returns the original receipt');
select throws_ok($$select public.tally_commit_command('11111111-1111-4111-8111-111111111111','create-category','saveCatalog',repeat('b',64),1,'[]','{}')$$,
 '23505',null,'A reused command ID cannot change payload');
select throws_ok($$select public.tally_commit_command('11111111-1111-4111-8111-111111111111','stale','saveCatalog',repeat('a',64),1,'[]','{}')$$,
 '40001',null,'Stale reads cannot commit across another owner mutation');
select lives_ok($$select public.tally_commit_command('11111111-1111-4111-8111-111111111111','update-existing','saveCatalog',repeat('a',64),2,
 '[{"kind":"update","collection":"categories","id":"custom","data":{"name":"Travel updated","revision":2}}]','{"id":"custom","revision":2}')$$,
 'An existing row update commits and advances the owner epoch');
select throws_ok($$select public.tally_commit_command('11111111-1111-4111-8111-111111111111','missing-update','saveCatalog',repeat('a',64),3,
 '[{"kind":"update","collection":"contacts","id":"missing","data":{"displayName":"Lost"}}]','{}')$$,
 'P0001',null,'An update of a missing row cannot acknowledge success');
select throws_ok($$select public.tally_commit_command('11111111-1111-4111-8111-111111111111','mixed-owner','saveCatalog',repeat('a',64),3,
 '[{"kind":"create","collection":"contacts","id":"bad","data":{"userId":"22222222-2222-4222-8222-222222222222"}}]','{}')$$,
 '42501',null,'Trusted commits still reject mismatched ownership');
select is((select count(*)::integer from public.tally_categories where id='custom'),1,'Retries cannot duplicate writes');
select * from finish();
rollback;
