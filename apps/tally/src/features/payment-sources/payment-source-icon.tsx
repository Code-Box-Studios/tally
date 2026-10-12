import React from "react";
import { Image, Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { findPaymentProvider, paymentProviders } from "./payment-providers";
import { providerLogos } from "./provider-logos";

const paths = {
  bank: "m3 9 9-6 9 6H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18",
  card: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3 10h18M6 15h4",
  wallet: "M4 6h15v14H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v2M15 11h7v5h-7Z",
  cash: "M2 6h20v12H2ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM5 9h.01M19 15h.01",
  other: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20ZM8 12h8M12 8v8",
};

export function PaymentSourceIcon({
  name = "",
  type = "other",
  size = 32,
  providerId = "",
  iconKey = "",
}: {
  name?: string;
  type?: string;
  size?: number;
  providerId?: string;
  iconKey?: string;
}) {
  const theme = useTheme();
  const provider =
    paymentProviders.find((item) => item.id === providerId) ??
    findPaymentProvider(name, type);
  const logo = provider ? providerLogos[provider.id] : undefined;
  const path =
    iconKey && iconKey in paths
      ? paths[iconKey as keyof typeof paths]
      : type === "bankAccount"
        ? paths.bank
        : ["creditCard", "debitCard"].includes(type)
          ? paths.card
          : type === "eWallet"
            ? paths.wallet
            : paths.cash;
  const initials =
    !logo && provider
      ? provider.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase()
      : "";
  const background =
    provider?.id === "metrobank"
      ? "#17498d"
      : provider?.id === "eastwest"
        ? "#4b1530"
        : logo
          ? "#ffffff"
          : theme.tint;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
      }}
    >
      {logo ? (
        <Image
          source={logo}
          accessible={false}
          resizeMode="contain"
          style={{ width: size - 4, height: size - 4 }}
        />
      ) : (
        <Svg
          width={initials ? size - 17 : size - 10}
          height={initials ? size - 17 : size - 10}
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.primary}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          accessible={Platform.OS === "web" ? undefined : false}
          aria-hidden
        >
          <Path d={path} />
        </Svg>
      )}
      {initials ? (
        <Txt
          style={{
            fontSize: 8,
            lineHeight: 10,
            fontWeight: "700",
            color: theme.primary,
          }}
        >
          {initials}
        </Txt>
      ) : null}
    </View>
  );
}
