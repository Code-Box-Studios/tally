import type { createInstallController } from "./browser-install";

type InstallController = ReturnType<typeof createInstallController>;
export type BrowserInstallState = ReturnType<
  InstallController["getSnapshot"]
> & {
  prompt: InstallController["prompt"];
};

export function useBrowserInstall(): BrowserInstallState | null {
  return null;
}
