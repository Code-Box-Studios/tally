begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','tally_borrower_shares','Borrower invitations have an owner-qualified table');
select has_table('public','tally_borrower_submissions','Borrower proofs have an owner-qualified table');
select is(tally_private.table_name('borrowerShares'),'tally_borrower_shares','Share commands use the atomic commit table mapping');
select is(tally_private.table_name('borrowerSubmissions'),'tally_borrower_submissions','Submission commands use the atomic commit table mapping');

create function pg_temp.share_body(owner_id uuid, share_id text, loan_id text, borrower_id text, state text default 'active') returns jsonb language sql as $$
 select jsonb_build_object('userId',owner_id::text,'schemaVersion',1,'shareId',share_id,'obligationId',loan_id,
  'inviteEmail','borrower@sharing.test','borrowerId',borrower_id,'status',state,
  'expiresAt','2026-12-31T00:00:00Z','acceptedAt',case when borrower_id is null then null else '2026-10-14T00:00:00Z' end,
  'revokedAt',case when state='revoked' then '2026-10-14T01:00:00Z' else null end);
$$;
create function pg_temp.submission_body(owner_id uuid, submission_id text, share_id text, loan_id text) returns jsonb language sql as $$
 select jsonb_build_object('userId',owner_id::text,'schemaVersion',1,'submissionId',submission_id,'shareId',share_id,
  'obligationId',loan_id,'borrowerId','a1000000-0000-4000-8000-000000000003','currency','PHP','amountMinor',1000,
  'paymentDate','2026-10-14','reference','Transfer 123','message','Payment proof','status','pending','reason','',
  'paymentId',null,'submittedAt','2026-10-14T00:00:00Z','reviewedAt',null);
$$;

insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','owner-a@sharing.test'),
 ('a1000000-0000-4000-8000-000000000002','owner-b@sharing.test'),
 ('a1000000-0000-4000-8000-000000000003','borrower@sharing.test');
insert into public.tally_profiles(user_id,data)
 select id,jsonb_build_object('userId',id::text,'schemaVersion',1,'accountStatus','active')
 from auth.users where id::text like 'a1000000-0000-4000-8000-00000000000%';
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',now(),now()),
 ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003',now(),now());
insert into public.tally_obligations(user_id,id,data)
 select owner_id,loan_id,jsonb_build_object('userId',owner_id::text,'schemaVersion',1,'obligationId',loan_id,
  'currency','PHP','type','owedToMe','originalAmountMinor',10000,'totalPaidMinor',0,'remainingMinor',10000,'singleInstanceId',loan_id||'-period')
 from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid,'loan'),
  ('a1000000-0000-4000-8000-000000000001'::uuid,'other-loan'),
  ('a1000000-0000-4000-8000-000000000002'::uuid,'loan')
 ) as fixture(owner_id,loan_id);
insert into public.tally_obligation_instances(user_id,id,data)
 select user_id,id||'-period',jsonb_build_object('userId',user_id::text,'schemaVersion',1,'obligationId',id,
  'occurrenceKey','single','currency','PHP','amountMinor',10000,'totalPaidMinor',0,'remainingMinor',10000)
 from public.tally_obligations where user_id::text in ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
insert into public.tally_borrower_shares(user_id,id,data) values
 ('a1000000-0000-4000-8000-000000000001','share-a',pg_temp.share_body('a1000000-0000-4000-8000-000000000001','share-a','loan','a1000000-0000-4000-8000-000000000003')),
 ('a1000000-0000-4000-8000-000000000002','share-b',pg_temp.share_body('a1000000-0000-4000-8000-000000000002','share-b','loan','a1000000-0000-4000-8000-000000000003'));
insert into public.tally_borrower_submissions(user_id,id,data) values
 ('a1000000-0000-4000-8000-000000000001','proof-a',pg_temp.submission_body('a1000000-0000-4000-8000-000000000001','proof-a','share-a','loan')),
 ('a1000000-0000-4000-8000-000000000002','proof-b',pg_temp.submission_body('a1000000-0000-4000-8000-000000000002','proof-b','share-b','loan'));
