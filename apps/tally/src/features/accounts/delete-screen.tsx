import React, { useState } from "react";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { backend } from "../../core/backend/client";
import { privateStore } from "../../core/storage";
import { useSession, queryClient } from "../auth/session-provider";
import { clearNotifications } from "../reminders/notification-service";
import { DeletionCoordinator } from "./deletion-coordinator";
import { Page, Heading, Card, Form, Field, Txt } from "../../shared/ui";
export function DeleteScreen() {
  const { repo, session, pending } = useSession(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  return (
    <Page>
      <Heading title="Delete your Tally account" />
      <Card style={{ maxWidth: 600 }}>
        <Txt>
          Deletion permanently removes your obligations, payments, private
          files, and account. Server cleanup may continue after you sign out.
        </Txt>
        <Form
          saveLabel="Delete my account"
          onCancel={() => router.back()}
          onSave={async () => {
            if (!repo || !session) throw new Error("Sign in first.");
            if (
              pending.some((p) => !["synced", "discarded"].includes(p.status))
            )
              throw new Error(
                "Sync or review saved actions before deleting your account.",
              );
            if (confirmation !== "DELETE")
              throw new Error("Type DELETE to confirm.");
            if (password) {
              const { data, error } = await backend().auth.signInWithPassword({
                email: session.user.email!,
                password,
              });
              setPassword("");
              if (error) throw new Error("Check your password.");
              if (data.user?.id !== repo.owner)
                throw new Error("Your sign-in changed.");
            }
            await clearNotifications(repo);
            const key = repo.prefix + "deletion";
            const coordinator = new DeletionCoordinator(
              privateStore,
              key,
              repo.owner,
              () => {
                try {
                  repo.check();
                  return true;
                } catch {
                  return false;
                }
              },
              (id) =>
                repo.command(
                  "requestAccountDeletion",
                  { confirmation: "DELETE" },
                  id,
                ),
              async () => {
                for (const entry of await privateStore.keys(repo.prefix))
                  if (entry !== key) await privateStore.remove(entry);
                queryClient.clear();
                const { error } = await backend().auth.signOut({
                  scope: "local",
                });
                if (error) throw error;
              },
              Crypto.randomUUID,
            );
            await coordinator.request();
            router.replace("/");
          }}
        >
          <Field
            label="Current password (email accounts)"
            value={password}
            secureTextEntry
            onChangeText={setPassword}
          />
          <Txt muted>
            Google accounts: sign out and sign in with Google again, then delete
            within five minutes.
          </Txt>
          <Field
            label="Type DELETE"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
          />
        </Form>
      </Card>
    </Page>
  );
}
