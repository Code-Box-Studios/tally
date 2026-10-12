import React, { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { civilDate, displayDate, todayInZone } from "../core/domain/date";
import { Icon } from "./icons";
import { useTheme } from "./theme";
import { Button, Txt } from "./ui";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function DateField({
  label,
  value,
  onChange,
  optional = false,
  placeholder = "Choose a date",
  today = todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
  precision = "day",
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  placeholder?: string;
  today?: string;
  precision?: "day" | "month";
  hideLabel?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(today.slice(0, 7));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(1900);
  const year = Number(page.slice(0, 4)),
    month = Number(page.slice(5, 7));
  const first = new Date(page + "-01T12:00:00Z");
  const offset = first.getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let selected = "";
  try {
    selected = civilDate(precision === "month" ? value + "-01" : value);
  } catch {
    // An empty optional date has no selection.
  }
  const display = selected
    ? precision === "month"
      ? `${months[Number(selected.slice(5, 7)) - 1]} ${selected.slice(0, 4)}`
      : displayDate(selected)
    : placeholder;

  function show() {
    const initial = selected || civilDate(today);
    setPage(initial.slice(0, 7));
    setYearStart(
      1900 + Math.floor((Number(initial.slice(0, 4)) - 1900) / 12) * 12,
    );
    setView(precision === "month" ? "months" : "days");
    setOpen(true);
  }
  function choose(date: string) {
    onChange(precision === "month" ? date.slice(0, 7) : date);
    setOpen(false);
  }
  function move(by: number) {
    if (view === "years") setYearStart(yearStart + by * 12);
    else {
      const next = new Date(first);
      if (view === "months") next.setUTCFullYear(year + by);
      else next.setUTCMonth(next.getUTCMonth() + by);
      setPage(next.toISOString().slice(0, 7));
    }
  }
  const previousDisabled =
    view === "years"
      ? yearStart === 1900
      : view === "months"
        ? year === 1900
        : page === "1900-01";
  const nextDisabled =
    view === "years"
      ? yearStart + 12 > 2199
      : view === "months"
        ? year === 2199
        : page === "2199-12";
  const navigation =
    view === "years" ? "years" : view === "months" ? "year" : "month";

  return (
    <View style={{ gap: 6 }}>
      {!hideLabel && <Txt muted>{label}</Txt>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        accessibilityHint="Opens the calendar picker"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={show}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Txt
          style={{
            flex: 1,
            fontSize: 16,
            color: selected ? theme.ink : theme.muted,
          }}
        >
          {display}
        </Txt>
        <Icon name="calendar" color={theme.muted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 12,
            backgroundColor: "#00000066",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${label} calendar`}
            onPress={() => setOpen(false)}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 380,
              maxHeight: "90%",
              borderRadius: 20,
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
              <Txt big style={{ fontSize: 21, fontWeight: "700" }}>
                {label}
              </Txt>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 4,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Previous ${navigation}`}
                  disabled={previousDisabled}
                  onPress={() => move(-1)}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: previousDisabled ? 0.3 : 1,
                  }}
                >
                  <View style={{ transform: [{ rotate: "180deg" }] }}>
                    <Icon name="chevron" color={theme.ink} />
                  </View>
                </Pressable>
                {view === "years" ? (
                  <Txt style={{ fontWeight: "600" }}>
                    {yearStart}–{Math.min(yearStart + 11, 2199)}
                  </Txt>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {view === "days" && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Choose month"
                        onPress={() => setView("months")}
                        style={{
                          padding: 8,
                          minHeight: 44,
                          justifyContent: "center",
                        }}
                      >
                        <Txt style={{ fontWeight: "600" }}>
                          {months[month - 1]}
                        </Txt>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose year"
                      onPress={() => {
                        setYearStart(
                          1900 + Math.floor((year - 1900) / 12) * 12,
                        );
                        setView("years");
                      }}
                      style={{
                        padding: 8,
                        minHeight: 44,
                        justifyContent: "center",
                      }}
                    >
                      <Txt style={{ fontWeight: "600" }}>{year}</Txt>
                    </Pressable>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Next ${navigation}`}
                  disabled={nextDisabled}
                  onPress={() => move(1)}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: nextDisabled ? 0.3 : 1,
                  }}
                >
                  <Icon name="chevron" color={theme.ink} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {view === "days" ? (
                  <>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (name) => (
                        <View
                          key={name}
                          style={{
                            width: "14.285714%",
                            alignItems: "center",
                            paddingVertical: 6,
                          }}
                        >
                          <Txt muted style={{ fontSize: 12 }}>
                            {name}
                          </Txt>
                        </View>
                      ),
                    )}
                    {Array.from(
                      { length: Math.ceil((offset + length) / 7) * 7 },
                      (_, i) => {
                        const day = i - offset + 1;
                        if (day < 1 || day > length)
                          return (
                            <View
                              key={i}
                              style={{ width: "14.285714%", minHeight: 44 }}
                            />
                          );
                        const date = `${page}-${String(day).padStart(2, "0")}`;
                        const active = selected === date;
                        return (
                          <Pressable
                            key={i}
                            accessibilityRole="button"
                            accessibilityLabel={displayDate(date)}
                            accessibilityState={{ selected: active }}
                            aria-selected={active}
                            onPress={() => choose(date)}
                            style={{
                              width: "14.285714%",
                              minHeight: 44,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 8,
                              backgroundColor: active
                                ? theme.primary
                                : "transparent",
                              borderWidth: 1,
                              borderColor:
                                date === today ? theme.primary : "transparent",
                            }}
                          >
                            <Txt
                              style={{
                                color: active ? theme.background : theme.ink,
                              }}
                            >
                              {day}
                            </Txt>
                          </Pressable>
                        );
                      },
                    )}
                  </>
                ) : (
                  (view === "months"
                    ? months
                    : Array.from(
                        { length: Math.min(12, 2200 - yearStart) },
                        (_, i) => String(yearStart + i),
                      )
                  ).map((name, i) => (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityLabel={name}
                      onPress={() => {
                        if (view === "years") {
                          setPage(`${name}-${String(month).padStart(2, "0")}`);
                          setView("months");
                        } else {
                          const next = `${year}-${String(i + 1).padStart(2, "0")}`;
                          if (precision === "month") choose(next + "-01");
                          else {
                            setPage(next);
                            setView("days");
                          }
                        }
                      }}
                      style={{
                        width: "33.333333%",
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Txt>{name}</Txt>
                    </Pressable>
                  ))
                )}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  secondary
                  title="Today"
                  onPress={() => choose(civilDate(today))}
                />
                {optional && (
                  <Button
                    secondary
                    title="Clear date"
                    onPress={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  />
                )}
                <Button
                  secondary
                  title="Cancel"
                  onPress={() => setOpen(false)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
