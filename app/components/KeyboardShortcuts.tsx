"use client";

import { useKeyboardPreferences } from "../hooks/useKeyboardPreferences";

export function KeyboardShortcuts() {
  const { enabled, update } = useKeyboardPreferences();
  return (
    <details data-shortcut-help className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
      <summary className="cursor-pointer font-medium">Keyboard shortcuts</summary>
      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        <p className="text-xs">Shortcuts work in song practice, outside text fields and dialogs. Focused controls keep their normal keys.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <dt>Space / K</dt><dd>Play or pause</dd>
          <dt>← / → or J / L</dt><dd>Seek 5 seconds</dd>
          <dt>Shift + J / L</dt><dd>Seek 15 seconds</dd>
          <dt>Page Up / Down or U / O</dt><dd>Previous / next section</dd>
          <dt>R</dt><dd>Toggle section loop</dd>
          <dt>;</dt><dd>Toggle the contour preview</dd>
          <dt>1–5</dt><dd>Rate the current section when ratings are available</dd>
          <dt>Escape</dt><dd>Stop Hands Free when no dialog is open</dd>
        </dl>
        <div className="space-y-1 rounded-md border border-indigo-100 bg-white p-2 text-xs">
          <p className="font-semibold text-slate-800">Tap practice keyboard controls</p>
          <p>9 / 0 select the previous / next section. Space plays or pauses.</p>
          <p>Letter and punctuation keys become pitch taps, from low to high in this order:</p>
          <p className="break-all font-mono">z x c v b n m , . / a s d f g h j k l ; &apos; q w e r t y u i o p [ ] \</p>
          <p>J/K/L, U/O, R, and semicolon are pitch taps in Tap mode, so their ordinary practice shortcuts are paused.</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(event) => update({ enabled: event.target.checked })} />
          Enable practice shortcuts
        </label>
        <p className="text-xs text-slate-500">Hover or focus practice controls for a brief reminder of their shortcuts.</p>
      </div>
    </details>
  );
}
