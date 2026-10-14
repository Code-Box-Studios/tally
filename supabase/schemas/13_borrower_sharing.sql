-- Borrower access is mediated by the authenticated Edge API. Direct reads
-- retain the existing owner-only RLS contract and account deletion fence.
create table public.tally_borrower_shares (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 obligation_id text generated always as (data->>'obligationId') stored not null,
 invite_email text generated always as (data->>'inviteEmail') stored not null,
 borrower_id text generated always as (data->>'borrowerId') stored,
 status text generated always as (data->>'status') stored not null,
 primary key(user_id,id),
 unique(user_id,id,obligation_id,borrower_id),
 foreign key(user_id,obligation_id) references public.tally_obligations(user_id,id)
  on delete cascade deferrable initially deferred,
 check (jsonb_typeof(data)='object' and data ?& array['userId','schemaVersion','shareId']
  and data->'userId'=to_jsonb(user_id::text) and data->'schemaVersion'='1'::jsonb and data->'shareId'=to_jsonb(id)),
 check (length(invite_email) between 3 and 320 and invite_email=lower(btrim(invite_email)) and position('@' in invite_email)>1),
 check (borrower_id is null or borrower_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 check (status in ('invited','active','revoked')),
 check (status<>'active' or borrower_id is not null)
);
create unique index tally_borrower_shares_current on public.tally_borrower_shares(user_id,obligation_id) where status<>'revoked';
create index tally_borrower_shares_obligation on public.tally_borrower_shares(user_id,obligation_id);
create index tally_borrower_shares_recipient on public.tally_borrower_shares(borrower_id,status);
create index tally_borrower_shares_invitation on public.tally_borrower_shares(invite_email,status);
alter table public.tally_borrower_shares enable row level security;
create policy owner_read on public.tally_borrower_shares for select to authenticated
 using ((select auth.uid())=user_id and (select tally_private.active_owner()));
revoke all on public.tally_borrower_shares from public,anon,authenticated;
grant select on public.tally_borrower_shares to authenticated;
grant all on public.tally_borrower_shares to service_role;

create table public.tally_borrower_submissions (
 user_id uuid not null references public.tally_profiles(user_id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
 data jsonb not null,
 version bigint not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 share_id text generated always as (data->>'shareId') stored not null,
 obligation_id text generated always as (data->>'obligationId') stored not null,
 borrower_id text generated always as (data->>'borrowerId') stored not null,
 status text generated always as (data->>'status') stored not null,
 amount_minor bigint generated always as ((data->>'amountMinor')::bigint) stored not null,
 currency text generated always as (data->>'currency') stored not null,
 payment_id text generated always as (data->>'paymentId') stored,
 primary key(user_id,id),
 foreign key(user_id,share_id,obligation_id,borrower_id)
  references public.tally_borrower_shares(user_id,id,obligation_id,borrower_id)
  on delete cascade deferrable initially deferred,
 foreign key(user_id,obligation_id) references public.tally_obligations(user_id,id)
  on delete cascade deferrable initially deferred,
 foreign key(user_id,payment_id) references public.tally_payments(user_id,id)
  deferrable initially deferred,
 check (jsonb_typeof(data)='object' and data ?& array['userId','schemaVersion','submissionId','paymentDate']
  and data->'userId'=to_jsonb(user_id::text) and data->'schemaVersion'='1'::jsonb and data->'submissionId'=to_jsonb(id)),
 check (jsonb_typeof(data->'amountMinor')='number' and amount_minor between 1 and 1000000000000),
 check (currency in ('PHP','USD','EUR','SGD','AUD','JPY','GBP')),
 check (status in ('draft','pending','approved','rejected','withdrawn')),
 check ((status='approved')=(payment_id is not null)),
 check (jsonb_typeof(data->'paymentDate')='string' and data->>'paymentDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and (data->>'paymentDate')::date between date '1900-01-01' and date '2199-12-31')
);
create index tally_borrower_submissions_share on public.tally_borrower_submissions(user_id,share_id,obligation_id,borrower_id);
create index tally_borrower_submissions_obligation on public.tally_borrower_submissions(user_id,obligation_id,status);
create unique index tally_borrower_submissions_payment on public.tally_borrower_submissions(user_id,payment_id) where payment_id is not null;
alter table public.tally_borrower_submissions enable row level security;
create policy owner_read on public.tally_borrower_submissions for select to authenticated
 using ((select auth.uid())=user_id and (select tally_private.active_owner()));
revoke all on public.tally_borrower_submissions from public,anon,authenticated;
grant select on public.tally_borrower_submissions to authenticated;
grant all on public.tally_borrower_submissions to service_role;
