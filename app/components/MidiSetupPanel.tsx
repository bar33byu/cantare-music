"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioPlayerControls } from "../hooks/useAudioPlayer";

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
    midiStartSeconds: number;
    midiDurationSeconds: number;
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
  audioPlayer: Pick<AudioPlayerControls, "isPlaying" | "isReady" | "currentMs" | "durationMs" | "play" | "pause" | "seek">;
  request: (url: string, init?: RequestInit) => Promise<Response>;
}

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const PIANO_ROLL_NOW_PERCENT = 28;
const PIANO_ROLL_PERCENT_PER_SECOND = 12;
const MIN_NOTE_WIDTH_PERCENT = 2.5;
const MAX_NOTE_WIDTH_PERCENT = 36;
const MIN_PREVIEW_SECONDS = 0.16;
const MAX_PREVIEW_SECONDS = 0.9;

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "None yet";
}

function movementLabel(value: "start" | "up" | "down" | "same"): string {
  if (value === "up") return "Up";
  if (value === "down") return "Down";
  if (value === "same") return "Same";
  return "Start";
}

function midiPitchToFrequency(pitch: number): number {
  return 440 * (2 ** ((pitch - 69) / 12));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function normalizePitchPosition(notes: MidiStatusSource["cleanedNotes"], pitch: number): number {
  if (notes.length === 0) return 50;
  const pitches = notes.map((note) => note.midiPitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  if (minPitch === maxPitch) return 50;
  return 88 - ((pitch - minPitch) / (maxPitch - minPitch)) * 76;
}

function estimateNoteAudioStartSeconds(
  note: MidiStatusSource["cleanedNotes"][number],
  notes: MidiStatusSource["cleanedNotes"],
  tappedStartTimesSeconds: number[]
): number {
  if (typeof tappedStartTimesSeconds[note.index] === "number") {
    return tappedStartTimesSeconds[note.index];
  }

  const lastAlignedIndex = Math.min(tappedStartTimesSeconds.length - 1, notes.length - 1);
  if (lastAlignedIndex < 0) {
    return note.midiStartSeconds;
  }

  const lastAlignedNote = notes[lastAlignedIndex];
  return tappedStartTimesSeconds[lastAlignedIndex] + (note.midiStartSeconds - lastAlignedNote.midiStartSeconds);
}

function estimateEffectiveNoteDurationSeconds(
  note: MidiStatusSource["cleanedNotes"][number],
  notes: MidiStatusSource["cleanedNotes"],
  tappedStartTimesSeconds: number[]
): number {
  const nextNote = notes[note.index + 1];
  const midiGapSeconds = nextNote ? nextNote.midiStartSeconds - note.midiStartSeconds : 0;
  const midiDurationSeconds = Math.max(MIN_PREVIEW_SECONDS, note.midiDurationSeconds || MIN_PREVIEW_SECONDS);
  const midiHeldRatio = midiGapSeconds > 0
    ? clamp(midiDurationSeconds / midiGapSeconds, 0.15, 1)
    : 1;
  const tappedStartSeconds = tappedStartTimesSeconds[note.index];
  const nextTappedStartSeconds = tappedStartTimesSeconds[note.index + 1];

  if (
    typeof tappedStartSeconds === "number" &&
    typeof nextTappedStartSeconds === "number" &&
    nextTappedStartSeconds > tappedStartSeconds
  ) {
    const realGapSeconds = nextTappedStartSeconds - tappedStartSeconds;
    return clamp(realGapSeconds * midiHeldRatio, MIN_PREVIEW_SECONDS, realGapSeconds);
  }

  return clamp(midiDurationSeconds, MIN_PREVIEW_SECONDS, MAX_PREVIEW_SECONDS);
}

function updateStatusAlignment(status: MidiStatusPayload, alignment: MidiStatusAlignment): MidiStatusPayload {
  const alignedCount = alignment.tappedStartTimesSeconds.length;
  return {
    ...status,
    alignment,
    summary: {
      ...status.summary,
      alignedCount,
      retainedMidiNoteCount: alignment.retainedMidiNoteCount,
      hasCompleteAlignment: alignment.isComplete || status.summary.hasCompleteAlignment,
      hasDerivedAnswerKey: alignment.isComplete || status.summary.hasDerivedAnswerKey,
      latestAlignmentDate: alignment.updatedAt,
    },
  };
}

export function MidiSetupPanel({ songId, audioPlayer, request }: MidiSetupPanelProps) {
  const [status, setStatus] = useState<MidiStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState(100);
  const [isAligning, setIsAligning] = useState(false);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [resumeIndexDraft, setResumeIndexDraft] = useState("0");
  const tapSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const audioContextRef = useRef<AudioContext | null>(null);
  const { isPlaying, isReady, currentMs, durationMs, play, pause, seek } = audioPlayer;

  const loadStatus = useCallback(async (options: { showLoading?: boolean } = {}) => {
    if (options.showLoading ?? true) {
      setLoading(true);
    }
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
      if (options.showLoading ?? true) {
        setLoading(false);
      }
    }
  }, [request, songId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const alignedCount = status?.alignment?.tappedStartTimesSeconds.length ?? 0;
  const retainedCount = status?.source?.cleanedNoteCount ?? 0;
  const summary = status?.summary ?? emptySummary();
  const nextNote = status?.source?.cleanedNotes[alignedCount] ?? null;
  const pianoRollNotes = useMemo(
    () => (status?.source?.cleanedNotes ?? []).filter((note) => {
      const audioStartSeconds = estimateNoteAudioStartSeconds(
        note,
        status?.source?.cleanedNotes ?? [],
        status?.alignment?.tappedStartTimesSeconds ?? []
      );
      const deltaSeconds = audioStartSeconds - (currentMs / 1000);
      return deltaSeconds >= -2.5 && deltaSeconds <= 8;
    }),
    [currentMs, status?.alignment?.tappedStartTimesSeconds, status?.source?.cleanedNotes]
  );

  const uploadMidi = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("shortNoteThresholdMs", String(thresholdDraft));
      const response = await request(`/api/songs/${songId}/midi`, { method: "POST", body: formData });
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

  const postAlignmentAction = async (
    body: Record<string, unknown>,
    options: { applyResponse?: boolean } = {}
  ): Promise<MidiStatusAlignment> => {
    const response = await request(`/api/songs/${songId}/midi/alignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Alignment update failed (${response.status})`);
    }
    const payload = await response.json() as { alignment?: MidiStatusAlignment };
    if (!payload.alignment) {
      throw new Error("Alignment response was missing progress.");
    }
    if (options.applyResponse ?? true) {
      setStatus((previous) => previous ? updateStatusAlignment(previous, payload.alignment!) : previous);
      setResumeIndexDraft(String(payload.alignment.tappedStartTimesSeconds.length));
    }
    return payload.alignment;
  };

  const playMidiTapPreview = (note: MidiStatusSource["cleanedNotes"][number]) => {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }

      const now = context.currentTime;
      const previewDurationSeconds = estimateEffectiveNoteDurationSeconds(
        note,
        status?.source?.cleanedNotes ?? [],
        status?.alignment?.tappedStartTimesSeconds ?? []
      );
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(midiPitchToFrequency(note.midiPitch), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + previewDurationSeconds);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + previewDurationSeconds + 0.02);
    } catch {
      // The audible preview is helpful, but alignment should still work if Web Audio is unavailable.
    }
  };

  const tapAlignedNote = () => {
    if (!status?.source || !status.alignment || alignedCount >= retainedCount) {
      return;
    }
    const tappedNote = status.source.cleanedNotes[alignedCount];
    const timeSeconds = currentMs / 1000;
    if (tappedNote) {
      playMidiTapPreview(tappedNote);
    }
    setMessage(null);
    setStatus((previous) => {
      if (!previous?.alignment) return previous;
      const tappedStartTimesSeconds = [
        ...previous.alignment.tappedStartTimesSeconds,
        timeSeconds,
      ].slice(0, previous.alignment.retainedMidiNoteCount);
      const isComplete = tappedStartTimesSeconds.length >= previous.alignment.retainedMidiNoteCount;
      return updateStatusAlignment(previous, {
        ...previous.alignment,
        tappedStartTimesSeconds,
        isComplete,
        updatedAt: new Date().toISOString(),
      });
    });
    setResumeIndexDraft(String(alignedCount + 1));
    setConfirmingRestart(false);
    tapSaveChainRef.current = tapSaveChainRef.current
      .then(() => postAlignmentAction({ action: "tap", timeSeconds }, { applyResponse: false }))
      .then(() => undefined)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Could not save tap.");
        void loadStatus({ showLoading: false });
      });
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
      setConfirmingRestart(false);
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
            {status?.source ? status.source.originalFilename : "Upload a single-part MIDI file to create a MIDI contour from note onsets."}
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
              data-testid="midi-restart-alignment"
              onClick={() => setConfirmingRestart(true)}
              className="rounded-full border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700"
            >
              Restart
            </button>
          </div>

          {confirmingRestart ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <span className="font-semibold">Restart MIDI alignment?</span>
              <button
                type="button"
                data-testid="midi-confirm-restart"
                onClick={() => {
                  setConfirmingRestart(false);
                  void postAlignmentAction({ action: "restart" });
                }}
                className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Yes, restart
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRestart(false)}
                className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700"
              >
                Cancel
              </button>
            </div>
          ) : null}

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
              <div
                role="button"
                tabIndex={0}
                data-testid="midi-alignment-tap"
                aria-disabled={!isReady || alignedCount >= retainedCount}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isReady && alignedCount < retainedCount) {
                    tapAlignedNote();
                  }
                }}
                onKeyDown={(event) => {
                  if ((event.key === " " || event.key === "Enter") && isReady && alignedCount < retainedCount) {
                    event.preventDefault();
                    tapAlignedNote();
                  }
                }}
                className={`tap-input-surface flex h-44 w-full touch-none select-none flex-col items-center justify-center rounded-2xl border-2 border-indigo-500 bg-white text-center shadow-sm md:h-52 ${
                  !isReady || alignedCount >= retainedCount ? "opacity-50" : "cursor-pointer active:bg-indigo-50"
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-500">Tap here with the audio</span>
                <span className="mt-2 text-2xl font-bold text-indigo-700">{alignedCount} / {retainedCount} notes</span>
                <span className="mt-1 text-base text-slate-700">
                  {nextNote ? `${nextNote.pitchName} - ${movementLabel(nextNote.movementFromPrevious)}` : "Alignment complete"}
                </span>
              </div>

              <div className="mt-3 h-36 overflow-hidden rounded-xl border border-indigo-100 bg-white" data-testid="midi-alignment-visual">
                <div className="relative h-full min-w-full">
                  <div className="absolute bottom-3 top-3 left-[28%] border-l-2 border-indigo-600" />
                  <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
                  {pianoRollNotes.map((note) => {
                    const audioStartSeconds = estimateNoteAudioStartSeconds(
                      note,
                      status.source?.cleanedNotes ?? [],
                      status.alignment?.tappedStartTimesSeconds ?? []
                    );
                    const effectiveDurationSeconds = estimateEffectiveNoteDurationSeconds(
                      note,
                      status.source?.cleanedNotes ?? [],
                      status.alignment?.tappedStartTimesSeconds ?? []
                    );
                    const deltaSeconds = audioStartSeconds - (currentMs / 1000);
                    const leftPercent = PIANO_ROLL_NOW_PERCENT + deltaSeconds * PIANO_ROLL_PERCENT_PER_SECOND;
                    const topPercent = normalizePitchPosition(status.source?.cleanedNotes ?? [], note.midiPitch);
                    const widthPercent = clamp(
                      effectiveDurationSeconds * PIANO_ROLL_PERCENT_PER_SECOND,
                      MIN_NOTE_WIDTH_PERCENT,
                      MAX_NOTE_WIDTH_PERCENT
                    );
                    return (
                      <button
                        type="button"
                        key={note.index}
                        title={`${note.index + 1}: ${note.pitchName} ${movementLabel(note.movementFromPrevious)}`}
                        aria-label={`Select note ${note.index + 1}`}
                        data-testid={`midi-note-${note.index + 1}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setResumeIndexDraft(String(note.index));
                        }}
                        className={`absolute h-3 cursor-pointer rounded-full border p-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                          note.index === alignedCount
                            ? "border-indigo-700 bg-indigo-600"
                            : note.index < alignedCount
                              ? "border-emerald-300 bg-emerald-200"
                              : "border-slate-300 bg-slate-100"
                        }`}
                        style={{
                          left: `${leftPercent}%`,
                          top: `${topPercent}%`,
                          minWidth: note.index === alignedCount ? "2rem" : "1.4rem",
                          width: `${widthPercent}%`,
                        }}
                      >
                        <span className="sr-only">{movementLabel(note.movementFromPrevious)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}
    </section>
  );
}
