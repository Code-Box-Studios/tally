begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
insert into auth.users(id,email) values ('33333333-3333-4333-8333-333333333333','ledger@tally.test');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.tally_bootstrap('33333333-3333-4333-8333-333333333333','Ledger',null,'{}');
insert into public.tally_obligations(user_id,id,data) values ('33333333-3333-4333-8333-333333333333','loan',
 '{"userId":"33333333-3333-4333-8333-333333333333","schemaVersion":1,"currency":"PHP","type":"owedByMe","originalAmountMinor":100,"totalPaidMinor":0,"remainingMinor":100,"singleInstanceId":"period"}');
insert into public.tally_obligation_instances(user_id,id,data) values ('33333333-3333-4333-8333-333333333333','period',
 '{"userId":"33333333-3333-4333-8333-333333333333","schemaVersion":1,"obligationId":"loan","occurrenceKey":"single","currency":"PHP","amountMinor":100,"totalPaidMinor":0,"remainingMinor":100}');
set constraints all immediate;
select throws_ok($test$do $code$ begin
 set constraints all deferred;
 insert into public.tally_payments(user_id,id,data) values ('33333333-3333-4333-8333-333333333333','unbalanced',
 '{"userId":"33333333-3333-4333-8333-333333333333","schemaVersion":1,"obligationId":"loan","currency":"PHP","amountMinor":10,"entryType":"payment","allocations":[{"instanceId":"period","amountMinor":10}]}');
 set constraints all immediate;
end $code$;$test$,'23514',null,'A payment without balance updates cannot commit');
select throws_ok($test$do $code$ begin
 set constraints all deferred;
 insert into public.tally_payments(user_id,id,data) values ('33333333-3333-4333-8333-333333333333','unbalanced-parent',
 '{"userId":"33333333-3333-4333-8333-333333333333","schemaVersion":1,"obligationId":"loan","currency":"PHP","amountMinor":10,"entryType":"payment","allocations":[{"instanceId":"period","amountMinor":10}]}');
 update public.tally_obligation_instances set data=data||'{"totalPaidMinor":10,"remainingMinor":90}' where id='period';
 set constraints all immediate;
end $code$;$test$,'23514',null,'A finite debt aggregate must match its payment ledger');
select throws_ok($test$update public.tally_obligations set data=data||'{"totalPaidMinor":10,"remainingMinor":90}' where id='loan'$test$,
 '23514',null,'Calculated remaining balances cannot be edited independently');
select throws_ok($test$update public.tally_obligation_instances set data=data||'{"currency":"USD"}' where id='period'$test$,
 '23514',null,'A billing period cannot cross its parent currency');
select * from finish();
rollback;
