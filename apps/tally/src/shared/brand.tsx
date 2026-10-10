import React from "react";
import { Text, View } from "react-native";
import { Icon } from "./icons";
import { useTheme } from "./theme";

export function BrandMark({ size = 36 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.31,
        backgroundColor: theme.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="tally" size={size * 0.77} color={theme.background} />
    </View>
  );
}
export function Brand({
  size = 34,
  mark = true,
}: {
  size?: number;
  mark?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {mark && <BrandMark size={size + 2} />}
      <Text
        style={{
          color: theme.ink,
          fontFamily: "Manrope",
          fontSize: size,
          fontWeight: "800",
          letterSpacing: -size * 0.045,
        }}
      >
        tally<Text style={{ color: theme.primary }}>.</Text>
      </Text>
    </View>
  );
}
