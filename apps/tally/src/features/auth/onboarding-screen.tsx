import React, { useState } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "./session-provider";
import { currencies } from "../../core/domain/money";
import { Card, Choices, Field, Form, Page, Txt } from "../../shared/ui";
export function OnboardingScreen() {
  const { profile, repo, setProfile } = useSession();
  const [currency, setCurrency] = useState(profile?.defaultCurrency ?? "PHP"),
    [timezone, setTimezone] = useState(profile?.timezone ?? "Asia/Manila");
  return (
    <Page>
      <Card style={{ maxWidth: 650, alignSelf: "center", width: "100%" }}>
        <Txt big>Welcome to Tally.</Txt>
        <Txt muted>A few preferences, then your first obligation.</Txt>
        <Form
          saveLabel="Open my workspace"
          onSave={async () => {
            new Intl.DateTimeFormat("en", { timeZone: timezone });
            const saved = await repo!.updateProfile(
              profile!,
              {
                defaultCurrency: currency,
                timezone,
                themeMode: profile!.themeMode,
                onboardingComplete: true,
              },
              Crypto.randomUUID(),
            );
            setProfile(saved);
          }}
        >
          <Choices
            label="Default currency"
            value={currency}
            options={currencies}
            onChange={setCurrency}
          />
          <Field
            label="Timezone"
            value={timezone}
            onChangeText={setTimezone}
            autoCapitalize="none"
          />
          <Txt muted>
            Reminders default to three days before and on the due date. You can
            change them in Settings.
          </Txt>
        </Form>
      </Card>
    </Page>
  );
}
