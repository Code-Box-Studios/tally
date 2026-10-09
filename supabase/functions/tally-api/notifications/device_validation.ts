import { createHash } from "node:crypto";
import { Instant, type RecordData } from "../shared/runtime.ts";
import { exactObject } from "../shared/callable.ts";
import {
  enumValue,
  identifier,
  invalid,
  revision,
} from "../shared/validation.ts";
import { owned, reminderRecovery } from "./context.ts";
import { isExpoPushToken } from "./expo_push_transport.ts";

export const notificationPlatforms = ["android", "ios", "web"] as const;
export const notificationPermissions = [
  "granted",
  "provisional",
  "denied",
  "notDetermined",
  "unsupported",
] as const;
export const notificationChannels = ["push", "local", "none"] as const;
export interface DeviceRegistration {
  installationId: string;
  platform: typeof notificationPlatforms[number];
  token: string | null;
  permission: typeof notificationPermissions[number];
  channel: typeof notificationChannels[number];
  appVersion: string;
  expectedRevision: number;
}
export interface NotificationDeviceView {
  userId: string;
  schemaVersion: 1;
  installationId: string;
  platform: typeof notificationPlatforms[number];
  permission: typeof notificationPermissions[number];
  channel: typeof notificationChannels[number];
  appVersion: string;
  active: boolean;
  revision: number;
  lastSeenAt: string;
}
export function notificationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function notificationToken(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" || value.length < 20 || value.length > 4096 ||
    (!/^[A-Za-z0-9:_.-]+$/.test(value) && !isExpoPushToken(value))
  ) {
    return invalid("Check the notification registration.");
  }
  return value;
}
export function validateDeviceRegistration(input: unknown): DeviceRegistration {
  const raw = exactObject(input, [
    "installationId",
    "platform",
    "token",
    "permission",
    "channel",
    "appVersion",
    "expectedRevision",
  ]);
  const platform = enumValue(raw.platform, notificationPlatforms),
    permission = enumValue(raw.permission, notificationPermissions),
    channel = enumValue(raw.channel, notificationChannels);
  const token = notificationToken(raw.token), version = raw.appVersion;
  if (
    typeof version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/.test(version) ||
    !Number.isSafeInteger(raw.expectedRevision) ||
    (raw.expectedRevision as number) < 0 ||
    (raw.expectedRevision as number) >= Number.MAX_SAFE_INTEGER
  ) {
    return invalid("Check the device version and registration.");
  }
  if (
    (channel !== "none" && !["granted", "provisional"].includes(permission)) ||
    (channel === "push" && token === null) ||
    (channel === "local" && platform === "web") ||
    (permission === "provisional" && platform !== "ios")
  ) return invalid("Choose a supported notification channel.");
  return {
    installationId: identifier(raw.installationId),
    platform,
    token,
    permission,
    channel,
    appVersion: version,
    expectedRevision: raw.expectedRevision as number,
  };
}
export function deviceView(
  uid: string,
  data: RecordData,
): NotificationDeviceView {
  owned(uid, data);
  if (
    typeof data.active !== "boolean" || !(data.lastSeenAt instanceof Instant) ||
    typeof data.appVersion !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/.test(data.appVersion)
  ) return reminderRecovery();
  return {
    userId: uid,
    schemaVersion: 1,
    installationId: identifier(data.installationId),
    platform: enumValue(data.platform, notificationPlatforms),
    permission: enumValue(data.permission, notificationPermissions),
    channel: enumValue(data.channel, notificationChannels),
    appVersion: data.appVersion,
    active: data.active,
    revision: revision(data.revision),
    lastSeenAt: data.lastSeenAt.toDate().toISOString(),
  };
}
export function readNotificationDevice(
  uid: string,
  id: string,
  data: RecordData,
): RecordData {
  const view = deviceView(uid, data);
  if (
    view.installationId !== id || !Number.isSafeInteger(data.tokenGeneration) ||
    data.tokenGeneration < 1 || data.tokenGeneration >= Number.MAX_SAFE_INTEGER
  ) return reminderRecovery();
  const token = notificationToken(data.token);
  if (
    token === null
      ? data.tokenHash !== null
      : data.tokenHash !== notificationTokenHash(token)
  ) return reminderRecovery();
  if (token !== null) revision(data.bindingGeneration);
  return data;
}
export function readNotificationBinding(
  hash: string,
  data: RecordData,
): RecordData {
  if (
    data.schemaVersion !== 1 || data.tokenHash !== hash ||
    typeof data.active !== "boolean"
  ) return reminderRecovery();
  identifier(data.userId);
  identifier(data.installationId);
  revision(data.generation);
  revision(data.tokenGeneration);
  return data;
}
export function bindingMatches(
  binding: RecordData | undefined,
  uid: string,
  installationId: string,
  generation: number,
  tokenGeneration: number,
): boolean {
  return !!binding && binding.userId === uid &&
    binding.installationId === installationId &&
    binding.generation === generation &&
    binding.tokenGeneration === tokenGeneration;
}
