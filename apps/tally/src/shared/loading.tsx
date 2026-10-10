import React, { useEffect, useState } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import { Brand } from "./brand";
import { useReducedMotion } from "./motion";
import { useTheme } from "./theme";

export function Loading({
  fullScreen = false,
  label = "Getting things in order",
}: {
  fullScreen?: boolean;
  label?: string;
}) {
  const theme = useTheme(),
    reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  const [orbit] = useState(() => new Animated.Value(0));
  const [strokes] = useState(() =>
    [0, 1, 2, 3].map(() => new Animated.Value(1)),
  );
  useEffect(() => {
    if (reduced) {
      pulse.setValue(0);
      orbit.setValue(0);
      strokes.forEach((value) => value.setValue(1));
      return;
    }
    const useNativeDriver = Platform.OS !== "web";
    strokes.forEach((value) => value.setValue(0));
    const animation = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver,
          }),
        ]),
      ),
      Animated.loop(
        Animated.timing(orbit, {
          toValue: 1,
          duration: 10000,
          easing: Easing.linear,
          useNativeDriver,
        }),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.stagger(
            170,
            strokes.map((value) =>
              Animated.timing(value, {
                toValue: 1,
                duration: 540,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
              }),
            ),
          ),
          Animated.delay(1400),
          Animated.parallel(
            strokes.map((value) =>
              Animated.timing(value, {
                toValue: 0,
                duration: 500,
                useNativeDriver,
              }),
            ),
          ),
          Animated.delay(280),
        ]),
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [orbit, pulse, reduced, strokes]);
  const size = fullScreen ? 224 : 156;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your workspace"
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={{
        flex: fullScreen ? 1 : undefined,
        width: "100%",
        minHeight: fullScreen ? 440 : 290,
        justifyContent: "center",
        alignItems: "center",
        gap: fullScreen ? 28 : 18,
        paddingVertical: 32,
      }}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            width: size * 0.88,
            height: size * 0.88,
            borderRadius: size,
            backgroundColor: theme.tint,
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.4, 0.75],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1.12],
                }),
              },
            ],
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: size,
            transform: [
              {
                rotate: orbit.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"],
                }),
              },
            ],
          }}
        >
          <View
            style={{
              position: "absolute",
              width: 9,
              height: 9,
              top: -4,
              left: size / 2 - 4,
              borderRadius: 5,
              backgroundColor: theme.primary,
            }}
          />
        </Animated.View>
        <Animated.View
          style={{
            width: 104,
            height: 110,
            borderRadius: 32,
            backgroundColor: theme.primary,
            justifyContent: "center",
            alignItems: "center",
            transform: [
              {
                translateY: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [2, -3],
                }),
              },
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.035],
                }),
              },
            ],
          }}
        >
          <View style={{ width: 84, height: 84 }}>
            {strokes.slice(0, 3).map((value, index) => (
              <Animated.View
                key={index}
                style={{
                  position: "absolute",
                  left: (7 + index * 5) * 3.5 - 3,
                  top: 17.5,
                  width: 6,
                  height: 49,
                  borderRadius: 3,
                  backgroundColor: theme.background,
                  opacity: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.18, 1],
                  }),
                  transform: [
                    {
                      scaleY: value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.55, 1],
                      }),
                    },
                  ],
                }}
              />
            ))}
            <Animated.View
              style={{
                position: "absolute",
                left: 10.5,
                top: 39,
                width: 63,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.background,
                opacity: strokes[3].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.12, 1],
                }),
                transform: [
                  { rotate: "-26.565deg" },
                  {
                    scaleX: strokes[3].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.35, 1],
                    }),
                  },
                ],
              }}
            />
          </View>
        </Animated.View>
      </View>
      <View style={{ alignItems: "center", gap: 8 }}>
        {fullScreen && <Brand size={40} mark={false} />}
        <Text
          style={{ fontFamily: "DM Sans", fontSize: 14, color: theme.muted }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "DM Sans",
            fontSize: 11,
            color: theme.muted,
            letterSpacing: 0.5,
          }}
        >
          Know what’s due.
        </Text>
      </View>
    </View>
  );
}
