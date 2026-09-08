"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const KEY = "cantare-keyboard-preferences";
const CHANGE = "cantare-keyboard-preferences-changed";
export type HintPreference = "auto" | "always" | "never";
const defaults = { enabled: true, hints: "auto" as HintPreference };
function snapshot() {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE, callback);
  };
}
export function useKeyboardPreferences() {
  const stored = useSyncExternalStore(subscribe, snapshot, () => "");
  let preferences = defaults;
  try {
    const parsed = JSON.parse(stored);
    preferences = {
      enabled: parsed.enabled !== false,
      hints: ["auto", "always", "never"].includes(parsed.hints) ? parsed.hints : "auto",
    };
  } catch { /* Use defaults when storage is unavailable or invalid. */ }
  const [keyboardActive, setKeyboardActive] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" && !event.isComposing && !(event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.matches("input, textarea, select")))) setKeyboardActive(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") setKeyboardActive(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  const update = (next: Partial<typeof defaults>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...preferences, ...next }));
      window.dispatchEvent(new Event(CHANGE));
    } catch { /* A blocked storage preference cannot be persisted. */ }
  };
  return { ...preferences, update, showHints: preferences.enabled &&
    (preferences.hints === "always" || (preferences.hints === "auto" && keyboardActive)) };
}
