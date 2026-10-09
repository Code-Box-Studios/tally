import { text, type Row, type Data } from "../../core/domain/records";
/** Native delivery mirrors the server's validated timezone and quiet-hour plans. */
export function selectLocalAlerts(
  reminders: Row[],
  policy: Data,
  now = Date.now(),
) {
  if (policy.enabled !== true || policy.localEnabled !== true) return [];
  const kinds = Array.isArray(policy.enabledKinds) ? policy.enabledKinds : [];
  return reminders
    .filter(
      (r) =>
        r.data.status !== "cancelled" && kinds.includes(text(r.data, "kind")),
    )
    .map((r) => ({
      id: r.id,
      at: new Date(text(r.data, "scheduledAt")),
      obligationId: text(r.data, "obligationId"),
    }))
    .filter((r) => Number.isFinite(r.at.getTime()) && r.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 32);
}
