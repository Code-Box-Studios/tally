interface SessionStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}
interface SessionAuth {
  getSession: () => Promise<{
    data: { session: { user: { id: string } } | null };
    error?: unknown;
  }>;
  signOut: (options: {
    scope: "local" | "global";
  }) => Promise<{ error?: unknown }>;
}
const mutations = new Map<string, Promise<unknown>>();
function withMutationLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (mutations.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => {
      if (typeof navigator !== "undefined" && navigator.locks)
        return navigator.locks.request("tally-auth-storage:" + key, work);
      return work();
    });
  mutations.set(key, next);
  const finished = () => {
    if (mutations.get(key) === next) mutations.delete(key);
  };
  void next.then(finished, finished);
  return next;
}
class OwnerChanged extends Error {}
function savedOwner(raw: string | null) {
  if (!raw) return null;
  const value = JSON.parse(raw);
  return typeof value?.user?.id === "string" ? (value.user.id as string) : null;
}

/** Preserve a new sign-in while an older owner's SDK logout is in flight. */
export function createOwnedSessionStorage(
  key: string,
  original: SessionStorage,
) {
  let io: Promise<unknown> = Promise.resolve();
  let removingOwner: string | null = null;
  let removed = false;
  let removalFinished: Promise<void> | null = null;
  const inOrder = <T>(work: () => Promise<T>): Promise<T> => {
    const next = io.catch(() => {}).then(work);
    io = next;
    return next;
  };
  const storage: SessionStorage = {
    getItem: (entry) => inOrder(() => original.getItem(entry)),
    setItem: async (entry, value) => {
      if (removingOwner !== null) {
        // getSession may refresh this same owner before logout starts. Other
        // sign-ins and PKCE flows wait until SDK cleanup and SIGNED_OUT finish.
        if (!removed && entry === key && savedOwner(value) === removingOwner)
          return inOrder(() => original.setItem(entry, value));
        await removalFinished;
        return storage.setItem(entry, value);
      }
      await withMutationLock(key, () =>
        inOrder(() => original.setItem(entry, value)),
      );
    },
    removeItem: async (entry) => {
      if (removingOwner !== null) {
        return inOrder(async () => {
          if (entry === key) {
            const current = savedOwner(await original.getItem(key));
            if (current && current !== removingOwner) throw new OwnerChanged();
            removed = true;
          }
          await original.removeItem(entry);
        });
      }
      await withMutationLock(key, () =>
        inOrder(() => original.removeItem(entry)),
      );
    },
  };
  return {
    storage,
    signOutOwner: async (
      auth: SessionAuth,
      owner: string,
      scope: "local" | "global" = "local",
    ) => {
      // SDK initialization can itself exchange a callback and write a new owner.
      // Let that settle before the write fence; check storage again under lock.
      const initial = await auth.getSession();
      if (initial.error) throw initial.error;
      if (initial.data.session?.user.id !== owner) return;
      return withMutationLock(key, async () => {
        // Inspect storage before getSession: refreshing an already different owner
        // must not wait for this owner's cleanup to release its write fence.
        if (savedOwner(await inOrder(() => original.getItem(key))) !== owner)
          return;
        let finish!: () => void;
        removalFinished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        removingOwner = owner;
        removed = false;
        try {
          const { data, error } = await auth.getSession();
          if (error) throw error;
          if (data.session?.user.id !== owner) return;
          const result = await auth.signOut({ scope });
          if (result.error) throw result.error;
        } catch (error) {
          // A writer from an older app version might not take our storage lock.
          // Stop SDK removal before it can erase or announce logout for that owner.
          if (!(error instanceof OwnerChanged)) throw error;
        } finally {
          removingOwner = null;
          removed = false;
          removalFinished = null;
          finish();
        }
      });
    },
  };
}
