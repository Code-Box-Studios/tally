-- Short owner-first transactions fence concurrent commands and lease jobs.
create function tally_private.claim_jobs(kinds text[], take integer default 5, clock_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; job public.tally_jobs; profile public.tally_profiles; result jsonb:='[]'; token text;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 if take not between 1 and 20 or cardinality(kinds) not between 1 and 8 or
  not kinds <@ array['recurringGeneration','automaticDeduction','ownerProjection','reminderReconciliation','reminderPreparation','reminderDelivery','fileCleanup','reminderPush']::text[] then
  raise exception 'invalid-argument' using errcode='22023'; end if;
 for candidate in select j.user_id,j.id from public.tally_jobs j
  where j.data->>'kind'=any(kinds) and
   ((j.data->>'status'='pending' and (j.data->>'nextRunAt')::timestamptz<=clock_at) or
    (j.data->>'status'='leased' and (j.data->>'leaseExpiresAt')::timestamptz<=clock_at))
  order by j.data->>'nextRunAt',j.user_id,j.id limit take*4 loop
  select * into profile from public.tally_profiles p where p.user_id=candidate.user_id for update skip locked;
  if not found or profile.account_status<>'active' then continue; end if;
  select * into job from public.tally_jobs j where j.user_id=candidate.user_id and j.id=candidate.id for update skip locked;
  if not found or not ((job.data->>'status'='pending' and (job.data->>'nextRunAt')::timestamptz<=clock_at) or
   (job.data->>'status'='leased' and (job.data->>'leaseExpiresAt')::timestamptz<=clock_at)) then continue; end if;
  token:=replace(gen_random_uuid()::text,'-','');
  update public.tally_jobs j set data=j.data||jsonb_build_object('status','leased','leaseToken',token,
   'leaseGeneration',j.data->'generation','leaseExpiresAt',clock_at+interval '120 seconds',
   'attempts',coalesce((j.data->>'attempts')::integer,0)+1),version=version+1,updated_at=now()
   where j.user_id=candidate.user_id and j.id=candidate.id returning * into job;
  update public.tally_profiles p set version=version+1,updated_at=now() where p.user_id=candidate.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'data',job.data));
  exit when jsonb_array_length(result)>=take;
 end loop;
 return result;
end;
$$;
revoke all on function tally_private.claim_jobs(text[],integer,timestamptz) from public,anon,authenticated;
grant execute on function tally_private.claim_jobs(text[],integer,timestamptz) to service_role;
create function public.tally_claim_jobs(kinds text[],take integer default 5,clock_at timestamptz default now())
returns jsonb language sql security invoker set search_path='' as $$ select tally_private.claim_jobs(kinds,take,clock_at); $$;
revoke all on function public.tally_claim_jobs(text[],integer,timestamptz) from public,anon,authenticated;
grant execute on function public.tally_claim_jobs(text[],integer,timestamptz) to service_role;
