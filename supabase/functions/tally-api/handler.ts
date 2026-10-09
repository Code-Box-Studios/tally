import { createClient, type User } from "@supabase/supabase-js";
import { CommandDatabase } from "./shared/database.ts";
import { databaseError, HttpsError } from "./shared/errors.ts";
import { exactObject } from "./shared/callable.ts";
import { executeMetadataCommand } from "./shared/commands.ts";
import {
  cancelObligation,
  createObligation,
  editObligation,
} from "./obligations/obligation_service.ts";
import {
  cancelInstallment,
  createInstallment,
  editInstallment,
} from "./obligations/installment_service.ts";
import {
  recordInstallmentPayment,
  recordPayment,
} from "./payments/payment_service.ts";
import { correctPayment } from "./payments/corrections.ts";
import {
  changeRecurringLifecycle,
  createRecurring,
  editRecurring,
} from "./recurring/recurring_service.ts";
import {
  editRecurringInstance,
  setRecurringAmount,
  skipRecurringInstance,
} from "./recurring/instance_service.ts";
import {
  confirmDeduction,
  reportDeductionFailure,
} from "./recurring/automatic_service.ts";
import { saveCatalog } from "./catalog/catalog.ts";
import {
  setObligationReminder,
  updateNotificationPreferences,
} from "./notifications/preference_service.ts";
import { defaultNotificationPolicy } from "./notifications/policy.ts";
import { validateProfileUpdate } from "./accounts/profile.ts";
import { stageProjectionMutation } from "./jobs/projection_jobs.ts";
import { stageReminderReconciliation } from "./notifications/reconciliation_job.ts";

import { repairFiniteDebt } from "./dashboard/repair.ts";
import { markReminderRead } from "./notifications/inbox_service.ts";

import {
  downloadAttachment,
  removeAttachment,
  reserveAttachment,
  uploadAttachment,
} from "./attachments/service.ts";

import {
  getAccountDeletionStatus,
  requestAccountDeletion,
} from "./accounts/deletion.ts";

import {
  listNotificationDevices,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from "./notifications/device_service.ts";

const commands: Record<
  string,
  (uid: string, input: unknown, db: CommandDatabase) => Promise<unknown>
> = {
  repairFiniteDebt,
  createObligation,
  editObligation,
  cancelObligation,
  createInstallment,
  editInstallment,
  cancelInstallment,
  recordPayment,
  recordInstallmentPayment,
  correctPayment,
  createRecurring,
  editRecurring,
  changeRecurringLifecycle,
  setRecurringAmount,
  editRecurringInstance,
  skipRecurringInstance,
  confirmDeduction,
  reportDeductionFailure,
  saveCatalog,
  updateNotificationPreferences,
  setObligationReminder,
  markReminderRead,
  reserveAttachment,
  uploadAttachment,
  downloadAttachment,
  removeAttachment,
  registerNotificationDevice,
  unregisterNotificationDevice,
  listNotificationDevices,
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function serverDatabase(): CommandDatabase {
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new HttpsError("unavailable", "Backend configuration unavailable.");
  }
  return new CommandDatabase(
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    }),
  );
}
export async function dispatch(
  uid: string,
  name: string,
  input: unknown,
  db: CommandDatabase,
  identity: User,
  sessionId: string,
): Promise<unknown> {
  if (name === "requestAccountDeletion") {
    return requestAccountDeletion(uid, input, db, sessionId);
  }
  if (name === "getAccountDeletionStatus") {
    return getAccountDeletionStatus(uid, input, db);
  }
  if (name === "bootstrapUser") {
    exactObject(input, []);
    const { data, error } = await db.client.rpc("tally_bootstrap", {
      owner_id: uid,
      display_name: typeof identity.user_metadata?.full_name === "string"
        ? identity.user_metadata.full_name
        : "",
      photo_url: typeof identity.user_metadata?.avatar_url === "string"
        ? identity.user_metadata.avatar_url
        : null,
      notification_policy: defaultNotificationPolicy(),
    });
    if (error) throw databaseError(error);
    return { profile: data };
  }
  if (name === "updateProfile") {
    const values = validateProfileUpdate(input);
    const { commandId, expectedOwnerUid, ...payload } = values;
    const profile = await executeMetadataCommand(
      uid,
      { commandId, expectedOwnerUid, payload },
      name,
      (body) => body as typeof payload,
      async (context) => {
        const current = context.profile;
        if (
          current.revision !== payload.expectedRevision
        ) throw new HttpsError("aborted", "Preferences changed.");
        if (
          current.onboardingComplete && !payload.onboardingComplete
        ) throw new HttpsError("failed-precondition", "Setup is complete.");
        const { expectedRevision, ...changes } = payload;
        const next = { ...current, ...changes, revision: current.revision + 1 };
        context.update("profiles", uid, next);
        const ledger = await context.read("ledgerState", "current");
        // Project the new preference revision under the same owner epoch.
        Object.assign(context.profile, next);
        await stageProjectionMutation(context, ledger.revision, new Date());
        await stageReminderReconciliation(context);
        return next;
      },
      db,
    );
    return { profile };
  }
  if (name === "refreshDashboard") {
    return executeMetadataCommand(uid, input, name, (body) => {
      exactObject(body, []);
      return {};
    }, async (context) => {
      const ledger = await context.read("ledgerState", "current");
      await stageProjectionMutation(context, ledger.revision, new Date());
      return { accepted: true };
    }, db);
  }
  const command = Object.hasOwn(commands, name) ? commands[name] : null;
  if (!command) throw new HttpsError("not-found", "Unsupported action.");
  return command(uid, input, db);
}

