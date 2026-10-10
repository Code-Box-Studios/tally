import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : true,
  );
  useEffect(() => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.matchMedia
    ) {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      const change = () => setReduced(query.matches);
      change();
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    }
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
