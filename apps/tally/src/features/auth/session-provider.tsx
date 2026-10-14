import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { completeAuthLink } from "./deep-link";
import {
  backend,
  signOutDeletedOwner,
  signOutOwnedSession,
} from "../../core/backend/client";
import { ApiError, TallyRepository } from "../../core/backend/repository";
import { runtimeConfig } from "../../core/config";
import { privateStore } from "../../core/storage";
import type { Profile, Data } from "../../core/domain/records";
import { PersistentCommandStore } from "../sync/data/persistent-store";
import { MemoryStore } from "../sync/data/memory-store";
import { CommandQueue } from "../sync/data/command-queue";
import {
  DeletionCoordinator,
  resumeAcceptedDeletions,
} from "../accounts/deletion-coordinator";
import {
  clearNotifications,
  clearLocalNotifications,
  clearInactiveLocalNotifications,
} from "../reminders/notification-service";
import type { SavedCommand } from "../sync/data/store";

WebBrowser.maybeCompleteAuthSession();
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: 1,
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
      staleTime: 5000,
    },
  },
});
interface AuthContext {
  session: Session | null;
  profile: Profile | null;
  repo: TallyRepository | null;
  queue: CommandQueue | null;
  ready: boolean;
  error: string | null;
  cached: boolean;
  trusted: boolean;
  recovery: boolean;
  pending: SavedCommand[];
  refresh: () => Promise<void>;
  setTrust: (enabled: boolean) => Promise<void>;
  execute: (
    name: string,
    payload: Data,
    stableId?: string,
  ) => Promise<SavedCommand>;
  setProfile: (p: Profile) => void;
  flush: () => Promise<void>;
  signOut: () => Promise<void>;
  google: () => Promise<void>;
}
const Context = createContext<AuthContext | null>(null);
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing session provider.");
  return value;
}
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [repo, setRepo] = useState<TallyRepository | null>(null),
    [queue, setQueue] = useState<CommandQueue | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [cached, setCached] = useState(false),
    [trusted, setTrusted] = useState(Platform.OS !== "web"),
    [pending, setPending] = useState<SavedCommand[]>([]),
    [recovery, setRecovery] = useState(false);
  const [trustVersion, setTrustVersion] = useState(0);
  const owner = useRef<string | null>(null),
    generation = useRef(0),
    trustRef = useRef(Platform.OS !== "web");
  const recoverStartup = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    let live = true;
    let authVersion = 0;
    let recovery: Promise<string[]> | null = null;
    let recovered: string[] | null = null;
    const client = backend();
    const namespace = runtimeConfig().namespace;
    const reportError = (error: unknown) => {
      if (!live) return;
      setError((error as Error).message);
      setReady(true);
    };
    const recover = () => {
      if (!recovery) {
        recovery = resumeAcceptedDeletions(
          privateStore,
          namespace,
          async (deletedOwner, prefix, deletionKey) => {
            await clearLocalNotifications(prefix);
            for (const key of await privateStore.keys(prefix))
              if (key !== deletionKey) await privateStore.remove(key);
            await signOutDeletedOwner(deletedOwner);
          },
        )
          .then((deleted) => {
            recovered = deleted;
            if (live) setError(null);
            return deleted;
          })
          .catch((error) => {
            recovery = null;
            throw error;
          });
      }
      return recovery;
    };
    const apply = (next: Session | null) => {
      if (!live) return;
      const uid = next?.user.id ?? null;
      if (uid !== owner.current) {
        const previousOwner = owner.current;
        owner.current = uid;
        generation.current++;
        queryClient.clear();
        setProfile(null);
        setRepo(null);
        setQueue(null);
        setPending([]);
        setError(null);
        setReady(!uid);
        // Authentication can change without the explicit sign-out flow. Queue
        // cancellation after invalidation so in-flight scheduling cannot leave
        // the previous owner's reminders behind.
        if (previousOwner)
          void clearLocalNotifications(`${namespace}:${previousOwner}:`).catch(
            reportError,
          );
      } else if (!uid) setReady(true);
      setSession(next);
      // Persisted alert manifests also recover interrupted owner cleanup after
      // process death, including launches where no session is restored.
      void clearInactiveLocalNotifications(namespace, () =>
        live ? owner.current : undefined,
      ).catch(reportError);
    };
    const { data } = client.auth.onAuthStateChange((event, next) => {
      const version = ++authVersion;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      if (recovered) {
        apply(next && recovered.includes(next.user.id) ? null : next);
        return;
      }
      // Do not publish a session while accepted deletion cleanup is pending.
      // Keep the callback synchronous: Supabase Auth work runs after it returns.
      void recover()
        .then((deleted) => {
          if (version === authVersion)
            apply(next && deleted.includes(next.user.id) ? null : next);
        })
        .catch(reportError);
    });
    const restore = async () => {
      const version = authVersion;
      const deleted = await recover();
      const { data, error } = await client.auth.getSession();
      if (!live || version !== authVersion) return;
      if (error) throw new Error("Could not restore your sign-in.");
      setError(null);
      apply(
        data.session && deleted.includes(data.session.user.id)
          ? null
          : data.session,
      );
    };
    recoverStartup.current = restore;
    void restore().catch(reportError);
    const handleLink = (url: string) => {
      if (Platform.OS !== "web")
        void completeAuthLink(url).catch((e) => {
          if (live) setError((e as Error).message);
        });
    };
    if (Platform.OS !== "web")
      void Linking.getInitialURL().then((value) => {
        if (value) handleLink(value);
      });
    const links = Linking.addEventListener("url", (event) =>
      handleLink(event.url),
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        client.auth.startAutoRefresh();
        if (recovered)
          void clearInactiveLocalNotifications(namespace, () =>
            live ? owner.current : undefined,
          ).catch(reportError);
      } else if (Platform.OS !== "web") client.auth.stopAutoRefresh();
    });
    return () => {
      live = false;
      owner.current = null;
      // Invalidate every asynchronous operation when this provider unmounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      recoverStartup.current = null;
      data.subscription.unsubscribe();
      subscription.remove();
      links.remove();
    };
  }, []);
  const sessionOwner = session?.user.id;
  useEffect(() => {
    if (!sessionOwner) return;
    const uid = sessionOwner,
      epoch = generation.current,
      config = runtimeConfig(),
      prefix = `${config.namespace}:${uid}:`;
    const active = () => owner.current === uid && generation.current === epoch;
    let timer: ReturnType<typeof setInterval> | undefined;
    const observeTrust = async () => {
      const saved = await privateStore.get(prefix + "trust");
      const current = saved === null ? Platform.OS !== "web" : saved === "true";
      if (!active()) return false;
      if (current === trustRef.current) return true;
      trustRef.current = current;
      generation.current++;
      queryClient.clear();
      setTrusted(current);
      setRepo(null);
      setQueue(null);
      setTrustVersion((v) => v + 1);
      return false;
    };
    const onTrustSignal = (event: StorageEvent) => {
      if (event.key === config.namespace + ":trust-change")
        void observeTrust().catch(() => {});
    };
    if (Platform.OS === "web" && typeof window !== "undefined")
      window.addEventListener("storage", onTrustSignal);
    (async () => {
      try {
        const savedTrust = await privateStore.get(prefix + "trust");
        const trust =
          savedTrust === null ? Platform.OS !== "web" : savedTrust === "true";
        if (!active()) return;
        trustRef.current = trust;
        setTrusted(trust);
        const storage = trust
          ? (privateStore.guard?.(prefix + "trust") ?? privateStore)
          : privateStore;
        const repository = new TallyRepository(
          backend(),
          uid,
          storage,
          async () =>
            Platform.OS === "web"
              ? (await privateStore.get(prefix + "trust")) === "true"
              : trustRef.current,
          active,
          config.namespace,
        );
        const commands = new CommandQueue(
          trust
            ? new PersistentCommandStore(storage, prefix + "command:")
            : new MemoryStore(),
          uid,
          config.namespace,
          active,
          (c) => repository.command(c.name, c.payload, c.id),
          Crypto.randomUUID,
          (value) =>
            Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              value,
            ),
        );
        const deletionKey = prefix + "deletion";
        if (await privateStore.get(deletionKey)) {
          await new DeletionCoordinator(
            privateStore,
            deletionKey,
            uid,
            active,
            (id) =>
              repository.command(
                "requestAccountDeletion",
                { confirmation: "DELETE" },
                id,
              ),
            async () => {
              await clearLocalNotifications(prefix);
              for (const key of await privateStore.keys(prefix))
                if (key !== deletionKey) await privateStore.remove(key);
              if (active()) queryClient.clear();
              await signOutDeletedOwner(uid);
            },
            Crypto.randomUUID,
          ).request();
          return;
        }
        setRepo(repository);
        setQueue(commands);
        const load = async () => {
          try {
            const loaded = await repository.profile();
            if (active()) {
              setProfile(loaded.profile);
              setCached(loaded.cached);
              setError(null);
              setReady(true);
            }
          } catch (e) {
            if (active()) {
              if (e instanceof ApiError && e.retryable) {
                setCached(true);
              } else setProfile(null);
              setError((e as Error).message);
              setReady(true);
            }
          }
        };
        await load();
        if (active()) {
          timer = setInterval(() => {
            void observeTrust()
              .then(async (unchanged) => {
                if (!unchanged) return;
                await load();
                await commands.flush();
                if (active()) setPending(await commands.list());
              })
              .catch(() => {});
          }, 15000);
          setPending(await commands.list());
          await commands.flush();
          if (active()) setPending(await commands.list());
        }
      } catch (e) {
        if (active()) {
          setError((e as Error).message);
          setReady(true);
        }
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      if (Platform.OS === "web" && typeof window !== "undefined")
        window.removeEventListener("storage", onTrustSignal);
    };
  }, [sessionOwner, trustVersion]);
  const refresh = useCallback(async () => {
    if (!repo) {
      try {
        await recoverStartup.current?.();
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    try {
      const value = await repo.profile();
      repo.check();
      setProfile(value.profile);
      setCached(value.cached);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    await queryClient.invalidateQueries();
  }, [repo]);
  const flush = useCallback(async () => {
    if (queue) {
      await queue.flush();
      setPending(await queue.list());
      await queryClient.invalidateQueries();
    }
  }, [queue]);
  async function execute(name: string, payload: Data, stableId?: string) {
    if (!queue) throw new Error("Wait for your account to load.");
    if (
      !trusted &&
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      !navigator.onLine
    )
      throw new Error("Trust this device in Settings before saving offline.");
    const uncertain = (await queue.list()).find(
      (c) =>
        c.status === "review" &&
        ![
          "aborted",
          "invalid-argument",
          "failed-precondition",
          "already-exists",
        ].includes(c.rejectionCode ?? ""),
    );
    if (uncertain)
      throw Object.assign(
        new Error(
          "Resolve the uncertain action in Settings > Saved actions before saving another action.",
        ),
        { actionSaved: true },
      );
    const item = await queue.enqueue(name, payload, stableId);
    await flush();
    const current = (await queue.list()).find((c) => c.id === item.id)!;
    if (current.status === "review") {
      const uncertain = ![
        "aborted",
        "invalid-argument",
        "failed-precondition",
        "already-exists",
      ].includes(current.rejectionCode ?? "");
      throw Object.assign(
        new Error(
          (current.error ?? "This action needs review.") +
            (uncertain
              ? " Open Settings > Saved actions to retry this saved action. Close this form before recording another action."
              : ""),
        ),
        { actionSaved: uncertain },
      );
    }
    return current;
  }
  async function setTrust(enabled: boolean) {
    if (!repo || !session) return;
    if (
      (queue ? await queue.list() : pending).some(
        (p) => !["synced", "discarded"].includes(p.status),
      )
    )
      throw new Error(
        "Sync or review saved actions before changing device trust.",
      );
    if (!enabled) await clearNotifications(repo);
    if (!enabled && privateStore.revokeTrust)
      await privateStore.revokeTrust(repo.prefix);
    else {
      await privateStore.set(repo.prefix + "trust", String(enabled));
      if (!enabled)
        for (const key of await privateStore.keys(repo.prefix))
          if (key !== repo.prefix + "trust") await privateStore.remove(key);
    }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          runtimeConfig().namespace + ":trust-change",
          Crypto.randomUUID(),
        );
      } catch {
        /* Transactional guards and polling still enforce the preference. */
      }
    }
    trustRef.current = enabled;
    setTrusted(enabled);
    generation.current++;
    queryClient.clear();
    setRepo(null);
    setQueue(null);
    setTrustVersion((v) => v + 1);
  }
  async function signOut() {
    const signingOutOwner = session?.user.id;
    if (!signingOutOwner) return;
    if (
      (queue ? await queue.list() : pending).some(
        (p) => !["synced", "discarded"].includes(p.status),
      )
    )
      throw new Error("Sync or review your saved actions before signing out.");
    if (repo) await clearNotifications(repo);
    await signOutOwnedSession(signingOutOwner, "global");
    if (!owner.current || owner.current === signingOutOwner)
      queryClient.clear();
  }
  async function google() {
    const redirect =
      Platform.OS === "web"
        ? window.location.origin + "/auth-callback"
        : Linking.createURL("auth-callback");
    const { data, error } = await backend().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirect,
        skipBrowserRedirect: Platform.OS !== "web",
      },
    });
    if (error) throw error;
    if (Platform.OS !== "web" && data.url) {
      const response = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirect,
      );
      if (response.type === "success") {
        await completeAuthLink(response.url);
      }
    }
  }
  return (
    <QueryClientProvider client={queryClient}>
      <Context.Provider
        value={{
          session,
          profile,
          repo,
          queue,
          ready,
          error,
          cached,
          trusted,
          recovery,
          pending,
          refresh,
          setTrust,
          execute,
          setProfile: (p) => {
            if (owner.current === p.userId) setProfile(p);
          },
          flush,
          signOut,
          google,
        }}
      >
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
