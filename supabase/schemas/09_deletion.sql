alter table tally_private.deletion_jobs add column next_run_at timestamptz not null default now();
create function tally_private.request_deletion(owner_id uuid,request_id text,session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile public.tally_profiles; job tally_private.deletion_jobs;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 if request_id !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid-argument' using errcode='22023'; end if;
 select * into profile from public.tally_profiles where user_id=owner_id for update;
 select * into job from tally_private.deletion_jobs j where j.user_id=owner_id;
 if found then return jsonb_build_object('userId',owner_id,'status',job.status,'step',job.step); end if;
 if profile.user_id is null or profile.account_status<>'active' then raise exception 'failed-precondition'; end if;
 -- A refreshed access token does not constitute recent password/OAuth login.
 if not exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=owner_id
  and s.created_at>=now()-interval '5 minutes' and (s.not_after is null or s.not_after>now())) then
  raise exception 'requires-recent-login' using errcode='P0001'; end if;
 update public.tally_profiles set data=data||jsonb_build_object('accountStatus','deleting','updatedAt',now()),version=version+1,updated_at=now() where user_id=owner_id;
 insert into tally_private.deletion_jobs(user_id,request_id,status,step) values(owner_id,request_id,'pending','revokeSessions');
 return jsonb_build_object('userId',owner_id,'status','pending','step','revokeSessions');
end;
$$;
revoke all on function tally_private.request_deletion(uuid,text,uuid) from public,anon,authenticated;
grant execute on function tally_private.request_deletion(uuid,text,uuid) to service_role;
create function public.tally_request_deletion(owner_id uuid,request_id text,session_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select tally_private.request_deletion(owner_id,request_id,session_id); $$;
revoke all on function public.tally_request_deletion(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.tally_request_deletion(uuid,text,uuid) to service_role;
create function public.tally_deletion_status(owner_id uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('userId',user_id,'status',status,'step',step) from tally_private.deletion_jobs where user_id=owner_id;
$$;
revoke all on function public.tally_deletion_status(uuid) from public,anon,authenticated;
grant execute on function public.tally_deletion_status(uuid) to service_role;
create function tally_private.claim_deletions() returns jsonb language plpgsql security definer set search_path='' as $$
declare job tally_private.deletion_jobs; result jsonb:='[]';
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 for job in select * from tally_private.deletion_jobs j where
  (j.status in ('pending','needsRecovery') and j.next_run_at<=now()) or (j.status='leased' and j.lease_until<=now())
  order by j.accepted_at limit 5 for update skip locked loop
  update tally_private.deletion_jobs j set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',
   attempts=attempts+1,updated_at=now() where j.user_id=job.user_id returning * into job;
  -- Access JWTs remain signed; removing sessions plus the profile fence blocks them.
  delete from auth.sessions where user_id=job.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('userId',job.user_id,'token',job.lease_token,'step',job.step));
 end loop;
 return result;
end;
$$;
revoke all on function tally_private.claim_deletions() from public,anon,authenticated;
grant execute on function tally_private.claim_deletions() to service_role;
create function public.tally_claim_deletions() returns jsonb language sql security invoker set search_path='' as $$ select tally_private.claim_deletions(); $$;
revoke all on function public.tally_claim_deletions() from public,anon,authenticated;
grant execute on function public.tally_claim_deletions() to service_role;
create function tally_private.finish_deletion(owner_id uuid,token uuid,finished boolean,wait_seconds integer default 30) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 if finished and exists(select 1 from auth.users where id=owner_id) then raise exception 'Identity still exists'; end if;
 update tally_private.deletion_jobs set status=case when finished then 'complete' else 'needsRecovery' end,
  step=case when finished then 'complete' else 'storage' end,lease_token=null,lease_until=null,
  next_run_at=now()+make_interval(secs=>least(greatest(wait_seconds,10),3600)),updated_at=now()
 where user_id=owner_id and lease_token=token and status='leased' and lease_until>now();
 return found;
end;
$$;
revoke all on function tally_private.finish_deletion(uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function tally_private.finish_deletion(uuid,uuid,boolean,integer) to service_role;
create function public.tally_finish_deletion(owner_id uuid,token uuid,finished boolean,wait_seconds integer default 30) returns boolean
language sql security invoker set search_path='' as $$ select tally_private.finish_deletion(owner_id,token,finished,wait_seconds); $$;
revoke all on function public.tally_finish_deletion(uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.tally_finish_deletion(uuid,uuid,boolean,integer) to service_role;
