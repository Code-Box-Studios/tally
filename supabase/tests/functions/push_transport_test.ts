import { pushOutcome } from "../../functions/tally-api/notifications/push_transport.ts";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}
Deno.test("FCM accepts only a successful named message", () => {
  equal(pushOutcome(200, { name: "projects/tally/messages/123" }), "accepted");
  equal(pushOutcome(200, {}), "retry");
});
Deno.test("FCM cleans up only explicitly unregistered tokens", () => {
  equal(
    pushOutcome(404, {
      error: {
        details: [{
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          errorCode: "UNREGISTERED",
        }],
      },
    }),
    "invalidToken",
  );
  equal(pushOutcome(400, { error: { status: "INVALID_ARGUMENT" } }), "retry");
  equal(pushOutcome(401, { error: { status: "UNAUTHENTICATED" } }), "retry");
});
Deno.test("FCM outages and quota limits retry without token deletion", () => {
  equal(pushOutcome(429, {}), "retry");
  equal(pushOutcome(503, {}), "retry");
});
