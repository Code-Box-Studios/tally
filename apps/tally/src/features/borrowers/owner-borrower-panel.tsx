import React, { useEffect, useRef, useState } from "react";
import { Platform, Share, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { TallyRepository } from "../../core/backend/repository";
import { civilDate } from "../../core/domain/date";
import { currency, formatMoney, minor } from "../../core/domain/money";
import {
  amount,
  label,
  object,
  text,
  type Data,
  type Row,
} from "../../core/domain/records";
import { useRecords } from "../../shared/queries";
import { SelectField } from "../../shared/select-field";
import {
  Button,
  Card,
  Choices,
  Failure,
  Field,
  Loading,
  Txt,
} from "../../shared/ui";
import { useTheme } from "../../shared/theme";
import { useSession } from "../auth/session-provider";
import { downloadAttachment } from "../attachments/attachment-service";
import { canonicalCommand } from "../sync/data/command-identity";

const methods = ["cash", "bankTransfer", "card", "eWallet", "payroll", "other"];
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
interface ReviewData {
  shares: Data[];
  submissions: Data[];
  attachments: Data[];
  intents: Record<string, Data>;
  fetchedAt: number;
}
const intentKey = (repo: TallyRepository, submissionId: string) =>
  repo.prefix + "upload:borrower-review:" + submissionId;

function verifyIntent(input: unknown, submissionId: string): Data {
  const value = object(input);
  if (
    value.submissionId !== submissionId ||
    !["approve", "reject"].includes(String(value.decision)) ||
    typeof value.reason !== "string" ||
    value.reason.length > 500 ||
    !methods.includes(String(value.paymentMethod)) ||
    (value.paymentSourceId !== null && !identifier(value.paymentSourceId)) ||
    Object.keys(value).length !== 5
  )
    throw new Error(
      "The saved review could not be verified. Refresh before continuing.",
    );
  return value;
}

async function fetchReview(
  repo: TallyRepository,
  obligation: Row,
): Promise<ReviewData> {
  repo.check();
  const response = await repo.invoke("getBorrowerReview", {
    obligationId: obligation.id,
  });
  repo.check();
  if (
    ![response.shares, response.submissions, response.attachments].every(
      Array.isArray,
    )
  )
    throw new Error("Borrower records could not be verified.");
  const shares = (response.shares as Data[]).map(object),
    submissions = (response.submissions as Data[]).map(object),
    attachments = (response.attachments as Data[]).map(object);
  if (
    shares.some(
      (share) =>
        share.userId !== repo.owner ||
        share.obligationId !== obligation.id ||
        !identifier(share.shareId) ||
        !["invited", "active", "revoked"].includes(String(share.status)),
    ) ||
    submissions.some(
      (submission) =>
        submission.obligationId !== obligation.id ||
        !identifier(submission.submissionId) ||
        !["pending", "approved", "rejected", "withdrawn"].includes(
          String(submission.status),
        ),
    )
  )
    throw new Error("Borrower records could not be verified.");
  const ids = new Set(submissions.map((submission) => submission.submissionId));
  if (
    attachments.some(
      (attachment) =>
        attachment.userId !== repo.owner ||
        attachment.obligationId !== obligation.id ||
        attachment.targetType !== "borrowerSubmission" ||
        attachment.state !== "ready" ||
        !identifier(attachment.attachmentId),
    )
  )
    throw new Error("Borrower records could not be verified.");
  const intents: Record<string, Data> = {};
  for (const submission of submissions) {
    currency(submission.currency);
    minor(submission.amountMinor);
    civilDate(String(submission.paymentDate));
    if (submission.status !== "pending") continue;
    const id = String(submission.submissionId),
      saved = await repo.transferIntent(intentKey(repo, id));
    repo.check();
    if (saved) intents[id] = verifyIntent(JSON.parse(saved), id);
  }
  return {
    shares,
    submissions,
    attachments: attachments.filter((attachment) =>
      ids.has(attachment.targetId),
    ),
    intents,
    fetchedAt: Date.now(),
  };
}

export function OwnerBorrowerPanel({
  obligation,
  onDone,
}: {
  obligation: Row;
  onDone?: () => void;
}) {
  const { repo } = useSession();
  if (!repo) return <Loading />;
  if (obligation.data.userId !== repo.owner)
    return (
      <Failure
        error={new Error("This loan is unavailable for this account.")}
      />
    );
  if (
    !["owedToMe", "owedByMe", "installment"].includes(
      text(obligation.data, "type"),
    )
  )
    return null;
  return (
    <OwnerBorrowerWorkspace
      key={`${repo.namespace}:${repo.owner}:${obligation.id}`}
      repo={repo}
      obligation={obligation}
      onDone={onDone}
    />
  );
}

function OwnerBorrowerWorkspace({
  repo,
  obligation,
  onDone,
}: {
  repo: TallyRepository;
  obligation: Row;
  onDone?: () => void;
}) {
  const client = useQueryClient(),
    theme = useTheme();
  const [email, setEmail] = useState(""),
    [invite, setInvite] = useState<string | null>(null),
    [revoke, setRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const locked = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const review = useQuery({
    queryKey: [repo.namespace, repo.owner, "borrowerReview", obligation.id],
    queryFn: () => fetchReview(repo, obligation),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    networkMode: "always",
  });
  const check = () => {
    repo.check();
    if (!live.current) throw new Error("Your sign-in changed.");
  };
  const refresh = async () => {
    check();
    const result = await review.refetch();
    check();
    if (result.error || !result.data)
      throw result.error ?? new Error("Borrower records are unavailable.");
    return result.data;
  };
  const run = async (task: () => Promise<void> | void) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      check();
      await task();
      check();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      locked.current = false;
      if (live.current) setBusy(false);
    }
  };
  const changed = async (payment = false) => {
    if (payment)
      await client.invalidateQueries({
        queryKey: [repo.namespace, repo.owner],
      });
    check();
    await refresh();
    check();
  };
  if (review.isPending)
    return (
      <View style={{ gap: 16 }}>
        <Loading />
        <Txt muted>Loading borrower access…</Txt>
      </View>
    );
  if (review.error || !review.data)
    return (
      <View style={{ gap: 16 }}>
        <Txt big>Borrower access</Txt>
        <Failure
          error={review.error ?? new Error("Borrower records are unavailable.")}
          retry={() => {
            void review.refetch();
          }}
        />
      </View>
    );
  const data = review.data;
  const canInvite =
    obligation.data.direction === "owedToMe" &&
    obligation.data.lifecycle !== "cancelled";
  const openShare = data.shares.some(
    (share) =>
      share.status === "active" ||
      (share.status === "invited" &&
        (!share.expiresAt ||
          Date.parse(String(share.expiresAt)) > data.fetchedAt)),
  );
  const link =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    /^https?:$/.test(window.location.protocol)
      ? window.location.origin + "/borrower"
      : "https://tally-code-box-studios.vercel.app/borrower";
  return (
    <View style={{ gap: 16 }}>
      <Txt big style={{ fontSize: 21 }}>
        Borrower access
      </Txt>
      <Txt muted>
        The borrower signs in with the invited, verified email to see this
        loan’s balance, schedule and payment history. Your private notes and
        payment sources stay private.
      </Txt>
      <Txt muted>
        Invitations expire after 7 days. Tally does not send an email; share the
        borrower link yourself. Reviewing proofs requires an internet
        connection.
      </Txt>
      {error ? <Failure error={new Error(error)} /> : null}
      {message ? <Txt>{message}</Txt> : null}
      {canInvite && !openShare && (
        <View style={{ gap: 12 }}>
          {invite ? (
            <>
              <Txt>
                Invite {invite} to view “{text(obligation.data, "title")}” for
                this loan only. They must accept within 7 days.
              </Txt>
              <Button
                disabled={busy}
                title="Create invitation"
                onPress={() => {
                  void run(async () => {
                    const result = await repo.command(
                      "createBorrowerShare",
                      { obligationId: obligation.id, email: invite },
                      Crypto.randomUUID(),
                    );
                    check();
                    if (!identifier(result.shareId))
                      throw new Error(
                        "Invitation response could not be verified. Refresh borrower access.",
                      );
                    setInvite(null);
                    setEmail("");
                    await changed();
                  });
                }}
              />
              <Button
                secondary
                disabled={busy}
                title="Edit invitation"
                onPress={() => setInvite(null)}
              />
            </>
          ) : (
            <>
              <Field
                label="Borrower email"
                value={email}
                onChangeText={setEmail}
                editable={!busy}
                autoCapitalize="none"
                keyboardType="email-address"
                maxLength={254}
              />
              <Button
                disabled={busy || !email.trim()}
                title="Review invitation"
                onPress={() => {
                  void run(() => {
                    const value = email.trim().toLowerCase();
                    if (
                      !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value) ||
                      value.length > 254
                    )
                      throw new Error("Enter a valid borrower email.");
                    setInvite(value);
                  });
                }}
              />
            </>
          )}
        </View>
      )}
      {data.shares.map((share) => (
        <View key={String(share.shareId)} style={{ gap: 10 }}>
          <Txt>
            {label(text(share, "status"))} · {text(share, "inviteEmail")}
          </Txt>
          {share.status === "invited" && !!share.expiresAt && (
            <Txt muted>
              Expires {new Date(String(share.expiresAt)).toLocaleDateString()}
            </Txt>
          )}
          {share.status !== "revoked" &&
            (revoke === share.shareId ? (
              <>
                <Txt>
                  Revoke access for {text(share, "inviteEmail")}? They will lose
                  access to this loan. Received proofs remain available for
                  review.
                </Txt>
                <Button
                  danger
                  disabled={busy}
                  title="Confirm revoke"
                  onPress={() => {
                    void run(async () => {
                      const result = await repo.command(
                        "revokeBorrowerShare",
                        { shareId: share.shareId },
                        Crypto.randomUUID(),
                      );
                      check();
                      if (result.shareId !== share.shareId)
                        throw new Error(
                          "Revocation response could not be verified. Refresh borrower access.",
                        );
                      setRevoke(null);
                      await changed();
                    });
                  }}
                />
                <Button
                  secondary
                  disabled={busy}
                  title="Keep access"
                  onPress={() => setRevoke(null)}
                />
              </>
            ) : (
              <Button
                secondary
                disabled={busy}
                title="Revoke access"
                onPress={() => setRevoke(String(share.shareId))}
              />
            ))}
        </View>
      ))}
      {openShare && (
        <View style={{ gap: 10 }}>
          <Txt>Borrower link</Txt>
          <Text selectable style={{ color: theme.primary, fontSize: 14 }}>
            {link}
          </Text>
          <Button
            secondary
            disabled={busy}
            title="Share borrower link"
            onPress={() => {
              void run(async () => {
                if (Platform.OS === "web") {
                  if (typeof navigator !== "undefined" && navigator.share)
                    await navigator.share({
                      title: "Your Tally loan",
                      url: link,
                    });
                  else if (
                    typeof navigator !== "undefined" &&
                    navigator.clipboard
                  ) {
                    await navigator.clipboard.writeText(link);
                    check();
                    setMessage("Borrower link copied.");
                  } else setMessage("Select and copy the borrower link above.");
                } else
                  await Share.share({
                    message: `View your shared loan in Tally: ${link}`,
                  });
              });
            }}
          />
        </View>
      )}
      <Txt style={{ fontSize: 18, fontWeight: "700" }}>Payment proofs</Txt>
      {!data.submissions.length && (
        <Txt muted>No submitted payment proofs yet.</Txt>
      )}
      {data.submissions.map((submission) => (
        <SubmissionReview
          key={String(submission.submissionId)}
          submission={submission}
          obligation={obligation}
          repo={repo}
          savedIntent={data.intents[String(submission.submissionId)] ?? null}
          attachments={data.attachments.filter(
            (attachment) => attachment.targetId === submission.submissionId,
          )}
          busy={busy}
          run={run}
          check={check}
          refresh={refresh}
          changed={changed}
        />
      ))}
      <Button
        secondary
        disabled={busy || review.isFetching}
        title="Refresh borrower access"
        onPress={() => {
          void run(async () => {
            await refresh();
          });
        }}
      />
      {onDone && (
        <Button secondary disabled={busy} title="Done" onPress={onDone} />
      )}
    </View>
  );
}

