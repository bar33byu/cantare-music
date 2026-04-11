"use client";

import React from "react";
import type { PitchContourNote } from "../types";
import {
  buildContourDirectionEvents,
  compareContourAttemptDetailed,
  compareContourAttemptStable,
  type ContourDirection,
} from "../lib/contourPractice";

const DEFAULT_TIMELINE_MS = 4000;
const DEFAULT_NOTE_DURATION_MS = 120;
const DEFAULT_SAME_DEAD_ZONE = 0.08;

type EditorMode = "answer" | "attempt";

function makeNote(id: string, timeOffsetMs: number, lane: number): PitchContourNote {
  return {
    id,
    timeOffsetMs,
    lane,
    durationMs: DEFAULT_NOTE_DURATION_MS,
  };
}

function formatLane(lane: number): string {
  return lane.toFixed(2);
}

function formatTime(value: number): string {
  return `${Math.round(value)} ms`;
}

function directionGlyph(direction: ContourDirection): string {
  if (direction === "up") {
    return "^";
  }
  if (direction === "down") {
    return "v";
  }
  return "=";
}

function directionLabel(direction: ContourDirection): string {
  if (direction === "up") {
    return "Up";
  }
  if (direction === "down") {
    return "Down";
  }
  return "Same";
}

function statusLabel(status: "matched" | "mismatched" | "extra"): string {
  if (status === "matched") {
    return "Correct";
  }
  if (status === "extra") {
    return "Extra";
  }
  return "Wrong";
}

function parseNotes(text: string): PitchContourNote[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [timeRaw, laneRaw] = line.split(",").map((part) => part.trim());
      const timeOffsetMs = Number(timeRaw);
      const lane = Number(laneRaw);
      if (!Number.isFinite(timeOffsetMs) || !Number.isFinite(lane)) {
        return null;
      }
      return makeNote(`manual-${index + 1}`, Math.max(0, timeOffsetMs), Math.min(1, Math.max(0, lane)));
    })
    .filter((note): note is PitchContourNote => note !== null)
    .sort((first, second) => first.timeOffsetMs - second.timeOffsetMs);
}

function serializeNotes(notes: PitchContourNote[]): string {
  return notes.map((note) => `${Math.round(note.timeOffsetMs)}, ${note.lane.toFixed(2)}`).join("\n");
}

function buildArrowLookup(notes: PitchContourNote[], sameDeadZone: number): Record<string, ContourDirection> {
  const sorted = [...notes].sort((first, second) => first.timeOffsetMs - second.timeOffsetMs);
  const events = buildContourDirectionEvents(sorted, { sameDeadZone });
  const lookup: Record<string, ContourDirection> = {};
  for (let index = 1; index < sorted.length; index += 1) {
    const note = sorted[index];
    const event = events[index - 1];
    if (note && event) {
      lookup[note.id] = event.direction;
    }
  }
  return lookup;
}

function scorePillClasses(status: "matched" | "mismatched" | "extra") {
  if (status === "matched") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (status === "extra") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  return "border-rose-300 bg-rose-50 text-rose-800";
}

function buildAudioProxyPath(key: string): string {
  const segments = key
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  return `/api/audio/${segments.join("/")}`;
}

interface PlotProps {
  title: string;
  subtitle: string;
  notes: PitchContourNote[];
  sameDeadZone: number;
  timelineMs: number;
  accentClasses: string;
  onAddNote: (clientX: number, clientY: number, rect: DOMRect) => void;
  onUndo: () => void;
  onClear: () => void;
  textValue: string;
  onTextChange: (value: string) => void;
  playheadMs?: number;
}

