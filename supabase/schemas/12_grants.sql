-- Supabase defaults can include TRUNCATE/REFERENCES/TRIGGER, which RLS does not
-- restrict. Revoke every client privilege, then add the exact read contract.
do $$
declare item record;
begin
 for item in select tablename from pg_tables where schemaname='public' and tablename like 'tally_%' loop
  execute format('revoke all on table public.%I from public,anon,authenticated',item.tablename);
  execute format('grant all on table public.%I to service_role',item.tablename);
  if item.tablename not in ('tally_jobs','tally_notification_devices') then
   execute format('grant select on table public.%I to authenticated',item.tablename);
  end if;
 end loop;
end;
$$;
revoke all on all tables in schema tally_private from public,anon,authenticated;
grant all on all tables in schema tally_private to service_role;
