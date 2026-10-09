SET local check_function_bodies = off;

CREATE SCHEMA "tally_private";

CREATE TABLE "public"."tally_activities" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_activities_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_activities_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_activities_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_activities_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_activities_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_activities"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_activities" FROM "anon";

CREATE TABLE "public"."tally_attachments" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_attachments_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_attachments_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_attachments_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_attachments_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_attachments_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_attachments"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_attachments" FROM "anon";

CREATE TABLE "public"."tally_categories" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_categories_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_categories_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_categories_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_categories_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_categories_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_categories"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_categories" FROM "anon";

CREATE TABLE "public"."tally_contacts" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_contacts_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_contacts_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_contacts_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_contacts_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_contacts_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_contacts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_contacts" FROM "anon";

CREATE TABLE "public"."tally_deduction_attempts" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_deduction_attempts_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_deduction_attempts_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_deduction_attempts_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_deduction_attempts_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_deduction_attempts_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_deduction_attempts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_deduction_attempts" FROM "anon";

CREATE TABLE "public"."tally_deduction_events" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_deduction_events_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_deduction_events_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_deduction_events_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_deduction_events_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_deduction_events_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_deduction_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_deduction_events" FROM "anon";

CREATE TABLE "public"."tally_jobs" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_jobs_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_jobs_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_jobs_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_jobs_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_jobs_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_jobs"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_jobs" FROM "anon", "authenticated";

CREATE TABLE "public"."tally_ledger_state" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_ledger_state_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_ledger_state_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_ledger_state_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_ledger_state_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_ledger_state_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_ledger_state"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_ledger_state" FROM "anon";

CREATE TABLE "public"."tally_notification_devices" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_notification_devices_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_notification_devices_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_notification_devices_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_notification_devices_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_notification_devices_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_notification_devices"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_notification_devices" FROM "anon", "authenticated";

CREATE TABLE "public"."tally_notification_preferences" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_notification_preferences_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_notification_preferences_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_notification_preferences_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_notification_preferences_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_notification_preferences_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_notification_preferences"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_notification_preferences" FROM "anon";

CREATE TABLE "public"."tally_obligation_instances" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_obligation_instances_check1" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_obligation_instances_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_obligation_instances_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_obligation_instances_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_obligation_instances_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_obligation_instances"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_obligation_instances" FROM "anon";

CREATE TABLE "public"."tally_obligations" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_obligations_check1" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_obligations_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_obligations_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_obligations_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_obligations_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_obligations"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_obligations" FROM "anon";

CREATE TABLE "public"."tally_payment_allocations" (
  "user_id"      uuid   NOT NULL,
  "payment_id"   text   NOT NULL,
  "instance_id"  text   NOT NULL,
  "amount_minor" bigint NOT NULL,
  CONSTRAINT "tally_payment_allocations_amount_minor_check" CHECK (((amount_minor > 0) AND (amount_minor <= '1000000000000'::bigint))),
  CONSTRAINT "tally_payment_allocations_pkey" PRIMARY KEY (user_id, payment_id, instance_id)
);

ALTER TABLE "public"."tally_payment_allocations"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_payment_allocations" FROM "anon";

CREATE TABLE "public"."tally_payment_evidence" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_payment_evidence_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_payment_evidence_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_payment_evidence_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_payment_evidence_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_payment_evidence_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_payment_evidence"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_payment_evidence" FROM "anon";

CREATE TABLE "public"."tally_payment_reversals" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_payment_reversals_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_payment_reversals_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_payment_reversals_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_payment_reversals_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_payment_reversals_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_payment_reversals"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_payment_reversals" FROM "anon";

CREATE TABLE "public"."tally_payment_sources" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_payment_sources_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_payment_sources_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_payment_sources_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_payment_sources_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_payment_sources_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_payment_sources"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_payment_sources" FROM "anon";

CREATE TABLE "public"."tally_payments" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_payments_check1" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_payments_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_payments_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_payments_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_payments_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_payments"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_payments" FROM "anon";

