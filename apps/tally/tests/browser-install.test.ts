import { describe, expect, it } from "vitest";
import {
  createInstallController,
  getInstallInstructions,
  getInstallPlatform,
  type InstallPromptEvent,
} from "../src/shared/browser-install";

function browser(standalone = false) {
  const events = new EventTarget();
  const displayMode = Object.assign(new EventTarget(), { matches: standalone });
  const controller = createInstallController({
    events,
    navigator: { userAgent: "Android", maxTouchPoints: 1 },
    displayMode,
  });
  return { events, displayMode, controller };
}

describe("mobile browser installation", () => {
  it("recognizes iPadOS when Safari uses its desktop user agent", () => {
    expect(
      getInstallPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1.15",
        maxTouchPoints: 5,
      }),
    ).toBe("ipad");
    expect(
      getInstallPlatform({ userAgent: "Macintosh", maxTouchPoints: 0 }),
    ).toBe("other");
    expect(getInstallPlatform({ userAgent: "iPhone" })).toBe("iphone");
    expect(getInstallPlatform({ userAgent: "Android" })).toBe("android");
  });

  it("explains Safari's current Share menu and optional web app switch", () => {
    const iphone = getInstallInstructions("iphone");
    expect(iphone.steps.join(" ")).toContain("Share");
    expect(iphone.steps.join(" ")).toContain("Page Menu");
    expect(iphone.steps.join(" ")).toContain("Add to Home Screen");
    expect(iphone.steps.join(" ")).toContain("Open as Web App");
    expect(iphone.note).toContain("Edit Actions");
    expect(getInstallInstructions("ipad").steps.join(" ")).toContain(
      "View More",
    );
  });

  it("covers current and older Chrome Android install labels", () => {
    const instructions = getInstallInstructions("android");
    expect(instructions.steps.join(" ")).toContain(
      "Install and create shortcut",
    );
    expect(instructions.steps.join(" ")).toContain("Install");
    expect(instructions.note).toContain("Add to Home screen");
  });

  it("holds a browser prompt across subscribers and consumes it only once", async () => {
    const { events, controller } = browser();
    let prompts = 0;
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt: async () => {
          prompts += 1;
        },
        userChoice: Promise.resolve({ outcome: "dismissed" as const }),
      },
    ) as InstallPromptEvent;
    const unsubscribe = controller.subscribe(() => {});
    events.dispatchEvent(event);
    unsubscribe();
    expect(event.defaultPrevented).toBe(true);
    expect(controller.getSnapshot().canPrompt).toBe(true);
    expect(await controller.prompt()).toBe("dismissed");
    expect(await controller.prompt()).toBe("unavailable");
    expect(prompts).toBe(1);
    expect(controller.getSnapshot().installed).toBe(false);
    controller.dispose();
  });

  it("hides install after the browser confirms installation", async () => {
    const { events, controller } = browser();
    events.dispatchEvent(new Event("appinstalled"));
    expect(controller.getSnapshot().installed).toBe(true);
    expect(await controller.prompt()).toBe("unavailable");
    controller.dispose();
  });

  it("detects installed launches and live standalone changes", () => {
    const installed = browser(true);
    expect(installed.controller.getSnapshot().installed).toBe(true);
    installed.controller.dispose();
    const { controller, displayMode } = browser();
    displayMode.matches = true;
    displayMode.dispatchEvent(new Event("change"));
    expect(controller.getSnapshot().installed).toBe(true);
    controller.dispose();
  });

  it("recognizes Apple's standalone launch flag", () => {
    const controller = createInstallController({
      events: new EventTarget(),
      navigator: { userAgent: "iPhone", standalone: true },
      displayMode: Object.assign(new EventTarget(), { matches: false }),
    });
    expect(controller.getSnapshot().installed).toBe(true);
    controller.dispose();
  });

  it("falls back to instructions when a browser prompt fails", async () => {
    const { events, controller } = browser();
    events.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt"), {
        prompt: async () => {
          throw new Error("Prompt is no longer available");
        },
        userChoice: Promise.resolve({ outcome: "dismissed" as const }),
      }),
    );
    expect(await controller.prompt()).toBe("unavailable");
    expect(controller.getSnapshot().canPrompt).toBe(false);
    expect(controller.getSnapshot().installed).toBe(false);
    controller.dispose();
  });
});
