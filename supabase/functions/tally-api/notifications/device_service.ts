import { CommandDatabase, tables } from "../shared/database.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { Instant, type RecordData } from "../shared/runtime.ts";
import { exactObject } from "../shared/callable.ts";
import { databaseError, HttpsError } from "../shared/errors.ts";
import { identifier, revision } from "../shared/validation.ts";
import {
  deviceView,
  notificationTokenHash,
  readNotificationDevice,
  validateDeviceRegistration,
} from "./device_validation.ts";
export async function registerNotificationDevice(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(
    uid,
    input,
    "registerNotificationDevice",
    validateDeviceRegistration,
    async (context, payload) => {
      const previous = await context.maybeRead(
        "notificationDevices",
        payload.installationId,
      );
      if (previous) {
        readNotificationDevice(uid, payload.installationId, previous);
      }
      if (
        (previous?.revision ?? 0) !== payload.expectedRevision
      ) throw new HttpsError("aborted", "This device changed.");
      const tokenHash = payload.token === null
        ? null
        : notificationTokenHash(payload.token);
      const changed = previous?.tokenHash !== tokenHash ||
        previous?.active !== true;
      const { expectedRevision, ...terms } = payload;
      const record = {
        ...terms,
        userId: uid,
        schemaVersion: 1,
        tokenHash,
        tokenGeneration: (previous?.tokenGeneration ?? 0) + (changed ? 1 : 0) ||
          1,
        bindingGeneration: tokenHash === null
          ? null
          : (previous?.bindingGeneration ?? 0) + 1,
        active: payload.channel !== "none" &&
          ["granted", "provisional"].includes(payload.permission),
        revision: (previous?.revision ?? 0) + 1,
        lastSeenAt: Instant.fromMillis(Date.now()),
      };
      if (previous) {
        context.update(
          "notificationDevices",
          payload.installationId,
          record,
        );
      } else {context.create(
          "notificationDevices",
          payload.installationId,
          record,
        );}
      return { device: deviceView(uid, record) };
    },
    db,
  );
}
export async function unregisterNotificationDevice(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(
    uid,
    input,
    "unregisterNotificationDevice",
    (value) => {
      const raw = exactObject(value, ["installationId", "expectedRevision"]);
      return {
        installationId: identifier(raw.installationId),
        expectedRevision: revision(raw.expectedRevision),
      };
    },
    async (context, payload) => {
      const previous = readNotificationDevice(
        uid,
        payload.installationId,
        await context.read("notificationDevices", payload.installationId),
      );
      if (previous.revision !== payload.expectedRevision) {
        throw new HttpsError(
          "aborted",
          "This device changed.",
        );
      }
      const record = {
        ...previous,
        active: false,
        channel: "none",
        revision: previous.revision + 1,
        lastSeenAt: Instant.fromMillis(Date.now()),
      };
      context.update("notificationDevices", payload.installationId, {
        active: false,
        channel: "none",
        revision: record.revision,
        lastSeenAt: record.lastSeenAt,
      });
      return { device: deviceView(uid, record) };
    },
    db,
  );
}
export async function listNotificationDevices(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  const envelope = exactObject(input, [
    "commandId",
    "expectedOwnerUid",
    "payload",
  ]);
  identifier(envelope.commandId);
  if (identifier(envelope.expectedOwnerUid) !== uid) {
    throw new HttpsError("permission-denied", "Your sign-in changed.");
  }
  const raw = exactObject(envelope.payload, ["limit", "after"]);
  if (
    !Number.isInteger(raw.limit) || (raw.limit as number) < 1 ||
    (raw.limit as number) > 50
  ) throw new HttpsError("invalid-argument", "Choose a bounded device page.");
  const after = raw.after === null ? null : identifier(raw.after);
  await db.profile(uid);
  let query = db.client.from(tables.notificationDevices!).select("id,data").eq(
    "user_id",
    uid,
  ).order("id").limit((raw.limit as number) + 1);
  if (after) query = query.gt("id", after);
  const { data, error } = await query;
  if (error) throw databaseError(error);
  await db.profile(uid);
  const items = data.slice(0, raw.limit as number);
  const { persisted } = await import("../shared/runtime.ts");
  return {
    devices: items.map((row) =>
      deviceView(
        uid,
        readNotificationDevice(uid, row.id, persisted(row.data) as RecordData),
      )
    ),
    nextCursor: data.length > (raw.limit as number) ? items.at(-1)!.id : null,
  };
}