CREATE TABLE "public"."tally_profiles" (
  "user_id"    uuid                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_profiles_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_profiles_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_profiles_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "tally_profiles_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_profiles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_profiles" FROM "anon";

CREATE TABLE "public"."tally_reminders" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_reminders_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_reminders_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_reminders_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_reminders_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_reminders_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_reminders"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_reminders" FROM "anon";

CREATE TABLE "public"."tally_summaries" (
  "user_id"    uuid                     NOT NULL,
  "id"         text                     NOT NULL,
  "data"       jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tally_summaries_check" CHECK ((((data ->> 'userId'::text) = (user_id)::text) AND ((data ->> 'schemaVersion'::text) = '1'::text))),
  CONSTRAINT "tally_summaries_data_check" CHECK (((data ? 'userId'::text) AND (data ? 'schemaVersion'::text))),
  CONSTRAINT "tally_summaries_id_check" CHECK ((id ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
  CONSTRAINT "tally_summaries_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "tally_summaries_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."tally_summaries"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."tally_summaries" FROM "anon";

CREATE TABLE "tally_private"."command_receipts" (
  "user_id"      uuid                     NOT NULL,
  "command_id"   text                     NOT NULL,
  "command_type" text                     NOT NULL,
  "payload_hash" text                     NOT NULL,
  "result"       jsonb                    NOT NULL,
  "recorded_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "command_receipts_pkey" PRIMARY KEY (user_id, command_id)
);

ALTER TABLE "tally_private"."command_receipts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "tally_private"."deletion_jobs" (
  "user_id"     uuid                     NOT NULL,
  "request_id"  text                     NOT NULL,
  "status"      text                     NOT NULL,
  "step"        text                     NOT NULL DEFAULT 'revokeSessions'::text,
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "attempts"    integer                  NOT NULL DEFAULT 0,
  "next_run_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deletion_jobs_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "deletion_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'leased'::text, 'needsRecovery'::text, 'complete'::text])))
);

ALTER TABLE "tally_private"."deletion_jobs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tally_obligation_instances"
  ADD COLUMN "obligation_id" text GENERATED ALWAYS AS ((DATA ->> 'obligationId'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_obligation_instances"
  ADD COLUMN "occurrence_key" text GENERATED ALWAYS AS ((DATA ->> 'occurrenceKey'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_obligation_instances"
  ADD COLUMN "currency" text GENERATED ALWAYS AS ((DATA ->> 'currency'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_obligation_instances"
  ADD COLUMN "amount_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'amountMinor'::text))::bigint) STORED;

ALTER TABLE "public"."tally_obligation_instances"
  ADD COLUMN "total_paid_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'totalPaidMinor'::text))::bigint) STORED NOT NULL;

ALTER TABLE "public"."tally_obligation_instances"
  ADD COLUMN "remaining_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'remainingMinor'::text))::bigint) STORED;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "currency" text GENERATED ALWAYS AS ((DATA ->> 'currency'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "original_amount_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'originalAmountMinor'::text))::bigint) STORED;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "total_paid_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'totalPaidMinor'::text))::bigint) STORED;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "remaining_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'remainingMinor'::text))::bigint) STORED;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "contact_id" text GENERATED ALWAYS AS ((DATA ->> 'contactId'::text)) STORED;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "category_id" text GENERATED ALWAYS AS ((DATA ->> 'categoryId'::text)) STORED;

ALTER TABLE "public"."tally_obligations"
  ADD COLUMN "payment_source_id" text GENERATED ALWAYS AS ((DATA ->> 'paymentSourceId'::text)) STORED;

