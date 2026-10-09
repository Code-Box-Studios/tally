import { expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
it("decodes Router query strings using the patched ESM decoder bridge", () => {
  const query = require("query-string");
  expect(query.parse("name=hello%20world").name).toBe("hello world");
  expect(typeof query.parse("name=%E0%A4%A").name).toBe("string");
});
