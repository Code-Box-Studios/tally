import React, { useEffect, useState } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { useTheme } from "../../shared/theme";
import { useReducedMotion } from "../../shared/motion";
import { Icon } from "../../shared/icons";
import { Txt } from "../../shared/ui";

export function AuthShowcase() {
  const theme = useTheme(),
    reduced = useReducedMotion();
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      drift.setValue(0);
      return;
    }
    const config = {
      duration: 3200,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: Platform.OS !== "web",
    };
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { ...config, toValue: 1 }),
        Animated.timing(drift, { ...config, toValue: 0 }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift, reduced]);
  return (
    <View style={{ flex: 1, gap: 24, paddingRight: 32 }}>
      <Txt
        style={{
          fontSize: 10,
          letterSpacing: 2,
          fontWeight: "700",
          color: theme.primary,
        }}
      >
        A LITTLE CLARITY, EVERY DAY
      </Txt>
      <Txt
        big
        style={{
          fontSize: 48,
          lineHeight: 58,
          fontWeight: "700",
          letterSpacing: -2,
        }}
      >
        Less to remember.{"\n"}More room to breathe.
      </Txt>
      <Txt muted style={{ fontSize: 16, lineHeight: 26, maxWidth: 410 }}>
        What you owe. What’s owed to you. What comes next. Keep it all together,
        in a space that feels like yours.
      </Txt>
      <View
        testID="auth-showcase"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={{ height: 310, marginTop: 10 }}
      >
        <View
          style={{
            position: "absolute",
            width: 276,
            height: 276,
            borderRadius: 150,
            backgroundColor: theme.tint,
            left: 48,
            top: 10,
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: 150,
            borderWidth: 1,
            borderColor: theme.border,
            left: 76,
            top: 38,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            left: 8,
            top: 38,
            width: 270,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            padding: 20,
            gap: 18,
            boxShadow: "0 14px 40px #0000000d",
            transform: [
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -9],
                }),
              },
              { rotate: "-5deg" },
            ],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                backgroundColor: theme.amberBg,
                padding: 9,
                borderRadius: 12,
              }}
            >
              <Icon name="calendar" color={theme.amber} size={18} />
            </View>
            <View>
              <Txt style={{ fontWeight: "700" }}>Next up</Txt>
              <Txt muted style={{ fontSize: 11 }}>
                Know what needs paying.
              </Txt>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Txt style={{ fontWeight: "600" }}>Internet bill</Txt>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 14,
                backgroundColor: theme.amberBg,
              }}
            >
              <Txt style={{ color: theme.amber, fontSize: 11 }}>Due soon</Txt>
            </View>
          </View>
        </Animated.View>
        <Animated.View
          style={{
            position: "absolute",
            left: 108,
            top: 169,
            width: 258,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            padding: 18,
            gap: 14,
            boxShadow: "0 14px 40px #0000000d",
            transform: [
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-5, 4],
                }),
              },
              { rotate: "4deg" },
            ],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                backgroundColor: theme.greenBg,
                borderRadius: 14,
                padding: 11,
              }}
            >
              <Icon name="check" color={theme.green} size={20} />
            </View>
            <View>
              <Txt style={{ fontWeight: "700" }}>A little peace of mind.</Txt>
              <Txt muted style={{ fontSize: 11 }}>
                Every payment, remembered.
              </Txt>
            </View>
          </View>
          <View
            style={{ height: 5, borderRadius: 5, backgroundColor: theme.tint }}
          >
            <View
              style={{
                width: "72%",
                height: 5,
                borderRadius: 5,
                backgroundColor: theme.primary,
              }}
            />
          </View>
        </Animated.View>
        <Animated.View
          style={{
            position: "absolute",
            right: 28,
            top: 85,
            backgroundColor: theme.blueBg,
            padding: 14,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: theme.border,
            transform: [
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [3, -4],
                }),
              },
            ],
          }}
        >
          <Icon name="bolt" color={theme.blue} size={26} />
        </Animated.View>
      </View>
      <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
        <Icon name="shield" color={theme.primary} size={16} />
        <Txt muted style={{ fontSize: 12 }}>
          Private by default. No bank credentials needed.
        </Txt>
      </View>
    </View>
  );
}