ALTER TABLE "public"."tally_payments"
  ADD COLUMN "obligation_id" text GENERATED ALWAYS AS ((DATA ->> 'obligationId'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_payments"
  ADD COLUMN "currency" text GENERATED ALWAYS AS ((DATA ->> 'currency'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_payments"
  ADD COLUMN "amount_minor" bigint GENERATED ALWAYS AS (((DATA ->> 'amountMinor'::text))::bigint) STORED NOT NULL;

ALTER TABLE "public"."tally_payments"
  ADD COLUMN "entry_type" text GENERATED ALWAYS AS ((DATA ->> 'entryType'::text)) STORED NOT NULL;

ALTER TABLE "public"."tally_payments"
  ADD COLUMN "reverses_payment_id" text GENERATED ALWAYS AS ((DATA ->> 'reversesPaymentId'::text)) STORED;

ALTER TABLE "public"."tally_profiles"
  ADD COLUMN "account_status" text GENERATED ALWAYS AS ((DATA ->> 'accountStatus'::text)) STORED NOT NULL;

CREATE OR REPLACE FUNCTION public.tally_bootstrap (
  owner_id            uuid,
  display_name        text,
  photo_url           text,
  notification_policy jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 select tally_private.bootstrap(owner_id,display_name,photo_url,notification_policy);
$function$;

REVOKE ALL ON FUNCTION "public"."tally_bootstrap"(uuid, text, text, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_claim_deletions()
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select tally_private.claim_deletions(); $function$;

REVOKE ALL ON FUNCTION "public"."tally_claim_deletions"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_claim_jobs (
  kinds    text[],
  take     integer                  DEFAULT 5,
  clock_at timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select tally_private.claim_jobs(kinds,take,clock_at); $function$;

REVOKE ALL ON FUNCTION "public"."tally_claim_jobs"(text[], integer, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_command_receipt (
  owner_id   uuid,
  command_id text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('commandType',command_type,'payloadHash',payload_hash,'result',result)
 from tally_private.command_receipts r where r.user_id=owner_id and r.command_id=tally_command_receipt.command_id;
$function$;

REVOKE ALL ON FUNCTION "public"."tally_command_receipt"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_commit_command (
  owner_id       uuid,
  command_id     text,
  command_type   text,
  payload_hash   text,
  owner_version  bigint,
  mutations      jsonb,
  command_result jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 select tally_private.commit_command(owner_id,command_id,command_type,payload_hash,owner_version,mutations,command_result);
$function$;

REVOKE ALL ON FUNCTION "public"."tally_commit_command"(uuid, text, text, text, bigint, jsonb, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_deletion_status (
  owner_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('userId',user_id,'status',status,'step',step) from tally_private.deletion_jobs where user_id=owner_id;
$function$;

REVOKE ALL ON FUNCTION "public"."tally_deletion_status"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_finish_deletion (
  owner_id     uuid,
  token        uuid,
  finished     boolean,
  wait_seconds integer DEFAULT 30
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select tally_private.finish_deletion(owner_id,token,finished,wait_seconds); $function$;

REVOKE ALL ON FUNCTION "public"."tally_finish_deletion"(uuid, uuid, boolean, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_read_page (
  collection_name text,
  request         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare table_name text; conditions text := 'user_id=$1'; sorting text := '';
 predicate text := ''; prefix text := ''; term text; field text; operation text;
 item record; ordering jsonb; cursor jsonb; comparator text; take integer;
 result jsonb; descending boolean := false; value jsonb;
begin
 if (select auth.uid()) is null then raise insufficient_privilege; end if;
 if collection_name not in ('obligations','obligationInstances','contacts','payments','paymentSources','categories',
  'activities','summaries','ledgerState','deductionAttempts','paymentEvidence','reminders','notificationPreferences','attachments') then
  raise exception 'invalid-argument' using errcode='22023';
 end if;
 take := (request->>'limit')::integer;
 if take not between 1 and 200 or octet_length(request::text)>16384 then raise exception 'invalid-argument' using errcode='22023'; end if;
 table_name := tally_private.table_name(collection_name);
 for item in select * from jsonb_each(coalesce(request->'equals','{}')) loop
  if item.key !~ '^[A-Za-z][A-Za-z0-9]{0,99}$' then raise exception 'invalid-argument'; end if;
  conditions := conditions || format(' and tally_private.query_value(%L,data->%L)=tally_private.query_value(%L,%L::jsonb)',item.key,item.key,item.key,item.value::text);
 end loop;
 for ordering in select * from jsonb_array_elements(coalesce(request->'ranges','[]')) loop
  field:=ordering->>'field'; operation:=ordering->>'comparison';
  if field !~ '^[A-Za-z][A-Za-z0-9]{0,99}$' then raise exception 'invalid-argument'; end if;
  comparator:=case operation when 'greaterThan' then '>' when 'greaterThanOrEqual' then '>='
   when 'lessThan' then '<' when 'lessThanOrEqual' then '<=' end;
  if comparator is null then raise exception 'invalid-argument'; end if;
  conditions:=conditions||format(' and tally_private.query_value(%L,data->%L) %s tally_private.query_value(%L,%L::jsonb)',field,field,comparator,field,(ordering->'value')::text);
 end loop;
 cursor:=request->'after';
 for ordering in select * from jsonb_array_elements(coalesce(request->'order','[]')) loop
  field:=ordering->>'field'; descending:=coalesce((ordering->>'descending')::boolean,false);
  if field !~ '^[A-Za-z][A-Za-z0-9]{0,99}$' then raise exception 'invalid-argument'; end if;
  term:=format('tally_private.query_value(%L,data->%L)',field,field);
  sorting:=sorting||case when sorting='' then '' else ',' end||term||case when descending then ' desc' else ' asc' end;
  if cursor is not null and cursor <> 'null'::jsonb then
   value:=coalesce(cursor->'values'->field,'null'::jsonb);
   predicate:=predicate||case when predicate='' then '' else ' or ' end||'('||prefix||
    format('%s %s tally_private.query_value(%L,%L::jsonb)',term,case when descending then '<' else '>' end,field,value::text)||')';
   prefix:=prefix||format('%s=tally_private.query_value(%L,%L::jsonb) and ',term,field,value::text);
  end if;
 end loop;
 sorting:=sorting||case when sorting='' then '' else ',' end||'id'||case when descending then ' desc' else ' asc' end;
 if cursor is not null and cursor <> 'null'::jsonb then
  if cursor->>'id' !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid-argument'; end if;
  predicate:=predicate||case when predicate='' then '' else ' or ' end||'('||prefix||
   format('id %s %L',case when descending then '<' else '>' end,cursor->>'id')||')';
  conditions:=conditions||' and ('||predicate||')';
 end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''data'',data) order by rank),''[]'') from
  (select id,data,row_number() over(order by %s) rank from public.%I where %s order by %s limit %s) page',
  sorting,table_name,conditions,sorting,take+1) into result using (select auth.uid());
 return result;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."tally_read_page"(text, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.tally_request_deletion (
  owner_id   uuid,
  request_id text,
  session_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select tally_private.request_deletion(owner_id,request_id,session_id); $function$;

REVOKE ALL ON FUNCTION "public"."tally_request_deletion"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tally_session_active (
  owner_id   uuid,
  session_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 select tally_private.session_active(owner_id,session_id);
$function$;

REVOKE ALL ON FUNCTION "public"."tally_session_active"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION tally_private.active_owner()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select exists(select 1 from public.tally_profiles p join auth.sessions s on s.user_id=p.user_id
  where p.user_id=(select auth.uid()) and p.account_status='active'
   and s.id=((select auth.jwt())->>'session_id')::uuid
   and (s.not_after is null or s.not_after>now()));
$function$;

CREATE OR REPLACE FUNCTION tally_private.append_allocations()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.assert_parent_ledger (
  owner_id  uuid,
  parent_id text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare parent public.tally_obligations; total_amount bigint; total_paid bigint; total_remaining bigint; actual_ids jsonb; wanted_ids jsonb; wrong bigint;
begin
 select * into parent from public.tally_obligations where user_id=owner_id and id=parent_id;
 if not found then return; end if;
 select coalesce(sum(amount_minor),0),coalesce(sum(total_paid_minor),0),coalesce(sum(remaining_minor),0),
  coalesce(jsonb_agg(id order by id),'[]'),count(*) filter(where currency<>parent.currency)
 into total_amount,total_paid,total_remaining,actual_ids,wrong
 from public.tally_obligation_instances where user_id=owner_id and obligation_id=parent_id;
 if wrong>0 then raise exception 'Period currency must match parent' using errcode='23514'; end if;
 if parent.data->>'type' in ('recurringDue','subscription') then
  if parent.original_amount_minor is not null or parent.total_paid_minor is not null or parent.remaining_minor is not null then
   raise exception 'Recurring totals belong to individual periods' using errcode='23514'; end if;
  return;
 end if;
 if parent.data->>'type'='installment' then
  select coalesce(jsonb_agg(value order by value),'[]') into wanted_ids from jsonb_array_elements_text(parent.data->'installmentInstanceIds');
 else wanted_ids:=jsonb_build_array(parent.data->>'singleInstanceId'); end if;
 if total_amount<>parent.original_amount_minor or total_paid<>parent.total_paid_minor or total_remaining<>parent.remaining_minor or wanted_ids<>actual_ids then
  raise exception 'Parent balance must match its payment ledger' using errcode='23514'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.assert_period_ledger (
  owner_id  uuid,
  period_id text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare period public.tally_obligation_instances; actual bigint; wrong bigint;
begin
 select * into period from public.tally_obligation_instances where user_id=owner_id and id=period_id;
 if not found then return; end if;
 select coalesce(sum(case when p.entry_type='reversal' then -a.amount_minor else a.amount_minor end),0),
 count(*) filter(where p.currency<>period.currency or p.obligation_id<>period.obligation_id)
 into actual,wrong from public.tally_payment_allocations a join public.tally_payments p on p.user_id=a.user_id and p.id=a.payment_id
 where a.user_id=owner_id and a.instance_id=period_id;
 if actual<>period.total_paid_minor or wrong>0 then raise exception 'Payment ledger does not match period balance' using errcode='23514'; end if;
 perform tally_private.assert_parent_ledger(owner_id,period.obligation_id);
end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.bootstrap (
  owner_id            uuid,
  display_name        text,
  photo_url           text,
  notification_policy jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.check_parent_ledger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin perform tally_private.assert_parent_ledger(new.user_id,new.id);return null;end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.check_payment_ledger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare allocation record; original public.tally_payments;
begin
 -- Account erasure may remove the entire ledger in the same transaction.
 if not exists(select 1 from public.tally_profiles where user_id=new.user_id) then return null; end if;
 if new.entry_type='reversal' then
  select * into original from public.tally_payments where user_id=new.user_id and id=new.reverses_payment_id;
  if not found or original.entry_type<>'payment' or original.obligation_id<>new.obligation_id or original.currency<>new.currency or
   original.amount_minor<>new.amount_minor or original.data->'allocations'<>new.data->'allocations' or
   original.data->'paymentDate' is distinct from new.data->'paymentDate' or original.data->'provenance' is distinct from new.data->'provenance' then
   raise exception 'Reversal must preserve the original payment' using errcode='23514'; end if;
 end if;
 for allocation in select instance_id from public.tally_payment_allocations where user_id=new.user_id and payment_id=new.id loop
  perform tally_private.assert_period_ledger(new.user_id,allocation.instance_id);
 end loop;
 return null;
end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.check_period_ledger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin perform tally_private.assert_period_ledger(new.user_id,new.id);return null;end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.claim_deletions()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.claim_jobs (
  kinds    text[],
  take     integer                  DEFAULT 5,
  clock_at timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.commit_command (
  owner_id       uuid,
  command_id     text,
  command_type   text,
  payload_hash   text,
  owner_version  bigint,
  mutations      jsonb,
  command_result jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.enqueue_worker()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.finish_deletion (
  owner_id     uuid,
  token        uuid,
  finished     boolean,
  wait_seconds integer DEFAULT 30
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise insufficient_privilege; end if;
 if finished and exists(select 1 from auth.users where id=owner_id) then raise exception 'Identity still exists'; end if;
 update tally_private.deletion_jobs set status=case when finished then 'complete' else 'needsRecovery' end,
  step=case when finished then 'complete' else 'storage' end,lease_token=null,lease_until=null,
  next_run_at=now()+make_interval(secs=>least(greatest(wait_seconds,10),3600)),updated_at=now()
 where user_id=owner_id and lease_token=token and status='leased' and lease_until>now();
 return found;
end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.immutable_history()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin raise exception 'Payment history is append-only' using errcode='23514'; end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.query_value (
  field_name text,
  value      jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
 select case when field_name ~ '(At|Until)$' and jsonb_typeof(value)='string'
  then to_jsonb(to_char((value#>>'{}')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  else coalesce(value,'null'::jsonb) end;
$function$;

CREATE OR REPLACE FUNCTION tally_private.request_deletion (
  owner_id   uuid,
  request_id text,
  session_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.resolve_audit (
  value jsonb,
  stamp text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION tally_private.session_active (
  owner_id   uuid,
  session_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select (select auth.jwt()->>'role')='service_role' and exists(
  select 1 from auth.sessions s where s.id=session_id and s.user_id=owner_id and (s.not_after is null or s.not_after>now()));
$function$;

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
 when 'systemJobs' then 'tally_jobs' end;
$function$;

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_amount_minor_check" CHECK (((amount_minor IS NULL) OR ((amount_minor >= 1) AND (amount_minor <= '1000000000000'::bigint))));

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_check"
    CHECK ((((amount_minor IS NULL) AND (remaining_minor IS NULL) AND (total_paid_minor = 0)) OR (amount_minor = (total_paid_minor + remaining_minor))));

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_currency_check"
    CHECK ((currency = ANY (ARRAY['PHP'::text, 'USD'::text, 'EUR'::text, 'SGD'::text, 'AUD'::text, 'JPY'::text, 'GBP'::text])));

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_remaining_minor_check" CHECK (((remaining_minor IS NULL) OR (remaining_minor >= 0)));

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_total_paid_minor_check" CHECK ((total_paid_minor >= 0));

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_user_id_obligation_id_occurrence_key" UNIQUE (user_id, obligation_id, occurrence_key);

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_check" CHECK (((original_amount_minor IS NULL) OR (original_amount_minor = (total_paid_minor + remaining_minor))));

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_currency_check" CHECK ((currency = ANY (ARRAY['PHP'::text, 'USD'::text, 'EUR'::text, 'SGD'::text, 'AUD'::text, 'JPY'::text, 'GBP'::text])));

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_original_amount_minor_check"
    CHECK (((original_amount_minor IS NULL) OR ((original_amount_minor >= 1) AND (original_amount_minor <= '1000000000000'::bigint))));

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_user_id_obligation_id_fkey" FOREIGN KEY (user_id, obligation_id) REFERENCES public.tally_obligations(user_id, id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_remaining_minor_check" CHECK (((remaining_minor IS NULL) OR (remaining_minor >= 0)));

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_total_paid_minor_check" CHECK (((total_paid_minor IS NULL) OR (total_paid_minor >= 0)));

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_user_id_category_id_fkey" FOREIGN KEY (user_id, category_id) REFERENCES public.tally_categories(user_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_user_id_contact_id_fkey" FOREIGN KEY (user_id, contact_id) REFERENCES public.tally_contacts(user_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_payment_allocations"
  ADD CONSTRAINT "tally_payment_allocations_user_id_instance_id_fkey" FOREIGN KEY (user_id, instance_id) REFERENCES public.tally_obligation_instances(user_id, id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_user_id_payment_source_id_fkey" FOREIGN KEY (user_id, payment_source_id) REFERENCES public.tally_payment_sources(user_id, id) DEFERRABLE
    INITIALLY DEFERRED;

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_amount_minor_check" CHECK (((amount_minor >= 1) AND (amount_minor <= '1000000000000'::bigint)));

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_check" CHECK (((entry_type = 'reversal'::text) = (reverses_payment_id IS NOT NULL)));

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_currency_check" CHECK ((currency = ANY (ARRAY['PHP'::text, 'USD'::text, 'EUR'::text, 'SGD'::text, 'AUD'::text, 'JPY'::text, 'GBP'::text])));

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_entry_type_check" CHECK ((entry_type = ANY (ARRAY['payment'::text, 'reversal'::text])));

ALTER TABLE "public"."tally_payment_allocations"
  ADD CONSTRAINT "tally_payment_allocations_user_id_payment_id_fkey" FOREIGN KEY (user_id, payment_id) REFERENCES public.tally_payments(user_id, id) ON DELETE CASCADE DEFERRABLE
    INITIALLY DEFERRED;

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_user_id_obligation_id_fkey" FOREIGN KEY (user_id, obligation_id) REFERENCES public.tally_obligations(user_id, id) ON DELETE CASCADE DEFERRABLE
    INITIALLY DEFERRED;

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_user_id_reverses_payment_id_fkey" FOREIGN KEY (user_id, reverses_payment_id) REFERENCES public.tally_payments(user_id, id) DEFERRABLE
    INITIALLY DEFERRED;

ALTER TABLE "public"."tally_profiles"
  ADD CONSTRAINT "tally_profiles_account_status_check" CHECK ((account_status = ANY (ARRAY['active'::text, 'deleting'::text])));

ALTER TABLE "public"."tally_activities"
  ADD CONSTRAINT "tally_activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_attachments"
  ADD CONSTRAINT "tally_attachments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_categories"
  ADD CONSTRAINT "tally_categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_contacts"
  ADD CONSTRAINT "tally_contacts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_deduction_attempts"
  ADD CONSTRAINT "tally_deduction_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_deduction_events"
  ADD CONSTRAINT "tally_deduction_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_jobs"
  ADD CONSTRAINT "tally_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_ledger_state"
  ADD CONSTRAINT "tally_ledger_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_notification_devices"
  ADD CONSTRAINT "tally_notification_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_notification_preferences"
  ADD CONSTRAINT "tally_notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_obligation_instances"
  ADD CONSTRAINT "tally_obligation_instances_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_obligations"
  ADD CONSTRAINT "tally_obligations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_payment_evidence"
  ADD CONSTRAINT "tally_payment_evidence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_payment_reversals"
  ADD CONSTRAINT "tally_payment_reversals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_payment_sources"
  ADD CONSTRAINT "tally_payment_sources_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_payments"
  ADD CONSTRAINT "tally_payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_profiles"
  ADD CONSTRAINT "tally_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_reminders"
  ADD CONSTRAINT "tally_reminders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."tally_summaries"
  ADD CONSTRAINT "tally_summaries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "tally_private"."command_receipts"
  ADD CONSTRAINT "command_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.tally_profiles(user_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX tally_active_push_token ON public.tally_notification_devices USING btree (((DATA ->> 'tokenHash'::text)))
  WHERE (((DATA ->> 'active'::text) = 'true'::text) AND ((DATA ->> 'channel'::text) = 'push'::text) AND ((DATA ->> 'tokenHash'::text) IS NOT NULL));

CREATE INDEX tally_activity_date ON public.tally_activities USING btree (user_id, ((DATA ->> 'recordedAt'::text)) DESC, id DESC);

CREATE INDEX tally_allocation_period ON public.tally_payment_allocations USING btree (user_id, instance_id);

CREATE INDEX tally_attachment_target ON public.tally_attachments USING btree (user_id, ((DATA ->> 'targetType'::text)), ((DATA ->> 'targetId'::text)));

CREATE INDEX tally_jobs_ready ON public.tally_jobs USING btree (((DATA ->> 'status'::text)), ((DATA ->> 'nextRunAt'::text)));

CREATE INDEX tally_obligation_category ON public.tally_obligations USING btree (user_id, category_id);

CREATE INDEX tally_obligation_person ON public.tally_obligations USING btree (user_id, contact_id);

CREATE INDEX tally_obligation_section ON public.tally_obligations USING btree (user_id, ((DATA ->> 'section'::text)), ((DATA ->> 'archived'::text)));

CREATE INDEX tally_obligation_source ON public.tally_obligations USING btree (user_id, payment_source_id);

CREATE INDEX tally_payment_date ON public.tally_payments USING btree (user_id, ((DATA ->> 'paymentDate'::text)) DESC, id DESC);

CREATE INDEX tally_payment_parent ON public.tally_payments USING btree (user_id, obligation_id, ((DATA ->> 'paymentDate'::text)));

CREATE INDEX tally_period_due ON public.tally_obligation_instances USING btree (user_id, ((DATA ->> 'dueDate'::text)), id);

CREATE INDEX tally_period_month ON public.tally_obligation_instances
  USING btree (user_id, ((DATA ->> 'yearMonth'::text)), ((DATA ->> 'section'::text)), ((DATA ->> 'dueDate'::text)));

CREATE INDEX tally_period_parent ON public.tally_obligation_instances USING btree (user_id, obligation_id);

CREATE UNIQUE INDEX tally_single_reversal ON public.tally_payments USING btree (user_id, reverses_payment_id)
  WHERE (reverses_payment_id IS NOT NULL);

CREATE TRIGGER immutable_deduction_events
  BEFORE UPDATE ON public.tally_deduction_events
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.immutable_history();

CREATE CONSTRAINT TRIGGER verify_period_ledger
  AFTER INSERT OR UPDATE ON public.tally_obligation_instances DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.check_period_ledger();

CREATE CONSTRAINT TRIGGER verify_parent_ledger
  AFTER INSERT OR UPDATE ON public.tally_obligations DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.check_parent_ledger();

CREATE TRIGGER immutable_allocations
  BEFORE UPDATE ON public.tally_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.immutable_history();

CREATE TRIGGER immutable_evidence
  BEFORE UPDATE ON public.tally_payment_evidence
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.immutable_history();

CREATE TRIGGER append_payment_allocations
  AFTER INSERT ON public.tally_payments
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.append_allocations();

CREATE TRIGGER immutable_payments
  BEFORE UPDATE ON public.tally_payments
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.immutable_history();

CREATE CONSTRAINT TRIGGER verify_payment_ledger
  AFTER INSERT ON public.tally_payments DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION tally_private.check_payment_ledger();

CREATE POLICY "owner_read" ON "public"."tally_activities"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_attachments"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_categories"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_contacts"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_deduction_attempts"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_deduction_events"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_ledger_state"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_notification_devices"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_notification_preferences"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_obligation_instances"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_obligations"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_payment_allocations"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_payment_evidence"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_payment_reversals"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_payment_sources"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_payments"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_profiles"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_reminders"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "owner_read" ON "public"."tally_summaries"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT tally_private.active_owner() AS active_owner)));

CREATE POLICY "tally_private_files" ON "storage"."objects"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING ((bucket_id <> 'tally-attachments'::text))
  WITH CHECK ((bucket_id <> 'tally-attachments'::text));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_activities";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_attachments";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_categories";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_contacts";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_deduction_attempts";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_ledger_state";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_notification_preferences";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_obligation_instances";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_obligations";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_payment_evidence";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_payment_sources";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_payments";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_profiles";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_reminders";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tally_summaries";

REVOKE ALL ON FUNCTION "public"."tally_bootstrap"(uuid, text, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_bootstrap"(uuid, text, text, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_bootstrap"(uuid, text, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_claim_deletions"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_claim_deletions"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_claim_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_claim_jobs"(text[], integer, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_claim_jobs"(text[], integer, timestamp WITH time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_claim_jobs"(text[], integer, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_command_receipt"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_command_receipt"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_command_receipt"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_commit_command"(uuid, text, text, text, bigint, jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_commit_command"(uuid, text, text, text, bigint, jsonb, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_commit_command"(uuid, text, text, text, bigint, jsonb, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_deletion_status"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_deletion_status"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_deletion_status"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_finish_deletion"(uuid, uuid, boolean, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_finish_deletion"(uuid, uuid, boolean, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_finish_deletion"(uuid, uuid, boolean, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."tally_read_page"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."tally_read_page"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_read_page"(text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."tally_request_deletion"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_request_deletion"(uuid, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_request_deletion"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tally_session_active"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_session_active"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tally_session_active"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."active_owner"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."active_owner"() TO "authenticated";

REVOKE ALL ON FUNCTION "tally_private"."append_allocations"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."assert_parent_ledger"(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."assert_period_ledger"(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."bootstrap"(uuid, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."bootstrap"(uuid, text, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."check_parent_ledger"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."check_payment_ledger"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."check_period_ledger"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."claim_deletions"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."claim_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."claim_jobs"(text[], integer, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."claim_jobs"(text[], integer, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."commit_command"(uuid, text, text, text, bigint, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."commit_command"(uuid, text, text, text, bigint, jsonb, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."enqueue_worker"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."finish_deletion"(uuid, uuid, boolean, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."finish_deletion"(uuid, uuid, boolean, integer) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."immutable_history"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."query_value"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."query_value"(text, jsonb) TO "authenticated", "service_role";

REVOKE ALL ON FUNCTION "tally_private"."request_deletion"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."request_deletion"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."resolve_audit"(jsonb, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "tally_private"."session_active"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."session_active"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "tally_private"."table_name"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "tally_private"."table_name"(text) TO "authenticated", "service_role";

GRANT USAGE ON SCHEMA "tally_private" TO "authenticated", "service_role";

REVOKE ALL ON TABLE "public"."tally_activities" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_activities" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_activities" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_activities" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_activities" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_attachments" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_attachments" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_attachments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_attachments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_attachments" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_categories" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_categories" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_categories" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_categories" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_categories" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_contacts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_contacts" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_contacts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_contacts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_contacts" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_deduction_attempts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_deduction_attempts" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_deduction_attempts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_deduction_attempts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_deduction_attempts" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_deduction_events" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_deduction_events" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_deduction_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_deduction_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_deduction_events" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_jobs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_jobs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_jobs" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_ledger_state" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_ledger_state" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_ledger_state" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_ledger_state" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_ledger_state" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_notification_devices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_notification_devices" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_notification_devices" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_notification_preferences" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_notification_preferences" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_notification_preferences" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_notification_preferences" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_notification_preferences" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_obligation_instances" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_obligation_instances" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_obligation_instances" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_obligation_instances" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_obligation_instances" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_obligations" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_obligations" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_obligations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_obligations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_obligations" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_payment_allocations" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_payment_allocations" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_payment_allocations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_allocations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_allocations" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_payment_evidence" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_payment_evidence" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_payment_evidence" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_evidence" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_evidence" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_payment_reversals" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_payment_reversals" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_payment_reversals" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_reversals" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_reversals" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_payment_sources" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_payment_sources" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_payment_sources" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_sources" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payment_sources" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_payments" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_payments" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_payments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_payments" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_profiles" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_reminders" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_reminders" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_reminders" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_reminders" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_reminders" TO "service_role";

REVOKE ALL ON TABLE "public"."tally_summaries" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tally_summaries" TO "authenticated";

REVOKE ALL ON TABLE "public"."tally_summaries" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_summaries" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tally_summaries" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "tally_private"."command_receipts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "tally_private"."deletion_jobs" TO "service_role";
