import React, { useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import { currencies } from "../../core/domain/money";
import { recordTitle, label, type Row } from "../../core/domain/records";
import { CatalogForm } from "../people/catalog-form";
import { PreferencesForm } from "../reminders/preferences-form";
import {
  Page,
  Heading,
  Card,
  Choices,
  Field,
  Form,
  Txt,
  Button,
  Row as FlexRow,
  Failure,
} from "../../shared/ui";
export function SettingsScreen() {
  const { profile, repo, setProfile, signOut } = useSession(),
    sources = useRecords("paymentSources"),
    categories = useRecords("categories"),
    [code, setCode] = useState(profile!.defaultCurrency),
    [zone, setZone] = useState(profile!.timezone),
    [theme, setTheme] = useState(profile!.themeMode),
    [tab, setTab] = useState("preferences"),
    [catalog, setCatalog] = useState<{
      kind: "source" | "category";
      row?: Row;
    } | null>(null),
    [error, setError] = useState<unknown>(null);
  return (
    <Page>
      <Heading title="Settings" subtitle="Make Tally feel like your space." />
      <View style={{ gap: 20 }}>
        <Choices
          label="Manage"
          value={tab}
          options={[
            { value: "preferences", label: "Preferences" },
            { value: "reminders", label: "Reminders" },
            { value: "sources", label: "Payment sources" },
            { value: "categories", label: "Categories" },
          ]}
          onChange={setTab}
        />
        {tab === "preferences" && (
          <>
            <Card>
              <Form
                saveLabel="Save preferences"
                onSave={async () => {
                  new Intl.DateTimeFormat("en", { timeZone: zone });
                  setProfile(
                    await repo!.updateProfile(
                      profile!,
                      {
                        defaultCurrency: code,
                        timezone: zone,
                        themeMode: theme,
                        onboardingComplete: true,
                      },
                      Crypto.randomUUID(),
                    ),
                  );
                }}
              >
                <Choices
                  label="Default currency"
                  value={code}
                  options={currencies}
                  onChange={setCode}
                />
                <Field label="Timezone" value={zone} onChangeText={setZone} />
                <Choices
                  label="Appearance"
                  value={theme}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "system", label: "System" },
                  ]}
                  onChange={(v) => setTheme(v as typeof theme)}
                />
                <Txt muted>
                  Each obligation keeps its own currency. No exchange-rate
                  conversion is assumed.
                </Txt>
              </Form>
            </Card>
            <Card>
              <Txt style={{ fontSize: 19 }}>Your device & account</Txt>
              <Button
                secondary
                title="Saved actions & offline saving"
                onPress={() => router.push("/settings/sync" as Href)}
              />
              <Button
                secondary
                title="Sign out"
                onPress={() => {
                  setError(null);
                  void signOut().catch(setError);
                }}
              />
              <Button
                secondary
                danger
                title="Delete account"
                onPress={() => router.push("/settings/delete" as Href)}
              />
            </Card>
          </>
        )}
        {tab === "reminders" && <PreferencesForm />}
        {["sources", "categories"].includes(tab) && (
          <>
            <Button
              title={tab === "sources" ? "Add payment source" : "Add category"}
              onPress={() =>
                setCatalog({ kind: tab === "sources" ? "source" : "category" })
              }
            />
            {catalog && (
              <Card>
                <CatalogForm
                  key={catalog.kind + ":" + (catalog.row?.id ?? "new")}
                  kind={catalog.kind}
                  existing={catalog.row}
                  onDone={() => setCatalog(null)}
                />
              </Card>
            )}
            {(tab === "sources" ? sources : categories).data?.rows.map((r) => (
              <Card key={r.id}>
                <FlexRow>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontSize: 17 }}>{recordTitle(r)}</Txt>
                    <Txt muted>
                      {r.data.type
                        ? label(String(r.data.type))
                        : r.data.isDefault
                          ? "Default category"
                          : "Custom category"}
                      {r.data.active === false ? " · Archived" : ""}
                    </Txt>
                  </View>
                  <Button
                    secondary
                    title="Edit"
                    onPress={() =>
                      setCatalog({
                        kind: tab === "sources" ? "source" : "category",
                        row: r,
                      })
                    }
                  />
                </FlexRow>
              </Card>
            ))}
          </>
        )}
        {!!error && <Failure error={error} />}
      </View>
    </Page>
  );
}
