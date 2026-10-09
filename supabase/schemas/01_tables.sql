-- Private ownership helpers are not exposed by PostgREST.
create schema if not exists tally_private;
revoke all on schema tally_private from public, anon, authenticated;
grant usage on schema tally_private to authenticated, service_role;

create table public.tally_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 account_status text generated always as (data->>'accountStatus') stored not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1'),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (account_status in ('active','deleting'))
);

create function tally_private.active_owner() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.tally_profiles where user_id=(select auth.uid()) and account_status='active');
$$;
revoke all on function tally_private.active_owner() from public, anon;
grant execute on function tally_private.active_owner() to authenticated;
alter table public.tally_profiles enable row level security;
create policy owner_read on public.tally_profiles for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_profiles to authenticated;
grant all on public.tally_profiles to service_role;

create table public.tally_contacts (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_contacts enable row level security;
grant all on public.tally_contacts to service_role;
create policy owner_read on public.tally_contacts for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_contacts to authenticated;

create table public.tally_payment_sources (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_payment_sources enable row level security;
grant all on public.tally_payment_sources to service_role;
create policy owner_read on public.tally_payment_sources for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_payment_sources to authenticated;

create table public.tally_categories (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_categories enable row level security;
grant all on public.tally_categories to service_role;
create policy owner_read on public.tally_categories for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_categories to authenticated;

create table public.tally_obligations (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 currency text generated always as (data->>'currency') stored not null,
 original_amount_minor bigint generated always as ((data->>'originalAmountMinor')::bigint) stored,
 total_paid_minor bigint generated always as ((data->>'totalPaidMinor')::bigint) stored,
 remaining_minor bigint generated always as ((data->>'remainingMinor')::bigint) stored,
 contact_id text generated always as (data->>'contactId') stored,
 category_id text generated always as (data->>'categoryId') stored,
 payment_source_id text generated always as (data->>'paymentSourceId') stored,
 check (currency in ('PHP','USD','EUR','SGD','AUD','JPY','GBP')),
 check (original_amount_minor is null or original_amount_minor between 1 and 1000000000000),
 check (total_paid_minor is null or total_paid_minor >= 0),
 check (remaining_minor is null or remaining_minor >= 0),
 check (original_amount_minor is null or original_amount_minor = total_paid_minor + remaining_minor),
 foreign key(user_id,contact_id) references public.tally_contacts(user_id,id) deferrable initially deferred,
 foreign key(user_id,category_id) references public.tally_categories(user_id,id) deferrable initially deferred,
 foreign key(user_id,payment_source_id) references public.tally_payment_sources(user_id,id) deferrable initially deferred,
 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_obligations enable row level security;
grant all on public.tally_obligations to service_role;
create policy owner_read on public.tally_obligations for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_obligations to authenticated;

create table public.tally_obligation_instances (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 obligation_id text generated always as (data->>'obligationId') stored not null,
 occurrence_key text generated always as (data->>'occurrenceKey') stored not null,
 currency text generated always as (data->>'currency') stored not null,
 amount_minor bigint generated always as ((data->>'amountMinor')::bigint) stored,
 total_paid_minor bigint generated always as ((data->>'totalPaidMinor')::bigint) stored not null,
 remaining_minor bigint generated always as ((data->>'remainingMinor')::bigint) stored,
 unique(user_id,obligation_id,occurrence_key),
 foreign key(user_id,obligation_id) references public.tally_obligations(user_id,id) on delete cascade deferrable initially deferred,
 check(currency in ('PHP','USD','EUR','SGD','AUD','JPY','GBP')),
 check(amount_minor is null or amount_minor between 1 and 1000000000000),
 check(total_paid_minor >= 0),
 check(remaining_minor is null or remaining_minor >= 0),
 check((amount_minor is null and remaining_minor is null and total_paid_minor=0) or amount_minor = total_paid_minor+remaining_minor),
 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_obligation_instances enable row level security;
grant all on public.tally_obligation_instances to service_role;
create policy owner_read on public.tally_obligation_instances for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_obligation_instances to authenticated;

create table public.tally_payments (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 obligation_id text generated always as (data->>'obligationId') stored not null,
 currency text generated always as (data->>'currency') stored not null,
 amount_minor bigint generated always as ((data->>'amountMinor')::bigint) stored not null,
 entry_type text generated always as (data->>'entryType') stored not null,
 reverses_payment_id text generated always as (data->>'reversesPaymentId') stored,
 foreign key(user_id,obligation_id) references public.tally_obligations(user_id,id) on delete cascade deferrable initially deferred,
 foreign key(user_id,reverses_payment_id) references public.tally_payments(user_id,id) deferrable initially deferred,
 check(amount_minor between 1 and 1000000000000),
 check(currency in ('PHP','USD','EUR','SGD','AUD','JPY','GBP')),
 check(entry_type in ('payment','reversal')),
 check((entry_type='reversal')=(reverses_payment_id is not null)),
 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_payments enable row level security;
grant all on public.tally_payments to service_role;
create policy owner_read on public.tally_payments for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_payments to authenticated;

create table public.tally_payment_reversals (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_payment_reversals enable row level security;
grant all on public.tally_payment_reversals to service_role;
create policy owner_read on public.tally_payment_reversals for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_payment_reversals to authenticated;

create table public.tally_activities (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_activities enable row level security;
grant all on public.tally_activities to service_role;
create policy owner_read on public.tally_activities for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_activities to authenticated;

create table public.tally_summaries (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_summaries enable row level security;
grant all on public.tally_summaries to service_role;
create policy owner_read on public.tally_summaries for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_summaries to authenticated;

create table public.tally_ledger_state (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_ledger_state enable row level security;
grant all on public.tally_ledger_state to service_role;
create policy owner_read on public.tally_ledger_state for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_ledger_state to authenticated;

create table public.tally_deduction_attempts (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_deduction_attempts enable row level security;
grant all on public.tally_deduction_attempts to service_role;
create policy owner_read on public.tally_deduction_attempts for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_deduction_attempts to authenticated;

create table public.tally_deduction_events (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_deduction_events enable row level security;
grant all on public.tally_deduction_events to service_role;
create policy owner_read on public.tally_deduction_events for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_deduction_events to authenticated;

create table public.tally_payment_evidence (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_payment_evidence enable row level security;
grant all on public.tally_payment_evidence to service_role;
create policy owner_read on public.tally_payment_evidence for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_payment_evidence to authenticated;

create table public.tally_reminders (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_reminders enable row level security;
grant all on public.tally_reminders to service_role;
create policy owner_read on public.tally_reminders for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_reminders to authenticated;

create table public.tally_notification_preferences (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_notification_preferences enable row level security;
grant all on public.tally_notification_preferences to service_role;
create policy owner_read on public.tally_notification_preferences for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_notification_preferences to authenticated;

create table public.tally_attachments (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_attachments enable row level security;
grant all on public.tally_attachments to service_role;
create policy owner_read on public.tally_attachments for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_attachments to authenticated;

create table public.tally_notification_devices (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_notification_devices enable row level security;
grant all on public.tally_notification_devices to service_role;
create policy owner_read on public.tally_notification_devices for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_notification_devices to authenticated;

create table public.tally_jobs (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),

 primary key(user_id,id),
 check (data ? 'userId' and data ? 'schemaVersion'),
 check (data->>'userId' = user_id::text and data->>'schemaVersion' = '1')
);
alter table public.tally_jobs enable row level security;
grant all on public.tally_jobs to service_role;

create table tally_private.command_receipts (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 command_id text not null,
 command_type text not null,
 payload_hash text not null,
 result jsonb not null,
 recorded_at timestamptz not null default now(),
 primary key(user_id,command_id)
);
alter table tally_private.command_receipts enable row level security;
grant all on tally_private.command_receipts to service_role;

create table public.tally_payment_allocations (
 user_id uuid not null,
 payment_id text not null,
 instance_id text not null,
 amount_minor bigint not null check(amount_minor > 0 and amount_minor <= 1000000000000),
 primary key(user_id,payment_id,instance_id),
 foreign key(user_id,payment_id) references public.tally_payments(user_id,id) on delete cascade deferrable initially deferred,
 foreign key(user_id,instance_id) references public.tally_obligation_instances(user_id,id) on delete cascade deferrable initially deferred
);
alter table public.tally_payment_allocations enable row level security;
create policy owner_read on public.tally_payment_allocations for select to authenticated using ((select auth.uid())=user_id and (select tally_private.active_owner()));
grant select on public.tally_payment_allocations to authenticated;
grant all on public.tally_payment_allocations to service_role;
create index tally_allocation_period on public.tally_payment_allocations(user_id,instance_id);
create unique index tally_single_reversal on public.tally_payments(user_id,reverses_payment_id) where reverses_payment_id is not null;

create function tally_private.append_allocations() returns trigger language plpgsql security definer set search_path = '' as $$
declare allocation jsonb; total bigint := 0;
begin
 if jsonb_typeof(new.data->'allocations') <> 'array' or jsonb_array_length(new.data->'allocations') not between 1 and 120 then
  raise exception 'invalid-argument' using errcode='22023';
 end if;
 for allocation in select * from jsonb_array_elements(new.data->'allocations') loop
  insert into public.tally_payment_allocations(user_id,payment_id,instance_id,amount_minor)
  values(new.user_id,new.id,allocation->>'instanceId',(allocation->>'amountMinor')::bigint);
  total := total + (allocation->>'amountMinor')::bigint;
 end loop;
 if total <> new.amount_minor then raise exception 'allocation mismatch' using errcode='23514'; end if;
 return new;
end;
$$;
revoke all on function tally_private.append_allocations() from public, anon, authenticated;
create trigger append_payment_allocations after insert on public.tally_payments for each row execute function tally_private.append_allocations();

create function tally_private.immutable_history() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Payment history is append-only' using errcode='23514'; end;
$$;
revoke all on function tally_private.immutable_history() from public, anon, authenticated;
create trigger immutable_payments before update on public.tally_payments for each row execute function tally_private.immutable_history();

create function tally_private.check_period_ledger() returns trigger language plpgsql security definer set search_path = '' as $$
declare period record; actual bigint; wrong integer;
begin
 select * into period from public.tally_obligation_instances where user_id=new.user_id and id=new.id;
 if not found then return null; end if;
 select coalesce(sum(case when p.entry_type='reversal' then -a.amount_minor else a.amount_minor end),0),
 count(*) filter(where p.currency <> period.currency or p.obligation_id <> period.obligation_id)
 into actual,wrong from public.tally_payment_allocations a join public.tally_payments p on p.user_id=a.user_id and p.id=a.payment_id
 where a.user_id=period.user_id and a.instance_id=period.id;
 if actual <> period.total_paid_minor or wrong > 0 then raise exception 'Payment ledger does not match period balance' using errcode='23514'; end if;
 return null;
end;
$$;
revoke all on function tally_private.check_period_ledger() from public, anon, authenticated;
create constraint trigger verify_period_ledger after insert or update on public.tally_obligation_instances deferrable initially deferred for each row execute function tally_private.check_period_ledger();

-- Query indexes match existing repository filters and sorting.
create index tally_obligation_section on public.tally_obligations(user_id,(data->>'section'),(data->>'archived'));
create index tally_obligation_person on public.tally_obligations(user_id,contact_id);
create index tally_obligation_category on public.tally_obligations(user_id,category_id);
create index tally_obligation_source on public.tally_obligations(user_id,payment_source_id);
create index tally_period_due on public.tally_obligation_instances(user_id,(data->>'dueDate'),id);
create index tally_period_month on public.tally_obligation_instances(user_id,(data->>'yearMonth'),(data->>'section'),(data->>'dueDate'));
create index tally_period_parent on public.tally_obligation_instances(user_id,obligation_id);
create index tally_payment_date on public.tally_payments(user_id,(data->>'paymentDate') desc,id desc);
create index tally_payment_parent on public.tally_payments(user_id,obligation_id,(data->>'paymentDate'));
create index tally_activity_date on public.tally_activities(user_id,(data->>'recordedAt') desc,id desc);
create index tally_jobs_ready on public.tally_jobs((data->>'status'),(data->>'nextRunAt'));
create index tally_attachment_target on public.tally_attachments(user_id,(data->>'targetType'),(data->>'targetId'));
