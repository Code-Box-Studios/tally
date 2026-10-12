import React, { useState } from "react";
import { Platform, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useSession } from "../auth/session-provider";
import { formatStatementMoney } from "./statement-money";
import { displayDate } from "../../core/domain/date";
import { label } from "../../core/domain/records";
import {
  Button,
  Card,
  Empty,
  Failure,
  Heading,
  Loading,
  Page,
  Row,
  Txt,
} from "../../shared/ui";
import {
  buildStatement,
  statementTimestamp,
  type AccountStatement,
} from "./statement";
import { exportStatementPdf } from "./export-pdf";

export function StatementScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const { repo, profile, cached, pending } = useSession();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const query = useQuery({
    queryKey: [repo?.namespace, repo?.owner, "account-statement", contactId],
    enabled: !!repo && !!profile && !!contactId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [contacts, obligations, instances, payments, evidence] =
        await Promise.all([
          repo!.records("contacts"),
          repo!.records("obligations"),
          repo!.records("obligationInstances"),
          repo!.records("payments"),
          repo!.records("paymentEvidence"),
        ]);
      repo!.check();
      const contact = contacts.rows.find((r) => r.id === contactId);
      if (!contact)
        throw new Error(
          "This contact is unavailable. Open a contact to generate its statement.",
        );
      return buildStatement({
        contact,
        obligations: obligations.rows,
        instances: instances.rows,
        payments: payments.rows,
        evidence: evidence.rows,
        cached:
          cached ||
          [contacts, obligations, instances, payments, evidence].some(
            (r) => r.cached,
          ),
        issuedBy: profile!.displayName,
        timezone: profile!.timezone,
        generatedAt: new Date().toISOString(),
        pendingActions: pending.filter(
          (p) => !["synced", "discarded"].includes(p.status),
        ).length,
      });
    },
  });
  const statement = query.data;
  return (
    <Page maxWidth={980}>
      <Heading
        title="Statement of account"
        subtitle="Review current balances and complete recorded history."
      />
      {query.isPending || query.isFetching ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : statement ? (
        <View style={{ gap: 18 }}>
          <Row>
            <Button
              title={exporting ? "Preparing PDF…" : "Export PDF"}
              disabled={exporting}
              onPress={() => {
                setExporting(true);
                setExportError(null);
                void exportStatementPdf(statement, () => repo!.check())
                  .catch(setExportError)
                  .finally(() => setExporting(false));
              }}
            />
            <Button
              secondary
              title="Refresh statement"
              disabled={exporting}
              onPress={() => {
                setExportError(null);
                void query.refetch();
              }}
            />
          </Row>
          {Platform.OS === "web" && (
            <Txt muted>
              In the print dialog, choose Save as PDF. Allow pop-ups if your
              browser blocks the statement.
            </Txt>
          )}
          {!!exportError && <Failure error={exportError} />}
          <StatementPreview statement={statement} />
        </View>
      ) : null}
    </Page>
  );
}

