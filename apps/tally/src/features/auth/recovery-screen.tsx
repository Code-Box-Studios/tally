import React, { useState } from "react";
import { router } from "expo-router";
import { backend } from "../../core/backend/client";
import { Card, Field, Form, Page, Txt } from "../../shared/ui";
export function RecoveryScreen() {
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  return (
    <Page>
      <Card style={{ maxWidth: 480, alignSelf: "center", width: "100%" }}>
        <Txt big>Choose a new password</Txt>
        <Form
          saveLabel="Update password"
          onSave={async () => {
            if (password.length < 8 || password !== confirmation)
              throw new Error(
                "Use at least eight characters and match both passwords.",
              );
            const { data } = await backend().auth.getSession();
            if (!data.session)
              throw new Error(
                "Open a valid password reset link from your email.",
              );
            const { error } = await backend().auth.updateUser({ password });
            if (error) throw error;
            const revoked = await backend().auth.signOut({ scope: "global" });
            if (revoked.error) throw revoked.error;
            setPassword("");
            setConfirmation("");
            router.replace("/sign-in");
          }}
        >
          <Field
            label="New password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Field
            label="Confirm password"
            secureTextEntry
            value={confirmation}
            onChangeText={setConfirmation}
          />
        </Form>
      </Card>
    </Page>
  );
}
