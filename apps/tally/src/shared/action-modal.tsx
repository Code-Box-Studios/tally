import React, { type PropsWithChildren } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useTheme } from "./theme";
import { Icon } from "./icons";
import { Txt } from "./ui";

export function ActionModal({
  title,
  onClose,
  maxWidth = 600,
  children,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  maxWidth?: number;
}>) {
  const theme = useTheme();
  return (
    <Modal
      visible
      transparent
      animationType="none"
      accessibilityLabel={title}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          backgroundColor: "#00000088",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          onPress={onClose}
          style={{ position: "absolute", inset: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth,
            maxHeight: "90%",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              gap: 16,
            }}
          >
            <Txt big style={{ flex: 1, fontSize: 22, fontWeight: "600" }}>
              {title}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              onPress={onClose}
              style={({ pressed }) => ({
                minWidth: 44,
                minHeight: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? theme.tint : "transparent",
              })}
            >
              <Icon name="close" color={theme.muted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: 20, paddingTop: 0 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