function StatementPreview({ statement }: { statement: AccountStatement }) {
  return (
    <View style={{ gap: 18 }}>
      <Card>
        <Txt big>{statement.contactName}</Txt>
        {!!(statement.contactEmail || statement.contactPhone) && (
          <Txt muted>
            {[statement.contactEmail, statement.contactPhone]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
        )}
        <Txt>Prepared by {statement.issuedBy || "Your Tally account"}</Txt>
        <Txt muted>
          Generated{" "}
          {statementTimestamp(statement.generatedAt, statement.timezone)} ·{" "}
          {statement.timezone}
        </Txt>
        <Txt>
          {statement.cached
            ? "Cached data — reconnect to confirm current records."
            : "Current records loaded for this statement."}
        </Txt>
        <Txt muted>
          Balances reflect this snapshot at generation. Complete recorded
          history covers obligations currently linked to this contact.
        </Txt>
        <Txt muted>
          Each currency and each debt direction stays separate. Cancelled and
          archived obligations and skipped or cancelled periods are excluded
          from payable totals.
        </Txt>
        <Txt muted>
          Recurring totals cover generated billing periods only. Unknown bill
          amounts are excluded until entered.
        </Txt>
        {statement.pendingActions > 0 && (
          <Txt>
            {statement.pendingActions} saved action(s) await confirmation and
            are excluded from this statement.
          </Txt>
        )}
        {statement.assumedPayments > 0 && (
          <Txt>
            {statement.assumedPayments} automatic payment(s) remain unconfirmed
            / assumed. Totals reflect the recorded ledger.
          </Txt>
        )}
      </Card>
      <Heading title="Current balances" />
      {statement.summaries.map((summary) => (
        <Card key={summary.currency}>
          <Txt style={{ fontWeight: "600" }}>{summary.currency}</Txt>
          <Row>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Txt muted>You owe {statement.contactName}</Txt>
              <Txt big>
                {formatStatementMoney(summary.youOweMinor, summary.currency)}
              </Txt>
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Txt muted>{statement.contactName} owes you</Txt>
              <Txt big>
                {formatStatementMoney(summary.owedToYouMinor, summary.currency)}
              </Txt>
            </View>
          </Row>
          {summary.unknownAmounts > 0 && (
            <Txt>
              {summary.unknownAmounts} bill amount(s) needed. Totals include
              known amounts only.
            </Txt>
          )}
        </Card>
      ))}
      {!statement.accounts.length && (
        <Empty
          title="No linked obligations"
          description="This contact has no obligations in your current records."
        />
      )}
      <Heading title="Obligations and billing periods" />
      {statement.accounts.map((account) => (
        <Card key={account.id}>
          <Txt style={{ fontSize: 19, fontWeight: "600" }}>{account.title}</Txt>
          <Txt muted>
            {label(account.section)} · {account.currency} · {account.status}
          </Txt>
          {account.excluded && (
            <Txt>Informational; excluded from payable totals.</Txt>
          )}
          <Txt muted>Obligation · {account.id}</Txt>
          {!!account.dueDate && (
            <Txt muted>Due {displayDate(account.dueDate)}</Txt>
          )}
          <Row>
            <View style={{ minWidth: 140 }}>
              <Txt muted>
                {account.section === "monthlyDues"
                  ? "Generated amount"
                  : "Original amount"}
              </Txt>
              <Txt>
                {formatStatementMoney(account.originalMinor, account.currency)}
              </Txt>
            </View>
            <View style={{ minWidth: 140 }}>
              <Txt muted>Recorded paid</Txt>
              <Txt>
                {formatStatementMoney(account.paidMinor, account.currency)}
              </Txt>
            </View>
            <View style={{ minWidth: 140 }}>
              <Txt muted>
                {account.excluded ? "Recorded balance" : "Remaining"}
              </Txt>
              <Txt>
                {formatStatementMoney(account.remainingMinor, account.currency)}
                {account.unknownAmounts ? " · Known amounts only" : ""}
              </Txt>
            </View>
          </Row>
          {account.principalMinor !== null && (
            <Txt>
              Principal{" "}
              {formatStatementMoney(account.principalMinor, account.currency)} ·
              Interest amount{" "}
              {formatStatementMoney(account.interestMinor, account.currency)}
            </Txt>
          )}
          {!!account.interestPolicy && (
            <Txt muted>{account.interestPolicy}</Txt>
          )}
          {account.section === "monthlyDues" && !account.periods.length && (
            <Txt muted>No billing periods generated yet.</Txt>
          )}
          {account.periods.map((period) => (
            <View key={period.id} style={{ gap: 4, paddingTop: 12 }}>
              <Txt style={{ fontWeight: "600" }}>
                {period.title} · {period.status}
              </Txt>
              {!!period.dueDate && (
                <Txt muted>Due {displayDate(period.dueDate)}</Txt>
              )}
              <Txt>
                Amount{" "}
                {formatStatementMoney(period.originalMinor, account.currency)} ·
                Paid {formatStatementMoney(period.paidMinor, account.currency)}{" "}
                · Remaining{" "}
                {formatStatementMoney(period.remainingMinor, account.currency)}
              </Txt>
              {period.excluded && (
                <Txt muted>Excluded from payable totals.</Txt>
              )}
              <Txt muted>Period · {period.id}</Txt>
            </View>
          ))}
        </Card>
      ))}
      <Heading
        title="All recorded payments and reversals"
        subtitle="Original entries remain visible after correction."
      />
      <Txt muted>
        Payment date reflects the original payment. Recorded date reflects when
        each entry was saved, including corrections.
      </Txt>
      {statement.history.map((entry) => (
        <Card key={entry.id}>
          <Txt style={{ fontWeight: "600" }}>{entry.title}</Txt>
          <Txt>
            {entry.entryType === "reversal" ? "Reversal" : "Payment"} ·{" "}
            {entry.id}
          </Txt>
          <Txt big>
            {formatStatementMoney(entry.signedAmountMinor, entry.currency)}
          </Txt>
          <Txt muted>
            {entry.direction === "owedToMe"
              ? "Received from contact"
              : "Paid to contact"}{" "}
            · {entry.method}
            {entry.source ? ` · ${entry.source}` : ""}
          </Txt>
          <Txt>{entry.provenanceLabel}</Txt>
          {!!entry.confirmationReference && (
            <Txt muted>User confirmation · {entry.confirmationReference}</Txt>
          )}
          <Txt>Payment date · {displayDate(entry.paymentDate)}</Txt>
          <Txt muted>
            Recorded ·{" "}
            {statementTimestamp(entry.recordedAt, statement.timezone)}
          </Txt>
          {entry.reversed && (
            <Txt muted>
              This payment was reversed. The reversal remains below.
            </Txt>
          )}
          {!!entry.reversesPaymentId && (
            <Txt>Reverses payment · {entry.reversesPaymentId}</Txt>
          )}
          {!!entry.notes && <Txt>{entry.notes}</Txt>}
        </Card>
      ))}
      {!statement.history.length && (
        <Txt muted>No recorded payments or reversals.</Txt>
      )}
      <Txt muted>
        Prepared from your Tally records. Informational statement; independent
        obligations remain separate.
      </Txt>
    </View>
  );
}