set constraints all immediate;

select ok((select relrowsecurity from pg_class where oid='public.tally_borrower_shares'::regclass),'Shares enforce RLS');
select ok((select relrowsecurity from pg_class where oid='public.tally_borrower_submissions'::regclass),'Submissions enforce RLS');
select ok(not has_table_privilege('anon','public.tally_borrower_shares','SELECT'),'Anonymous callers cannot read invitations');
select ok(not has_table_privilege('anon','public.tally_borrower_submissions','SELECT'),'Anonymous callers cannot read proof');
select ok(not has_table_privilege('authenticated','public.tally_borrower_shares','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'Clients cannot mutate or truncate invitations');
select ok(not has_table_privilege('authenticated','public.tally_borrower_submissions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'Clients cannot mutate or truncate proof');
select ok(has_table_privilege('service_role','public.tally_borrower_shares','SELECT,INSERT,UPDATE,DELETE'),'Trusted commands can manage shares');
select ok(has_table_privilege('service_role','public.tally_borrower_submissions','SELECT,INSERT,UPDATE,DELETE'),'Trusted commands can manage submissions');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a2000000-0000-4000-8000-000000000001"}',true);
select is((select array_agg(id order by id) from public.tally_borrower_shares),array['share-a'],'Owners read only their invitations');
select is((select array_agg(id order by id) from public.tally_borrower_submissions),array['proof-a'],'Owners read only their submissions');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"a2000000-0000-4000-8000-000000000003"}',true);
select is((select count(*)::integer from public.tally_borrower_shares),0,'Borrower identity does not bypass owner-only table RLS');
select is((select count(*)::integer from public.tally_borrower_submissions),0,'Borrowers obtain sanitized proof only through dedicated API');
reset role;
update public.tally_profiles set data=data||'{"accountStatus":"deleting"}' where user_id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a2000000-0000-4000-8000-000000000001"}',true);
select is((select count(*)::integer from public.tally_borrower_shares),0,'Account deletion fences invitation reads');
select is((select count(*)::integer from public.tally_borrower_submissions),0,'Account deletion fences proof reads');
reset role;
update public.tally_profiles set data=data||'{"accountStatus":"active"}' where user_id='a1000000-0000-4000-8000-000000000001';

select throws_ok($$insert into public.tally_borrower_shares(user_id,id,data) values
 ('a1000000-0000-4000-8000-000000000001','duplicate',pg_temp.share_body('a1000000-0000-4000-8000-000000000001','duplicate','loan',null,'invited'))$$,
 '23505',null,'One loan cannot have multiple active or invited shares');
select lives_ok($$insert into public.tally_borrower_shares(user_id,id,data) values
 ('a1000000-0000-4000-8000-000000000001','old-share',pg_temp.share_body('a1000000-0000-4000-8000-000000000001','old-share','loan','a1000000-0000-4000-8000-000000000003','revoked'))$$,
 'Revoked history can coexist with the current share');
select throws_ok($$update public.tally_borrower_shares set data=data||'{"userId":"a1000000-0000-4000-8000-000000000002"}' where id='share-a'$$,
 '23514',null,'Share JSON ownership cannot disagree with its row');
select throws_ok($$update public.tally_borrower_shares set data=data||'{"shareId":"different"}' where id='share-a'$$,
 '23514',null,'Share JSON identity cannot disagree with its row');
select throws_ok($$update public.tally_borrower_shares set data=data||'{"schemaVersion":null}' where id='share-a'$$,
 '23514',null,'Null schema versions cannot bypass share checks');
select throws_ok($$insert into public.tally_borrower_shares(user_id,id,data) values
 ('a1000000-0000-4000-8000-000000000002','wrong-loan',pg_temp.share_body('a1000000-0000-4000-8000-000000000002','wrong-loan','other-loan','a1000000-0000-4000-8000-000000000003'))$$,
 '23503',null,'A share cannot reference a loan belonging to another owner');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"submissionId":"different"}' where id='proof-a'$$,
 '23514',null,'Submission JSON identity cannot disagree with its row');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"userId":null}' where id='proof-a'$$,
 '23514',null,'Null JSON ownership cannot bypass submission checks');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"shareId":"share-b"}' where id='proof-a'$$,
 '23503',null,'A proof cannot reference another owner’s share');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"obligationId":"other-loan"}' where id='proof-a'$$,
 '23503',null,'A proof cannot reference a different loan from its share');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"borrowerId":"a1000000-0000-4000-8000-000000000002"}' where id='proof-a'$$,
 '23503',null,'A proof cannot impersonate a different share recipient');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"amountMinor":0}' where id='proof-a'$$,
 '23514',null,'Proof amounts must be positive');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"amountMinor":1000000000001}' where id='proof-a'$$,
 '23514',null,'Proof amounts respect the supported money bound');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"amountMinor":"1000"}' where id='proof-a'$$,
 '23514',null,'Proof amounts must be JSON numbers');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"amountMinor":1.5}' where id='proof-a'$$,
 '22P02',null,'Proof amounts cannot contain fractional minor units');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"status":"unknown"}' where id='proof-a'$$,
 '23514',null,'Proof cannot enter an unsupported state');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"currency":"BTC"}' where id='proof-a'$$,
 '23514',null,'Proof requires a supported currency');
