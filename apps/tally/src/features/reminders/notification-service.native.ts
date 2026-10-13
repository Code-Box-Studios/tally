import * as Notifications from "expo-notifications";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { privateStore } from "../../core/storage";
import type { TallyRepository } from "../../core/backend/repository";
import { object, type Row, type Data } from "../../core/domain/records";
import { readOwnedDevice } from "./device-record";
import { selectLocalAlerts } from "./local-alerts";
const localWork = new Map<string, Promise<void>>();
function withLocalNotifications(prefix: string, work: () => Promise<void>) {
  const next = (localWork.get(prefix) ?? Promise.resolve())
    .catch(() => {})
    .then(work);
  localWork.set(prefix, next);
  const finished = () => {
    if (localWork.get(prefix) === next) localWork.delete(prefix);
  };
  void next.then(finished, finished);
  return next;
}
function savedAlert(raw: string | null) {
  if (!raw) return null;
  try {
    const value = object(JSON.parse(raw));
    if (
      typeof value.id !== "string" ||
      (value.fingerprint !== null && typeof value.fingerprint !== "string")
    )
      throw new Error("Local reminders need recovery.");
    return { id: value.id, fingerprint: value.fingerprint };
  } catch (error) {
    // Earlier versions saved the OS identifier without a schedule fingerprint.
    if (raw.startsWith("{")) throw error;
    return { id: raw, fingerprint: null };
  }
}
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
export async function enableNotifications(
  repo: TallyRepository,
  push: boolean,
) {
  repo.check();
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("tally-reminders", {
      name: "Payment reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permission = await Notifications.requestPermissionsAsync();
  repo.check();
  const granted =
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted)
    throw new Error(
      "Notifications are off in device settings. In-app reminders still work.",
    );
  const installationKey = repo.namespace + ":installation";
  let installationId = await privateStore.get(installationKey);
  if (!installationId) {
    installationId = Crypto.randomUUID();
    await privateStore.set(installationKey, installationId);
  }
  const manifest = await readOwnedDevice(repo, installationId);
  let token: string | null = null;
  const projectId =
    Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (push) {
    if (!projectId)
      throw new Error(
        "Link Tally to EAS and configure APNs/FCM before enabling push. Local reminders are available now.",
      );
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }
  repo.check();
  // Keep ownership and installation identity before dispatch. A server commit
  // with a lost response must still be discoverable during logout cleanup.
  await privateStore.set(
    repo.prefix + "notification-device",
    JSON.stringify({
      userId: repo.owner,
      installationId,
      revision: manifest?.revision ?? 0,
    }),
  );
  repo.check();
  const response = await repo.command(
    "registerNotificationDevice",
    {
      installationId,
      platform: Platform.OS,
      token,
      permission: permission.granted ? "granted" : "provisional",
      channel: push ? "push" : "local",
      appVersion: Constants.expoConfig?.version ?? "0.2.0",
      expectedRevision: manifest?.revision ?? 0,
    },
    Crypto.randomUUID(),
  );
  const device = object(response.device);
  if (device.userId !== repo.owner || device.installationId !== installationId)
    throw new Error("Notification registration could not be verified.");
  await privateStore.set(
    repo.prefix + "notification-device",
    JSON.stringify(device),
  );
  repo.check();
  return push ? "Push enabled." : "Local reminders enabled.";
}
export async function clearNotifications(repo: TallyRepository) {
  repo.check();
  const raw = await privateStore.get(repo.prefix + "notification-device");
  if (raw) {
    const device = object(JSON.parse(raw));
    if (device.userId !== repo.owner)
      throw new Error("Notification owner changed.");
    const current = await readOwnedDevice(repo, String(device.installationId));
    if (current?.active === true)
      await repo.command(
        "unregisterNotificationDevice",
        {
          installationId: current.installationId,
          expectedRevision: current.revision,
        },
        Crypto.randomUUID(),
      );
    await privateStore.remove(repo.prefix + "notification-device");
  }
  await clearLocalNotifications(repo.prefix);
  repo.check();
}
async function cancelLocalNotification(key: string, id: string) {
  // Mark the schedule uncertain before cancelling. If removal is interrupted,
  // reconciliation must not mistake the old fingerprint for a live OS alert.
  await privateStore.set(key, JSON.stringify({ id, fingerprint: null }));
  await Notifications.cancelScheduledNotificationAsync(id);
}
async function removeLocalNotifications(prefix: string) {
  for (const key of await privateStore.keys(prefix + "local-alert:")) {
    const saved = savedAlert(await privateStore.get(key));
    if (saved) await cancelLocalNotification(key, saved.id);
    await privateStore.remove(key);
  }
}
export function clearLocalNotifications(prefix: string) {
  return withLocalNotifications(prefix, () => removeLocalNotifications(prefix));
}
export async function clearInactiveLocalNotifications(
  namespace: string,
  currentOwner: () => string | null | undefined,
) {
  const owners = new Set<string>();
  for (const key of await privateStore.keys(namespace + ":")) {
    const relative = key.slice(namespace.length + 1),
      separator = relative.indexOf(":");
    if (
      separator > 0 &&
      relative.slice(separator + 1).startsWith("local-alert:")
    )
      owners.add(relative.slice(0, separator));
  }
  for (const owner of owners) {
    const prefix = `${namespace}:${owner}:`;
    await withLocalNotifications(prefix, async () => {
      // Check again after earlier schedules finish. A rapid account switch may
      // have made this owner active while recovery waited for the OS.
      const activeOwner = currentOwner();
      if (activeOwner !== undefined && owner !== activeOwner)
        await removeLocalNotifications(prefix);
    });
  }
}
export async function scheduleLocalReminders(
  repo: TallyRepository,
  reminders: Row[],
  policy: Data,
) {
  return withLocalNotifications(repo.prefix, () =>
    reconcileLocalReminders(repo, reminders, policy),
  );
}
async function reconcileLocalReminders(
  repo: TallyRepository,
  reminders: Row[],
  policy: Data,
) {
  repo.check();
  // Accepted cleanup keeps this marker until local sign-out finishes. Pending
  // deletion also suspends alerts while its server response is uncertain.
  if (await privateStore.get(repo.prefix + "deletion")) {
    await removeLocalNotifications(repo.prefix);
    return;
  }
  repo.check();
  const permission = await Notifications.getPermissionsAsync();
  repo.check();
  const allowed =
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const next = allowed ? selectLocalAlerts(reminders, policy) : [],
    keys = await privateStore.keys(repo.prefix + "local-alert:");
  for (const key of keys) {
    repo.check();
    if (!next.some((p) => key === repo.prefix + "local-alert:" + p.id)) {
      const saved = savedAlert(await privateStore.get(key));
      if (saved) await cancelLocalNotification(key, saved.id);
      await privateStore.remove(key);
    }
  }
  for (const item of next) {
    repo.check();
    const key = repo.prefix + "local-alert:" + item.id,
      fingerprint = JSON.stringify([item.at.toISOString(), item.obligationId]),
      saved = savedAlert(await privateStore.get(key));
    if (saved?.fingerprint === fingerprint) continue;
    if (saved) await cancelLocalNotification(key, saved.id);
    let id = key;
    try {
      // Persist the deterministic identifier before scheduling so a process
      // interruption still leaves enough evidence to cancel or retry the alert.
      await privateStore.set(key, JSON.stringify({ id, fingerprint: null }));
      repo.check();
      id = await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: "Tally",
          body: "You have a payment reminder. Open Tally to review it.",
          data: { obligationId: item.obligationId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.at,
          channelId: "tally-reminders",
        },
      });
      repo.check();
      await privateStore.set(key, JSON.stringify({ id, fingerprint }));
      repo.check();
    } catch (e) {
      await cancelLocalNotification(key, id);
      await privateStore.remove(key);
      throw e;
    }
  }
}
