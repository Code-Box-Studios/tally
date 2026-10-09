import React, {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";
import { useSession } from "../features/auth/session-provider";
const light = {
  background: "#f6f7f4",
  surface: "#ffffff",
  ink: "#26332d",
  muted: "#778078",
  primary: "#3c6653",
  tint: "#edf4ee",
  border: "#e6e9e2",
  danger: "#b64c3a",
  warm: "#fff4e6",
};
const dark = {
  background: "#151d19",
  surface: "#1d2721",
  ink: "#e6ece5",
  muted: "#a2aea3",
  primary: "#9dc4a8",
  tint: "#2d4435",
  border: "#344137",
  danger: "#ffad97",
  warm: "#3e3322",
};
type Theme = typeof light;
const Context = createContext<Theme>(light);
export function ThemeProvider({ children }: PropsWithChildren) {
  const { profile } = useSession(),
    system = useColorScheme();
  const mode =
    profile?.themeMode === "system" ? system : (profile?.themeMode ?? system);
  return (
    <Context.Provider value={mode === "dark" ? dark : light}>
      {children}
    </Context.Provider>
  );
}
export function useTheme() {
  return useContext(Context);
}