select throws_ok($$update public.tally_borrower_submissions set data=data||'{"status":"approved"}' where id='proof-a'$$,
 '23514',null,'Approved proof requires its recorded payment');
select lives_ok($$insert into public.tally_borrower_submissions(user_id,id,data) values
 ('a1000000-0000-4000-8000-000000000001','withdrawn',pg_temp.submission_body('a1000000-0000-4000-8000-000000000001','withdrawn','share-a','loan')||'{"status":"withdrawn","reason":"Withdrawn by borrower.","reviewedAt":"2026-10-14T01:00:00Z"}')$$,
 'Withdrawn proof remains traceable without a payment');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.tally_commit_command('a1000000-0000-4000-8000-000000000001','borrower-commit','borrowerMetadata',repeat('a',64),1,
 jsonb_build_array(
  jsonb_build_object('kind','create','collection','borrowerShares','id','other-share','data',pg_temp.share_body('a1000000-0000-4000-8000-000000000001','other-share','other-loan','a1000000-0000-4000-8000-000000000003')),
  jsonb_build_object('kind','create','collection','borrowerSubmissions','id','other-proof','data',pg_temp.submission_body('a1000000-0000-4000-8000-000000000001','other-proof','other-share','other-loan'))),
 '{"submissionId":"other-proof"}')$$,'Atomic commands create borrower metadata through protected table mappings');
select is(public.tally_commit_command('a1000000-0000-4000-8000-000000000001','borrower-commit','borrowerMetadata',repeat('a',64),1,'[]','{}'),
 '{"submissionId":"other-proof"}'::jsonb,'Lost-response retries return the borrower metadata receipt');
select throws_ok($$select public.tally_commit_command('a1000000-0000-4000-8000-000000000001','bad-approval','reviewBorrower',repeat('b',64),2,
 '[{"kind":"update","collection":"borrowerSubmissions","id":"other-proof","data":{"status":"approved","paymentId":"missing-payment"}}]','{}')$$,
 '23503',null,'An approval without its payment fails atomically');
select is((select status from public.tally_borrower_submissions where id='other-proof'),'pending','A failed approval preserves pending proof');
select is((select version::integer from public.tally_profiles where user_id='a1000000-0000-4000-8000-000000000001'),2,'A failed approval preserves the owner epoch');
select is((select count(*)::integer from tally_private.command_receipts where command_id='bad-approval'),0,'A failed approval cannot leave a successful command receipt');

