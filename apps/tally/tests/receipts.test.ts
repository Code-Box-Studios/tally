import { expect, it } from "vitest";
import { validateReceipt } from "../src/features/sync/data/receipt";
import { createHash } from "node:crypto";
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

const hash = async (value: string) =>
  createHash("sha256").update(value).digest("hex");
const assignedCommand = {
  id: "assigned",
  owner: "owner-a",
  name: "createInstallment",
  payload: {
    repayment: { contactId: "alex", accountId: "card" },
    installments: [{}, {}],
  },
};
async function installmentReceipt(role: string) {
  const obligationId =
    role + "-" + (await hash(JSON.stringify(["owner-a:assigned", role])));
  const ids = await Promise.all(
    ["i:0001", "i:0002"].map(
      async (key) =>
        "instance-" + (await hash(JSON.stringify([obligationId, key]))),
    ),
  );
  return {
    obligationId,
    obligationRevision: 1,
    obligationInstanceIds: ids,
    instanceRevisions: ids.map((instanceId) => ({
      instanceId,
      instanceRevision: 1,
    })),
  };
}

it("does not acknowledge an assigned installment until both schedules are saved", async () => {
  const primary = await installmentReceipt("obligation");
  await expect(
    validateReceipt(assignedCommand, primary, hash),
  ).rejects.toThrow();
});

it("verifies the linked repayment identity and all its installment revisions", async () => {
  const primary = await installmentReceipt("obligation");
  const repayment = await installmentReceipt("repaymentObligation");
  const receipt = { ...primary, repayment };
  await expect(
    validateReceipt(assignedCommand, receipt, hash),
  ).resolves.toEqual(receipt);
  await expect(
    validateReceipt(
      assignedCommand,
      {
        ...receipt,
        repayment: { ...repayment, obligationId: primary.obligationId },
      },
      hash,
    ),
  ).rejects.toThrow();
  await expect(
    validateReceipt(
      assignedCommand,
      {
        ...receipt,
        repayment: {
          ...repayment,
          instanceRevisions: repayment.instanceRevisions.slice(1),
        },
      },
      hash,
    ),
  ).rejects.toThrow();
  await expect(
    validateReceipt(
      assignedCommand,
      {
        ...receipt,
        repayment: {
          ...repayment,
          obligationInstanceIds: primary.obligationInstanceIds,
          instanceRevisions: primary.instanceRevisions,
        },
      },
      hash,
    ),
  ).rejects.toThrow();
});
