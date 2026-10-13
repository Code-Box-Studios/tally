import React, { useState } from "react";
import { useSession } from "../auth/session-provider";
import { Button, Card, Failure, Txt } from "../../shared/ui";
import { saveFile } from "../attachments/files";
import { collectExport, paymentsCsv } from "./data-export";

export function DataExportCard() {
  const { repo, profile, pending } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function download(format: "json" | "csv") {
    if (!repo || !profile || busy) return;
    setBusy(true);
    setError(null);
    let bytes: Uint8Array | undefined;
    try {
      const exported = await collectExport(repo, profile);
      const content =
        format === "json"
          ? JSON.stringify(exported, null, 2)
          : paymentsCsv(exported);
      bytes = new TextEncoder().encode(content);
      repo.check();
      await saveFile(
        bytes,
        `tally-${format === "json" ? "records" : "payments"}-${exported.generatedAt.slice(0, 10)}.${format}`,
        format === "json" ? "application/json" : "text/csv",
        () => repo.check(),
      );
    } catch (e) {
      setError(e);
    } finally {
      bytes?.fill(0);
      setBusy(false);
    }
  }
  return (
    <Card>
      <Txt style={{ fontSize: 19 }}>Export your data</Txt>
      <Txt muted>
        Keep a copy of your saved records. The spreadsheet includes payments and
        reversals. JSON includes all record collections.
      </Txt>
      <Txt muted>
        Attached file contents and unsynced actions are excluded. This export
        cannot be imported back into Tally.
      </Txt>
      {!!pending?.some(
        (action) => !["synced", "discarded"].includes(action.status),
      ) && (
        <Txt>
          Some actions are still waiting to sync. They will be missing from this
          export.
        </Txt>
      )}
      <Button
        secondary
        disabled={busy || !repo}
        title={busy ? "Preparing export…" : "Download payments (CSV)"}
        onPress={() => void download("csv")}
      />
      <Button
        secondary
        disabled={busy || !repo}
        title="Download all records (JSON)"
        onPress={() => void download("json")}
      />
      {!!error && <Failure error={error} />}
    </Card>
  );
}
