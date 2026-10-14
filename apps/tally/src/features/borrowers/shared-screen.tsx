import React, { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useSession } from "../auth/session-provider";
import {
  type Data,
  object,
  text,
  amount,
  label,
} from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import { displayDate } from "../../core/domain/date";
import {
  Page,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Pill,
  Failure,
  Loading,
  Empty,
} from "../../shared/ui";
import { BorrowerProofForm } from "./borrower-proof-form";
import { addProofFile, downloadProofFile } from "./proof-files";

function list(data: Data | undefined, key: string): Data[] {
  const value = data?.[key];
  if (value == null) return [];
  if (!Array.isArray(value))
    throw new Error("Shared records could not be verified.");
  return value.map(object);
}

export function SharedScreen() {
  const { repo } = useSession();
  return <SharedContent key={`${repo?.namespace}:${repo?.owner}`} />;
}

function SharedContent() {
  const { repo, cached } = useSession();
  const [selected, setSelected] = useState<Data | null>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false);
  const shares = useQuery({
    queryKey: [repo?.namespace, repo?.owner, "sharedWithMe"],
    queryFn: () => repo!.invoke("borrowerList", {}),
    enabled: !!repo && !cached,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
    retry: false,
  });
  const detail = useQuery({
    queryKey: [
      repo?.namespace,
      repo?.owner,
      "sharedLoan",
      selected?.ownerId,
      selected?.shareId,
    ],
    queryFn: () =>
      repo!.invoke("borrowerView", {
        ownerId: selected!.ownerId,
        shareId: selected!.shareId,
      }),
    enabled: !!repo && !!selected && !cached,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
    retry: false,
  });
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      repo!.check();
      await Promise.all([
        shares.refetch(),
        selected ? detail.refetch() : Promise.resolve(),
      ]);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const result = detail.data,
    loan = result?.loan ? object(result.loan) : null;
  const code = loan ? text(loan, "currency") : "PHP";
  const submissions = list(result, "submissions"),
    attachments = list(result, "attachments");
  return (
    <Page maxWidth={900}>
      <Heading
        title="Shared with me"
        subtitle="Loans shared with your verified email. Your own records stay separate."
        action={
          <Button
            secondary
            title="Refresh"
            disabled={busy || cached}
            onPress={() => void run(async () => {})}
          />
        }
      />
      <View style={{ gap: 16 }}>
        {cached ? (
          <Empty
            title="Connect to view shared loans"
            description="Shared balances and access are checked online each time."
          />
        ) : (
          <>
            {!!error && <Failure error={error} />}
            {selected ? (
              <>
                <Button
                  secondary
                  title="All shared loans"
                  onPress={() => {
                    setSelected(null);
                    setAdding(false);
                    setError(null);
                  }}
                />
                {detail.isPending ? (
                  <Loading />
                ) : detail.error ? (
                  <Failure
                    error={detail.error}
                    retry={() => void detail.refetch()}
                  />
                ) : (
                  loan && (
                    <>
                      <Card>
                        <Txt muted>Shared by {text(result!, "ownerName")}</Txt>
                        <Txt big>{text(loan, "title")}</Txt>
                        <Txt muted>Remaining balance</Txt>
                        <Txt big>
                          {formatMoney(
                            amount(loan, "remainingMinor") ?? 0,
                            code,
                          )}
                        </Txt>
                        <Row>
                          <Pill>
                            {label(text(loan, "financialStatus", "pending"))}
                          </Pill>
                          <Txt muted>
                            Loan total{" "}
                            {formatMoney(
                              amount(loan, "originalAmountMinor") ?? 0,
                              code,
                            )}
                          </Txt>
                        </Row>
                        <Txt muted>
                          Paid{" "}
                          {formatMoney(
                            amount(loan, "totalPaidMinor") ?? 0,
                            code,
                          )}
                        </Txt>
                        {Number(loan.remainingMinor) > 0 &&
                          loan.lifecycle === "active" &&
                          !adding && (
                            <Button
                              title="Submit payment proof"
                              disabled={busy}
                              onPress={() => setAdding(true)}
                            />
                          )}
                      </Card>
                      {adding && (
                        <Card>
                          <BorrowerProofForm
                            ownerId={text(selected, "ownerId")}
                            shareId={text(selected, "shareId")}
                            loan={loan}
                            timezone={text(result!, "timezone", "Asia/Manila")}
                            onDone={() => {
                              setAdding(false);
                              void detail.refetch();
                            }}
                          />
                        </Card>
                      )}
                      <Card>
                        <Txt big>Payment schedule</Txt>
                        {list(loan, "schedule").map((period, index) => (
                          <View
                            key={text(period, "instanceId", String(index))}
                            style={{ gap: 4, paddingVertical: 10 }}
                          >
                            <Row>
                              <Txt>
                                {text(period, "dueDate")
                                  ? displayDate(text(period, "dueDate"))
                                  : "No due date"}
                              </Txt>
                              <Pill>
                                {label(
                                  text(period, "financialStatus", "pending"),
                                )}
                              </Pill>
                            </Row>
                            <Txt>
                              {formatMoney(
                                amount(period, "remainingMinor") ?? 0,
                                code,
                              )}{" "}
                              remaining of{" "}
                              {formatMoney(
                                amount(period, "amountMinor") ?? 0,
                                code,
                              )}
                            </Txt>
                          </View>
                        ))}
                      </Card>
                      <Card>
                        <Txt big>Your payment proofs</Txt>
                        <Txt muted>
                          Only approved payments reduce the balance. Drafts are
                          not submitted for review until you send them.
                        </Txt>
                        {!submissions.length && (
                          <Txt muted>No proofs submitted yet.</Txt>
                        )}
                        {submissions.map((submission) => {
                          const id = text(submission, "submissionId"),
                            status = text(submission, "status"),
                            files = attachments.filter(
                              (file) => file.targetId === id,
                            );
                          const scope = {
                            ownerId: selected.ownerId,
                            shareId: selected.shareId,
                            submissionId: id,
                          };
                          return (
                            <Card key={id} style={{ padding: 14 }}>
                              <Row>
                                <Txt big>
                                  {formatMoney(
                                    amount(submission, "amountMinor") ?? 0,
                                    text(submission, "currency"),
                                  )}
                                </Txt>
                                <Pill>{label(status)}</Pill>
                              </Row>
                              <Txt>
                                {displayDate(text(submission, "paymentDate"))}
                              </Txt>
                              {!!text(submission, "reference") && (
                                <Txt>
                                  Reference: {text(submission, "reference")}
                                </Txt>
                              )}
                              {!!text(submission, "message") && (
                                <Txt>{text(submission, "message")}</Txt>
                              )}
                              {!!text(submission, "reason") && (
                                <Txt muted>{text(submission, "reason")}</Txt>
                              )}
                              {files.map((file) => (
                                <View
                                  key={text(file, "attachmentId")}
                                  style={{ gap: 6 }}
                                >
                                  <Txt muted>
                                    {text(file, "filename")} ·{" "}
                                    {file.state === "ready"
                                      ? "Attached"
                                      : "Unfinished — select the same file to retry"}
                                  </Txt>
                                  {file.state === "ready" && (
                                    <Button
                                      secondary
                                      title={`Download ${text(file, "filename")}`}
                                      disabled={busy}
                                      onPress={() =>
                                        void run(() =>
                                          downloadProofFile(
                                            repo!,
                                            text(selected, "ownerId"),
                                            text(selected, "shareId"),
                                            id,
                                            file,
                                          ),
                                        )
                                      }
                                    />
                                  )}
                                </View>
                              ))}
                              {status === "draft" && (
                                <>
                                  <Button
                                    secondary
                                    title="Attach receipt or screenshot"
                                    disabled={busy}
                                    onPress={() =>
                                      void run(() =>
                                        addProofFile(
                                          repo!,
                                          text(selected, "ownerId"),
                                          text(selected, "shareId"),
                                          id,
                                        ),
                                      )
                                    }
                                  />
                                  <Txt muted>
                                    Optional JPEG, PNG, WebP or PDF, up to 10
                                    MiB. Sending shares these details and files
                                    with the owner.
                                  </Txt>
                                  <Button
                                    title="Send proof for approval"
                                    disabled={
                                      busy ||
                                      files.some(
                                        (file) => file.state !== "ready",
                                      )
                                    }
                                    onPress={() =>
                                      void run(() =>
                                        repo!.invoke("borrowerSubmit", {
                                          ...scope,
                                          commandId: `submit-${id}`,
                                        }),
                                      )
                                    }
                                  />
                                </>
                              )}
                              {["draft", "pending"].includes(status) && (
                                <Button
                                  secondary
                                  title={
                                    status === "draft"
                                      ? "Discard draft"
                                      : "Withdraw proof"
                                  }
                                  disabled={busy}
                                  onPress={() =>
                                    void run(() =>
                                      repo!.invoke("borrowerWithdraw", {
                                        ...scope,
                                        commandId: `withdraw-${id}`,
                                      }),
                                    )
                                  }
                                />
                              )}
                            </Card>
                          );
                        })}
                      </Card>
                      <Card>
                        <Txt big>Recorded payments</Txt>
                        {!list(loan, "payments").length && (
                          <Txt muted>No payments recorded yet.</Txt>
                        )}
                        {list(loan, "payments").map((payment) => (
                          <View
                            key={text(payment, "paymentId")}
                            style={{ gap: 4, paddingVertical: 8 }}
                          >
                            <Txt>
                              {displayDate(text(payment, "paymentDate"))} ·{" "}
                              {payment.entryType === "reversal"
                                ? "Reversed "
                                : ""}
                              {formatMoney(
                                amount(payment, "amountMinor") ?? 0,
                                code,
                              )}
                            </Txt>
                          </View>
                        ))}
                      </Card>
                    </>
                  )
                )}
              </>
            ) : shares.isPending ? (
              <Loading />
            ) : shares.error ? (
              <Failure
                error={shares.error}
                retry={() => void shares.refetch()}
              />
            ) : (
              <>
                {!list(shares.data, "shares").length && (
                  <Empty
                    title="No shared loans yet"
                    description="Ask the lender to open a loan, choose Share with borrower, and invite the email you use for Tally."
                  />
                )}
                {list(shares.data, "shares").map((share) => (
                  <Card key={`${share.ownerId}:${share.shareId}`}>
                    <Txt big>{text(share, "title")}</Txt>
                    <Txt muted>Shared by {text(share, "ownerName")}</Txt>
                    {share.status === "invited" ? (
                      <>
                        <Txt muted>
                          Accept to see your balance and schedule and send
                          payment proof.
                        </Txt>
                        <Button
                          title="Accept invitation"
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              await repo!.invoke("borrowerAccept", {
                                ownerId: share.ownerId,
                                shareId: share.shareId,
                                commandId: Crypto.randomUUID(),
                              });
                              repo!.check();
                              setSelected(share);
                            })
                          }
                        />
                      </>
                    ) : (
                      <Button
                        title="View shared loan"
                        onPress={() => setSelected(share)}
                      />
                    )}
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </View>
    </Page>
  );
}
