create function tally_private.table_name(collection text) returns text language sql immutable set search_path = '' as $$
 select case collection
 when 'profiles' then 'tally_profiles' when 'contacts' then 'tally_contacts'
 when 'paymentSources' then 'tally_payment_sources' when 'categories' then 'tally_categories'
 when 'obligations' then 'tally_obligations' when 'obligationInstances' then 'tally_obligation_instances'
 when 'payments' then 'tally_payments' when 'paymentReversals' then 'tally_payment_reversals'
 when 'activities' then 'tally_activities' when 'summaries' then 'tally_summaries'
 when 'ledgerState' then 'tally_ledger_state' when 'deductionAttempts' then 'tally_deduction_attempts'
 when 'deductionEvents' then 'tally_deduction_events' when 'paymentEvidence' then 'tally_payment_evidence'
 when 'reminders' then 'tally_reminders' when 'notificationPreferences' then 'tally_notification_preferences'
 when 'attachments' then 'tally_attachments' when 'notificationDevices' then 'tally_notification_devices'
 when 'systemJobs' then 'tally_jobs' end;
$$;
revoke all on function tally_private.table_name(text) from public, anon;
grant execute on function tally_private.table_name(text) to authenticated, service_role;

create function tally_private.resolve_audit(value jsonb, stamp text) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; item record;
begin
 if value='{"$tallyAudit":"server"}'::jsonb then return to_jsonb(stamp); end if;
 if jsonb_typeof(value)='object' then
  result:='{}';
  for item in select * from jsonb_each(value) loop result:=result||jsonb_build_object(item.key,tally_private.resolve_audit(item.value,stamp)); end loop;
  return result;
 elsif jsonb_typeof(value)='array' then
  select coalesce(jsonb_agg(tally_private.resolve_audit(v,stamp)),'[]') into result from jsonb_array_elements(value) v;
  return result;
 end if;
 return value;
end;
$$;
revoke all on function tally_private.resolve_audit(jsonb,text) from public,anon,authenticated;

create function tally_private.commit_command(
 owner_id uuid, command_id text, command_type text, payload_hash text,
 owner_version bigint, mutations jsonb, command_result jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare profile public.tally_profiles; receipt tally_private.command_receipts;
 mutation jsonb; table_name text; body jsonb; previous jsonb; row_id text; affected bigint;
 stamp text := to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 if command_id !~ '^[A-Za-z0-9_-]{1,128}$' or payload_hash !~ '^[a-f0-9]{64}$' or
    jsonb_typeof(mutations) <> 'array' or jsonb_array_length(mutations) > 500 then
  raise exception 'invalid-argument' using errcode='22023';
 end if;
 -- All owner writes, including workers and metadata, use this lock and epoch.
 -- The epoch also detects query phantoms without long-running edge transactions.
 select * into profile from public.tally_profiles where user_id=owner_id for update;
 if not found or profile.account_status <> 'active' then raise exception 'failed-precondition' using errcode='P0001'; end if;
 select * into receipt from tally_private.command_receipts r where r.user_id=owner_id and r.command_id=commit_command.command_id;
 if found then
  if receipt.command_type <> commit_command.command_type or receipt.payload_hash <> commit_command.payload_hash then
   raise exception 'already-exists' using errcode='23505';
  end if;
  return receipt.result;
 end if;
 if profile.version <> owner_version then raise exception 'aborted' using errcode='40001'; end if;
 for mutation in select * from jsonb_array_elements(mutations) loop
  table_name := tally_private.table_name(mutation->>'collection'); row_id := mutation->>'id';
  if table_name is null or row_id !~ '^[A-Za-z0-9_-]{1,128}$' or jsonb_typeof(mutation->'data') <> 'object' then
   raise exception 'invalid-argument' using errcode='22023';
  end if;
  body := tally_private.resolve_audit(mutation->'data',stamp);
  if body ? 'userId' and body->>'userId' <> owner_id::text then raise insufficient_privilege; end if;
  if mutation->>'kind' = 'create' then
   if table_name='tally_profiles' then raise exception 'invalid-argument'; end if;
   body := body || jsonb_build_object('userId',owner_id::text,'schemaVersion',1,'createdAt',stamp,'updatedAt',stamp);
   execute format('insert into public.%I(user_id,id,data) values($1,$2,$3)',table_name) using owner_id,row_id,body;
  elsif mutation->>'kind'='update' then
   if table_name='tally_payments' or table_name='tally_payment_reversals' or table_name='tally_payment_evidence' or table_name='tally_deduction_events' then
    raise exception 'History is append-only' using errcode='23514';
   end if;
   if table_name='tally_profiles' then
    update public.tally_profiles set data=data||body||jsonb_build_object('updatedAt',stamp), updated_at=statement_timestamp() where user_id=owner_id;
   else
    execute format('update public.%I set data=data||$3||jsonb_build_object(''updatedAt'',$4),version=version+1,updated_at=statement_timestamp() where user_id=$1 and id=$2',table_name)
     using owner_id,row_id,body,stamp;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'failed-precondition'; end if;
   end if;
  else raise exception 'invalid-argument' using errcode='22023'; end if;
 end loop;
 update public.tally_profiles set version=version+1,updated_at=statement_timestamp() where user_id=owner_id;
 insert into tally_private.command_receipts(user_id,command_id,command_type,payload_hash,result)
 values(owner_id,command_id,command_type,payload_hash,command_result);
 return command_result;
end;
$$;
revoke all on function tally_private.commit_command(uuid,text,text,text,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function tally_private.commit_command(uuid,text,text,text,bigint,jsonb,jsonb) to service_role;

create function public.tally_commit_command(
 owner_id uuid, command_id text, command_type text, payload_hash text,
 owner_version bigint, mutations jsonb, command_result jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
 select tally_private.commit_command(owner_id,command_id,command_type,payload_hash,owner_version,mutations,command_result);
$$;
revoke all on function public.tally_commit_command(uuid,text,text,text,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.tally_commit_command(uuid,text,text,text,bigint,jsonb,jsonb) to service_role;

create function public.tally_command_receipt(owner_id uuid, command_id text) returns jsonb language sql security invoker set search_path = '' as $$
 select jsonb_build_object('commandType',command_type,'payloadHash',payload_hash,'result',result)
 from tally_private.command_receipts r where r.user_id=owner_id and r.command_id=tally_command_receipt.command_id;
$$;
revoke all on function public.tally_command_receipt(uuid,text) from public, anon, authenticated;
grant execute on function public.tally_command_receipt(uuid,text) to service_role;
