import {
  expoPushOutcome,
  expoReceipt,
  isExpoPushToken,
  sendExpoPush,
} from "../../functions/tally-api/notifications/expo_push_transport.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Unexpected result");
  }
}
Deno.test("Expo token has a strict transport-specific shape", () => {
  equal(isExpoPushToken("ExpoPushToken[abcdefghijklmnopqrstuvwxyz]"), true);
  equal(isExpoPushToken("bad[token]"), false);
});
Deno.test("Expo ticket acceptance requires a ticket id", () => {
  equal(expoPushOutcome(200, { data: { status: "ok", id: "ticket" } }), {
    outcome: "accepted",
    ticketId: "ticket",
  });
  equal(expoPushOutcome(200, { data: { status: "ok" } }), { outcome: "retry" });
});
Deno.test("Expo deletes tokens only for explicit DeviceNotRegistered", () => {
  equal(
    expoPushOutcome(200, {
      data: { status: "error", details: { error: "DeviceNotRegistered" } },
    }),
    { outcome: "invalidToken" },
  );
  equal(expoPushOutcome(401, { error: "DeviceNotRegistered" }), {
    outcome: "retry",
  });
  equal(
    expoPushOutcome(200, {
      data: { status: "error", details: { error: "InvalidCredentials" } },
    }),
    { outcome: "retry" },
  );
});
Deno.test("Expo payload is generic and bounded, and receipts are checked", async () => {
  const original = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ data: { status: "ok", id: "ticket" } });
  }) as typeof fetch;
  try {
    const result = await sendExpoPush(
      "ExpoPushToken[abcdefghijklmnopqrstuvwxyz]",
      "r1",
      "o1",
      "i1",
      Date.now() + 60000,
      "",
    );
    equal(result, { outcome: "accepted", ticketId: "ticket" });
    equal(sent.title, "Tally");
    equal(sent.data, {
      reminderId: "r1",
      obligationId: "o1",
      instanceId: "i1",
    });
    globalThis.fetch = (async () =>
      Response.json({
        data: {
          ticket: {
            status: "error",
            details: { error: "DeviceNotRegistered" },
          },
        },
      })) as typeof fetch;
    equal(await expoReceipt("ticket", ""), "invalidToken");
  } finally {
    globalThis.fetch = original;
  }
});
