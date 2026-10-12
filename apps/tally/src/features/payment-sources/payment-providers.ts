import bankDirectory from "./bank-directory.json";
import walletDirectory from "./wallet-directory.json";

export type PaymentProvider = {
  id: string;
  name: string;
  type: "bankAccount" | "eWallet";
  aliases: readonly string[];
};
// Familiar product names are matched to the complete BSP directory snapshots.
const featuredProviders: readonly PaymentProvider[] = [
  { id: "bdo", name: "BDO", type: "bankAccount", aliases: ["BDO Unibank"] },
  {
    id: "bpi",
    name: "BPI",
    type: "bankAccount",
    aliases: ["Bank of the Philippine Islands"],
  },
  {
    id: "metrobank",
    name: "Metrobank",
    type: "bankAccount",
    aliases: ["Metropolitan Bank and Trust Company"],
  },
  {
    id: "landbank",
    name: "LANDBANK",
    type: "bankAccount",
    aliases: ["Land Bank of the Philippines"],
  },
  {
    id: "pnb",
    name: "PNB",
    type: "bankAccount",
    aliases: ["Philippine National Bank"],
  },
  {
    id: "rcbc",
    name: "RCBC",
    type: "bankAccount",
    aliases: ["Rizal Commercial Banking Corporation"],
  },
  {
    id: "security-bank",
    name: "Security Bank",
    type: "bankAccount",
    aliases: ["Security Bank Corporation"],
  },
  {
    id: "unionbank",
    name: "UnionBank",
    type: "bankAccount",
    aliases: ["Union Bank of the Philippines"],
  },
  {
    id: "chinabank",
    name: "Chinabank",
    type: "bankAccount",
    aliases: ["China Bank", "China Banking Corporation"],
  },
  {
    id: "eastwest",
    name: "EastWest",
    type: "bankAccount",
    aliases: ["East West Banking Corporation", "EastWest Bank"],
  },
  {
    id: "aub",
    name: "AUB",
    type: "bankAccount",
    aliases: ["Asia United Bank", "Asia United Bank Corporation"],
  },
  {
    id: "bankcom",
    name: "Bank of Commerce",
    type: "bankAccount",
    aliases: ["BankCom"],
  },
  {
    id: "dbp",
    name: "DBP",
    type: "bankAccount",
    aliases: ["Development Bank of the Philippines"],
  },
  {
    id: "psbank",
    name: "PSBank",
    type: "bankAccount",
    aliases: ["Philippine Savings Bank"],
  },
  {
    id: "maybank",
    name: "Maybank",
    type: "bankAccount",
    aliases: ["Maybank Philippines"],
  },
  {
    id: "cimb",
    name: "CIMB",
    type: "bankAccount",
    aliases: ["CIMB Bank", "CIMB Bank Philippines"],
  },
  {
    id: "gotyme",
    name: "GoTyme Bank",
    type: "bankAccount",
    aliases: ["GoTyme"],
  },
  {
    id: "maya-bank",
    name: "Maya Bank",
    type: "bankAccount",
    aliases: ["Maya", "Maya Savings"],
  },
  {
    id: "maribank",
    name: "MariBank",
    type: "bankAccount",
    aliases: ["SeaBank", "MariBank Philippines"],
  },
  {
    id: "tonik",
    name: "Tonik",
    type: "bankAccount",
    aliases: ["Tonik Digital Bank"],
  },
  {
    id: "uno",
    name: "UNO Digital Bank",
    type: "bankAccount",
    aliases: ["UNO", "UNObank"],
  },
  {
    id: "uniondigital",
    name: "UnionDigital Bank",
    type: "bankAccount",
    aliases: ["Union Digital Bank"],
  },
  {
    id: "netbank",
    name: "Netbank",
    type: "bankAccount",
    aliases: ["Netbank Mobile"],
  },
  {
    id: "ownbank",
    name: "OwnBank",
    type: "bankAccount",
    aliases: ["Own Bank"],
  },
  { id: "gcash", name: "GCash", type: "eWallet", aliases: ["G-Xchange"] },
  {
    id: "maya-wallet",
    name: "Maya Wallet",
    type: "eWallet",
    aliases: ["Maya", "PayMaya"],
  },
  {
    id: "grabpay",
    name: "GrabPay",
    type: "eWallet",
    aliases: ["GrabPay Wallet"],
  },
  { id: "shopeepay", name: "ShopeePay", type: "eWallet", aliases: [] },
  {
    id: "coins",
    name: "Coins.ph",
    type: "eWallet",
    aliases: ["Coins", "DCPay"],
  },
  {
    id: "palawanpay",
    name: "PalawanPay",
    type: "eWallet",
    aliases: ["Palawan Pay"],
  },
  { id: "bayad", name: "Bayad", type: "eWallet", aliases: ["Bayad Center"] },
  { id: "starpay", name: "Starpay", type: "eWallet", aliases: ["StarPay"] },
];

function institutionName(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(incorporated|inc|corporation|corp|limited|ltd)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const issuerNames: Record<string, string> = {
  ownbank: "Own Bank, The Rural Bank of Cavite City, Inc.",
  grabpay: "Gpay Network PH, Incorporated",
  coins: "DCPAY Philippines, Incorporated",
  "maya-wallet": "Maya Philippines, Incorporated",
  palawanpay: "PPS-PEPP Financial Services Corporation",
  shopeepay: "ShopeePay Philippines, Incorporated",
  bayad: "CIS Bayad Center, Incorporated",
};

function directoryProvider(
  item: { id: string; name: string },
  type: "bankAccount" | "eWallet",
): PaymentProvider {
  const featured = featuredProviders.find(
    (provider) =>
      provider.type === type &&
      [provider.name, ...provider.aliases, issuerNames[provider.id] ?? ""].some(
        (name) => institutionName(name) === institutionName(item.name),
      ),
  );
  return featured
    ? { ...featured, aliases: [...featured.aliases, item.name] }
    : { id: item.id, name: item.name, type, aliases: [] };
}

export const paymentProviders: readonly PaymentProvider[] = [
  ...bankDirectory.map((item) => directoryProvider(item, "bankAccount")),
  ...walletDirectory.map((item) => directoryProvider(item, "eWallet")),
].sort((left, right) => {
  const leftFeatured = featuredProviders.some(
    (provider) => provider.id === left.id,
  );
  const rightFeatured = featuredProviders.some(
    (provider) => provider.id === right.id,
  );
  return (
    Number(rightFeatured) - Number(leftFeatured) ||
    left.name.localeCompare(right.name, "en")
  );
});

export const paymentDirectorySnapshot = {
  checkedAt: "2026-10-12",
  banks: bankDirectory.length,
  nonbankIssuers: walletDirectory.length,
  bankSource:
    "https://www.bsp.gov.ph/SitePages/FinancialStability/DirBanksFIList.aspx",
  walletSource:
    "https://www.bsp.gov.ph/Lists/Directories/Attachments/7/emi.pdf",
  walletPublishedAt: "2026-05-31",
};

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en");
}

export function findPaymentProvider(
  name: string,
  type: string,
): PaymentProvider | undefined {
  const family = ["bankAccount", "debitCard", "creditCard"].includes(type)
    ? "bankAccount"
    : type === "eWallet"
      ? "eWallet"
      : null;
  if (!family) return undefined;
  return paymentProviders.find(
    (provider) =>
      provider.type === family &&
      [provider.name, ...provider.aliases].some(
        (alias) => normalize(alias) === normalize(name),
      ),
  );
}
