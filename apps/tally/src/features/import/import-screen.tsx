import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Crypto from "expo-crypto";
import { todayInZone } from "../../core/domain/date";
import { formatMoney } from "../../core/domain/money";
import {
  amount,
  label,
  object,
  text,
  type Data,
} from "../../core/domain/records";
import { useRecords } from "../../shared/queries";
import { SelectField } from "../../shared/select-field";
import {
  Button,
  Card,
  Failure,
  Field,
  Heading,
  Loading,
  Page,
  Txt,
} from "../../shared/ui";
import { useTheme } from "../../shared/theme";
import { useSession } from "../auth/session-provider";
import {
  importFields,
  parseCsv,
  suggestMapping,
  type ColumnMapping,
  type CsvTable,
  type ImportField,
} from "./csv";
import { buildImportPreview, type ImportPreviewRow } from "./import-model";
import { readCsvFile } from "./read-csv";

const fieldOptions = [
  { value: "", label: "Ignore column" },
  ...Object.entries(importFields).map(([value, label]) => ({ value, label })),
];
const kindOptions = ["borrowed", "lent", "installment", "recurring"].map(
  (value) => ({ value, label: label(value) }),
);
const duplicateLabels = {
  file: "Duplicate in this CSV; skipped.",
  "saved-action":
    "Already saved or queued; review Saved actions if it needs attention.",
  "existing-record":
    "Possible duplicate. Review the details before selecting this row.",
};

function PreviewTerms({
  payload,
  command,
}: {
  payload: Data;
  command: string;
}) {
  const recurring = command === "createRecurring",
    code = text(payload, "currency"),
    interest = payload.interestInfo ? object(payload.interestInfo) : null;
  const recurrence = payload.recurrence ? object(payload.recurrence) : null;
  return (
    <View style={{ gap: 4 }}>
      <Txt>
        {recurring ? "Recurring bill" : label(text(payload, "direction"))} ·{" "}
        {formatMoney(
          amount(payload, recurring ? "defaultAmountMinor" : "amountMinor"),
          code,
        )}{" "}
        {code}
      </Txt>
      {interest && (
        <Txt>
          Principal {formatMoney(amount(interest, "principalMinor"), code)} +
          interest {formatMoney(amount(interest, "interestMinor"), code)} (
          {Number(interest.rateBasisPoints) / 100}% {text(interest, "basis")})
        </Txt>
      )}
      {recurrence ? (
        <Txt>
          Starts {text(recurrence, "startDate")} ·{" "}
          {text(recurrence, "frequency")} · {text(payload, "amountKind")} ·
          Manual payment
          {recurrence.endDate ? ` · Ends ${recurrence.endDate}` : ""}
        </Txt>
      ) : (
        <Txt>
          Original date {text(payload, "originationDate")} ·{" "}
          {payload.dueDate ? `Due ${payload.dueDate}` : "No due date"}
        </Txt>
      )}
      {Array.isArray(payload.installments) && (
        <Txt>
          {payload.installments
            .map((term, index) => {
              const item = object(term);
              return `${index + 1}. ${text(item, "dueDate")}: ${formatMoney(amount(item, "amountMinor"), code)}`;
            })
            .join("\n")}
        </Txt>
      )}
      {!!payload.description && <Txt muted>{text(payload, "description")}</Txt>}
      {!!payload.notes && <Txt muted>{text(payload, "notes")}</Txt>}
    </View>
  );
}

export function ImportScreen() {
  const { repo, profile } = useSession();
  if (!repo || !profile) return <Loading />;
  return <ImportWorkspace key={`${repo.namespace}:${repo.owner}`} />;
}

