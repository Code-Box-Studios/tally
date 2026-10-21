import { SettlementPanel } from "../statements/settlement-panel";
import { PayoffSimulator } from "../payoff/payoff-simulator";
import { OwnerBorrowerPanel } from "../borrowers/owner-borrower-panel";
import React, { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import {
  amount,
  text,
  label,
  recordTitle,
  object,
  type Row,
} from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import { todayInZone, displayDate, civilDate } from "../../core/domain/date";
import {
  Heading,
  Page,
  Card,
  Txt,
  Button,
  Row as FlexRow,
  Pill,
  Form,
  Field,
  Choices,
  Failure,
  Loading,
  styles,
} from "../../shared/ui";
import { PaymentForm } from "../payments/payment-form";
import { DateField } from "../../shared/date-field";
import { ActionModal } from "../../shared/action-modal";
import { CorrectionForm } from "../payments/correction-form";
import { ObligationForm } from "./obligation-form";
import { LinkedInstallmentCard } from "./linked-installment-card";
import { hasComputedInterest, interestSummary } from "./interest-settings";
import { PeriodActionForm } from "../recurring/period-action-form";
import { AttachmentsPanel } from "../attachments/attachments-panel";
type Panel = {
  kind:
    | "settlement"
    | "payoff"
    | "borrower"
    | "pay"
    | "confirm"
    | "correct"
    | "amount"
    | "periodEdit"
    | "skip"
    | "failed"
    | "edit"
    | "cancel"
    | "lifecycle"
    | "reminder";
  subject?: Row;
  action?: string;
} | null;

function DetailPanel({
  panel,
  onClose,
  children,
}: React.PropsWithChildren<{
  panel: NonNullable<Panel>;
  onClose: () => void;
}>) {
  if (panel.kind === "edit") return <Card>{children}</Card>;
  const title =
    panel.kind === "lifecycle"
      ? `${label(panel.action!)} schedule`
      : {
          settlement: "Paid-in-full confirmation",
          payoff: "Payoff simulator",
          borrower: "Share with borrower",
          pay: "Record payment",
          confirm: "Confirm deduction",
          correct: "Correct payment",
          amount: "Set period amount",
          periodEdit: "Edit billing period",
          skip: "Skip billing period",
          failed: "Report failed deduction",
          cancel: "Cancel obligation",
          reminder: "Edit reminders",
        }[panel.kind];
  return (
    <ActionModal
      title={title}
      maxWidth={
        ["settlement", "payoff", "borrower"].includes(panel.kind) ? 820 : 600
      }
      onClose={onClose}
    >
      {children}
    </ActionModal>
  );
}

export function DetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
      id: string;
      instanceId?: string;
    }>(),
    parents = useRecords("obligations"),
    periods = useRecords("obligationInstances"),
    payments = useRecords("payments"),
    { profile, execute } = useSession();
  const [revealedPeriod, setRevealedPeriod] = useState<string | undefined>(
    undefined,
  );
  const [panel, setPanel] = useState<Panel>(null),
    [reason, setReason] = useState(""),
    [effectiveDate, setEffectiveDate] = useState(
      todayInZone(profile!.timezone),
    ),
    [offsets, setOffsets] = useState("3,0"),
    [time, setTime] = useState("09:00"),
    [enabled, setEnabled] = useState("yes");
  if (parents.isPending || periods.isPending || payments.isPending)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (parents.error || periods.error || payments.error)
    return (
      <Page>
        <Failure error={parents.error || periods.error || payments.error} />
      </Page>
    );
  const obligation = parents.data!.rows.find((r) => r.id === id);
  if (!obligation)
    return (
      <Page>
        <Failure error={new Error("This obligation is unavailable.")} />
      </Page>
    );
  const d = obligation.data,
    code = text(d, "currency"),
    recurring = d.section === "monthlyDues",
    instances = periods
      .data!.rows.filter((r) => r.data.obligationId === id)
      .sort((a, b) =>
        text(a.data, "dueDate").localeCompare(text(b.data, "dueDate")),
      ),
    history = payments
      .data!.rows.filter((r) => r.data.obligationId === id)
      .sort((a, b) =>
        text(b.data, "createdAt").localeCompare(text(a.data, "createdAt")),
      ),
    reversed = new Set(
      history
        .filter((r) => r.data.entryType === "reversal")
        .map((r) => r.data.reversesPaymentId),
    );
  const selectedPeriod =
    typeof instanceId === "string"
      ? instances.find((row) => row.id === instanceId)
      : undefined;
  const focusPeriod = selectedPeriod && revealedPeriod !== instanceId;
  const visibleInstances = focusPeriod ? [selectedPeriod] : instances;
  const done = () => {
    setPanel(null);
  };
  const modalOpen = panel !== null && panel.kind !== "edit";
  return (
    <Page>
      <Heading
        title={recordTitle(obligation)}
        subtitle={`${label(text(d, "section"))} · ${code}`}
        action={
          panel && !modalOpen ? (
            <Button secondary title="Back to obligation" onPress={done} />
          ) : (
            <FlexRow>
              {!recurring &&
                d.lifecycle === "active" &&
                d.financialStatus === "paid" &&
                d.remainingMinor === 0 && (
                  <Button
                    title="Paid-in-full confirmation"
                    onPress={() => setPanel({ kind: "settlement" })}
                  />
                )}
              {!recurring && (
                <Button
                  secondary
                  title="Payoff simulator"
                  onPress={() => setPanel({ kind: "payoff" })}
                />
              )}
              {!recurring && (
                <Button
                  secondary
                  title={
                    d.direction === "owedToMe"
                      ? "Share with borrower"
                      : "Borrower access"
                  }
                  onPress={() => setPanel({ kind: "borrower" })}
                />
              )}
              <Button
                secondary
                title="Edit obligation"
                onPress={() => setPanel({ kind: "edit" })}
              />
              {!!text(d, "contactId") && (
                <Button
                  secondary
                  title="Contact statement"
                  onPress={() =>
                    router.push({
                      pathname: "/statement",
                      params: { contactId: text(d, "contactId") },
                    } as Href)
                  }
                />
              )}
            </FlexRow>
          )
        }
      />
      <View style={{ gap: 20 }}>
        {panel && (
          <DetailPanel panel={panel} onClose={done}>
            {panel.kind === "settlement" ? (
              <SettlementPanel
                key={obligation.id}
                obligationId={obligation.id}
                onDone={done}
              />
            ) : panel.kind === "payoff" ? (
              <PayoffSimulator
                obligation={obligation}
                instances={instances}
                today={todayInZone(profile!.timezone)}
                onDone={done}
              />
            ) : panel.kind === "borrower" ? (
              <OwnerBorrowerPanel obligation={obligation} onDone={done} />
            ) : panel.kind === "edit" ? (
              <ObligationForm
                existing={obligation}
                instances={d.type === "installment" ? instances : []}
              />
            ) : panel.kind === "pay" || panel.kind === "confirm" ? (
              <PaymentForm
                obligation={obligation}
                instance={panel.subject}
                confirm={panel.kind === "confirm"}
                onDone={done}
              />
            ) : panel.kind === "correct" ? (
              <CorrectionForm
                obligation={obligation}
                payment={panel.subject!}
                onDone={done}
              />
            ) : ["amount", "periodEdit", "skip", "failed"].includes(
                panel.kind,
              ) ? (
              <PeriodActionForm
                obligation={obligation}
                instance={panel.subject!}
                action={
                  panel.kind === "periodEdit"
                    ? "edit"
                    : (panel.kind as "amount" | "skip" | "failed")
                }
                onDone={done}
              />
            ) : (
              <Form
                saveLabel="Save change"
                onCancel={done}
                onSave={async () => {
                  if (panel.kind === "reminder") {
                    await execute("setObligationReminder", {
                      obligationId: id,
                      expectedRevision: Number(d.revision),
                      reminderPolicy: {
                        enabled: enabled === "yes",
                        offsetDays: offsets.trim()
                          ? offsets.split(",").map(Number)
                          : [],
                        localTime: time,
                      },
                    });
                  } else if (panel.kind === "lifecycle") {
                    await execute("changeRecurringLifecycle", {
                      obligationId: id,
                      expectedRevision: Number(d.revision),
                      action: panel.action!,
                      effectiveDate: civilDate(effectiveDate),
                    });
                  } else {
                    if (!reason.trim())
                      throw new Error(
                        "Explain why this obligation is cancelled.",
                      );
                    await execute(
                      d.type === "installment"
                        ? "cancelInstallment"
                        : "cancelObligation",
                      {
                        obligationId: id,
                        expectedRevision: Number(d.revision),
                        reason,
                      },
                    );
                  }
                  done();
                }}
              >
                {panel.kind === "reminder" ? (
                  <>
                    <Choices
                      label="Reminders"
                      value={enabled}
                      options={[
                        { value: "yes", label: "Enabled" },
                        { value: "no", label: "Disabled" },
                      ]}
                      onChange={setEnabled}
                    />
                    <Field
                      label="Days before due"
                      value={offsets}
                      onChangeText={setOffsets}
                    />
                    <Field
                      label="Reminder time (HH:MM)"
                      value={time}
                      onChangeText={setTime}
                    />
                  </>
                ) : panel.kind === "lifecycle" ? (
                  <>
                    <Txt>
                      {label(panel.action!)} recurring schedule. Historical
                      periods remain.
                    </Txt>
                    <DateField
                      label="Effective date"
                      value={effectiveDate}
                      onChange={setEffectiveDate}
                      today={todayInZone(profile!.timezone)}
                    />
                  </>
                ) : (
                  <Field
                    label="Cancellation reason"
                    value={reason}
                    onChangeText={setReason}
                  />
                )}
              </Form>
            )}
          </DetailPanel>
        )}
        {(!panel || modalOpen) && (
          <>
            <LinkedInstallmentCard
              obligation={obligation}
              linked={parents.data!.rows.find(
                (row) => row.id === d.linkedObligationId,
              )}
            />
            <View style={styles.columns}>
              {[
                ["Original", amount(d, "originalAmountMinor")],
                ["Paid", amount(d, "totalPaidMinor")],
                ["Remaining", amount(d, "remainingMinor")],
              ].map(([name, value]) => (
                <Card key={name} style={styles.grow}>
                  <Txt muted>{name}</Txt>
                  <Txt big>
                    {recurring
                      ? name === "Original"
                        ? formatMoney(amount(d, "defaultAmountMinor"), code)
                        : "Per billing period"
                      : formatMoney(value as number | null, code)}
                  </Txt>
                </Card>
              ))}
            </View>
            <Card>
              <FlexRow>
                <Pill danger={d.financialStatus === "overdue"}>
                  {label(text(d, "financialStatus", text(d, "lifecycle")))}
                </Pill>
                <Pill>{label(text(d, "paymentMode"))}</Pill>
                <Txt muted>{displayDate(text(d, "nextDueDate") || null)}</Txt>
              </FlexRow>
              <Txt>{text(d, "description")}</Txt>
              <Txt muted>{text(d, "notes")}</Txt>
              {d.interestInfo && (
                <View style={{ gap: 6 }}>
                  <Txt style={{ fontWeight: "600" }}>Interest terms</Txt>
                  <Txt muted>
                    {interestSummary(object(d.interestInfo), code)}
                  </Txt>
                  {hasComputedInterest(object(d.interestInfo)) && (
                    <Txt muted>
                      Principal{" "}
                      {formatMoney(
                        amount(object(d.interestInfo), "principalMinor"),
                        code,
                      )}{" "}
                      · Interest included{" "}
                      {formatMoney(
                        amount(object(d.interestInfo), "interestMinor"),
                        code,
                      )}
                    </Txt>
                  )}
                  {!!text(object(d.interestInfo), "agreementNotes") && (
                    <Txt muted>
                      {text(object(d.interestInfo), "agreementNotes")}
                    </Txt>
                  )}
                </View>
              )}
              <FlexRow>
                {!recurring &&
                  d.lifecycle === "active" &&
                  Number(d.remainingMinor) > 0 && (
                    <Button
                      title="Record payment"
                      onPress={() => setPanel({ kind: "pay" })}
                    />
                  )}
                <Button
                  secondary
                  title={recurring ? "Edit bill reminders" : "Edit reminders"}
                  onPress={() => {
                    const policy = d.reminderPolicy
                      ? object(d.reminderPolicy)
                      : {};
                    setEnabled(policy.enabled === false ? "no" : "yes");
                    setOffsets(
                      Array.isArray(policy.offsetDays)
                        ? policy.offsetDays.join(",")
                        : "3,0",
                    );
                    setTime(text(policy, "localTime", "09:00"));
                    setPanel({ kind: recurring ? "edit" : "reminder" });
                  }}
                />
                {recurring && d.lifecycle !== "ended" ? (
                  <>
                    {d.lifecycle === "paused" ? (
                      <Button
                        secondary
                        title="Resume schedule"
                        onPress={() =>
                          setPanel({ kind: "lifecycle", action: "resume" })
                        }
                      />
                    ) : (
                      <Button
                        secondary
                        title="Pause schedule"
                        onPress={() =>
                          setPanel({ kind: "lifecycle", action: "pause" })
                        }
                      />
                    )}
                    <Button
                      secondary
                      danger
                      title="End schedule"
                      onPress={() =>
                        setPanel({ kind: "lifecycle", action: "end" })
                      }
                    />
                  </>
                ) : (
                  !recurring &&
                  d.lifecycle !== "cancelled" && (
                    <Button
                      secondary
                      danger
                      title="Cancel obligation"
                      onPress={() => setPanel({ kind: "cancel" })}
                    />
                  )
                )}
              </FlexRow>
            </Card>
          </>
        )}
        <Heading
          title={
            focusPeriod
              ? "Selected period"
              : recurring
                ? "Billing periods"
                : "Payment schedule"
          }
          action={
            focusPeriod ? (
              <Button
                secondary
                title="Show all periods"
                onPress={() => setRevealedPeriod(instanceId)}
              />
            ) : undefined
          }
        />
        {!!instanceId && !selectedPeriod && (
          <Txt muted>
            The linked period is unavailable. Showing this obligation’s
            schedule.
          </Txt>
        )}
        {visibleInstances.map((r) => (
          <Card key={r.id}>
            <FlexRow>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Txt style={{ fontWeight: "600" }}>
                  {text(r.data, "periodLabel", "Payment due")}
                </Txt>
                <Txt muted>{displayDate(text(r.data, "dueDate") || null)}</Txt>
              </View>
              <View style={{ gap: 5 }}>
                <Txt>
                  {formatMoney(amount(r.data, "remainingMinor"), code)}
                  remaining
                </Txt>
                <Txt muted>
                  {formatMoney(amount(r.data, "totalPaidMinor"), code)} paid
                </Txt>
                <Pill>
                  {label(
                    text(r.data, "deductionStatus") ||
                      text(r.data, "financialStatus"),
                  )}
                </Pill>
              </View>
            </FlexRow>
            <FlexRow>
              {r.data.closed !== true && Number(r.data.remainingMinor) > 0 && (
                <Button
                  title="Mark as paid"
                  onPress={() => setPanel({ kind: "pay", subject: r })}
                />
              )}
              {recurring && r.data.closed !== true && (
                <>
                  <Button
                    secondary
                    title="Set period amount"
                    onPress={() => setPanel({ kind: "amount", subject: r })}
                  />
                  <Button
                    secondary
                    title="Edit period"
                    onPress={() => setPanel({ kind: "periodEdit", subject: r })}
                  />
                  <Button
                    secondary
                    title="Skip period"
                    onPress={() => setPanel({ kind: "skip", subject: r })}
                  />
                </>
              )}
              {recurring &&
                ["expected", "deducted"].includes(
                  text(r.data, "deductionStatus"),
                ) && (
                  <>
                    <Button
                      title="Confirm deduction"
                      onPress={() => setPanel({ kind: "confirm", subject: r })}
                    />
                    <Button
                      secondary
                      danger
                      title="Deduction failed"
                      onPress={() => setPanel({ kind: "failed", subject: r })}
                    />
                  </>
                )}
            </FlexRow>
            {recurring && (
              <AttachmentsPanel targetType="instance" targetId={r.id} />
            )}
          </Card>
        ))}
        <Heading
          title="Payment history"
          subtitle="Every payment stays traceable."
        />
        {history.map((r) => (
          <Card key={r.id}>
            <FlexRow>
              <View style={{ flex: 1, minWidth: 150 }}>
                <Txt>
                  {r.data.entryType === "reversal"
                    ? "Payment reversed"
                    : "Payment recorded"}{" "}
                  · {displayDate(text(r.data, "paymentDate"))}
                </Txt>
                <Txt muted>
                  {label(
                    text(r.data, "provenance", text(r.data, "paymentMethod")),
                  )}
                </Txt>
              </View>
              <Txt style={{ fontSize: 20 }}>
                {r.data.entryType === "reversal" ? "−" : ""}
                {formatMoney(amount(r.data, "amountMinor"), code)}
              </Txt>
            </FlexRow>
            <Txt muted>
              {text(r.data, "notes") || text(r.data, "correctionReason")}
            </Txt>
            {r.data.entryType === "payment" && !reversed.has(r.id) && (
              <Button
                secondary
                title="Correct payment"
                onPress={() => setPanel({ kind: "correct", subject: r })}
              />
            )}
            <AttachmentsPanel targetType="payment" targetId={r.id} />
          </Card>
        ))}
        <AttachmentsPanel targetType="obligation" targetId={id} />
      </View>
    </Page>
  );
}
