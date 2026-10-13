import React, { useState } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import { text } from "../../core/domain/records";
import { addAttachment, downloadAttachment } from "./attachment-service";
import { Button, Card, Txt, Row, Failure } from "../../shared/ui";
export function AttachmentsPanel({
  targetType,
  targetId,
}: {
  targetType: "obligation" | "instance" | "payment";
  targetId: string;
}) {
  const { repo } = useSession(),
    files = useRecords("attachments"),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const rows =
    files.data?.rows.filter(
      (r) =>
        r.data.targetType === targetType &&
        r.data.targetId === targetId &&
        r.data.state !== "deleted",
    ) ?? [];
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      // A failed transfer may already have reserved its attachment slot.
      try {
        await files.refetch();
      } catch (e) {
        setError((current: unknown) => current ?? e);
      }
      setBusy(false);
    }
  }
  return (
    <Card>
      <Txt style={{ fontSize: 18 }}>Attachments</Txt>
      <Txt muted>
        Private receipts, agreements, and statements. Maximum 10 MiB each.
      </Txt>
      {rows.map((r) => (
        <Card key={r.id} style={{ padding: 12 }}>
          <Txt>{text(r.data, "filename")}</Txt>
          <Txt muted>
            {["awaitingUpload", "processing"].includes(text(r.data, "state"))
              ? "Upload unfinished. Retry with the same file."
              : text(r.data, "state")}
          </Txt>
          <Row>
            {["awaitingUpload", "processing"].includes(
              text(r.data, "state"),
            ) && (
              <Button
                secondary
                disabled={busy || !repo}
                title="Retry upload"
                onPress={() =>
                  void run(() => addAttachment(repo!, targetType, targetId, r))
                }
              />
            )}
            {r.data.state === "ready" && (
              <Button
                secondary
                disabled={busy}
                title="Download"
                onPress={() => void run(() => downloadAttachment(repo!, r))}
              />
            )}
            <Button
              secondary
              danger
              disabled={busy}
              title="Remove file"
              onPress={() =>
                void run(async () => {
                  await repo!.command(
                    "removeAttachment",
                    {
                      attachmentId: r.id,
                      expectedRevision: Number(r.data.revision),
                    },
                    Crypto.randomUUID(),
                  );
                })
              }
            />
          </Row>
        </Card>
      ))}
      <Button
        disabled={
          busy ||
          !repo ||
          files.isPending ||
          !!files.error ||
          rows.filter((r) =>
            ["awaitingUpload", "processing", "ready"].includes(
              text(r.data, "state"),
            ),
          ).length >= 10
        }
        title={busy ? "Working…" : "Add attachment"}
        onPress={() =>
          void run(() => addAttachment(repo!, targetType, targetId))
        }
      />
      {!!files.error && <Failure error={files.error} />}
      {!!error && <Failure error={error} />}
    </Card>
  );
}
