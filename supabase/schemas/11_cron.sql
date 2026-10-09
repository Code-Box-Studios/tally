create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function tally_private.enqueue_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare base text; secret text; request_id bigint;
begin
 -- Keep idle invocations low; the next civil-time job remains stored in SQL.
 if not exists(select 1 from public.tally_jobs where
  (data->>'status'='pending' and (data->>'nextRunAt')::timestamptz<=now()) or
  (data->>'status'='leased' and (data->>'leaseExpiresAt')::timestamptz<=now())) and
  not exists(select 1 from tally_private.deletion_jobs where status in ('pending','needsRecovery','leased') and next_run_at<=now()) then return 0; end if;
 select decrypted_secret into base from vault.decrypted_secrets where name='tally_project_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='tally_job_secret';
 if base is null or secret is null then return 0; end if;
 if base !~ '^https://[a-z0-9]{20}\.supabase\.co$' and base<>'http://kong:8000' then raise exception 'Invalid worker endpoint'; end if;
 select net.http_post(url:=base||'/functions/v1/tally-worker',headers:=jsonb_build_object(
  'Content-Type','application/json','x-tally-job-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end;
$$;
revoke all on function tally_private.enqueue_worker() from public,anon,authenticated,service_role;
