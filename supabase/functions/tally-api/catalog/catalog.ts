import type { CommandDatabase } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { executeOwnerCommand } from "../shared/commands.ts";
import {
  boolValue,
  enumValue,
  invalid,
  nullableId,
  nullableText,
  revision,
  textValue,
} from "../shared/validation.ts";
export const sourceTypes = [
  "cash",
  "bankAccount",
  "debitCard",
  "creditCard",
  "eWallet",
  "payroll",
  "other",
] as const;
export const sourceIconKeys = [
  "bank",
  "wallet",
  "card",
  "cash",
  "other",
] as const;
export const categoryIconKeys = [
  "wallet",
  "home",
  "bolt",
  "globe",
  "creditCard",
  "shield",
  "car",
  "education",
  "people",
  "briefcase",
  "membership",
  "installments",
  "tag",
  "food",
  "heart",
  "plane",
  "bag",
  "gift",
] as const;
export interface CatalogInput {
  kind: "contact" | "source" | "category";
  id: string | null;
  expectedRevision: number | null;
  values: Record<string, unknown>;
}
export function validateCatalog(input: unknown): CatalogInput {
  const data = exactObject(input, ["kind", "id", "expectedRevision", "values"]);
  const kind = enumValue(data.kind, ["contact", "source", "category"]);
  const id = nullableId(data.id);
  const expectedRevision = data.expectedRevision === null
    ? null
    : revision(data.expectedRevision);
  if ((id === null) !== (expectedRevision === null)) {
    return invalid("Select a record and its current revision.");
  }
  let values: Record<string, unknown>;
  if (kind === "contact") {
    const raw = exactObject(data.values, [
      "kind",
      "displayName",
      "organizationType",
      "email",
      "phone",
      "address",
      "notes",
      "archived",
    ]);
    const contactKind = enumValue(raw.kind, ["person", "organization"]);
    const displayName = textValue(raw.displayName, 120, true);
    const email = nullableText(raw.email, 254);
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return invalid("Enter a valid email address.");
    }
    const organizationType = nullableText(raw.organizationType, 80);
    if (contactKind === "person" && organizationType !== null) {
      return invalid("Organization details require an organization.");
    }
    values = {
      kind: contactKind,
      displayName,
      searchName: displayName.normalize("NFKC").toLocaleLowerCase("en"),
      organizationType,
      email,
      phone: nullableText(raw.phone, 40),
      address: nullableText(raw.address, 500),
      notes: textValue(raw.notes, 4000),
      archived: boolValue(raw.archived),
    };
  } else if (kind === "source") {
    const optionalFields = ["providerId", "iconKey"].filter((key) =>
      data.values !== null && typeof data.values === "object" &&
      Object.hasOwn(data.values, key)
    );
    const raw = exactObject(data.values, [
      "name",
      "type",
      "nickname",
      "lastFour",
      "notes",
      "active",
      ...optionalFields,
    ]);
    const lastFour = nullableText(raw.lastFour, 4);
    if (lastFour !== null && !/^\d{4}$/.test(lastFour)) {
      return invalid("Enter exactly four digits.");
    }
    const providerId = Object.hasOwn(raw, "providerId")
      ? nullableText(raw.providerId, 80)
      : undefined;
    if (
      providerId !== undefined && providerId !== null &&
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(providerId)
    ) {
      return invalid("Choose a valid payment provider.");
    }
    values = {
      name: textValue(raw.name, 120, true),
      type: enumValue(raw.type, sourceTypes),
      nickname: nullableText(raw.nickname, 120),
      lastFour,
      notes: textValue(raw.notes, 4000),
      active: boolValue(raw.active),
      ...(providerId !== undefined ? { providerId } : {}),
      ...(Object.hasOwn(raw, "iconKey")
        ? {
          iconKey: raw.iconKey === null
            ? null
            : enumValue(raw.iconKey, sourceIconKeys),
        }
        : {}),
    };
  } else {
    const hasIcon = data.values !== null && typeof data.values === "object" &&
      Object.hasOwn(data.values, "iconKey");
    const raw = exactObject(data.values, [
      "name",
      "active",
      ...(hasIcon ? ["iconKey"] : []),
    ]);
    const name = textValue(raw.name, 80, true);
    values = {
      name,
      searchName: name.normalize("NFKC").toLocaleLowerCase("en"),
      active: boolValue(raw.active),
      ...(hasIcon ? { iconKey: enumValue(raw.iconKey, categoryIconKeys) } : {}),
    };
  }
  return { kind, id, expectedRevision, values };
}
export async function saveCatalog(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(
    uid,
    input,
    "saveCatalog",
    validateCatalog,
    async (context, payload) => {
      const collection = payload.kind === "contact"
        ? "contacts"
        : payload.kind === "source"
        ? "paymentSources"
        : "categories";
      const id = payload.id ?? context.id(payload.kind);
      const current = payload.id ? await context.read(collection, id) : null;
      if (
        current && current.revision !== payload.expectedRevision
      ) {
        throw new HttpsError(
          "aborted",
          "This record changed. Refresh and try again.",
        );
      }
      const updated = {
        ...payload.values,
        revision: current ? revision(current.revision) + 1 : 1,
        ...(payload.kind === "category"
          ? {
            iconKey: payload.values.iconKey ?? current?.iconKey ?? null,
            isDefault: current?.isDefault ?? false,
          }
          : {}),
      };
      if (current) context.update(collection, id, updated);
      else context.create(collection, id, updated);
      context.activity(
        payload.kind === "contact"
          ? "contactChanged"
          : payload.kind === "source"
          ? "sourceChanged"
          : "categoryChanged",
        {
          entityId: id,
          title: payload.values.displayName ?? payload.values.name,
          obligationId: null,
          amountMinor: null,
          currency: null,
        },
      );
      return { id, revision: updated.revision };
    },
    db,
  );
}
