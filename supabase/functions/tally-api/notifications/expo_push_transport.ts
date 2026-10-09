import type { PushOutcome } from "./push_transport.ts";
export interface ExpoTicket {
  outcome: PushOutcome;
  ticketId?: string;
}
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" &&
    /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{20,200}\]$/.test(token);
}
export function expoPushOutcome(status: number, body: unknown): ExpoTicket {
  const raw = body as {
    data?: { status?: string; id?: string; details?: { error?: string } };
  };
  if (status < 200 || status >= 300) return { outcome: "retry" };
  if (
    raw?.data?.status === "ok" && typeof raw.data.id === "string" &&
    raw.data.id.length > 0 && raw.data.id.length < 200
  ) return { outcome: "accepted", ticketId: raw.data.id };
  if (
    raw?.data?.status === "error" &&
    raw.data.details?.error === "DeviceNotRegistered"
  ) return { outcome: "invalidToken" };
  return { outcome: "retry" };
}
export function expoPushConfigured() {
  return Deno.env.get("TALLY_EXPO_PUSH_ENABLED") === "true";
}
function headers(accessToken: string) {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
  };
}
export async function sendExpoPush(
  token: string,
  reminderId: string,
  obligationId: string,
  instanceId: string,
  expiresAt: number,
  accessToken = Deno.env.get("TALLY_EXPO_ACCESS_TOKEN") ?? "",
): Promise<ExpoTicket> {
  if (!isExpoPushToken(token) || expiresAt <= Date.now()) {
    return { outcome: "retry" };
  }
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: headers(accessToken),
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      to: token,
      title: "Tally",
      body: "You have a payment reminder. Open Tally to review it.",
      sound: "default",
      ttl: Math.min(86400, Math.floor((expiresAt - Date.now()) / 1000)),
      collapseId: reminderId,
      data: { reminderId, obligationId, instanceId },
    }),
  });
  return expoPushOutcome(response.status, await response.json());
}
export async function expoReceipt(
  ticketId: string,
  accessToken = Deno.env.get("TALLY_EXPO_ACCESS_TOKEN") ?? "",
): Promise<PushOutcome | null> {
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: headers(accessToken),
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ ids: [ticketId] }),
  });
  if (!response.ok) return "retry";
  const body = await response.json(), receipt = body?.data?.[ticketId];
  if (!receipt) return null;
  if (receipt.status === "ok") return "accepted";
  if (
    receipt.status === "error" &&
    receipt.details?.error === "DeviceNotRegistered"
  ) return "invalidToken";
  return "retry";
}
