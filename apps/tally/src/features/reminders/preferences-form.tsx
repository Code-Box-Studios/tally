import React, { useState } from "react";
import { Platform } from "react-native";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import { text, type Data } from "../../core/domain/records";
import {
  enableNotifications,
  scheduleLocalReminders,
} from "./notification-service";
import {
  Card,
  Field,
  Choices,
  Form,
  Button,
  Txt,
  Failure,
  Loading,
} from "../../shared/ui";
const kinds = [
  "upcoming",
  "dueToday",
  "overdue",
  "automaticUpcoming",
  "automaticConfirmation",
  "owedToMe",
];
export function PreferencesForm() {
  const query = useRecords("notificationPreferences"),
    periods = useRecords("reminders");
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const policy = query.data?.rows.find((r) => r.id === "default");
  if (!policy)
    return (
      <Failure error={new Error("Reminder preferences are unavailable.")} />
    );
  return (
    <ReminderPolicy
      key={String(policy.data.revision)}
      data={policy.data}
      periods={periods.data?.rows ?? []}
    />
  );
}
function ReminderPolicy({
  data,
  periods,
}: {
  data: Data;
  periods: import("../../core/domain/records").Row[];
}) {
  const { execute, repo } = useSession(),
    [enabled, setEnabled] = useState(data.enabled ? "yes" : "no"),
    [offsets, setOffsets] = useState((data.offsetDays as number[]).join(",")),
    [time, setTime] = useState(text(data, "localTime", "09:00")),
    [quietStart, setQuietStart] = useState(text(data, "quietStart", "21:00")),
    [quietEnd, setQuietEnd] = useState(text(data, "quietEnd", "08:00")),
    [push, setPush] = useState(data.pushEnabled ? "yes" : "no"),
    [local, setLocal] = useState(data.localEnabled ? "yes" : "no"),
    [enabledKinds, setEnabledKinds] = useState(
      (data.enabledKinds as string[]) ?? kinds,
    ),
    [message, setMessage] = useState("");
  return (
    <Card>
      <Form
        saveLabel="Save reminder preferences"
        onSave={async () => {
          const preferences: Data = {
            enabled: enabled === "yes",
            enabledKinds,
            offsetDays: offsets.split(",").map(Number),
            localTime: time,
            quietStart,
            quietEnd,
            pushEnabled: push === "yes",
            localEnabled: local === "yes",
            allowSensitivePushText: false,
            timezonePolicy: "savedDueProfileQuiet",
          };
          await execute("updateNotificationPreferences", {
            expectedRevision: Number(data.revision),
            preferences,
          });
          await scheduleLocalReminders(repo!, periods, preferences);
        }}
      >
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
          label="Days before due (0 = on due date)"
          value={offsets}
          onChangeText={setOffsets}
        />
        <Field
          label="Reminder time (HH:MM)"
          value={time}
          onChangeText={setTime}
        />
        <Field
          label="Quiet hours start"
          value={quietStart}
          onChangeText={setQuietStart}
        />
        <Field
          label="Quiet hours end"
          value={quietEnd}
          onChangeText={setQuietEnd}
        />
        {kinds.map((kind) => (
          <Choices
            key={kind}
            label={kind.replace(/([a-z])([A-Z])/g, "$1 $2")}
            value={enabledKinds.includes(kind) ? "yes" : "no"}
            options={[
              { value: "yes", label: "On" },
              { value: "no", label: "Off" },
            ]}
            onChange={(v) =>
              setEnabledKinds((current) =>
                v === "yes"
                  ? [...current.filter((k) => k !== kind), kind]
                  : current.filter((k) => k !== kind),
              )
            }
          />
        ))}
        {Platform.OS !== "web" && (
          <>
            <Choices
              label="Local alerts"
              value={local}
              options={[
                { value: "yes", label: "On" },
                { value: "no", label: "Off" },
              ]}
              onChange={setLocal}
            />
            <Choices
              label="Remote push"
              value={push}
              options={[
                { value: "yes", label: "On" },
                { value: "no", label: "Off" },
              ]}
              onChange={setPush}
            />
            <Button
              secondary
              title="Enable device notifications"
              onPress={() =>
                void enableNotifications(repo!, push === "yes")
                  .then(setMessage)
                  .catch((e) => setMessage((e as Error).message))
              }
            />
            {!!message && <Txt>{message}</Txt>}
          </>
        )}
        <Txt muted>
          Lock-screen alerts use generic text. In-app reminders remain
          independent of device delivery.
        </Txt>
      </Form>
    </Card>
  );
}
