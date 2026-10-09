import { expect, it } from "vitest";
import { validateConfig } from "../src/core/config";
it("rejects missing, private and misleading production configuration", () => {
  expect(() => validateConfig(undefined, undefined, false)).toThrow();
  expect(() =>
    validateConfig(
      "https://abcdefghijklmnopqrst.supabase.co",
      "sb_secret_danger",
      false,
    ),
  ).toThrow();
  expect(() =>
    validateConfig("http://127.0.0.1:56321", "sb_publishable_public", false),
  ).toThrow();
  expect(() =>
    validateConfig(
      "https://abcdefghijklmnopqrst.supabase.co/path",
      "sb_publishable_public",
      false,
    ),
  ).toThrow();
});
it("accepts only explicit local development and hosted public configuration", () => {
  expect(
    validateConfig("http://127.0.0.1:56321", "eyJpublic", true).namespace,
  ).toBe("expo-v1:http://127.0.0.1:56321");
  expect(
    validateConfig(
      "https://abcdefghijklmnopqrst.supabase.co",
      "sb_publishable_public",
      false,
    ).url,
  ).toBe("https://abcdefghijklmnopqrst.supabase.co");
});
