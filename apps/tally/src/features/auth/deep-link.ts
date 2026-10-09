import { backend } from "../../core/backend/client";
const exchanges = new Map<string, Promise<void>>();
/** Duplicate delivery from Linking and the browser callback exchanges a code once. */
export function completeAuthLink(value: string): Promise<void> {
  const url = new URL(value),
    route = url.pathname.replace(/^\//, "") || url.hostname;
  if (!["auth-callback", "reset-password"].includes(route))
    return Promise.resolve();
  if (url.searchParams.has("error"))
    return Promise.reject(
      new Error("The sign-in link expired or was cancelled. Start again."),
    );
  const code = url.searchParams.get("code");
  if (!code) return Promise.resolve();
  if (!exchanges.has(code)) {
    const operation = backend()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error)
          throw new Error("The sign-in link expired. Request a new link.");
      });
    exchanges.set(code, operation);
    operation
      .finally(() => {
        setTimeout(() => exchanges.delete(code), 60000);
      })
      .catch(() => {});
  }
  return exchanges.get(code)!;
}
