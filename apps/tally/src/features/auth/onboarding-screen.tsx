import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "./session-provider";
import { currencies } from "../../core/domain/money";
import { Card, Field, Form, Page, Txt } from "../../shared/ui";
import { Brand, BrandMark } from "../../shared/brand";
import { Icon } from "../../shared/icons";
import { useTheme } from "../../shared/theme";

const names = {
  PHP: "Philippine peso",
  USD: "US dollar",
  EUR: "Euro",
  SGD: "Singapore dollar",
  AUD: "Australian dollar",
  JPY: "Japanese yen",
  GBP: "British pound",
};
export function OnboardingScreen() {
  const { profile, repo, setProfile } = useSession();
  const [currency, setCurrency] = useState(profile?.defaultCurrency ?? "PHP"),
    [timezone, setTimezone] = useState(profile?.timezone ?? "Asia/Manila");
  const theme = useTheme(),
    { width } = useWindowDimensions(),
    wide = width >= 900;
  return (
    <Page centered>
      <View
        style={{
          width: "100%",
          maxWidth: 1000,
          alignSelf: "center",
          flexDirection: wide ? "row" : "column",
          alignItems: wide ? "center" : "stretch",
          gap: wide ? 64 : 28,
        }}
      >
        <View style={{ flex: wide ? 0.8 : undefined, gap: 28 }}>
          <Brand size={34} />
          <View style={{ gap: 12 }}>
            <Txt
              muted
              style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: "600" }}
            >
              MAKE YOURSELF AT HOME
            </Txt>
            <Txt
              big
              style={{
                fontSize: wide ? 38 : 30,
                lineHeight: wide ? 48 : 40,
                fontWeight: "800",
                letterSpacing: -1.4,
              }}
            >
              A little setup.{"\n"}A clearer picture.
            </Txt>
            <Txt muted>
              Your money, your space. A few preferences to help Tally remember
              what matters to you.
            </Txt>
          </View>
          {wide && (
            <View style={{ gap: 18 }}>
              <View
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <BrandMark size={30} />
                <Txt>Make it yours</Txt>
              </View>
              <View
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    backgroundColor: theme.tint,
                    borderRadius: 9,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="plus" color={theme.primary} size={17} />
                </View>
                <Txt muted>Add your first obligation</Txt>
              </View>
            </View>
          )}
          {wide && (
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Icon name="shield" color={theme.primary} size={16} />
              <Txt muted style={{ fontSize: 12 }}>
                Private by default. Always your space.
              </Txt>
            </View>
          )}
        </View>
        <Card
          style={{
            flex: wide ? 1.2 : undefined,
            borderRadius: 24,
            padding: width < 480 ? 22 : 32,
            gap: 24,
          }}
        >
          <View style={{ gap: 6 }}>
            <Txt
              big
              style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.6 }}
            >
              Welcome to Tally.
            </Txt>
            <Txt muted>Set your defaults. You can change them anytime.</Txt>
          </View>
          <Form
            fullWidth
            saveLabel="Open my workspace"
            onSave={async () => {
              const zone = timezone.trim();
              try {
                if (!zone) throw new Error();
                new Intl.DateTimeFormat("en", { timeZone: zone });
              } catch {
                throw new Error("Enter a valid timezone, such as Asia/Manila.");
              }
              if (!repo || !profile)
                throw new Error("Your account is still loading. Try again.");
              const saved = await repo.updateProfile(
                profile,
                {
                  defaultCurrency: currency,
                  timezone: zone,
                  themeMode: profile.themeMode,
                  onboardingComplete: true,
                },
                Crypto.randomUUID(),
              );
              setProfile(saved);
            }}
          >
            <View style={{ gap: 10 }}>
              <Txt style={{ fontWeight: "600" }}>Your default currency</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {currencies.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityLabel={`${code} · ${names[code]}`}
                    accessibilityState={{ checked: currency === code }}
                    aria-checked={currency === code}
                    onPress={() => setCurrency(code)}
                    style={({ pressed }) => ({
                      width: "48%",
                      flexGrow: 1,
                      minWidth: 100,
                      minHeight: 62,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor:
                        currency === code ? theme.primary : theme.border,
                      borderRadius: 12,
                      backgroundColor:
                        currency === code ? theme.tint : theme.surface,
                      opacity: pressed ? 0.75 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    })}
                  >
                    <View>
                      <Txt
                        style={{
                          fontWeight: "700",
                          color: currency === code ? theme.primary : theme.ink,
                        }}
                      >
                        {code}
                      </Txt>
                      <Txt muted style={{ fontSize: 11 }}>
                        {names[code]}
                      </Txt>
                    </View>
                    {currency === code && (
                      <Icon name="check" color={theme.primary} size={16} />
                    )}
                  </Pressable>
                ))}
              </View>
              <Txt muted style={{ fontSize: 11 }}>
                Each obligation can still use its own currency.
              </Txt>
            </View>
            <Field
              label="Timezone"
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ fontSize: 16, minHeight: 52 }}
            />
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                padding: 14,
                borderRadius: 12,
                backgroundColor: theme.tint,
              }}
            >
              <Icon name="bell" color={theme.primary} size={19} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt style={{ fontWeight: "600", fontSize: 13 }}>
                  A heads-up, right on time.
                </Txt>
                <Txt muted style={{ fontSize: 12 }}>
                  Reminders start 3 days before and on the due date. Adjust them
                  in Settings.
                </Txt>
              </View>
            </View>
          </Form>
        </Card>
      </View>
    </Page>
  );
}
