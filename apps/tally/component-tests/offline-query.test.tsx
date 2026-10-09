import { queryClient } from "../src/features/auth/session-provider";
jest.mock("../src/core/backend/client", () => ({ backend: () => ({}) }));
jest.mock("../src/core/storage", () => ({ privateStore: {} }));
jest.mock("../src/core/config", () => ({
  runtimeConfig: () => ({ namespace: "test" }),
}));
jest.mock("../src/features/reminders/notification-service", () => ({
  clearNotifications: async () => {},
}));
it("allows repository queries to restore durable private cache when the network is offline", () => {
  expect(queryClient.getDefaultOptions().queries?.networkMode).toBe("always");
});
