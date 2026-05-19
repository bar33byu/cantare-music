"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { toPlayableAudioUrl } from "../lib/audioUrls";

interface MidiStatusSource {
  id: string;
  originalFilename: string;
  uploadedAt: string;
  parseStatus: string;
  rawNoteCount: number;
  cleanedNoteCount: number;
  ignoredShortNoteCount: number;
  cleanupSettings: {
    shortNoteThresholdMs: number;
    simultaneousThresholdMs: number;
  };
  cleanedNotes: Array<{
    index: number;
    midiPitch: number;
    pitchName: string;
    movementFromPrevious: "start" | "up" | "down" | "same";
  }>;
}

interface MidiStatusAlignment {
  id: string;
  tappedStartTimesSeconds: number[];
  retainedMidiNoteCount: number;
  isComplete: boolean;
  updatedAt: string;
}

interface MidiStatusPayload {
  source: MidiStatusSource | null;
  alignment: MidiStatusAlignment | null;
  summary: {
    hasMidi: boolean;
    rawNoteCount: number;
    cleanedNoteCount: number;
    ignoredShortNoteCount: number;
    shortNoteThresholdMs: number;
    alignedCount: number;
    retainedMidiNoteCount: number;
    hasCompleteAlignment: boolean;
    hasDerivedAnswerKey: boolean;
    latestAlignmentDate: string | null;
  };
}

interface MidiSetupPanelProps {
  songId: string;
  audioUrl: string;
  request: (url: string, init?: RequestInit) => Promise<Response>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "None yet";
  }
  return new Date(value).toLocaleString();
}

function movementLabel(value: "start" | "up" | "down" | "same"): string {
  if (value === "up") return "Up";
  if (value === "down") return "Down";
  if (value === "same") return "Same";
  return "Start";
}

function emptySummary(): MidiStatusPayload["summary"] {
  return {
    hasMidi: false,
    rawNoteCount: 0,
    cleanedNoteCount: 0,
    ignoredShortNoteCount: 0,
    shortNoteThresholdMs: 100,
    alignedCount: 0,
    retainedMidiNoteCount: 0,
    hasCompleteAlignment: false,
    hasDerivedAnswerKey: false,
    latestAlignmentDate: null,
  };
}

function normalizeStatus(payload: Partial<MidiStatusPayload>): MidiStatusPayload {
  return {
    source: payload.source ?? null,
    alignment: payload.alignment ?? null,
    summary: { ...emptySummary(), ...(payload.summary ?? {}) },
  };
}

