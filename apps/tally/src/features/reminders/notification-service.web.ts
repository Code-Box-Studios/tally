import type { TallyRepository } from "../../core/backend/repository";
import type { Row, Data } from "../../core/domain/records";
export async function enableNotifications(
  _repo: TallyRepository,
  _push: boolean,
): Promise<string> {
  throw new Error(
    "Use in-app reminders on web. Native device notifications are configured in the iOS/Android app.",
  );
}
export async function clearNotifications(_repo: TallyRepository) {}
export async function scheduleLocalReminders(
  _repo: TallyRepository,
  _instances: Row[],
  _policy: Data,
) {}
