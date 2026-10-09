import { expect, it } from "vitest";
import { validateReceipt } from "../src/features/sync/data/receipt";
const command = {
  id: "c1",
  owner: "owner-a",
  name: "recordPayment",
  payload: { obligationId: "o1", obligationInstanceId: "i1" },
};
const valid = {
  obligationId: "o1",
  obligationInstanceId: "i1",
  paymentId: "p1",
  obligationRevision: 2,
  instanceRevision: 2,
};
it("rejects a partial financial acknowledgement", async () => {
  await expect(validateReceipt(command, { paymentId: "p1" })).rejects.toThrow();
});
it("rejects acknowledgements for another obligation or period", async () => {
  await expect(
    validateReceipt(command, { ...valid, obligationId: "other" }),
  ).rejects.toThrow();
  await expect(
    validateReceipt(command, { ...valid, obligationInstanceId: "other" }),
  ).rejects.toThrow();
});
it("rejects invalid revisions", async () => {
  await expect(
    validateReceipt(command, { ...valid, instanceRevision: 0 }),
  ).rejects.toThrow();
});
it("accepts a complete matched receipt", async () => {
  await expect(validateReceipt(command, valid)).resolves.toEqual(valid);
});
it("rejects unknown commands rather than accepting arbitrary keys", async () => {
  await expect(
    validateReceipt({ ...command, name: "unknown" }, { accepted: true }),
  ).rejects.toThrow();
});
