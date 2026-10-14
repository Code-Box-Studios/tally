import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Platform, View } from "react-native";
import { useSession } from "../auth/session-provider";
import { displayDate } from "../../core/domain/date";
import { formatMoney } from "../../core/domain/money";
import { Button, Failure, Loading, Row, Txt } from "../../shared/ui";
import { useTheme } from "../../shared/theme";
import { exportHtmlPdf } from "../../shared/pdf-export";
import { fetchSettlement, type Settlement } from "./settlement";
import { settlementHtml } from "./settlement-html";
import { statementTimestamp } from "./statement";

export function SettlementPanel({
  obligationId,
  onDone,
}: {
  obligationId: string;
  onDone: () => void;
}) {
  const { repo, pending } = useSession();
  const theme = useTheme();
  const [document, setDocument] = useState<Settlement | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(true);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const check = useCallback(() => {
    repo!.check();
    if (!mounted.current)
      throw new Error("The confirmation was closed. Open it again to export.");
    if (
      pendingRef.current.some(
        (p) => !["synced", "discarded"].includes(p.status),
      )
    )
      throw new Error(
        "Sync or discard your pending changes before generating a paid-in-full confirmation.",
      );
  }, [repo]);
  const prepare = useCallback(async () => {
    check();
    const fresh = await fetchSettlement(repo!, obligationId);
    check();
    return fresh;
  }, [check, repo, obligationId]);
  const run = useCallback(
    async (exporting: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (exporting) {
          // The helper reserves the web window before this callback awaits the server.
          await exportHtmlPdf(
            "Save Tally paid-in-full confirmation",
            async () => {
              const fresh = await prepare();
              setDocument(fresh);
              return settlementHtml(fresh);
            },
            check,
          );
        } else setDocument(await prepare());
      } catch (e) {
        if (mounted.current) {
          setError(e);
          setDocument(null);
        }
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [check, prepare],
  );
  useEffect(() => {
    mounted.current = true;
    void prepare()
      .then((fresh) => {
        if (mounted.current) setDocument(fresh);
      })
      .catch((e: unknown) => {
        if (mounted.current) setError(e);
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [prepare]);
  const detail = (label: string, value: string) => (
    <View style={{ flex: 1, minWidth: 130, gap: 4 }}>
      <Txt muted>{label}</Txt>
      <Txt style={{ fontWeight: "600" }}>{value}</Txt>
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      <Txt style={{ fontSize: 22, fontWeight: "600" }}>
        Paid-in-full confirmation
      </Txt>
      <Txt muted>Share a PDF showing this loan has been settled.</Txt>
      {error ? (
        <>
          <Failure error={error} />
          <Button
            secondary
            title="Try again"
            disabled={busy}
            onPress={() => void run(false)}
          />
        </>
      ) : null}
      {busy ? <Loading label="Verifying saved payments…" /> : null}
      {document ? (
        <>
          <View
            style={{
              gap: 16,
              padding: 20,
              backgroundColor: theme.background,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Txt style={{ fontSize: 18, fontWeight: "600" }}>
              {document.title}
            </Txt>
            <Row>
              {detail("Lender", document.lender)}
              {detail("Borrower", document.borrower)}
            </Row>
            <View style={{ gap: 4 }}>
              <Txt muted>Remaining balance</Txt>
              <Txt style={{ fontSize: 30, fontWeight: "600" }}>
                {formatMoney(0, document.currency)}
              </Txt>
            </View>
            <Row>
              {detail(
                "Net payments received",
                formatMoney(document.paidMinor, document.currency),
              )}
              {detail("Settled on", displayDate(document.settlementDate))}
            </Row>
            {document.principalMinor !== null &&
            document.interestMinor !== null ? (
              <Row>
                {detail(
                  "Principal",
                  formatMoney(document.principalMinor, document.currency),
                )}
                {detail(
                  "Recorded interest / charges",
                  formatMoney(document.interestMinor, document.currency),
                )}
              </Row>
            ) : null}
            <Txt muted>
              {document.paymentCount} confirmed{" "}
              {document.paymentCount === 1 ? "payment" : "payments"} ·{" "}
              {document.currency}
            </Txt>
            <Txt muted style={{ fontSize: 12 }}>
              Verified{" "}
              {statementTimestamp(document.generatedAt, document.timezone)} (
              {document.timezone})
            </Txt>
          </View>
          {document.lender === "Name not recorded" ||
          document.borrower === "Name not recorded" ? (
            <Txt muted>
              Add the missing name in your profile or linked contact for a more
              useful confirmation.
            </Txt>
          ) : null}
          <Txt muted>
            The PDF includes the loan reference and recorded totals. Records are
            checked again when you export.
          </Txt>
          {Platform.OS === "web" ? (
            <Txt muted>
              Choose Save as PDF in the print dialog. On iPhone, expand the
              print preview, then tap Share to save or send the PDF.
            </Txt>
          ) : null}
          <Button
            title="Export PDF"
            disabled={busy}
            onPress={() => void run(true)}
          />
        </>
      ) : null}
      <Button secondary title="Close confirmation" onPress={onDone} />
    </View>
  );
}
