export type InstallPlatform = "iphone" | "ipad" | "android" | "other";

type InstallNavigator = {
  userAgent: string;
  maxTouchPoints?: number;
  standalone?: boolean;
};

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function getInstallPlatform(
  navigator: InstallNavigator,
): InstallPlatform {
  if (/iPad/i.test(navigator.userAgent)) return "ipad";
  if (/iPhone|iPod/i.test(navigator.userAgent)) return "iphone";
  if (
    /Macintosh/i.test(navigator.userAgent) &&
    (navigator.maxTouchPoints ?? 0) > 1
  )
    return "ipad";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "other";
}

export function getInstallInstructions(
  platform: Exclude<InstallPlatform, "other">,
) {
  if (platform === "android")
    return {
      title: "On Android",
      steps: [
        "Open Tally in Chrome.",
        "Tap More (the three dots beside the address bar), then Install and create shortcut.",
        "Tap Install and follow Chrome’s on-screen steps.",
        "Open Tally from its icon on your Home screen.",
      ],
      note: "On older Chrome versions, choose Add to Home screen or Install app. If you only see Create shortcut, you can add a shortcut instead.",
    };
  return {
    title: platform === "ipad" ? "On iPad" : "On iPhone",
    steps: [
      "Open Tally in Safari.",
      platform === "ipad"
        ? "Tap Share (the square with an upward arrow). Tap View More or More if needed."
        : "Tap Share (the square with an upward arrow). If it is hidden, open Page Menu or More beside the address bar, then tap Share.",
      "Scroll through the actions and choose Add to Home Screen.",
      "Turn on Open as Web App if Safari shows that switch, then tap Add.",
      "Open Tally from its icon on your Home Screen.",
    ],
    note: "If Add to Home Screen is missing, scroll to Edit Actions and add it. In another browser or an in-app browser, copy this page’s address and open it in Safari.",
  };
}

type InstallEnvironment = {
  events: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  navigator: InstallNavigator;
  displayMode: Pick<
    MediaQueryList,
    "matches" | "addEventListener" | "removeEventListener"
  >;
};

export function createInstallController(environment: InstallEnvironment) {
  const listeners = new Set<() => void>();
  let deferredPrompt: InstallPromptEvent | null = null;
  let snapshot = {
    platform: getInstallPlatform(environment.navigator),
    installed:
      environment.displayMode.matches ||
      environment.navigator.standalone === true,
    canPrompt: false,
  };

  function update(values: Partial<typeof snapshot>) {
    snapshot = { ...snapshot, ...values };
    listeners.forEach((listener) => listener());
  }
  function beforeInstall(event: Event) {
    if (snapshot.installed || !("prompt" in event)) return;
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    update({ canPrompt: true });
  }
  function installed() {
    deferredPrompt = null;
    update({ installed: true, canPrompt: false });
  }
  function displayChanged() {
    if (environment.displayMode.matches || environment.navigator.standalone)
      installed();
  }
  environment.events.addEventListener("beforeinstallprompt", beforeInstall);
  environment.events.addEventListener("appinstalled", installed);
  environment.displayMode.addEventListener("change", displayChanged);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async prompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
      const event = deferredPrompt;
      if (!event || snapshot.installed) return "unavailable";
      deferredPrompt = null;
      update({ canPrompt: false });
      try {
        // Invoke prompt before yielding so the browser retains the user gesture.
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "accepted") installed();
        return choice.outcome;
      } catch {
        return "unavailable";
      }
    },
    dispose() {
      environment.events.removeEventListener(
        "beforeinstallprompt",
        beforeInstall,
      );
      environment.events.removeEventListener("appinstalled", installed);
      environment.displayMode.removeEventListener("change", displayChanged);
      listeners.clear();
    },
  };
}
