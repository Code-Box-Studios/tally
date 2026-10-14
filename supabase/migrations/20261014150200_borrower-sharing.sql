SET local check_function_bodies = off;

CREATE TABLE "public"."tally_borrower_shares" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_borrower_shares_check"
    CHECK
    (((jsonb_typeof(data) = 'object'::text) AND (data ?& ARRAY['userId'::text, 'schemaVersion'::text, 'shareId'::text]) AND ((data -> 'userId'::text) = to_jsonb((user_id)::text))
    AND ((data -> 'schemaVersion'::text) = '1'::jsonb) AND ((data -> 'shareId'::text) = to_jsonb(id)))),
  CONSTRAINT "tally_borrower_shares_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_borrower_shares_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_borrower_shares_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_borrower_shares"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_borrower_shares" FROM "anon";

CREATE TABLE "public"."tally_borrower_submissions" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_borrower_submissions_check"
    CHECK
    (((jsonb_typeof(data) = 'object'::text) AND (data ?& ARRAY['userId'::text, 'schemaVersion'::text, 'submissionId'::text, 'paymentDate'::text]) AND ((data -> 'userId'::text) =
    to_jsonb((user_id)::text)) AND ((data -> 'schemaVersion'::text) = '1'::jsonb) AND ((data -> 'submissionId'::text) = to_jsonb(id)))),
  CONSTRAINT "tally_borrower_submissions_data_check"
    CHECK
    (((jsonb_typeof((data -> 'paymentDate'::text)) = 'string'::text) AND ((data ->> 'paymentDate'::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text) AND ((((data ->>
    'paymentDate'::text))::date >= '1900-01-01'::date) AND (((data ->> 'paymentDate'::text))::date <= '2199-12-31'::date)))),
  CONSTRAINT "tally_borrower_submissions_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_borrower_submissions_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_borrower_submissions_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_borrower_submissions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_borrower_submissions" FROM "anon";

ALTER TABLE "public"."tally_borrower_shares"
  ADD COLUMN "obligation_id" text GENERATED ALWAYS AS ((DATA ->> 'obligationId'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_shares"
  ADD COLUMN "invite_email" text GENERATED ALWAYS AS ((DATA ->> 'inviteEmail'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_shares"
  ADD COLUMN "borrower_id" text GENERATED ALWAYS AS ((DATA ->> 'borrowerId'::text)) STORED;

ALTER TABLE "public"."tally_borrower_shares"
  ADD COLUMN "status" text GENERATED ALWAYS AS ((DATA ->> 'status'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "share_id" text GENERATED ALWAYS AS ((DATA ->> 'shareId'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "obligation_id" text GENERATED ALWAYS AS ((DATA ->> 'obligationId'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "borrower_id" text GENERATED ALWAYS AS ((DATA ->> 'borrowerId'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "status" text GENERATED ALWAYS AS ((DATA ->> 'status'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "amount_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'amountMinor'::text))::bigint) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "currency" text GENERATED ALWAYS AS ((DATA ->> 'currency'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD COLUMN "payment_id" text GENERATED ALWAYS AS ((DATA ->> 'paymentId'::text)) STORED;

CREATE OR REPLACE FUNCTION tally_private.table_name (
  collection text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
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
 when 'borrowerShares' then 'tally_borrower_shares' when 'borrowerSubmissions' then 'tally_borrower_submissions'
 when 'systemJobs' then 'tally_jobs' end;
$function$;

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_borrower_id_check" CHECK (((borrower_id IS NULL) OR (borrower_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)));

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_check1" CHECK (((status <> 'active'::text) OR (borrower_id IS NOT NULL)));

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_invite_email_check"
    CHECK ((((length(invite_email) >= 3) AND (length(invite_email) <= 320)) AND (invite_email = lower(btrim(invite_email))) AND (POSITION(('@'::text) IN (invite_email)) > 1)));

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'revoked'::text])));

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_user_id_id_obligation_id_borrower_id_key" UNIQUE (user_id, id, obligation_id, borrower_id);

ALTER TABLE "public"."tally_borrower_shares"
  ADD CONSTRAINT "tally_borrower_shares_user_id_obligation_id_fkey" FOREIGN KEY (user_id, obligation_id) REFERENCES public.tally_obligations(user_id, id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_check1"
    CHECK (((jsonb_typeof((data -> 'amountMinor'::text)) = 'number'::text) AND ((amount_minor >= 1) AND (amount_minor <= '1000000000000'::bigint))));

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_check2" CHECK (((status = 'approved'::text) = (payment_id IS NOT NULL)));

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_currency_check"
    CHECK ((currency = ANY (ARRAY['PHP'::text, 'USD'::text, 'EUR'::text, 'SGD'::text, 'AUD'::text, 'JPY'::text, 'GBP'::text])));

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])));

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_user_id_obligation_id_fkey" FOREIGN KEY (user_id, obligation_id) REFERENCES public.tally_obligations(user_id, id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_user_id_payment_id_fkey" FOREIGN KEY (user_id, payment_id) REFERENCES public.tally_payments(user_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_borrower_submissions"
  ADD CONSTRAINT "tally_borrower_submissions_user_id_share_id_obligation_id__fkey" FOREIGN KEY (user_id, share_id, obligation_id, borrower_id)
    REFERENCES public.tally_borrower_shares(user_id, id, obligation_id, borrower_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX tally_borrower_shares_current ON public.tally_borrower_shares USING btree (user_id, obligation_id)
  WHERE (status <> 'revoked'::text);

CREATE INDEX tally_borrower_shares_invitation ON public.tally_borrower_shares USING btree (invite_email, status);

CREATE INDEX tally_borrower_shares_obligation ON public.tally_borrower_shares USING btree (user_id, obligation_id);

CREATE INDEX tally_borrower_shares_recipient ON public.tally_borrower_shares USING btree (borrower_id, status);

CREATE INDEX tally_borrower_submissions_obligation ON public.tally_borrower_submissions USING btree (user_id, obligation_id, status);

CREATE UNIQUE INDEX tally_borrower_submissions_payment ON public.tally_borrower_submissions USING btree (user_id, payment_id)
  WHERE (payment_id IS NOT NULL);

CREATE INDEX tally_borrower_submissions_share ON public.tally_borrower_submissions USING btree (user_id, share_id, obligation_id, borrower_id);

CREATE POLICY "owner_read" ON "public"."tally_borrower_shares"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_borrower_submissions"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

REVOKE ALL ON TABLE "public"."tally_borrower_shares" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_borrower_shares" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_borrower_shares" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_borrower_shares" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_borrower_shares" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_borrower_submissions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_borrower_submissions" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_borrower_submissions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_borrower_submissions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_borrower_submissions" TO "service_role";
