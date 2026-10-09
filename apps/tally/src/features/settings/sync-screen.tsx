import React, { useState } from "react";
import { View } from "react-native";
import { useSession } from "../auth/session-provider";
import { label } from "../../core/domain/records";
import {
  Page,
  Heading,
  Card,
  Choices,
  Button,
  Txt,
  Failure,
  Row,
  Empty,
} from "../../shared/ui";
export function SyncScreen() {
  const { pending, trusted, setTrust, flush, queue } = useSession(),
    [error, setError] = useState<unknown>(null),
    [history, setHistory] = useState("pending");
  function run(work: () => Promise<void>) {
    setError(null);
    void work().catch(setError);
  }
  const actions = pending.filter(
    (c) => history === "all" || !["synced", "discarded"].includes(c.status),
  );
  return (
    <Page>
      <Heading
        title="Saved actions"
        subtitle="See what’s waiting, what needs review, and what synced."
      />
      <View style={{ gap: 18 }}>
        <Card>
          <Choices
            label="Trust this device for offline saving"
            value={trusted ? "yes" : "no"}
            options={[
              { value: "yes", label: "Trusted device" },
              { value: "no", label: "Do not save private data" },
            ]}
            onChange={(value) => run(() => setTrust(value === "yes"))}
          />
          <Txt muted>
            Use trusted saving on your own device. Pending payments stay
            separate from confirmed balances.
          </Txt>
          <Button title="Sync now" onPress={() => run(flush)} />
        </Card>
        <Choices
          label="Show actions"
          value={history}
          options={[
            { value: "pending", label: "Waiting / review" },
            { value: "all", label: "History" },
          ]}
          onChange={setHistory}
        />
        {!!error && <Failure error={error} />}
        {actions.map((c) => (
          <Card key={c.id}>
            <Txt>{label(c.name)}</Txt>
            <Txt muted>
              {new Date(c.createdAt).toLocaleString()} · {label(c.status)}
            </Txt>
            {c.error && <Txt>{c.error}</Txt>}
            <Row>
              {c.status === "review" &&
                [
                  "aborted",
                  "invalid-argument",
                  "failed-precondition",
                  "already-exists",
                ].includes(c.rejectionCode ?? "") && (
                  <Button
                    secondary
                    danger
                    title="Discard rejected action"
                    onPress={() =>
                      run(async () => {
                        await queue!.discard(c.id);
                        await flush();
                      })
                    }
                  />
                )}
              {!["synced", "discarded"].includes(c.status) && (
                <Button
                  secondary
                  title="Retry same action"
                  onPress={() =>
                    run(async () => {
                      await queue!.retry(c.id);
                      await flush();
                    })
                  }
                />
              )}
            </Row>
          </Card>
        ))}
        {!actions.length && (
          <Empty
            title="Nothing waiting on this device"
            description="Saved actions appear here when Tally needs to sync or verify them."
          />
        )}
      </View>
    </Page>
  );
}