function SubmissionReview({
  submission,
  obligation,
  repo,
  savedIntent,
  attachments,
  busy,
  run,
  check,
  refresh,
  changed,
}: {
  submission: Data;
  obligation: Row;
  repo: TallyRepository;
  savedIntent: Data | null;
  attachments: Data[];
  busy: boolean;
  run: (task: () => Promise<void> | void) => Promise<void>;
  check: () => void;
  refresh: () => Promise<ReviewData>;
  changed: (payment?: boolean) => Promise<void>;
}) {
  const sources = useRecords("paymentSources");
  const [method, setMethod] = useState("cash"),
    [source, setSource] = useState(""),
    [reason, setReason] = useState("");
  const [prepared, setPrepared] = useState<Data | null>(null),
    [attempt, setAttempt] = useState<Data | null>(null);
  const id = String(submission.submissionId),
    code = String(submission.currency),
    paid = Number(submission.amountMinor);
  const immutable = attempt ?? savedIntent,
    payload = immutable ?? prepared;
  const remaining = amount(obligation.data, "remainingMinor"),
    pending = submission.status === "pending";
  const approve = async (intent: Data) => {
    const latest = await refresh();
    check();
    const current = latest.submissions.find((item) => item.submissionId === id);
    if (!current) throw new Error("This proof is no longer available.");
    if (current.status !== "pending") {
      await repo.transferIntent(intentKey(repo, id), null);
      check();
      setAttempt(null);
      setPrepared(null);
      await changed(current.status === "approved");
      return;
    }
    const existing = await repo.transferIntent(intentKey(repo, id));
    check();
    const frozen = existing ? verifyIntent(JSON.parse(existing), id) : intent;
    setAttempt(frozen);
    if (canonicalCommand(frozen) !== canonicalCommand(intent))
      throw new Error(
        "An earlier review has different terms. Check the saved decision below before retrying it.",
      );
    await repo.transferIntent(intentKey(repo, id), JSON.stringify(frozen));
    check();
    try {
      const result = await repo.command(
        "reviewBorrowerSubmission",
        frozen,
        `review-${id}`,
      );
      check();
      if (
        result.submissionId !== id ||
        (frozen.decision === "approve"
          ? !identifier(result.paymentId)
          : result.paymentId !== null)
      )
        throw new Error(
          "Review response could not be verified. Retry the saved review.",
        );
      await repo.transferIntent(intentKey(repo, id), null);
      check();
      setAttempt(null);
      setPrepared(null);
      await changed(frozen.decision === "approve");
    } catch (error) {
      if (
        ["invalid-argument", "failed-precondition", "aborted"].includes(
          String((error as { code?: string }).code),
        )
      ) {
        await repo.transferIntent(intentKey(repo, id), null);
        check();
        setAttempt(null);
        setPrepared(null);
      }
      throw error;
    }
  };
  return (
    <View style={{ gap: 12, paddingVertical: 14 }}>
      <Txt style={{ fontWeight: "700" }}>
        {formatMoney(paid, code)} {code} · {text(submission, "paymentDate")}
      </Txt>
      <Txt>
        {submission.status === "pending"
          ? "Pending review"
          : label(text(submission, "status"))}
      </Txt>
      {!!submission.reference && <Txt>{text(submission, "reference")}</Txt>}
      {!!submission.message && <Txt>{text(submission, "message")}</Txt>}
      {!!submission.reason && <Txt>Reason: {text(submission, "reason")}</Txt>}
      {attachments.map((attachment) => (
        <Button
          key={String(attachment.attachmentId)}
          secondary
          disabled={busy}
          title={`Download ${text(attachment, "filename", "receipt")}`}
          onPress={() => {
            void run(async () => {
              await downloadAttachment(repo, {
                id: String(attachment.attachmentId),
                data: attachment,
              });
              check();
            });
          }}
        />
      ))}
      {pending &&
        (payload ? (
          <>
            {payload.decision === "approve" ? (
              <>
                <Txt>
                  Records {formatMoney(paid, code)} received on{" "}
                  {text(submission, "paymentDate")} and reduces the balance
                  {remaining !== null && remaining >= paid
                    ? ` from ${formatMoney(remaining, code)} to ${formatMoney(remaining - paid, code)}`
                    : " by that amount"}
                  . Confirm only after checking the payment.
                </Txt>
                <Txt>
                  Method: {label(String(payload.paymentMethod))} · Source:{" "}
                  {payload.paymentSourceId
                    ? text(
                        sources.data?.rows.find(
                          (row) => row.id === payload.paymentSourceId,
                        )?.data ?? {},
                        "name",
                        "Selected source",
                      )
                    : "None"}
                </Txt>
              </>
            ) : (
              <Txt>
                Reject this proof with reason: {String(payload.reason)}. The
                balance will stay unchanged.
              </Txt>
            )}
            {immutable && (
              <Txt muted>
                This review may already have reached Tally. Its decision and
                payment terms are locked until the result is verified.
              </Txt>
            )}
            <Button
              disabled={busy}
              title={
                immutable
                  ? "Refresh and retry saved review"
                  : payload.decision === "approve"
                    ? "Approve and record payment"
                    : "Reject proof"
              }
              onPress={() => {
                void run(() => approve(payload));
              }}
            />
            {!immutable && (
              <Button
                secondary
                disabled={busy}
                title="Back to review"
                onPress={() => setPrepared(null)}
              />
            )}
          </>
        ) : (
          <>
            <Choices
              label="Payment method"
              value={method}
              options={methods.map((value) => ({ value, label: label(value) }))}
              onChange={(value) => {
                if (!busy) setMethod(value);
              }}
            />
            <SelectField
              label="Payment source"
              value={source}
              onChange={setSource}
              disabled={busy}
              options={[
                { value: "", label: "None" },
                ...(sources.data?.rows ?? [])
                  .filter((row) => row.data.active === true)
                  .map((row) => ({
                    value: row.id,
                    label: text(row.data, "name"),
                  })),
              ]}
            />
            <Button
              disabled={
                busy ||
                remaining === null ||
                paid > remaining ||
                submission.currency !== obligation.data.currency
              }
              title="Review approval"
              onPress={() =>
                setPrepared({
                  submissionId: id,
                  decision: "approve",
                  reason: "",
                  paymentMethod: method,
                  paymentSourceId: source || null,
                })
              }
            />
            {remaining !== null && paid > remaining && (
              <Txt muted>
                This proof exceeds the displayed balance. Refresh the loan
                before approving.
              </Txt>
            )}
            <Field
              label="Rejection reason"
              value={reason}
              onChangeText={setReason}
              editable={!busy}
              maxLength={500}
              multiline
            />
            <Button
              secondary
              disabled={busy || !reason.trim()}
              title="Review rejection"
              onPress={() =>
                setPrepared({
                  submissionId: id,
                  decision: "reject",
                  reason: reason.trim(),
                  paymentMethod: method,
                  paymentSourceId: source || null,
                })
              }
            />
          </>
        ))}
    </View>
  );
}
