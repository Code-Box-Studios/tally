import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import { useSession } from "../features/auth/session-provider";
const light = {
  isDark: false,
  background: "#f6f7f4",
  surface: "#ffffff",
  ink: "#26332d",
  muted: "#657166",
  primary: "#3c6653",
  tint: "#edf4ee",
  border: "#e6e9e2",
  danger: "#b64c3a",
  warm: "#fff4e6",
  surface2: "#f8f9f6",
  green: "#426953",
  greenBg: "#eef4e9",
  blue: "#4b6c91",
  blueBg: "#edf2f8",
  amber: "#856334",
  amberBg: "#f8f3e6",
  redBg: "#faf0ec",
};
const dark = {
  isDark: true,
  background: "#151d19",
  surface: "#1d2721",
  ink: "#e6ece5",
  muted: "#a2aea3",
  primary: "#9dc4a8",
  tint: "#2d4435",
  border: "#344137",
  danger: "#ffad97",
  warm: "#3e3322",
  surface2: "#222e26",
  green: "#b1cfad",
  greenBg: "#2a3c2b",
  blue: "#b1c8e4",
  blueBg: "#293b4d",
  amber: "#dbc38e",
  amberBg: "#403727",
  redBg: "#44332a",
};
type Theme = typeof light;
const Context = createContext<Theme>(light);
export type AppearanceMode = "light" | "dark" | "system";
const AppearanceContext = createContext({
  mode: "system" as AppearanceMode,
  setMode: (_mode: AppearanceMode) => {},
  saveBusy: false,
  beginSave: (): boolean => true,
  finishSave: () => {},
});
export function ThemeProvider({ children }: PropsWithChildren) {
  const { profile } = useSession(),
    system = useColorScheme();
  const [signedOutMode, setSignedOutMode] = useState<AppearanceMode>("system");
  const [saveBusy, setSaveBusy] = useState(false);
  const saving = useRef(false);
  function beginSave() {
    if (saving.current) return false;
    saving.current = true;
    setSaveBusy(true);
    return true;
  }
  function finishSave() {
    saving.current = false;
    setSaveBusy(false);
  }
  const mode = profile?.themeMode ?? signedOutMode;
  const theme = (mode === "system" ? system : mode) === "dark" ? dark : light;
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);
  return (
    <AppearanceContext.Provider
      value={{
        mode,
        setMode: setSignedOutMode,
        saveBusy,
        beginSave,
        finishSave,
      }}
    >
      <Context.Provider value={theme}>{children}</Context.Provider>
    </AppearanceContext.Provider>
  );
}
export function useAppearance() {
  return useContext(AppearanceContext);
}
export function useTheme() {
  return useContext(Context);
}
