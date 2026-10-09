-- Revocation must fence data even while the signed access JWT has time left.
create or replace function tally_private.active_owner() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tally_profiles p join auth.sessions s on s.user_id=p.user_id
  where p.user_id=(select auth.uid()) and p.account_status='active'
   and s.id=((select auth.jwt())->>'session_id')::uuid
   and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function tally_private.active_owner() from public,anon;
grant execute on function tally_private.active_owner() to authenticated;

create function tally_private.session_active(owner_id uuid,session_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.jwt()->>'role')='service_role' and exists(
  select 1 from auth.sessions s where s.id=session_id and s.user_id=owner_id and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function tally_private.session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function tally_private.session_active(uuid,uuid) to service_role;
create function public.tally_session_active(owner_id uuid,session_id uuid) returns boolean language sql security invoker set search_path='' as $$
 select tally_private.session_active(owner_id,session_id);
$$;
revoke all on function public.tally_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tally_session_active(uuid,uuid) to service_role;

-- Postgres Changes honors the SELECT policies above. Avoid duplicate publication
-- entries if this schema is reapplied to a fresh development database.
do $$ declare table_name text; begin
 foreach table_name in array array['tally_profiles','tally_obligations','tally_obligation_instances','tally_payments',
 'tally_contacts','tally_payment_sources','tally_categories','tally_summaries','tally_ledger_state',
 'tally_activities','tally_reminders','tally_notification_preferences','tally_attachments','tally_deduction_attempts','tally_payment_evidence'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
   execute format('alter publication supabase_realtime add table public.%I',table_name);
  end if;
 end loop;
end $$;
