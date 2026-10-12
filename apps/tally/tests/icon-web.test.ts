import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("react-native", async () => import("react-native-web"));
import { Icon } from "../src/shared/icons";

it("renders decorative icons without browser attribute warnings", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const html = renderToStaticMarkup(
      React.createElement(Icon, { name: "search", color: "#657166" }),
    );
    expect(errors.mock.calls).toEqual([]);
    expect(html).toContain('aria-hidden="true"');
  } finally {
    errors.mockRestore();
  }
});