function ImportWorkspace() {
  const { repo, profile, pending, execute } = useSession(),
    theme = useTheme();
  const categories = useRecords("categories"),
    contacts = useRecords("contacts"),
    sources = useRecords("paymentSources"),
    obligations = useRecords("obligations");
  const [csv, setCsv] = useState(""),
    [table, setTable] = useState<CsvTable | null>(null),
    [mapping, setMapping] = useState<ColumnMapping>([]);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("borrowed"),
    [category, setCategory] = useState("default-personal-loan");
  const [results, setResults] = useState<Record<number, string>>({}),
    [finished, setFinished] = useState(false);
  const locked = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const run = async (task: (check: () => void) => Promise<void> | void) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const check = () => {
      repo?.check();
      if (!live.current) throw new Error("Your sign-in changed.");
    };
    try {
      check();
      await task(check);
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      locked.current = false;
      if (live.current) setBusy(false);
    }
  };
  const queries = [categories, contacts, sources, obligations];
  if (!repo || !profile || queries.some((query) => query.isPending))
    return <Loading />;
  const loadError = queries.find((query) => query.error)?.error;
  if (loadError || queries.some((query) => !query.data))
    return (
      <Page>
        <Failure
          error={
            loadError ??
            new Error("Load all records before checking import duplicates.")
          }
        />
      </Page>
    );
  const categoryRows = categories.data!.rows,
    contactRows = contacts.data!.rows,
    sourceRows = sources.data!.rows;
  const selected =
    rows?.filter((row) => row.selected && !row.errors.length) ?? [];
  const catalogName = (
    id: unknown,
    catalog: typeof categoryRows,
    key: string,
  ) => catalog.find((row) => row.id === id)?.data[key] ?? "None";
  return (
    <Page maxWidth={900}>
      <Heading
        title="Import spreadsheet"
        subtitle="Bring loans and recurring bills into Tally. Review every row before saving."
      />
      <View style={{ gap: 18 }}>
        {error ? <Failure error={new Error(error)} /> : null}
        {queries.some((query) => query.data?.cached) && (
          <Txt muted>
            Cached records are being used for duplicate checks. Newer changes
            may appear after syncing.
          </Txt>
        )}
        {!table ? (
          <Card>
            <Txt>
              Use UTF-8 CSV with a header row, up to 500 rows and 2 MiB. Dates
              must use YYYY-MM-DD. Amounts use decimal units, such as 100.25.
            </Txt>
            <Txt muted>
              Supported: borrowed or lent loans, equal installments, simple
              interest, and fixed or variable recurring bills. Existing
              payments, outstanding balances, compound interest, custom
              schedules and automatic deductions need manual entry.
            </Txt>
            <Button
              secondary
              disabled={busy}
              title="Choose CSV file"
              onPress={() => {
                void run(async (check) => {
                  const value = await readCsvFile();
                  check();
                  if (value !== null) setCsv(value);
                });
              }}
            />
            <Field
              label="CSV text"
              multiline
              value={csv}
              onChangeText={setCsv}
              editable={!busy}
              placeholder="Title,Type,Amount,Date,Due Date"
              style={{ minHeight: 180 }}
            />
            <Button
              secondary
              disabled={busy}
              title="Use sample CSV"
              onPress={() =>
                setCsv(
                  "Title,Type,Amount,Date,Due Date,Frequency,Installment Count,First Due Date,Installment Frequency,Interest Rate,Interest Basis\nPersonal loan,lent,1000,2026-01-01,2026-12-01,,,,,5,oneTime\nPhone,installment,3000,2026-01-01,,,3,2026-02-01,monthly,,\nInternet,recurring,1500,2026-11-01,,monthly,,,,,",
                )
              }
            />
            <Button
              disabled={busy || !csv.trim()}
              title="Match columns"
              onPress={() => {
                void run(() => {
                  const parsed = parseCsv(csv);
                  setTable(parsed);
                  setMapping(suggestMapping(parsed.headers));
                });
              }}
            />
          </Card>
        ) : !rows ? (
          <Card>
            <Txt>
              {table.rows.length} rows found. Match columns to Tally fields.
            </Txt>
            <Txt muted>
              People, categories and payment sources must match one active
              record by name or ID. Create missing records before importing.
            </Txt>
            <SelectField
              label="Default type (when no type column)"
              value={kind}
              options={kindOptions}
              onChange={setKind}
              disabled={busy}
            />
            <SelectField
              label="Default category (when no category column)"
              value={category}
              options={categoryRows
                .filter((row) => row.data.active === true)
                .map((row) => ({
                  value: row.id,
                  label: text(row.data, "name"),
                }))}
              onChange={setCategory}
              disabled={busy}
            />
            <Txt muted>
              Default currency: {profile.defaultCurrency}. Bill timezone:{" "}
              {profile.timezone}. Imported bills use manual payments and
              reminders 3 days before and on the due date.
            </Txt>
            {table.headers.map((header, index) => (
              <View key={index} style={{ gap: 4 }}>
                <SelectField
                  label={`Column ${index + 1}: ${header}`}
                  value={mapping[index]}
                  options={fieldOptions}
                  onChange={(value) =>
                    setMapping((current) =>
                      current.map((field, column) =>
                        column === index ? (value as ImportField | "") : field,
                      ),
                    )
                  }
                  disabled={busy}
                  searchable
                />
                <Txt muted>Example: {table.rows[0][index] || "(empty)"}</Txt>
              </View>
            ))}
            <Button
              disabled={busy}
              title={busy ? "Checking rows…" : "Preview import"}
              onPress={() => {
                void run(async (check) => {
                  const preview = await buildImportPreview(
                    table,
                    mapping,
                    {
                      owner: repo.owner,
                      environment: repo.namespace,
                      currency: profile.defaultCurrency,
                      timezone: profile.timezone,
                      today: todayInZone(profile.timezone),
                      defaultKind: kind,
                      defaultCategoryId: category,
                      categories: categoryRows,
                      contacts: contactRows,
                      sources: sourceRows,
                      existing: obligations.data!.rows,
                      pending,
                    },
                    (value) =>
                      Crypto.digestStringAsync(
                        Crypto.CryptoDigestAlgorithm.SHA256,
                        value,
                      ),
                  );
                  check();
                  setRows(preview);
                  setResults({});
                  setFinished(false);
                });
              }}
            />
            <Button
              secondary
              disabled={busy}
              title="Change CSV"
              onPress={() => setTable(null)}
            />
          </Card>
        ) : (
          <>
            <Card>
              <Txt>
                {rows.length} rows ·{" "}
                {rows.filter((row) => row.errors.length).length} invalid ·{" "}
                {rows.filter((row) => row.duplicate).length} possible duplicates
              </Txt>
              <Txt muted>
                Only checked valid rows will be saved. Reimporting the same
                details reuses the saved action, including after an interrupted
                import.
              </Txt>
              {finished ? (
                <Txt>
                  Import finished. Saved actions show sync progress and any
                  issues.
                </Txt>
              ) : (
                <Button
                  disabled={busy || !selected.length}
                  title={
                    busy
                      ? "Importing…"
                      : `Import ${selected.length} selected row${selected.length === 1 ? "" : "s"}`
                  }
                  onPress={() => {
                    void run(async (check) => {
                      for (const row of selected) {
                        check();
                        const saved = await execute(
                          row.command!,
                          row.payload!,
                          row.commandId!,
                        );
                        check();
                        if (saved.status === "discarded")
                          throw new Error(
                            "This import row was discarded. Review Saved actions before importing it again.",
                          );
                        setResults((current) => ({
                          ...current,
                          [row.sourceRow]:
                            saved.status === "synced"
                              ? "Imported and synced."
                              : "Saved on this device; waiting to sync.",
                        }));
                        setRows(
                          (current) =>
                            current?.map((item) =>
                              item.sourceRow === row.sourceRow
                                ? { ...item, selected: false }
                                : item,
                            ) ?? null,
                        );
                      }
                      setFinished(true);
                    });
                  }}
                />
              )}
              <Button
                secondary
                disabled={busy}
                title={
                  finished ? "Import another CSV" : "Back to column matching"
                }
                onPress={() => {
                  setRows(null);
                  setResults({});
                  setFinished(false);
                  if (finished) {
                    setTable(null);
                    setCsv("");
                  }
                }}
              />
            </Card>
            {rows.map((row) => (
              <Card key={row.sourceRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Import row ${row.sourceRow}`}
                  accessibilityState={{
                    checked: row.selected,
                    disabled:
                      busy ||
                      finished ||
                      !!results[row.sourceRow] ||
                      !!row.errors.length ||
                      row.duplicate === "file" ||
                      row.duplicate === "saved-action",
                  }}
                  disabled={
                    busy ||
                    finished ||
                    !!results[row.sourceRow] ||
                    !!row.errors.length ||
                    row.duplicate === "file" ||
                    row.duplicate === "saved-action"
                  }
                  onPress={() =>
                    setRows((current) =>
                      current!.map((item) =>
                        item.sourceRow === row.sourceRow
                          ? { ...item, selected: !item.selected }
                          : item,
                      ),
                    )
                  }
                  style={{
                    minHeight: 44,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Txt style={{ color: theme.primary, fontSize: 20 }}>
                    {row.selected ? "☑" : "☐"}
                  </Txt>
                  <Txt style={{ fontWeight: "700" }}>
                    Row {row.sourceRow} · {row.title}
                  </Txt>
                </Pressable>
                {row.errors.map((message, index) => (
                  <Txt key={index} style={{ color: theme.danger }}>
                    {message}
                  </Txt>
                ))}
                {row.duplicate && (
                  <Txt muted>{duplicateLabels[row.duplicate]}</Txt>
                )}
                {row.payload && (
                  <>
                    <PreviewTerms
                      payload={row.payload}
                      command={row.command!}
                    />
                    <Txt muted>
                      Person:{" "}
                      {String(
                        catalogName(
                          row.payload.contactId,
                          contactRows,
                          "displayName",
                        ),
                      )}{" "}
                      · Category:{" "}
                      {String(
                        catalogName(
                          row.payload.categoryId,
                          categoryRows,
                          "name",
                        ),
                      )}{" "}
                      · Source:{" "}
                      {String(
                        catalogName(
                          row.payload.paymentSourceId,
                          sourceRows,
                          "name",
                        ),
                      )}
                    </Txt>
                  </>
                )}
                {results[row.sourceRow] && <Txt>{results[row.sourceRow]}</Txt>}
              </Card>
            ))}
          </>
        )}
      </View>
    </Page>
  );
}
