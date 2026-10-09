create table tally_private.deletion_jobs (
 user_id uuid primary key,
 request_id text not null,
 status text not null check(status in ('pending','leased','needsRecovery','complete')),
 step text not null default 'revokeSessions',
 accepted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0
);
alter table tally_private.deletion_jobs enable row level security;
grant all on tally_private.deletion_jobs to service_role;

create function tally_private.bootstrap(owner_id uuid, display_name text, photo_url text, notification_policy jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.tally_profiles; entry text[]; audit jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 if exists(select 1 from tally_private.deletion_jobs where user_id=owner_id) then raise exception 'failed-precondition'; end if;
 select * into profile from public.tally_profiles where user_id=owner_id for update;
 if found then
  if profile.account_status <> 'active' then raise exception 'failed-precondition'; end if;
  return profile.data;
 end if;
 audit := jsonb_build_object('userId',owner_id::text,'schemaVersion',1,'createdAt',now(),'updatedAt',now());
 insert into public.tally_profiles(user_id,data) values(owner_id,audit||jsonb_build_object(
  'displayName',left(coalesce(display_name,''),120),'photoUrl',photo_url,'defaultCurrency','PHP',
  'timezone','Asia/Manila','locale','en','themeMode','system','onboardingComplete',false,'accountStatus','active','revision',1)) returning * into profile;
 foreach entry slice 1 in array array[
  ['personal-loan','Personal Loan'],['rent','Rent'],['utilities','Utilities'],['subscription','Subscription'],
  ['credit-card','Credit Card'],['insurance','Insurance'],['vehicle','Vehicle'],['education','Education'],
  ['family','Family'],['business','Business'],['housing','Housing'],['membership','Membership'],
  ['installment','Installment'],['other','Other']
 ] loop
  insert into public.tally_categories(user_id,id,data) values(owner_id,'default-'||entry[1],audit||jsonb_build_object(
   'name',entry[2],'searchName',lower(entry[2]),'iconKey',null,'isDefault',true,'active',true,'revision',1));
 end loop;
 insert into public.tally_notification_preferences(user_id,id,data) values(owner_id,'default',audit||notification_policy||'{"revision":1}');
 insert into public.tally_ledger_state(user_id,id,data) values(owner_id,'current',audit||jsonb_build_object('revision',0,'formulaVersion',1,'lastMutationAt',now()));
 return profile.data;
end;
$$;
revoke all on function tally_private.bootstrap(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function tally_private.bootstrap(uuid,text,text,jsonb) to service_role;
create function public.tally_bootstrap(owner_id uuid, display_name text, photo_url text, notification_policy jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select tally_private.bootstrap(owner_id,display_name,photo_url,notification_policy);
$$;
revoke all on function public.tally_bootstrap(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tally_bootstrap(uuid,text,text,jsonb) to service_role;
