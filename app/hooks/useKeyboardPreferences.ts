"use client";

import { useSyncExternalStore } from "react";

const KEY = "cantare-keyboard-preferences";
const CHANGE = "cantare-keyboard-preferences-changed";
const defaults = { enabled: true };
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
    preferences = { enabled: parsed.enabled !== false };
  } catch { /* Use defaults when storage is unavailable or invalid. */ }
  const update = (next: Partial<typeof defaults>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...preferences, ...next }));
      window.dispatchEvent(new Event(CHANGE));
    } catch { /* A blocked storage preference cannot be persisted. */ }
  };
  return { ...preferences, update };
}