export async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return Response.json({ error: { code: "invalid-argument" } }, {
      status: 405,
      headers: cors,
    });
  }
  try {
    // Bound buffered financial/file envelopes before parsing. The file endpoint
    // has an additional decoded byte bound and signature validation.
    const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    if (!reader) throw new HttpsError("invalid-argument", "Missing request.");
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new HttpsError("resource-exhausted", "Request too large.");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (bytes.byteLength > 16 * 1024 * 1024) {
      throw new HttpsError("resource-exhausted", "Request too large.");
    }
    const db = serverDatabase();
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) {
      throw new HttpsError("unauthenticated", "Please sign in.");
    }
    const { data: { user }, error } = await db.client.auth.getUser(
      bearer.slice(7),
    );
    if (error || !user || user.is_anonymous) {
      throw new HttpsError("unauthenticated", "Please sign in.");
    }
    // getUser verifies the signature and subject. Check the live session as well:
    // Supabase session revocation alone does not invalidate an existing JWT.
    const claims = JSON.parse(
      atob(
        bearer.slice(7).split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"),
      ),
    );
    if (typeof claims.session_id !== "string") {
      throw new HttpsError("unauthenticated", "Please sign in.");
    }
    const active = await db.client.rpc("tally_session_active", {
      owner_id: user.id,
      session_id: claims.session_id,
    });
    if (active.error) throw databaseError(active.error);
    if (active.data !== true) {
      throw new HttpsError("unauthenticated", "Please sign in again.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new HttpsError("invalid-argument", "Invalid request.");
    }
    const envelope = exactObject(parsed, ["name", "input"]);
    if (typeof envelope.name !== "string") {
      throw new HttpsError("invalid-argument", "Invalid action.");
    }
    const result = await dispatch(
      user.id,
      envelope.name,
      envelope.input,
      db,
      user,
      claims.session_id,
    );
    return Response.json({ result }, { headers: cors });
  } catch (error) {
    const safe = error instanceof HttpsError
      ? error
      : new HttpsError("internal", "Action unavailable.");
    const status = safe.code === "unauthenticated"
      ? 401
      : safe.code === "permission-denied"
      ? 403
      : safe.code === "aborted" || safe.code === "already-exists"
      ? 409
      : safe.code === "internal" || safe.code === "unavailable"
      ? 503
      : 400;
    return Response.json({
      error: { code: safe.code, message: safe.message, details: safe.details },
    }, { status, headers: cors });
  }
}