select lives_ok($test$do $code$ begin
 set constraints all deferred;
 perform public.tally_commit_command('a1000000-0000-4000-8000-000000000001','good-approval','reviewBorrower',repeat('c',64),2,
  '[{"kind":"update","collection":"borrowerSubmissions","id":"other-proof","data":{"status":"approved","paymentId":"approved-payment"}},
    {"kind":"create","collection":"payments","id":"approved-payment","data":{"obligationId":"other-loan","currency":"PHP","amountMinor":1000,"entryType":"payment","allocations":[{"instanceId":"other-loan-period","amountMinor":1000}]}},
    {"kind":"update","collection":"obligationInstances","id":"other-loan-period","data":{"totalPaidMinor":1000,"remainingMinor":9000}},
    {"kind":"update","collection":"obligations","id":"other-loan","data":{"totalPaidMinor":1000,"remainingMinor":9000}}]',
  '{"submissionId":"other-proof","paymentId":"approved-payment"}');
 set constraints all immediate;
end $code$;$test$,'Proof approval and the balanced ledger commit in one transaction regardless of mutation order');
select is((select status from public.tally_borrower_submissions where id='other-proof'),'approved','A successful approval stores the approved state');
select is((select remaining_minor from public.tally_obligations where user_id='a1000000-0000-4000-8000-000000000001' and id='other-loan'),9000::bigint,'A successful approval reduces the actual ledger balance once');
select is(public.tally_commit_command('a1000000-0000-4000-8000-000000000001','good-approval','reviewBorrower',repeat('c',64),2,'[]','{}'),
 '{"submissionId":"other-proof","paymentId":"approved-payment"}'::jsonb,'Approval retries return the existing payment receipt');
select is((select count(*)::integer from public.tally_payments where user_id='a1000000-0000-4000-8000-000000000001' and id='approved-payment'),1,'Approval retries cannot create another payment');
select throws_ok($test$do $code$ begin
 set constraints all deferred;
 perform public.tally_commit_command('a1000000-0000-4000-8000-000000000001','rollback-approval','reviewBorrower',repeat('d',64),3,
  '[{"kind":"create","collection":"payments","id":"failed-payment","data":{"obligationId":"loan","currency":"PHP","amountMinor":1000,"entryType":"payment","allocations":[{"instanceId":"loan-period","amountMinor":1000}]}},
    {"kind":"update","collection":"obligationInstances","id":"loan-period","data":{"totalPaidMinor":1000,"remainingMinor":9000}},
    {"kind":"update","collection":"obligations","id":"loan","data":{"totalPaidMinor":1000,"remainingMinor":9000}},
    {"kind":"update","collection":"borrowerSubmissions","id":"proof-a","data":{"status":"approved","paymentId":"failed-payment"}},
    {"kind":"update","collection":"borrowerSubmissions","id":"missing-proof","data":{"status":"rejected"}}]','{}');
 set constraints all immediate;
end $code$;$test$,'P0001',null,'A later failed mutation rolls back both proof approval and its payment');
select is((select count(*)::integer from public.tally_payments where user_id='a1000000-0000-4000-8000-000000000001' and id='failed-payment'),0,'An aborted approval leaves no payment');
select is((select status from public.tally_borrower_submissions where id='proof-a'),'pending','An aborted approval restores its proof state');
select is((select remaining_minor from public.tally_obligations where user_id='a1000000-0000-4000-8000-000000000001' and id='loan'),10000::bigint,'An aborted approval restores its ledger balance');

reset role;
select lives_ok($$delete from auth.users where id='a1000000-0000-4000-8000-000000000001'$$,'Owner erasure cascades through borrower metadata and approved-payment references');
select is((select count(*)::integer from public.tally_borrower_shares where user_id='a1000000-0000-4000-8000-000000000001'),0,'Owner erasure removes invitations');
select is((select count(*)::integer from public.tally_borrower_submissions where user_id='a1000000-0000-4000-8000-000000000001'),0,'Owner erasure removes submissions');
select is((select count(*)::integer from public.tally_borrower_shares where user_id='a1000000-0000-4000-8000-000000000002'),1,'Owner erasure preserves another owner’s sharing records');

select * from finish();
rollback;
