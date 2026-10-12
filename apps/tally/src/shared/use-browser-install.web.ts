import { useSyncExternalStore } from "react";
import { createInstallController } from "./browser-install";
import type { BrowserInstallState } from "./use-browser-install";

// Keep the browser's one-use prompt while visitors move between routes.
const controller =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? createInstallController({
        events: window,
        navigator: window.navigator,
        displayMode: window.matchMedia(
          "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)",
        ),
      })
    : null;
const serverSnapshot = () => null;
const subscribe = (listener: () => void) =>
  controller?.subscribe(listener) ?? (() => {});
const getSnapshot = () => controller?.getSnapshot() ?? null;

export function useBrowserInstall(): BrowserInstallState | null {
  const state = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  return state && controller ? { ...state, prompt: controller.prompt } : null;
}
