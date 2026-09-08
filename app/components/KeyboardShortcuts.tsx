"use client";

import { useId } from "react";
import { useKeyboardPreferences, type HintPreference } from "../hooks/useKeyboardPreferences";

export function KeyboardShortcuts({ context = "general" }: { context?: "general" | "practice" | "tap" }) {
  const { enabled, hints, showHints, update } = useKeyboardPreferences();
  const id = useId();
  return (
    <details data-shortcut-help className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
      <summary className="cursor-pointer font-medium">Keyboard shortcuts
        {showHints && context !== "general" ? <span className="ml-2 text-xs font-normal text-slate-500">{context === "tap" ? "9 / 0: sections" : "K: play/pause"}</span> : null}
      </summary>
      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        <p className="text-xs">Shortcuts work in song practice, outside text fields and dialogs. Focused controls keep their normal keys.</p>
        {context !== "tap" ? <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <dt>Space / K</dt><dd>Play or pause</dd>
          <dt>← / → or J / L</dt><dd>Seek 5 seconds</dd>
          <dt>Shift + J / L</dt><dd>Seek 15 seconds</dd>
          <dt>Page Up / Down or U / O</dt><dd>Previous / next section</dd>
          <dt>R</dt><dd>Toggle section loop</dd>
          <dt>1–5</dt><dd>Rate the current section when ratings are available</dd>
          <dt>Escape</dt><dd>Stop Hands Free when no dialog is open</dd>
        </dl> : null}
        {context !== "practice" ? <div className="space-y-1 text-xs">
          <p className="font-semibold">Tap practice</p>
          <p>9 / 0 select previous / next section. Space plays or pauses.</p>
          <p>Letter and punctuation keys become pitch taps, from low to high in this order:</p>
          <p className="break-all font-mono">z x c v b n m , . / a s d f g h j k l ; &apos; q w e r t y u i o p [ ] \</p>
          <p>J/K/L, U/O, and R are taps in this mode, not transport shortcuts.</p>
        </div> : null}
        <label className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(event) => update({ enabled: event.target.checked })} />
          Enable practice shortcuts
        </label>
        <label htmlFor={id} className="block text-xs">Shortcut hints on this device</label>
        <select id={id} value={hints} onChange={(event) => update({ hints: event.target.value as HintPreference })}
          className="min-h-11 rounded border border-slate-300 bg-white px-2">
          <option value="auto">Auto — after keyboard use</option>
          <option value="always">Always</option>
          <option value="never">Never</option>
        </select>
        <p className="text-xs text-slate-500">Auto responds to Tab navigation, not screen size. Touch or pen use hides hints. This reference is always available.</p>
      </div>
    </details>
  );
}
