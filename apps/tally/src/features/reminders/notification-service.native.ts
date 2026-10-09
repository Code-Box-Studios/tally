import * as Notifications from "expo-notifications";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { privateStore } from "../../core/storage";
import type { TallyRepository } from "../../core/backend/repository";
import { object, type Row, type Data } from "../../core/domain/records";
import { readOwnedDevice } from "./device-record";
import { selectLocalAlerts } from "./local-alerts";
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
  for (const key of await privateStore.keys(repo.prefix + "local-alert:")) {
    const id = await privateStore.get(key);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
    await privateStore.remove(key);
  }
  repo.check();
}
export async function scheduleLocalReminders(
  repo: TallyRepository,
  reminders: Row[],
  policy: Data,
) {
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
      const id = await privateStore.get(key);
      if (id) await Notifications.cancelScheduledNotificationAsync(id);
      await privateStore.remove(key);
    }
  }
  for (const item of next) {
    repo.check();
    const key = repo.prefix + "local-alert:" + item.id;
    if (await privateStore.get(key)) continue;
    const id = await Notifications.scheduleNotificationAsync({
      identifier: repo.owner + ":" + item.id,
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
    try {
      repo.check();
      await privateStore.set(key, id);
      repo.check();
    } catch (e) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await privateStore.remove(key);
      throw e;
    }
  }
}
