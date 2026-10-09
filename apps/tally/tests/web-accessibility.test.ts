import { expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("react-native", async () => import("react-native-web"));
vi.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    surface: "#fff",
    ink: "#111",
    muted: "#555",
    border: "#ddd",
    primary: "#365",
    background: "#fff",
  }),
}));
import { Choices } from "../src/shared/ui";
it("exposes the selected privacy choice to browser assistive technology", () => {
  const html = renderToStaticMarkup(
    React.createElement(Choices, {
      label: "Device privacy",
      value: "yes",
      options: [
        { value: "yes", label: "Trusted device" },
        { value: "no", label: "Do not save private data" },
      ],
      onChange() {},
    }),
  );
  expect(html).toContain('aria-checked="true"');
  expect(html).toContain('aria-checked="false"');
});
