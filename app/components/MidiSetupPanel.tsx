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
  audioPlayer: Pick<AudioPlayerControls, "currentMs" | "durationMs">;
  request: (url: string, init?: RequestInit) => Promise<Response>;
}

const PIANO_ROLL_NOW_PERCENT = 28;
const PIANO_ROLL_PERCENT_PER_SECOND = 12;
const MIN_NOTE_WIDTH_PERCENT = 2.5;
const MAX_NOTE_WIDTH_PERCENT = 36;

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "None yet";
}

function movementLabel(value: "start" | "up" | "down" | "same"): string {
  if (value === "up") return "Up";
  if (value === "down") return "Down";
  if (value === "same") return "Same";
  return "Start";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)}s`;
}

function emptySummary(): MidiStatusPayload["summary"] {
  return {
    hasMidi: false,
    rawNoteCount: 0,
    cleanedNoteCount: 0,
    ignoredShortNoteCount: 0,
    shortNoteThresholdMs: 0,
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
  const [firstAudioStartDraftSeconds, setFirstAudioStartDraftSeconds] = useState(0);
  const currentMsRef = useRef(0);
  const { currentMs, durationMs } = audioPlayer;

  useEffect(() => {
    currentMsRef.current = currentMs;
  }, [currentMs]);

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

  const summary = status?.summary ?? emptySummary();
  const firstMidiStartSeconds = status?.source?.cleanedNotes[0]?.midiStartSeconds ?? 0;
  const offsetSliderMaxSeconds = Math.max(60, Math.ceil(durationMs / 1000), Math.ceil(firstAudioStartDraftSeconds + 10));
  const setClampedFirstAudioStartDraftSeconds = useCallback((value: number) => {
    setFirstAudioStartDraftSeconds(clamp(value, 0, Math.max(60, Math.ceil(durationMs / 1000), value)));
  }, [durationMs]);
  const offsetPreviewNotes = useMemo(
    () => (status?.source?.cleanedNotes ?? []).filter((note) => {
      const audioStartSeconds = firstAudioStartDraftSeconds + (note.midiStartSeconds - firstMidiStartSeconds);
      const deltaSeconds = audioStartSeconds - (currentMs / 1000);
      return deltaSeconds >= -2.5 && deltaSeconds <= 8;
    }),
    [currentMs, firstAudioStartDraftSeconds, firstMidiStartSeconds, status?.source?.cleanedNotes]
  );

  useEffect(() => {
    if (!status?.source) {
      setFirstAudioStartDraftSeconds(0);
      return;
    }

    const existingFirstAudioStartSeconds = status.alignment?.tappedStartTimesSeconds[0];
    setFirstAudioStartDraftSeconds(
      typeof existingFirstAudioStartSeconds === "number"
        ? existingFirstAudioStartSeconds
        : currentMsRef.current / 1000
    );
  }, [status?.alignment?.tappedStartTimesSeconds, status?.alignment?.updatedAt, status?.source]);

  const uploadMidi = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
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
    }
    return payload.alignment;
  };

  const applyStartOffset = async () => {
    try {
      const firstAudioStartSeconds = firstAudioStartDraftSeconds;
      await postAlignmentAction({ action: "offset", firstAudioStartSeconds });
      setMessage("MIDI start offset applied.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply MIDI start offset.");
    }
  };

  const nudgeFirstAudioStart = (deltaSeconds: number) => {
    setClampedFirstAudioStartDraftSeconds(firstAudioStartDraftSeconds + deltaSeconds);
  };

  return (
    <section className="mb-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm" data-testid="midi-setup-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-800">MIDI start setup</p>
          <p className="mt-1 text-xs text-slate-500">
            {status?.source ? status.source.originalFilename : "Upload a single-part MIDI file, then line up its first note with the audio."}
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
        <div className="mt-3">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p><span className="font-semibold text-slate-900">Uploaded:</span> {formatDate(status?.source?.uploadedAt)}</p>
            <p><span className="font-semibold text-slate-900">Parse:</span> {status?.source?.parseStatus ?? "No MIDI"}</p>
            <p><span className="font-semibold text-slate-900">Notes:</span> {summary.cleanedNoteCount} notes</p>
            <p><span className="font-semibold text-slate-900">Alignment:</span> {summary.alignedCount} / {summary.retainedMidiNoteCount} notes</p>
            <p><span className="font-semibold text-slate-900">Derived key:</span> {summary.hasDerivedAnswerKey ? "Ready" : "Not ready"}</p>
          </div>
        </div>
      )}

      {status?.source ? (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <div className="mb-3 rounded-lg border border-indigo-100 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700" htmlFor="midi-start-offset-slider">
                First MIDI note at {formatSeconds(firstAudioStartDraftSeconds)}
              </label>
              <button
                type="button"
                data-testid="midi-start-offset-use-playhead"
                onClick={() => setClampedFirstAudioStartDraftSeconds(currentMs / 1000)}
                className="rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-700"
              >
                Use playhead
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                aria-label="Move MIDI one second earlier"
                onClick={() => nudgeFirstAudioStart(-1)}
                className="h-8 w-9 rounded border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                -1
              </button>
              <button
                type="button"
                aria-label="Move MIDI one tenth second earlier"
                onClick={() => nudgeFirstAudioStart(-0.1)}
                className="h-8 w-9 rounded border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                -.1
              </button>
              <input
                id="midi-start-offset-slider"
                data-testid="midi-start-offset-slider"
                type="range"
                min={0}
                max={offsetSliderMaxSeconds}
                step={0.05}
                value={firstAudioStartDraftSeconds}
                onChange={(event) => setClampedFirstAudioStartDraftSeconds(Number(event.currentTarget.value))}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                aria-label="Move MIDI one tenth second later"
                onClick={() => nudgeFirstAudioStart(0.1)}
                className="h-8 w-9 rounded border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                +.1
              </button>
              <button
                type="button"
                aria-label="Move MIDI one second later"
                onClick={() => nudgeFirstAudioStart(1)}
                className="h-8 w-9 rounded border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                +1
              </button>
            </div>
            <div className="mt-3 h-28 overflow-hidden rounded-lg border border-indigo-100 bg-slate-50" data-testid="midi-offset-preview">
              <div className="relative h-full min-w-full">
                <div className="absolute bottom-2 top-2 left-[28%] border-l-2 border-indigo-600" />
                <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
                {offsetPreviewNotes.map((note) => {
                  const audioStartSeconds = firstAudioStartDraftSeconds + (note.midiStartSeconds - firstMidiStartSeconds);
                  const deltaSeconds = audioStartSeconds - (currentMs / 1000);
                  const leftPercent = PIANO_ROLL_NOW_PERCENT + deltaSeconds * PIANO_ROLL_PERCENT_PER_SECOND;
                  const topPercent = normalizePitchPosition(status.source?.cleanedNotes ?? [], note.midiPitch);
                  const widthPercent = clamp(
                    note.midiDurationSeconds * PIANO_ROLL_PERCENT_PER_SECOND,
                    MIN_NOTE_WIDTH_PERCENT,
                    MAX_NOTE_WIDTH_PERCENT
                  );
                  return (
                    <span
                      key={note.index}
                      title={`Offset preview ${note.index + 1}: ${note.pitchName} ${movementLabel(note.movementFromPrevious)}`}
                      data-testid={`midi-offset-note-${note.index + 1}`}
                      className="absolute h-3 rounded-full border border-indigo-300 bg-indigo-200"
                      style={{
                        left: `${leftPercent}%`,
                        top: `${topPercent}%`,
                        minWidth: note.index === 0 ? "2rem" : "1.4rem",
                        width: `${widthPercent}%`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="midi-apply-start-offset"
              onClick={() => { void applyStartOffset(); }}
              className="rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              {summary.hasDerivedAnswerKey ? "Update start offset" : "Set start offset here"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}
    </section>
  );
}
