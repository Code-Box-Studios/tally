-- Deferred checks verify the final transaction, whichever row changed first.
create function tally_private.assert_parent_ledger(owner_id uuid,parent_id text) returns void
language plpgsql security definer set search_path='' as $$
declare parent public.tally_obligations; total_amount bigint; total_paid bigint; total_remaining bigint; actual_ids jsonb; wanted_ids jsonb; wrong bigint;
begin
 select * into parent from public.tally_obligations where user_id=owner_id and id=parent_id;
 if not found then return; end if;
 select coalesce(sum(amount_minor),0),coalesce(sum(total_paid_minor),0),coalesce(sum(remaining_minor),0),
  coalesce(jsonb_agg(id order by id),'[]'),count(*) filter(where currency<>parent.currency)
 into total_amount,total_paid,total_remaining,actual_ids,wrong
 from public.tally_obligation_instances where user_id=owner_id and obligation_id=parent_id;
 if wrong>0 then raise exception 'Period currency must match parent' using errcode='23514'; end if;
 if parent.data->>'type' in ('recurringDue','subscription') then
  if parent.original_amount_minor is not null or parent.total_paid_minor is not null or parent.remaining_minor is not null then
   raise exception 'Recurring totals belong to individual periods' using errcode='23514'; end if;
  return;
 end if;
 if parent.data->>'type'='installment' then
  select coalesce(jsonb_agg(value order by value),'[]') into wanted_ids from jsonb_array_elements_text(parent.data->'installmentInstanceIds');
 else wanted_ids:=jsonb_build_array(parent.data->>'singleInstanceId'); end if;
 if total_amount<>parent.original_amount_minor or total_paid<>parent.total_paid_minor or total_remaining<>parent.remaining_minor or wanted_ids<>actual_ids then
  raise exception 'Parent balance must match its payment ledger' using errcode='23514'; end if;
end;
$$;
revoke all on function tally_private.assert_parent_ledger(uuid,text) from public,anon,authenticated;
create function tally_private.assert_period_ledger(owner_id uuid,period_id text) returns void
language plpgsql security definer set search_path='' as $$
declare period public.tally_obligation_instances; actual bigint; wrong bigint;
begin
 select * into period from public.tally_obligation_instances where user_id=owner_id and id=period_id;
 if not found then return; end if;
 select coalesce(sum(case when p.entry_type='reversal' then -a.amount_minor else a.amount_minor end),0),
 count(*) filter(where p.currency<>period.currency or p.obligation_id<>period.obligation_id)
 into actual,wrong from public.tally_payment_allocations a join public.tally_payments p on p.user_id=a.user_id and p.id=a.payment_id
 where a.user_id=owner_id and a.instance_id=period_id;
 if actual<>period.total_paid_minor or wrong>0 then raise exception 'Payment ledger does not match period balance' using errcode='23514'; end if;
 perform tally_private.assert_parent_ledger(owner_id,period.obligation_id);
end;
$$;
revoke all on function tally_private.assert_period_ledger(uuid,text) from public,anon,authenticated;
create or replace function tally_private.check_period_ledger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform tally_private.assert_period_ledger(new.user_id,new.id);return null;end;
$$;
create function tally_private.check_parent_ledger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform tally_private.assert_parent_ledger(new.user_id,new.id);return null;end;
$$;
revoke all on function tally_private.check_parent_ledger() from public,anon,authenticated;
create constraint trigger verify_parent_ledger after insert or update on public.tally_obligations deferrable initially deferred for each row execute function tally_private.check_parent_ledger();
create function tally_private.check_payment_ledger() returns trigger language plpgsql security definer set search_path='' as $$
declare allocation record; original public.tally_payments;
begin
 -- Account erasure may remove the entire ledger in the same transaction.
 if not exists(select 1 from public.tally_profiles where user_id=new.user_id) then return null; end if;
 if new.entry_type='reversal' then
  select * into original from public.tally_payments where user_id=new.user_id and id=new.reverses_payment_id;
  if not found or original.entry_type<>'payment' or original.obligation_id<>new.obligation_id or original.currency<>new.currency or
   original.amount_minor<>new.amount_minor or original.data->'allocations'<>new.data->'allocations' or
   original.data->'paymentDate' is distinct from new.data->'paymentDate' or original.data->'provenance' is distinct from new.data->'provenance' then
   raise exception 'Reversal must preserve the original payment' using errcode='23514'; end if;
 end if;
 for allocation in select instance_id from public.tally_payment_allocations where user_id=new.user_id and payment_id=new.id loop
  perform tally_private.assert_period_ledger(new.user_id,allocation.instance_id);
 end loop;
 return null;
end;
$$;
revoke all on function tally_private.check_payment_ledger() from public,anon,authenticated;
create constraint trigger verify_payment_ledger after insert on public.tally_payments deferrable initially deferred for each row execute function tally_private.check_payment_ledger();
create trigger immutable_allocations before update on public.tally_payment_allocations for each row execute function tally_private.immutable_history();
create trigger immutable_evidence before update on public.tally_payment_evidence for each row execute function tally_private.immutable_history();
create trigger immutable_deduction_events before update on public.tally_deduction_events for each row execute function tally_private.immutable_history();
