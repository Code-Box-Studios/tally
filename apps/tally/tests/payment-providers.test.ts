import { expect, it } from "vitest";
import {
  findPaymentProvider,
  paymentProviders,
} from "../src/features/payment-sources/payment-providers";
import bankDirectory from "../src/features/payment-sources/bank-directory.json";
import walletDirectory from "../src/features/payment-sources/wallet-directory.json";

it("keeps every bank and nonbank issuer from the BSP directory snapshots searchable", () => {
  for (const bank of bankDirectory)
    expect(findPaymentProvider(bank.name, "bankAccount")).toBeDefined();
  for (const issuer of walletDirectory)
    expect(findPaymentProvider(issuer.name, "eWallet")).toBeDefined();
  expect(
    paymentProviders.filter((provider) => provider.type === "bankAccount"),
  ).toHaveLength(458);
  expect(
    paymentProviders.filter((provider) => provider.type === "eWallet"),
  ).toHaveLength(40);
});

it("offers distinct bank and wallet presets without duplicate identities", () => {
  expect(new Set(paymentProviders.map((p) => p.id)).size).toBe(
    paymentProviders.length,
  );
  expect(paymentProviders.find((p) => p.id === "maya-bank")?.type).toBe(
    "bankAccount",
  );
  expect(paymentProviders.find((p) => p.id === "maya-wallet")?.type).toBe(
    "eWallet",
  );
  expect(paymentProviders.find((p) => p.id === "gcash")?.type).toBe("eWallet");
  expect(paymentProviders.find((p) => p.id === "bpi")?.type).toBe(
    "bankAccount",
  );
});

it("recognizes old bank names while keeping custom sources unbranded", () => {
  expect(findPaymentProvider("SeaBank", "bankAccount")?.id).toBe("maribank");
  expect(findPaymentProvider("PayMaya", "eWallet")?.id).toBe("maya-wallet");
  expect(findPaymentProvider(" bpi ", "creditCard")?.id).toBe("bpi");
  expect(findPaymentProvider("Maya", "bankAccount")?.id).toBe("maya-bank");
  expect(findPaymentProvider("Maya", "eWallet")?.id).toBe("maya-wallet");
  expect(findPaymentProvider("My cash jar", "cash")).toBeUndefined();
  expect(findPaymentProvider("BPI", "cash")).toBeUndefined();
});
