import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createOwnedSessionStorage } from "../src/core/backend/owned-session-storage";

function session(owner: string) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner, exp: 4070908800 })}.Zml4dHVyZQ`,
    refresh_token: `fixture-refresh-${owner}`,
    expires_at: 4070908800,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: owner,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}
let fixtureId = 0;
function fixture() {
  const values = new Map<string, string>();
  const key = "fixture-auth-" + ++fixtureId;
  const original = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
  return {
    values,
    key,
    original,
    guarded: createOwnedSessionStorage(key, original),
  };
}

it.each([
  { method: "setSession", scope: "local" as const },
  { method: "password", scope: "local" as const },
  { method: "setSession", scope: "global" as const },
  { method: "password", scope: "global" as const },
])(
  "preserves SDK $method sign-in during old-owner $scope logout",
  async ({ method, scope }) => {
    const { values, key, guarded } = fixture();
    values.set(key, JSON.stringify(session("old-owner")));
    let release!: () => void;
    let started!: () => void;
    let userFetched!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const logoutStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const readUser = new Promise<void>((resolve) => {
      userFetched = resolve;
    });
    const client = createClient(
      "https://fixture.invalid",
      "public-fixture-key",
      {
        auth: {
          storage: guarded.storage,
          storageKey: key,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input) => {
            const url = String(input);
            if (url.includes("/logout")) {
              started();
              await gate;
              return new Response("{}", { status: 200 });
            }
            if (url.includes("grant_type=password")) {
              userFetched();
              return new Response(JSON.stringify(session("new-owner")), {
                status: 200,
              });
            }
            if (url.endsWith("/user")) {
              userFetched();
              return new Response(JSON.stringify(session("new-owner").user), {
                status: 200,
              });
            }
            throw new Error("Unexpected fixture request");
          },
        },
      },
    );
    const events: string[] = [];
    const { data: listener } = client.auth.onAuthStateChange((event, value) => {
      events.push(`${event}:${value?.user.id ?? "none"}`);
    });
    try {
      await client.auth.getSession();
      const deletion = guarded.signOutOwner(client.auth, "old-owner", scope);
      await logoutStarted;
      const signingIn =
        method === "password"
          ? client.auth.signInWithPassword({
              email: "fixture@example.invalid",
              password: "fixture-only",
            })
          : client.auth.setSession(session("new-owner"));
      await readUser;
      release();
      await Promise.all([deletion, signingIn]);
      expect((await client.auth.getSession()).data.session?.user.id).toBe(
        "new-owner",
      );
      expect(JSON.parse(values.get(key)!).user.id).toBe("new-owner");
      expect(events.indexOf("SIGNED_OUT:none")).toBeLessThan(
        events.indexOf("SIGNED_IN:new-owner"),
      );
    } finally {
      release();
      listener.subscription.unsubscribe();
      await client.auth.stopAutoRefresh();
    }
  },
);

it("keeps newer session and PKCE state when they are saved during removal notification", async () => {
  const { values, key, guarded } = fixture();
  values.set(key, JSON.stringify(session("old-owner")));
  let saving: Promise<void> | undefined;
  await guarded.signOutOwner(
    {
      getSession: async () => ({ data: { session: session("old-owner") } }),
      signOut: async () => {
        await guarded.storage.removeItem(key);
        saving = (async () => {
          await guarded.storage.setItem(
            key,
            JSON.stringify(session("new-owner")),
          );
          await guarded.storage.setItem(key + "-code-verifier", "new-verifier");
        })();
        await guarded.storage.removeItem(key + "-code-verifier");
        await guarded.storage.removeItem(key + "-user");
        return {};
      },
    },
    "old-owner",
  );
  await saving;
  expect(JSON.parse(values.get(key)!).user.id).toBe("new-owner");
  expect(values.get(key + "-code-verifier")).toBe("new-verifier");
});

it("does not request logout for a different owner", async () => {
  const { values, key, guarded } = fixture();
  values.set(key, JSON.stringify(session("new-owner")));
  let signedOut = false;
  await guarded.signOutOwner(
    {
      getSession: async () => ({ data: { session: session("new-owner") } }),
      signOut: async () => {
        signedOut = true;
        return {};
      },
    },
    "old-owner",
  );
  expect(signedOut).toBe(false);
  expect(values.has(key)).toBe(true);
});

it("lets SDK initialization finish a newer sign-in before installing the owner cleanup fence", async () => {
  const { values, key, guarded } = fixture();
  values.set(key, JSON.stringify(session("old-owner")));
  let signedOut = false;
  const recovery = guarded.signOutOwner(
    {
      getSession: async () => {
        // getSession waits for SDK initialization, which may be exchanging a
        // callback and saving a different owner before it can return.
        await guarded.storage.setItem(
          key,
          JSON.stringify(session("new-owner")),
        );
        return { data: { session: session("new-owner") } };
      },
      signOut: async () => {
        signedOut = true;
        return {};
      },
    },
    "old-owner",
  );
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      recovery,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Session initialization deadlocked")),
          500,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
  expect(signedOut).toBe(false);
  expect(JSON.parse(values.get(key)!).user.id).toBe("new-owner");
});

it("serializes another client’s session write until owner logout and notification finish", async () => {
  const { values, key, original, guarded } = fixture();
  const otherClient = createOwnedSessionStorage(key, original);
  values.set(key, JSON.stringify(session("old-owner")));
  const events: string[] = [];
  let saving: Promise<void> | undefined;
  await guarded.signOutOwner(
    {
      getSession: async () => ({ data: { session: session("old-owner") } }),
      signOut: async () => {
        saving = otherClient.storage
          .setItem(key, JSON.stringify(session("new-owner")))
          .then(() => {
            events.push("new-sign-in");
          });
        await guarded.storage.removeItem(key);
        await guarded.storage.removeItem(key + "-code-verifier");
        events.push("old-sign-out");
        return {};
      },
    },
    "old-owner",
  );
  await saving;
  expect(events).toEqual(["old-sign-out", "new-sign-in"]);
  expect(JSON.parse(values.get(key)!).user.id).toBe("new-owner");
});

it("allows the SDK to refresh the same owner before removing its session", async () => {
  const { values, key, guarded } = fixture();
  values.set(key, JSON.stringify(session("old-owner")));
  await guarded.signOutOwner(
    {
      getSession: async () => {
        await guarded.storage.setItem(
          key,
          JSON.stringify(session("old-owner")),
        );
        return { data: { session: session("old-owner") } };
      },
      signOut: async () => {
        await guarded.storage.removeItem(key);
        return {};
      },
    },
    "old-owner",
  );
  expect(values.has(key)).toBe(false);
});
