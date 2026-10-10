import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    extensions: [
      ".web.js",
      ".web.ts",
      ".web.tsx",
      ".mjs",
      ".js",
      ".ts",
      ".tsx",
      ".json",
    ],
    alias: {
      "react-native-svg": "react-native-svg/lib/module/ReactNativeSVG.web.js",
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
