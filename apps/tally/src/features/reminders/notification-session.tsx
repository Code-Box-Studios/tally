import { useEffect } from "react";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import { scheduleLocalReminders } from "./notification-service";
export function NotificationSession() {
  const { repo, trusted } = useSession(),
    reminders = useRecords("reminders"),
    preferences = useRecords("notificationPreferences");
  useEffect(() => {
    if (!trusted || !repo || !reminders.data || !preferences.data) return;
    const policy = preferences.data.rows.find((r) => r.id === "default");
    if (policy)
      void scheduleLocalReminders(repo, reminders.data.rows, policy.data).catch(
        () => {},
      );
  }, [repo, trusted, reminders.data, preferences.data]);
  return null;
}