export function MidiSetupPanel({ songId, audioUrl, request }: MidiSetupPanelProps) {
  const [status, setStatus] = useState<MidiStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState(100);
  const [isAligning, setIsAligning] = useState(false);
  const [resumeIndexDraft, setResumeIndexDraft] = useState("0");
  const playbackUrl = useMemo(() => toPlayableAudioUrl(audioUrl), [audioUrl]);
  const { isPlaying, isReady, currentMs, durationMs, play, pause, seek } = useAudioPlayer(playbackUrl);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request(`/api/songs/${songId}/midi`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load MIDI status (${response.status})`);
      }
      const payload = normalizeStatus(await response.json() as Partial<MidiStatusPayload>);
      setStatus(payload);
      setThresholdDraft(payload.summary.shortNoteThresholdMs);
      setResumeIndexDraft(String(payload.summary.alignedCount));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load MIDI status.");
    } finally {
      setLoading(false);
    }
  }, [request, songId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const alignedCount = status?.alignment?.tappedStartTimesSeconds.length ?? 0;
  const retainedCount = status?.source?.cleanedNoteCount ?? 0;
  const summary = status?.summary ?? emptySummary();
  const nextNote = status?.source?.cleanedNotes[alignedCount] ?? null;
  const upcomingNotes = status?.source?.cleanedNotes.slice(Math.max(0, alignedCount - 3), alignedCount + 9) ?? [];

  const uploadMidi = async (file: File | null) => {
    if (!file) {
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("shortNoteThresholdMs", String(thresholdDraft));
      const response = await request(`/api/songs/${songId}/midi`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? `MIDI upload failed (${response.status})`);
      }
      setStatus(normalizeStatus(await response.json() as Partial<MidiStatusPayload>));
      setMessage("MIDI uploaded and parsed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "MIDI upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const updateThreshold = async () => {
    setMessage(null);
    const response = await request(`/api/songs/${songId}/midi`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortNoteThresholdMs: thresholdDraft }),
    });
    if (!response.ok) {
      setMessage("Could not update MIDI cleanup.");
      return;
    }
    setStatus(normalizeStatus(await response.json() as Partial<MidiStatusPayload>));
    setMessage("MIDI cleanup updated.");
  };

  const postAlignmentAction = async (body: Record<string, unknown>) => {
    const response = await request(`/api/songs/${songId}/midi/alignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Alignment update failed (${response.status})`);
    }
    await loadStatus();
  };

  const tapAlignedNote = async () => {
    if (!status?.source || alignedCount >= retainedCount) {
      return;
    }
    try {
      await postAlignmentAction({ action: "tap", timeSeconds: currentMs / 1000 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save tap.");
    }
  };

  const startPlayback = () => {
    const startMs = Math.max(0, currentMs);
    play(startMs, durationMs > startMs ? durationMs : startMs + 60_000);
  };

  const resumeFromSelected = async () => {
    const noteIndex = Number(resumeIndexDraft);
    try {
      const previousTime = status?.alignment?.tappedStartTimesSeconds[Math.max(0, noteIndex - 1)];
      if (typeof previousTime === "number") {
        seek(Math.max(0, previousTime * 1000 - 1500));
      }
      await postAlignmentAction({ action: "resumeFrom", noteIndex });
      setIsAligning(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resume alignment.");
    }
  };

  return (
    <section className="mb-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm" data-testid="midi-setup-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-800">MIDI-guided tap practice</p>
          <p className="mt-1 text-xs text-slate-500">
            {status?.source ? status.source.originalFilename : "Upload a single-part MIDI file to create tap keys from note onsets."}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
          {uploading ? "Uploading..." : "Upload/replace MIDI"}
          <input
            data-testid="midi-upload-input"
            type="file"
            accept=".mid,.midi"
            disabled={uploading}
            className="sr-only"
            onChange={(event) => {
              void uploadMidi(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading MIDI status...</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p><span className="font-semibold text-slate-900">Uploaded:</span> {formatDate(status?.source?.uploadedAt)}</p>
            <p><span className="font-semibold text-slate-900">Parse:</span> {status?.source?.parseStatus ?? "No MIDI"}</p>
            <p><span className="font-semibold text-slate-900">Notes:</span> {summary.rawNoteCount} raw, {summary.cleanedNoteCount} retained, {summary.ignoredShortNoteCount} ignored</p>
            <p><span className="font-semibold text-slate-900">Alignment:</span> {summary.alignedCount} / {summary.retainedMidiNoteCount} notes</p>
            <p><span className="font-semibold text-slate-900">Derived key:</span> {summary.hasDerivedAnswerKey ? "Ready" : "Not ready"}</p>
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <label className="text-xs font-semibold text-slate-700" htmlFor="midi-short-note-threshold">
              Ignore notes shorter than {thresholdDraft} ms
            </label>
            <input
              id="midi-short-note-threshold"
              data-testid="midi-short-note-threshold"
              type="range"
              min={0}
              max={300}
              step={10}
              value={thresholdDraft}
              disabled={!status?.source}
              onChange={(event) => setThresholdDraft(Number(event.currentTarget.value))}
              className="mt-2 w-full"
            />
            <button
              type="button"
              disabled={!status?.source}
              onClick={() => { void updateThreshold(); }}
              className="mt-2 rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 disabled:opacity-40"
            >
              Re-clean MIDI
            </button>
          </div>
        </div>
      )}

      {status?.source ? (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAligning(true);
                void postAlignmentAction({ action: "start" }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not start alignment."));
              }}
              className="rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              {alignedCount > 0 ? "Resume alignment" : "Start alignment"}
            </button>
            <button
              type="button"
              disabled={!isReady}
              onClick={() => (isPlaying ? pause() : startPlayback())}
              className="rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 disabled:opacity-40"
            >
              {isPlaying ? "Pause audio" : "Play audio"}
            </button>
            <button
              type="button"
              disabled={alignedCount === 0}
              onClick={() => { void postAlignmentAction({ action: "undo" }); }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Undo last tap
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Restart MIDI alignment for this song?")) {
                  void postAlignmentAction({ action: "restart" });
                }
              }}
              className="rounded-full border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700"
            >
              Restart
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              data-testid="midi-resume-index"
              type="number"
              min={0}
              max={retainedCount}
              value={resumeIndexDraft}
              onChange={(event) => setResumeIndexDraft(event.currentTarget.value)}
              className="w-24 rounded border border-indigo-200 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => { void resumeFromSelected(); }}
              className="rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-700"
            >
              Resume from note
            </button>
          </div>

          {isAligning ? (
            <div className="mt-3">
              <button
                type="button"
                data-testid="midi-alignment-tap"
                disabled={!isReady || alignedCount >= retainedCount}
                onClick={() => { void tapAlignedNote(); }}
                className="tap-input-surface flex h-32 w-full touch-none select-none flex-col items-center justify-center rounded-2xl border-2 border-indigo-500 bg-white text-center shadow-sm disabled:opacity-50"
              >
                <span className="text-lg font-bold text-indigo-700">{alignedCount} / {retainedCount} notes</span>
                <span className="mt-1 text-sm text-slate-600">
                  {nextNote ? `${nextNote.pitchName} - ${movementLabel(nextNote.movementFromPrevious)}` : "Alignment complete"}
                </span>
              </button>
              <div className="mt-3 flex items-center gap-1 overflow-hidden" data-testid="midi-alignment-visual">
                {upcomingNotes.map((note) => (
                  <span
                    key={note.index}
                    title={`${note.index + 1}: ${note.pitchName}`}
                    className={`h-5 min-w-5 rounded-full border text-[10px] leading-5 text-center ${
                      note.index === alignedCount
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : note.index < alignedCount
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {note.movementFromPrevious === "up" ? "U" : note.movementFromPrevious === "down" ? "D" : note.movementFromPrevious === "same" ? "S" : "•"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}
    </section>
  );
}
