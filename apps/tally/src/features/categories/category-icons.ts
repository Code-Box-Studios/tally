import { text, type Row } from "../../core/domain/records";
import type { IconName } from "../../shared/icons";

export const categoryIcons = [
  { key: "wallet", label: "Money" },
  { key: "home", label: "Home" },
  { key: "bolt", label: "Utilities" },
  { key: "globe", label: "Subscription" },
  { key: "creditCard", label: "Credit card" },
  { key: "shield", label: "Insurance" },
  { key: "car", label: "Vehicle" },
  { key: "education", label: "Education" },
  { key: "people", label: "Family" },
  { key: "briefcase", label: "Business" },
  { key: "membership", label: "Membership" },
  { key: "installments", label: "Installments" },
  { key: "tag", label: "Other" },
  { key: "food", label: "Food" },
  { key: "heart", label: "Health" },
  { key: "plane", label: "Travel" },
  { key: "bag", label: "Shopping" },
  { key: "gift", label: "Gift" },
] as const satisfies readonly { key: IconName; label: string }[];
export type CategoryIconKey = (typeof categoryIcons)[number]["key"];

const defaultIcons: Record<string, CategoryIconKey> = {
  "personal-loan": "wallet",
  rent: "home",
  utilities: "bolt",
  subscription: "globe",
  "credit-card": "creditCard",
  insurance: "shield",
  vehicle: "car",
  education: "education",
  family: "people",
  business: "briefcase",
  housing: "home",
  membership: "membership",
  installment: "installments",
  other: "tag",
};

export function categoryIcon(row?: Row): CategoryIconKey {
  const saved = row ? text(row.data, "iconKey") : "";
  const known = categoryIcons.find((icon) => icon.key === saved);
  return (
    known?.key ??
    (row ? defaultIcons[row.id.replace(/^default-/, "")] : undefined) ??
    "tag"
  );
}
