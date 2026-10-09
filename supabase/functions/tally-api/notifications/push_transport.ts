import { createHash } from "node:crypto";
import { HttpsError } from "../shared/errors.ts";

export type PushOutcome = "accepted" | "invalidToken" | "retry";
export function pushOutcome(status: number, body: unknown): PushOutcome {
  const value = body as
    | { name?: unknown; error?: { details?: unknown[] } }
    | null;
  if (status >= 200 && status < 300 && typeof value?.name === "string") {
    return "accepted";
  }
  if (
    value?.error?.details?.some((detail) => {
      const item = detail as Record<string, unknown> | null;
      return item?.["@type"] ===
          "type.googleapis.com/google.firebase.fcm.v1.FcmError" &&
        item.errorCode === "UNREGISTERED";
    })
  ) return "invalidToken";
  return "retry";
}
interface Credentials {
  project_id: string;
  client_email: string;
  private_key: string;
}
let cached: { key: string; token: string; expires: number } | undefined;
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-")
    .replace(/\//g, "_");
const json = (value: unknown) =>
  encode(new TextEncoder().encode(JSON.stringify(value)));
export function pushConfigured(): boolean {
  return !!Deno.env.get("TALLY_FCM_SERVICE_ACCOUNT_JSON");
}
async function authorization(credentials: Credentials): Promise<string> {
  const key = createHash("sha256").update(credentials.private_key).digest(
    "hex",
  );
  if (cached?.key === key && cached.expires > Date.now() + 60000) {
    return cached.token;
  }
  const seconds = Math.floor(Date.now() / 1000),
    unsigned = `${json({ alg: "RS256", typ: "JWT" })}.${
      json({
        iss: credentials.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: seconds,
        exp: seconds + 3600,
      })
    }`;
  const pem = credentials.private_key.replace(/-----[^-]+-----/g, "").replace(
    /\s/g,
    "",
  );
  const imported = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    imported,
    new TextEncoder().encode(unsigned),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${encode(new Uint8Array(signature))}`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (
    !response.ok || typeof result.access_token !== "string" ||
    typeof result.expires_in !== "number"
  ) throw new HttpsError("unavailable", "Push authorization unavailable.");
  cached = {
    key,
    token: result.access_token,
    expires: Date.now() + Math.min(3600, result.expires_in) * 1000,
  };
  return cached.token;
}
/** FCM receives only generic text and opaque routing IDs; never amounts or names. */
export async function sendPush(
  token: string,
  reminderId: string,
  obligationId: string,
  instanceId: string,
  expiresAt: number,
): Promise<PushOutcome> {
  const raw = Deno.env.get("TALLY_FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new HttpsError(
      "failed-precondition",
      "Push transport is not configured.",
    );
  }
  const credentials = JSON.parse(raw) as Credentials;
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(credentials.project_id) ||
    !credentials.client_email?.endsWith(".iam.gserviceaccount.com") ||
    !credentials.private_key?.startsWith("-----BEGIN PRIVATE KEY-----")
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Push transport is not configured.",
    );
  }
  const ttl = Math.max(
    0,
    Math.min(86400, Math.floor((expiresAt - Date.now()) / 1000)),
  );
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await authorization(credentials)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: "Tally",
            body: "You have a payment reminder. Open Tally for details.",
          },
          data: { reminderId, obligationId, instanceId },
          android: {
            ttl: `${ttl}s`,
            collapse_key: reminderId,
            notification: { tag: reminderId },
          },
          apns: {
            headers: {
              "apns-expiration": String(Math.floor(expiresAt / 1000)),
              "apns-collapse-id": createHash("sha256").update(reminderId)
                .digest("hex"),
            },
          },
          webpush: {
            headers: {
              TTL: String(ttl),
              Topic: createHash("sha256").update(reminderId).digest("base64url")
                .slice(0, 32),
            },
            notification: { tag: reminderId },
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  return pushOutcome(response.status, await response.json().catch(() => null));
}
