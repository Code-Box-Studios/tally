import { afterEach, expect, it, vi } from "vitest";
import { exportHtmlPdf } from "../src/shared/pdf-export.web";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const popup = {
    opener: {},
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
    closed: false,
  };
  const open = vi.fn(() => popup);
  vi.stubGlobal("window", { open });
  return { popup, open };
}
it("reserves the print window before fetching fresh financial records", async () => {
  const { popup, open } = fixture();
  await exportHtmlPdf(
    "Confirmation",
    async () => {
      expect(open).toHaveBeenCalledOnce();
      expect(popup.print).not.toHaveBeenCalled();
      return "<p>Paid</p>";
    },
    () => {},
  );
  expect(popup.opener).toBeNull();
  expect(popup.document.write).toHaveBeenLastCalledWith("<p>Paid</p>");
  expect(popup.print).toHaveBeenCalledOnce();
});
it("closes the window and does not print after validation or account failure", async () => {
  for (const changed of [true, false]) {
    const { popup } = fixture();
    let active = true;
    await expect(
      exportHtmlPdf(
        "Confirmation",
        async () => {
          if (changed) {
            active = false;
            return "private";
          }
          throw new Error("Balance changed");
        },
        () => {
          if (!active) throw new Error("Sign-in changed");
        },
      ),
    ).rejects.toThrow(/changed/);
    expect(popup.print).not.toHaveBeenCalled();
    expect(popup.document.write).not.toHaveBeenCalledWith("private");
    expect(popup.close).toHaveBeenCalled();
  }
});
it("does not fetch a confirmation when popups are blocked", async () => {
  const prepare = vi.fn();
  vi.stubGlobal("window", { open: () => null });
  await expect(
    exportHtmlPdf("Confirmation", prepare, () => {}),
  ).rejects.toThrow(/pop-ups/);
  expect(prepare).not.toHaveBeenCalled();
});