function DotPlot({
  title,
  subtitle,
  notes,
  sameDeadZone,
  timelineMs,
  accentClasses,
  onAddNote,
  onUndo,
  onClear,
  textValue,
  onTextChange,
  playheadMs,
}: PlotProps) {
  const arrowLookup = React.useMemo(() => buildArrowLookup(notes, sameDeadZone), [notes, sameDeadZone]);
  const sortedNotes = React.useMemo(
    () => [...notes].sort((first, second) => first.timeOffsetMs - second.timeOffsetMs),
    [notes]
  );

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUndo}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>

      <button
        type="button"
        onPointerDown={(event) => onAddNote(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())}
        className={`relative mt-4 h-64 w-full overflow-hidden rounded-[24px] border border-dashed ${accentClasses} bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(241,245,249,0.96))] text-left`}
      >
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-300/70" />
        <div className="absolute inset-y-0 left-1/4 border-l border-slate-200" />
        <div className="absolute inset-y-0 left-2/4 border-l border-slate-200" />
        <div className="absolute inset-y-0 left-3/4 border-l border-slate-200" />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {sortedNotes.map((note, index) => {
            const previous = sortedNotes[index - 1];
            if (!previous) {
              return null;
            }
            return (
              <line
                key={`line-${note.id}`}
                x1={(previous.timeOffsetMs / timelineMs) * 100}
                y1={(1 - previous.lane) * 100}
                x2={(note.timeOffsetMs / timelineMs) * 100}
                y2={(1 - note.lane) * 100}
                stroke="rgb(71 85 105)"
                strokeWidth="0.8"
                opacity="0.7"
              />
            );
          })}
        </svg>

        {sortedNotes.map((note, index) => {
          const left = `${(note.timeOffsetMs / timelineMs) * 100}%`;
          const top = `${(1 - note.lane) * 100}%`;
          const direction = arrowLookup[note.id];

          return (
            <div
              key={note.id}
              className="absolute"
              style={{ left, top, transform: "translate(-50%, -50%)" }}
            >
              <div className="flex flex-col items-center gap-1">
                {direction ? (
                  <div className="rounded-full border border-slate-300 bg-white/95 px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] text-slate-700 shadow-sm">
                    {directionGlyph(direction)}
                  </div>
                ) : (
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Start</div>
                )}
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white shadow-sm">
                  {index + 1}
                </div>
              </div>
            </div>
          );
        })}

        {typeof playheadMs === "number" ? (
          <>
            <div
              className="absolute inset-y-0 w-0.5 bg-indigo-600/80"
              style={{ left: `${Math.min(100, Math.max(0, (playheadMs / timelineMs) * 100))}%` }}
            />
            <div
              className="absolute top-2 -translate-x-1/2 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              style={{ left: `${Math.min(100, Math.max(0, (playheadMs / timelineMs) * 100))}%` }}
            >
              {formatTime(playheadMs)}
            </div>
          </>
        ) : null}

        <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm">
          Click anywhere to add a point. Horizontal = time, vertical = lane.
        </div>
      </button>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Points</h3>
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Lane</th>
                  <th className="px-3 py-2 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sortedNotes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                      No points yet.
                    </td>
                  </tr>
                ) : (
                  sortedNotes.map((note, index) => (
                    <tr key={`row-${note.id}`}>
                      <td className="px-3 py-2 text-slate-900">{index + 1}</td>
                      <td className="px-3 py-2 text-slate-700">{formatTime(note.timeOffsetMs)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatLane(note.lane)}</td>
                      <td className="px-3 py-2 text-slate-700">{arrowLookup[note.id] ? directionLabel(arrowLookup[note.id]) : "Start"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Manual entry</h3>
            <span className="text-xs text-slate-500">One point per line: timeMs, lane</span>
          </div>
          <textarea
            value={textValue}
            onChange={(event) => onTextChange(event.target.value)}
            className="mt-2 h-48 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-slate-400"
            spellCheck={false}
          />
        </div>
      </div>
    </section>
  );
}

export default function DebugContourPage() {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadedAudioObjectUrlRef = React.useRef<string | null>(null);
  const [timelineMs, setTimelineMs] = React.useState(DEFAULT_TIMELINE_MS);
  const [sameDeadZone, setSameDeadZone] = React.useState(DEFAULT_SAME_DEAD_ZONE);
  const [audioKey, setAudioKey] = React.useState("audio/sample.mp3");
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null);
  const [audioSource, setAudioSource] = React.useState<"key" | "upload" | null>(null);
  const [uploadedAudioName, setUploadedAudioName] = React.useState<string | null>(null);
  const [audioError, setAudioError] = React.useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = React.useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = React.useState(false);
  const [syncTimelineToAudio, setSyncTimelineToAudio] = React.useState(true);
  const [answerNotes, setAnswerNotes] = React.useState<PitchContourNote[]>([
    makeNote("answer-1", 0, 0.22),
    makeNote("answer-2", 900, 0.78),
    makeNote("answer-3", 1800, 0.42),
    makeNote("answer-4", 2800, 0.45),
  ]);
  const [attemptNotes, setAttemptNotes] = React.useState<PitchContourNote[]>([
    makeNote("attempt-1", 0, 0.2),
    makeNote("attempt-2", 950, 0.8),
    makeNote("attempt-3", 1900, 0.72),
  ]);
  const [answerText, setAnswerText] = React.useState(serializeNotes(answerNotes));
  const [attemptText, setAttemptText] = React.useState(serializeNotes(attemptNotes));

  React.useEffect(() => {
    return () => {
      if (uploadedAudioObjectUrlRef.current) {
        URL.revokeObjectURL(uploadedAudioObjectUrlRef.current);
        uploadedAudioObjectUrlRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      setPlayheadMs(audio.currentTime * 1000);
    };
    const handlePlay = () => setIsAudioPlaying(true);
    const handlePause = () => setIsAudioPlaying(false);
    const handleEnded = () => {
      setIsAudioPlaying(false);
      setPlayheadMs(audio.duration > 0 ? audio.duration * 1000 : 0);
    };
    const handleLoadedMetadata = () => {
      if (syncTimelineToAudio && Number.isFinite(audio.duration) && audio.duration > 0) {
        setTimelineMs(Math.max(500, Math.round(audio.duration * 1000)));
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [syncTimelineToAudio]);

  const loadAudio = React.useCallback(() => {
    setAudioError(null);
    const trimmed = audioKey.trim();
    if (!trimmed) {
      setAudioSrc(null);
      setAudioSource(null);
      setUploadedAudioName(null);
      return;
    }
    if (uploadedAudioObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedAudioObjectUrlRef.current);
      uploadedAudioObjectUrlRef.current = null;
    }
    setAudioSrc(buildAudioProxyPath(trimmed));
    setAudioSource("key");
    setUploadedAudioName(null);
    setPlayheadMs(0);
  }, [audioKey]);

  const handleUploadClick = React.useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleUploadAudio = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (uploadedAudioObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedAudioObjectUrlRef.current);
      uploadedAudioObjectUrlRef.current = null;
    }
    const objectUrl = URL.createObjectURL(file);
    uploadedAudioObjectUrlRef.current = objectUrl;
    setAudioError(null);
    setAudioSrc(objectUrl);
    setAudioSource("upload");
    setUploadedAudioName(file.name);
    setPlayheadMs(0);
    event.target.value = "";
  }, []);

  const togglePlayback = React.useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAudioError(message);
      }
      return;
    }

    audio.pause();
  }, []);

  const stopPlayback = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setPlayheadMs(0);
  }, []);

  const appendPoint = React.useCallback((mode: EditorMode, clientX: number, clientY: number, rect: DOMRect) => {
    const xRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const yRatio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const note = makeNote(
      `${mode}-${Date.now()}-${Math.round(clientX)}-${Math.round(clientY)}`,
      Math.round(xRatio * timelineMs),
      Number((1 - yRatio).toFixed(3))
    );

    if (mode === "answer") {
      setAnswerNotes((previous) => {
        const next = [...previous, note].sort((first, second) => first.timeOffsetMs - second.timeOffsetMs);
        setAnswerText(serializeNotes(next));
        return next;
      });
      return;
    }

    setAttemptNotes((previous) => {
      const next = [...previous, note].sort((first, second) => first.timeOffsetMs - second.timeOffsetMs);
      setAttemptText(serializeNotes(next));
      return next;
    });
  }, [timelineMs]);

  const stableScore = React.useMemo(
    () => compareContourAttemptStable(answerNotes, attemptNotes, { sameDeadZone }),
    [answerNotes, attemptNotes, sameDeadZone]
  );

  const detailedScore = React.useMemo(
    () => compareContourAttemptDetailed(answerNotes, attemptNotes, { sameDeadZone }),
    [answerNotes, attemptNotes, sameDeadZone]
  );

  const answerEvents = React.useMemo(
    () => buildContourDirectionEvents(answerNotes, { sameDeadZone }),
    [answerNotes, sameDeadZone]
  );

  const attemptEvents = React.useMemo(
    () => buildContourDirectionEvents(attemptNotes, { sameDeadZone }),
    [attemptNotes, sameDeadZone]
  );

  const loadAnswerIntoAttempt = React.useCallback(() => {
    const next = answerNotes.map((note, index) => ({ ...note, id: `attempt-copy-${index + 1}` }));
    setAttemptNotes(next);
    setAttemptText(serializeNotes(next));
  }, [answerNotes]);

  const loadAttemptIntoAnswer = React.useCallback(() => {
    const next = attemptNotes.map((note, index) => ({ ...note, id: `answer-copy-${index + 1}` }));
    setAnswerNotes(next);
    setAnswerText(serializeNotes(next));
  }, [attemptNotes]);

  const captureAttemptTap = React.useCallback((clientY: number, rect: DOMRect) => {
    const yRatio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const lane = Number((1 - yRatio).toFixed(3));
    const note = makeNote(
      `attempt-live-${Date.now()}-${Math.round(clientY)}`,
      Math.round(Math.min(Math.max(0, playheadMs), timelineMs)),
      lane
    );

    setAttemptNotes((previous) => {
      const next = [...previous, note].sort((first, second) => first.timeOffsetMs - second.timeOffsetMs);
      setAttemptText(serializeNotes(next));
      return next;
    });
  }, [playheadMs, timelineMs]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_28%),radial-gradient(circle_at_top_right,#dbeafe,transparent_34%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[32px] border border-white/70 bg-white/80 px-6 py-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Temporary Debug Tool</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Contour Sandbox</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Build an answer key on the left, build an attempt on the right, and inspect exactly how each point is interpreted.
                Every dot after the first shows the derived direction from the previous dot: ^ for up, v for down, = for same.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Timeline</span>
                <input
                  type="number"
                  min={500}
                  step={100}
                  value={timelineMs}
                  onChange={(event) => setTimelineMs(Math.max(500, Number(event.target.value) || DEFAULT_TIMELINE_MS))}
                  className="mt-1 w-28 bg-transparent text-base font-semibold outline-none"
                />
              </label>
              <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Same dead zone</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sameDeadZone}
                  onChange={(event) => setSameDeadZone(Math.min(1, Math.max(0, Number(event.target.value) || DEFAULT_SAME_DEAD_ZONE)))}
                  className="mt-1 w-28 bg-transparent text-base font-semibold outline-none"
                />
              </label>
            </div>
          </div>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Live Playback + Tap Capture</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <input
                ref={uploadInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleUploadAudio}
              />
              <label className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Audio key</span>
                <input
                  value={audioKey}
                  onChange={(event) => setAudioKey(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-medium outline-none"
                  placeholder="audio/sample.mp3"
                />
              </label>
              <button
                type="button"
                onClick={loadAudio}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Load audio
              </button>
              <button
                type="button"
                onClick={handleUploadClick}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={togglePlayback}
                disabled={!audioSrc}
                className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAudioPlaying ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={stopPlayback}
                disabled={!audioSrc}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Stop
              </button>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={syncTimelineToAudio}
                  onChange={(event) => setSyncTimelineToAudio(event.target.checked)}
                />
                Sync timeline to audio duration
              </label>
            </div>

            {audioSource === "upload" && uploadedAudioName ? (
              <p className="mt-2 text-sm text-slate-700">Loaded local file: {uploadedAudioName}</p>
            ) : audioSource === "key" ? (
              <p className="mt-2 text-sm text-slate-700">Loaded from key: {audioKey.trim() || "(none)"}</p>
            ) : null}

            {audioError ? <p className="mt-2 text-sm text-rose-700">Audio error: {audioError}</p> : null}
            {audioSrc ? (
              <audio
                ref={audioRef}
                src={audioSrc}
                controls
                preload="metadata"
                className="mt-3 w-full"
                onError={() => setAudioError(audioSource === "upload" ? "Could not play the uploaded file." : "Could not load audio from the provided key.")}
              />
            ) : (
              <p className="mt-3 text-sm text-slate-500">Load an audio key or upload a local file to enable a moving playhead and live tap capture.</p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
              <button
                type="button"
                onPointerDown={(event) => captureAttemptTap(event.clientY, event.currentTarget.getBoundingClientRect())}
                className="relative h-48 w-full overflow-hidden rounded-2xl border border-dashed border-indigo-300 bg-[linear-gradient(180deg,rgba(238,242,255,0.75),rgba(224,231,255,0.55))]"
                title="Tap vertically while audio is playing. Tap time comes from the moving playhead."
              >
                <div className="absolute inset-x-0 top-1/2 border-t border-indigo-200/90" />
                <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-700">
                  Tap Lane
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-indigo-700">Higher pitch up top</div>
              </button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Live capture state</p>
                <p className="mt-1 text-sm text-slate-700">Playhead: {formatTime(playheadMs)} / {formatTime(timelineMs)}</p>
                <p className="mt-1 text-sm text-slate-700">Attempt taps: {attemptNotes.length}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Use this to test the exact interaction you described: listen while the playhead moves, tap the lane by feel,
                  and then compare your expected up/down/same transitions against the system interpretation shown in the panels.
                </p>
              </div>
            </div>
          </section>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-6 lg:grid-cols-2">
            <DotPlot
              title="Answer Key"
              subtitle="Define the intended melodic contour here."
              notes={answerNotes}
              sameDeadZone={sameDeadZone}
              timelineMs={timelineMs}
              accentClasses="border-sky-200"
              onAddNote={(clientX, clientY, rect) => appendPoint("answer", clientX, clientY, rect)}
              onUndo={() => {
                setAnswerNotes((previous) => {
                  const next = previous.slice(0, -1);
                  setAnswerText(serializeNotes(next));
                  return next;
                });
              }}
              onClear={() => {
                setAnswerNotes([]);
                setAnswerText("");
              }}
              textValue={answerText}
              playheadMs={playheadMs}
              onTextChange={(value) => {
                setAnswerText(value);
                setAnswerNotes(parseNotes(value));
              }}
            />

            <DotPlot
              title="Attempt"
              subtitle="Try to match the contour, then compare how both scorers react."
              notes={attemptNotes}
              sameDeadZone={sameDeadZone}
              timelineMs={timelineMs}
              accentClasses="border-indigo-200"
              onAddNote={(clientX, clientY, rect) => appendPoint("attempt", clientX, clientY, rect)}
              onUndo={() => {
                setAttemptNotes((previous) => {
                  const next = previous.slice(0, -1);
                  setAttemptText(serializeNotes(next));
                  return next;
                });
              }}
              onClear={() => {
                setAttemptNotes([]);
                setAttemptText("");
              }}
              textValue={attemptText}
              playheadMs={playheadMs}
              onTextChange={(value) => {
                setAttemptText(value);
                setAttemptNotes(parseNotes(value));
              }}
            />
          </div>

          <aside className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadAnswerIntoAttempt}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copy answer to attempt
              </button>
              <button
                type="button"
                onClick={loadAttemptIntoAnswer}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copy attempt to answer
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Score comparison</h2>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Stable step score</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{Math.round(stableScore.score * 100)}%</p>
                    <p className="mt-1 text-sm text-slate-600">{stableScore.matchedEvents} matched out of {stableScore.totalEvents}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Greedy sequence score</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{Math.round(detailedScore.score * 100)}%</p>
                    <p className="mt-1 text-sm text-slate-600">{detailedScore.matchedEvents} matched out of {detailedScore.totalEvents}</p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Answer interpretation</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {answerEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">Need at least two answer points.</p>
                  ) : (
                    answerEvents.map((event, index) => (
                      <span key={`answer-event-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                        {`#${index + 1} ${directionGlyph(event.direction)} ${directionLabel(event.direction)}`}
                      </span>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Attempt interpretation</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {attemptEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">Need at least two attempt points.</p>
                  ) : (
                    attemptEvents.map((event, index) => (
                      <span key={`attempt-event-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                        {`#${index + 1} ${directionGlyph(event.direction)} ${directionLabel(event.direction)}`}
                      </span>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Stable step outcomes</h2>
                <div className="mt-3 flex flex-col gap-2">
                  {stableScore.transitionResults.length === 0 ? (
                    <p className="text-sm text-slate-500">Add two attempt points to produce a scored step.</p>
                  ) : (
                    stableScore.transitionResults.map((result, index) => (
                      <div key={`${result.attemptNoteId}-${index}`} className={`rounded-2xl border px-3 py-2 text-sm ${scorePillClasses(result.status)}`}>
                        <p className="font-semibold">{`Step ${index + 1}: ${directionGlyph(result.direction)} ${directionLabel(result.direction)} - ${statusLabel(result.status)}`}</p>
                        <p className="mt-1 text-xs opacity-80">
                          {result.expectedDirection ? `Expected ${directionLabel(result.expectedDirection)}` : "No matching answer step remains."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}