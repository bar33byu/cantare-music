"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  generateTranspositionPath,
  getContextMetronomeBeats,
  getExercisePitchRange,
  midiNoteName,
  setExerciseStartBeat,
  type VocalExercise,
  type VocalRange,
} from "../lib/vocalExercise";
import { useWarmupPitchTrace, type WarmupPitchTracePoint } from "../hooks/useWarmupPitchTrace";

const DEFAULT_RANGE: VocalRange = { low: 45, high: 64 };
const NOTE_OPTIONS = Array.from({ length: 61 }, (_, index) => 24 + index);

interface TimelineItem {
  index: number;
  offset: number;
  startSeconds: number;
  endSeconds: number;
}

function NoteSelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      >
        {NOTE_OPTIONS.map((midi) => <option key={midi} value={midi}>{midiNoteName(midi)}</option>)}
      </select>
    </label>
  );
}

function PianoRoll({ exercise, range, offset, playheadBeat, pitchTrace }: {
  exercise: VocalExercise;
  range: VocalRange;
  offset: number;
  playheadBeat: number;
  pitchTrace: WarmupPitchTracePoint[];
}) {
  const width = 960;
  const labelWidth = 54;
  const height = Math.max(280, (range.high - range.low + 1) * 15);
  const safeDuration = Math.max(1, exercise.durationBeats);
  const plotWidth = width - labelWidth;
  const rowHeight = height / (range.high - range.low + 1);
  const xForBeat = (beat: number) => labelWidth + (beat / safeDuration) * plotWidth;
  const yForMidi = (midi: number) => (range.high - midi) * rowHeight;
  const visibleEvents = exercise.events.filter((event) => event.midi + offset >= range.low && event.midi + offset <= range.high);
  const beatLines = Array.from({ length: Math.ceil(safeDuration) + 1 }, (_, index) => index);
  const pitchLines = Array.from({ length: range.high - range.low + 2 }, (_, index) => index);
  const singX = xForBeat(exercise.exerciseStartBeat);
  const cursorX = xForBeat(Math.max(0, Math.min(safeDuration, playheadBeat)));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <svg
        role="img"
        aria-label={`Piano roll from ${midiNoteName(range.low)} to ${midiNoteName(range.high)}`}
        viewBox={`0 0 ${width} ${height}`}
        className="block min-w-[720px] w-full"
        data-testid="exercise-piano-roll"
      >
        <rect x="0" y="0" width={width} height={height} fill="#f8fafc" />
        <rect x={labelWidth} y="0" width={Math.max(0, singX - labelWidth)} height={height} fill="#f1f5f9" />
        {pitchLines.map((line) => (
          <line key={`pitch-${line}`} x1={labelWidth} y1={line * rowHeight} x2={width} y2={line * rowHeight} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {beatLines.map((beat) => (
          <line key={`beat-${beat}`} x1={xForBeat(beat)} y1="0" x2={xForBeat(beat)} y2={height} stroke={beat % exercise.timeSignature.numerator === 0 ? "#94a3b8" : "#cbd5e1"} strokeWidth={beat % exercise.timeSignature.numerator === 0 ? 1.5 : 1} />
        ))}
        {Array.from({ length: range.high - range.low + 1 }, (_, index) => range.high - index).map((midi) => (
          <text key={midi} x={labelWidth - 7} y={yForMidi(midi) + rowHeight * 0.7} textAnchor="end" fontSize="10" fill={midi % 12 === 0 ? "#312e81" : "#64748b"} fontWeight={midi % 12 === 0 ? "700" : "400"}>
            {midiNoteName(midi)}
          </text>
        ))}
        {visibleEvents.map((event) => {
          const midi = event.midi + offset;
          const x = xForBeat(event.startBeat);
          const noteWidth = Math.max(3, (event.durationBeats / safeDuration) * plotWidth);
          const isContext = event.region === "context";
          return (
            <g key={event.id}>
              <rect
                x={x}
                y={yForMidi(midi) + 1.5}
                width={Math.min(noteWidth, width - x)}
                height={Math.max(4, rowHeight - 3)}
                rx="3"
                fill={isContext ? "#94a3b8" : "#4f46e5"}
                stroke={isContext ? "#475569" : "#312e81"}
                strokeWidth="1"
                strokeDasharray={isContext ? "4 2" : undefined}
              />
              <title>{`${isContext ? "Context" : "Sing"}: ${midiNoteName(midi)}`}</title>
            </g>
          );
        })}
        {pitchTrace.slice(1).map((point, index) => {
          const previous = pitchTrace[index];
          const target = exercise.events.find((event) => event.region === "exercise"
            && point.beat >= event.startBeat
            && point.beat < event.startBeat + event.durationBeats);
          const cents = target ? Math.abs((point.midi - (target.midi + offset)) * 100) : Number.POSITIVE_INFINITY;
          const stroke = cents <= 50 ? "#10b981" : cents <= 100 ? "#f59e0b" : "#f43f5e";
          return (
            <g key={`${point.beat}-${index}`}>
              <line x1={xForBeat(previous.beat)} y1={yForMidi(previous.midi)} x2={xForBeat(point.beat)} y2={yForMidi(point.midi)} stroke="white" strokeWidth="7" strokeLinecap="round" />
              <line x1={xForBeat(previous.beat)} y1={yForMidi(previous.midi)} x2={xForBeat(point.beat)} y2={yForMidi(point.midi)} stroke={stroke} strokeWidth="3.5" strokeLinecap="round" />
            </g>
          );
        })}
        <line x1={singX} y1="0" x2={singX} y2={height} stroke="#be123c" strokeWidth="3" />
        <rect x={Math.min(singX + 5, width - 96)} y="7" width="90" height="22" rx="11" fill="#fff1f2" stroke="#fda4af" />
        <text x={Math.min(singX + 50, width - 51)} y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="#9f1239">SING</text>
        <line x1={cursorX} y1="0" x2={cursorX} y2={height} stroke="#f59e0b" strokeWidth="3" opacity="0.9" />
      </svg>
    </div>
  );
}

function RangeKeyboard({ range, current, startingPitch }: { range: VocalRange; current: VocalRange | null; startingPitch: number | null }) {
  const notes = Array.from({ length: range.high - range.low + 1 }, (_, index) => range.low + index);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Vocal range keyboard">
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-600">
        <span>Saved range: {midiNoteName(range.low)} to {midiNoteName(range.high)}</span>
        {current ? <span className="text-indigo-700">Current exercise: {midiNoteName(current.low)} to {midiNoteName(current.high)}</span> : null}
      </div>
      <div className="flex h-14 overflow-hidden rounded-lg border border-slate-300">
        {notes.map((midi) => {
          const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
          const inExercise = Boolean(current && midi >= current.low && midi <= current.high);
          const isStart = midi === startingPitch;
          return (
            <div
              key={midi}
              title={midiNoteName(midi)}
              className={`relative min-w-0 flex-1 border-r border-slate-300 last:border-r-0 ${isBlack ? "bg-slate-700" : "bg-white"} ${inExercise ? "ring-2 ring-inset ring-indigo-500" : ""}`}
            >
              {isStart ? <span className="absolute inset-x-1 bottom-1 h-2 rounded-full bg-rose-500" aria-label={`Starting pitch ${midiNoteName(midi)}`} /> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Indigo outline: sung notes. Red marker: first sung pitch.</p>
    </div>
  );
}

function ExercisePlayer({ exercise, range, isAdmin, onUpdate, onDelete }: {
  exercise: VocalExercise;
  range: VocalRange;
  isAdmin: boolean;
  onUpdate: (exercise: VocalExercise) => void;
  onDelete: () => void;
}) {
  const [tempoPercent, setTempoPercent] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [inputLatencyMs, setInputLatencyMs] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<OscillatorNode[]>([]);
  const frameRef = useRef<number | null>(null);
  const playbackStartRef = useRef(0);
  const timelineRef = useRef<TimelineItem[]>([]);
  const path = useMemo(() => generateTranspositionPath(exercise, range), [exercise, range]);
  const contextMetronomeBeats = useMemo(() => getContextMetronomeBeats(exercise), [exercise]);
  const offset = path[currentIndex] ?? path[0] ?? 0;
  const currentRange = getExercisePitchRange(exercise, offset);
  const firstExerciseNote = [...exercise.events]
    .filter((event) => event.region === "exercise")
    .sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi)[0];
  const pitchTrace = useWarmupPitchTrace({
    isPlaying,
    playheadBeat,
    repetitionIndex: currentIndex,
    exerciseStartBeat: exercise.exerciseStartBeat,
    exerciseEndBeat: exercise.durationBeats,
    tempoBpm: exercise.tempoBpm,
    tempoPercent,
    latencyMs: inputLatencyMs,
  });

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch { /* Already stopped. */ }
    }
    sourcesRef.current = [];
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setIsPlaying(false);
    setPlayheadBeat(0);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback((tempoOverride = tempoPercent, startingIndex = 0, startingBeat = 0) => {
    stop();
    if (path.length === 0) return;
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const master = context.createGain();
    master.gain.value = 0.28;
    master.connect(context.destination);
    const secondsPerBeat = 60 / exercise.tempoBpm / (tempoOverride / 100);
    const startAt = context.currentTime + 0.08;
    let cursorSeconds = -Math.max(0, startingBeat) * secondsPerBeat;
    const timeline: TimelineItem[] = [];

    path.slice(startingIndex).forEach((semitones, relativeIndex) => {
      const index = startingIndex + relativeIndex;
      const repetitionStart = cursorSeconds;
      const repetitionEnd = repetitionStart + exercise.durationBeats * secondsPerBeat;
      timeline.push({ index, offset: semitones, startSeconds: repetitionStart, endSeconds: repetitionEnd });
      const measureLength = exercise.timeSignature.numerator * (4 / exercise.timeSignature.denominator);
      for (const beat of contextMetronomeBeats) {
        const clickOffset = repetitionStart + beat * secondsPerBeat;
        if (clickOffset < 0) continue;
        const clickStart = startAt + clickOffset;
        const clickEnd = clickStart + 0.035;
        const isMeasureStart = Math.abs(beat % measureLength) < 1e-6;
        const click = context.createOscillator();
        const clickGain = context.createGain();
        click.type = "sine";
        click.frequency.value = isMeasureStart ? 1500 : 1050;
        clickGain.gain.setValueAtTime(isMeasureStart ? 0.32 : 0.22, clickStart);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, clickEnd);
        click.connect(clickGain);
        clickGain.connect(master);
        click.start(clickStart);
        click.stop(clickEnd + 0.005);
        sourcesRef.current.push(click);
      }
      for (const note of exercise.events) {
        const noteStartOffset = repetitionStart + note.startBeat * secondsPerBeat;
        const noteEndOffset = noteStartOffset + Math.max(0.03, note.durationBeats * secondsPerBeat);
        if (noteEndOffset <= 0) continue;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = startAt + Math.max(0, noteStartOffset);
        const noteEnd = startAt + noteEndOffset;
        if (noteEnd - noteStart < 0.01) continue;
        const attackEnd = noteStart + Math.min(0.012, (noteEnd - noteStart) * 0.35);
        const sustainEnd = Math.max(attackEnd, noteEnd - 0.025);
        oscillator.type = "triangle";
        oscillator.frequency.value = 440 * 2 ** ((note.midi + semitones - 69) / 12);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.015, (note.velocity / 127) * 0.18), attackEnd);
        gain.gain.setValueAtTime(Math.max(0.015, (note.velocity / 127) * 0.18), sustainEnd);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.01);
        sourcesRef.current.push(oscillator);
      }
      cursorSeconds = repetitionEnd;
    });

    audioContextRef.current = context;
    playbackStartRef.current = startAt;
    timelineRef.current = timeline;
    setCurrentIndex(startingIndex);
    setPlayheadBeat(Math.max(0, startingBeat));
    setIsPlaying(true);
    pitchTrace.clear();

    const update = () => {
      const elapsed = context.currentTime - playbackStartRef.current;
      const item = timeline.find((candidate) => elapsed >= candidate.startSeconds && elapsed < candidate.endSeconds);
      if (!item) {
        if (elapsed >= cursorSeconds) {
          stop();
          return;
        }
        frameRef.current = requestAnimationFrame(update);
        return;
      }
      setCurrentIndex(item.index);
      setPlayheadBeat(Math.max(0, (elapsed - item.startSeconds) / secondsPerBeat));
      frameRef.current = requestAnimationFrame(update);
    };
    frameRef.current = requestAnimationFrame(update);
  }, [contextMetronomeBeats, exercise, path, pitchTrace, stop, tempoPercent]);

  return (
    <section className="space-y-4" data-testid="exercise-player">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Vocal exercise</p>
          <h2 className="text-2xl font-bold text-slate-950">{exercise.title}</h2>
          <p className="text-sm text-slate-500">
            {exercise.category ?? "Exercise"}{exercise.syllable ? ` / ${exercise.syllable}` : ""} / {exercise.tempoBpm} BPM / {exercise.timeSignature.numerator}/{exercise.timeSignature.denominator}
          </p>
          {exercise.description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{exercise.description}</p> : null}
          {exercise.difficulty || exercise.pattern ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {exercise.difficulty ? `Difficulty: ${exercise.difficulty}` : ""}
              {exercise.difficulty && exercise.pattern ? " / " : ""}
              {exercise.pattern ? `Pattern: ${exercise.pattern}` : ""}
            </p>
          ) : null}
          {(exercise.coachingNotes?.length ?? 0) > 0 ? (
            <details className="mt-3 max-w-2xl rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold text-indigo-800">Coaching notes</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {exercise.coachingNotes?.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
        {isAdmin ? <button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete</button> : null}
      </div>

      <div className={`grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${isAdmin ? "md:grid-cols-[1fr_1fr_auto]" : "md:grid-cols-[1fr_auto]"} md:items-end`}>
        {isAdmin ? (
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Exercise begins at beat
            <input
              type="number"
              min="0"
              max={exercise.durationBeats}
              step="0.25"
              value={exercise.exerciseStartBeat}
              onChange={(event) => onUpdate(setExerciseStartBeat(exercise, Number(event.target.value)))}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Tempo: {tempoPercent}%
          <input
            type="range"
            min="40"
            max="150"
            step="5"
            value={tempoPercent}
            onChange={(event) => {
              const nextTempo = Number(event.target.value);
              setTempoPercent(nextTempo);
              if (isPlaying) start(nextTempo, currentIndex, playheadBeat);
            }}
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={isPlaying ? stop : () => start()} disabled={path.length === 0} className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isPlaying ? "Stop" : "Start"}
          </button>
          <button type="button" onClick={() => start()} disabled={!isPlaying} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-40">Restart</button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 md:grid-cols-[auto_1fr] md:items-end">
        <button type="button" onClick={pitchTrace.isListening ? pitchTrace.stop : () => void pitchTrace.start()} className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800">
          {pitchTrace.isListening ? "Stop listening" : "Use microphone"}
        </button>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Microphone delay: {inputLatencyMs} ms
          <span className="flex items-center gap-3">
            <input aria-label="Microphone delay" type="range" min="0" max="400" step="10" value={inputLatencyMs} onChange={(event) => setInputLatencyMs(Number(event.target.value))} className="min-w-0 flex-1" />
            <button type="button" onClick={() => setInputLatencyMs(0)} className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold">Wired</button>
            <button type="button" onClick={() => setInputLatencyMs(180)} className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold">Bluetooth</button>
          </span>
        </label>
        <p className="text-xs text-emerald-900 md:col-span-2" role="status">
          {pitchTrace.status}. Green is within 50 cents, amber within 100, and rose is farther away.
          {pitchTrace.status.includes("embedded browser") ? (
            <> <button type="button" onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")} className="font-semibold underline">Open this page in a full browser</button>.</>
          ) : null}
        </p>
      </div>

      {path.length === 0 ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This exercise does not fit inside your saved range. Widen the range or choose a smaller exercise region.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-950 px-4 py-3 text-white">
          <span className="font-semibold">Repetition {currentIndex + 1} of {path.length}</span>
          <span>Sing from {midiNoteName((firstExerciseNote?.midi ?? 60) + offset)}</span>
          <span className="text-sm text-indigo-200">Transpose {offset >= 0 ? "+" : ""}{offset}</span>
        </div>
      )}

      <div>
        <div className="mb-2 flex gap-4 text-xs font-semibold text-slate-600">
          <span><span className="mr-1 inline-block h-3 w-5 rounded-sm border border-slate-600 bg-slate-400 align-middle" /> Context</span>
          <span><span className="mr-1 inline-block h-3 w-5 rounded-sm border border-indigo-900 bg-indigo-600 align-middle" /> Sing</span>
        </div>
        <PianoRoll exercise={exercise} range={range} offset={offset} playheadBeat={playheadBeat} pitchTrace={pitchTrace.points} />
      </div>

      <RangeKeyboard range={range} current={currentRange} startingPitch={firstExerciseNote ? firstExerciseNote.midi + offset : null} />

      <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-slate-900">Note-name reference</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...exercise.events].filter((event) => event.region === "exercise").sort((a, b) => a.startBeat - b.startBeat).map((event) => (
            <span key={event.id} className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-800">{midiNoteName(event.midi + offset)}</span>
          ))}
        </div>
      </details>
    </section>
  );
}

function ExerciseWorkspace({ userId, isSignedIn, isAdmin }: { userId: string; isSignedIn: boolean; isAdmin: boolean }) {
  const [range, setRange] = useState<VocalRange>(DEFAULT_RANGE);
  const [exercises, setExercises] = useState<VocalExercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startBeat, setStartBeat] = useState(0);
  const [importError, setImportError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [rangeMessage, setRangeMessage] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const loadExercises = useCallback(async () => {
    try {
      const response = await fetch("/api/exercises", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load exercises");
      const payload = await response.json() as { exercises?: VocalExercise[] };
      const nextExercises = Array.isArray(payload.exercises) ? payload.exercises : [];
      setExercises(nextExercises);
      setSelectedId((current) => nextExercises.some((exercise) => exercise.id === current) ? current : null);
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to load exercises");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadExercises(); }, [loadExercises]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/users/me/vocal-range", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load your vocal range");
        const payload = await response.json() as { range?: VocalRange | null };
        if (!cancelled && payload.range) setRange(payload.range);
      } catch (error) {
        if (!cancelled) setRangeMessage(error instanceof Error ? error.message : "Unable to load your vocal range");
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, userId]);

  const selected = exercises.find((exercise) => exercise.id === selectedId) ?? null;
  const selectedIndex = selected ? exercises.findIndex((exercise) => exercise.id === selected.id) : -1;
  const exerciseGroups = useMemo(() => {
    const groups = new Map<string, { title: string; exercises: VocalExercise[] }>();
    for (const exercise of exercises) {
      const key = exercise.collectionSlug ?? "uncollected";
      const group = groups.get(key) ?? {
        title: exercise.collectionTitle ?? "Other exercises",
        exercises: [],
      };
      group.exercises.push(exercise);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }, [exercises]);

  const saveRange = async (nextRange: VocalRange) => {
    setRange(nextRange);
    setRangeMessage("Saving...");
    try {
      const response = await fetch("/api/users/me/vocal-range", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextRange),
      });
      if (!response.ok) throw new Error("Unable to save your vocal range");
      const payload = await response.json() as { range: VocalRange };
      setRange(payload.range);
      setRangeMessage("Range saved");
    } catch (error) {
      setRangeMessage(error instanceof Error ? error.message : "Unable to save your vocal range");
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(mid|midi)$/i.test(file.name)) {
      setImportError("Choose a .mid or .midi file.");
      return;
    }
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", title);
      formData.set("exerciseStartBeat", String(startBeat));
      const response = await fetch("/api/exercises", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({})) as { exercise?: VocalExercise; error?: string };
      if (!response.ok || !payload.exercise) throw new Error(payload.error || "Unable to save this exercise");
      await loadExercises();
      setSelectedId(payload.exercise.id);
      setTitle("");
      setShowAddForm(false);
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to read this MIDI file.");
    }
  };

  const updateSelectedExercise = (updated: VocalExercise) => {
    setExercises((previous) => previous.map((exercise) => exercise.id === updated.id ? updated : exercise));
    void fetch(`/api/exercises/${updated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseStartBeat: updated.exerciseStartBeat }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Unable to save exercise setup");
      const payload = await response.json() as { exercise: VocalExercise };
      setExercises((previous) => previous.map((exercise) => exercise.id === payload.exercise.id ? payload.exercise : exercise));
    }).catch((error) => setImportError(error instanceof Error ? error.message : "Unable to save exercise setup"));
  };

  const deleteSelectedExercise = () => {
    if (!selected) return;
    void fetch(`/api/exercises/${selected.id}`, { method: "DELETE" }).then((response) => {
      if (!response.ok) throw new Error("Unable to delete exercise");
      setSelectedId(null);
      return loadExercises();
    }).catch((error) => setImportError(error instanceof Error ? error.message : "Unable to delete exercise"));
  };

  if (selected) {
    const nextExercise = exercises[selectedIndex + 1] ?? null;
    return (
      <main className="fixed inset-0 z-[70] overflow-y-auto bg-slate-50" data-testid="exercise-detail-page">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-700">
              <span aria-hidden="true">&larr; </span>Exercises
            </button>
            <span className="hidden text-sm font-medium text-slate-500 sm:inline">{selectedIndex + 1} of {exercises.length}</span>
            <button
              type="button"
              onClick={() => nextExercise && setSelectedId(nextExercise.id)}
              disabled={!nextExercise}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Next exercise <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
          {importError ? <p role="alert" className="mb-4 text-sm font-medium text-rose-700">{importError}</p> : null}
          <ExercisePlayer
            key={selected.id}
            exercise={selected}
            range={range}
            isAdmin={isAdmin}
            onUpdate={updateSelectedExercise}
            onDelete={deleteSelectedExercise}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6" data-testid="exercise-browser">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Warmups and technique</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Exercises</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Choose an exercise to open its full practice view.</p>
        </div>
        {isAdmin ? (
          <button type="button" onClick={() => setShowAddForm((visible) => !visible)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-700">
            {showAddForm ? "Close" : "+ Add exercise"}
          </button>
        ) : null}
      </div>

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
        {isSignedIn ? (
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <NoteSelect label="Lowest comfortable note" value={range.low} onChange={(low) => void saveRange({ low, high: Math.max(low, range.high) })} />
            <NoteSelect label="Highest comfortable note" value={range.high} onChange={(high) => void saveRange({ low: Math.min(range.low, high), high })} />
            <div className="rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-indigo-800 shadow-sm">{range.high - range.low + 1} semitones</div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-indigo-950">
            <span>Guest range: {midiNoteName(range.low)} to {midiNoteName(range.high)}</span>
            <span className="font-semibold">Sign in to set and save your vocal range.</span>
          </div>
        )}
        {rangeMessage ? <p className="mt-2 text-xs font-medium text-indigo-800" role="status">{rangeMessage}</p> : null}
      </section>

      {isAdmin && showAddForm ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-950">Add shared MIDI exercise</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_12rem_auto] md:items-end">
            <label className="grid gap-1 text-sm font-medium text-slate-700">Title (optional)<input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Triad on Mum" /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Singing begins at beat<input type="number" min="0" step="0.25" value={startBeat} onChange={(event) => setStartBeat(Math.max(0, Number(event.target.value)))} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="cursor-pointer rounded-lg bg-slate-900 px-5 py-2 text-center font-semibold text-white hover:bg-slate-700">Choose MIDI<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" onChange={handleImport} className="sr-only" /></label>
          </div>
        </section>
      ) : null}
      {importError ? <p role="alert" className="text-sm font-medium text-rose-700">{importError}</p> : null}

      {isLoading ? <p className="text-sm text-slate-600">Loading exercises...</p> : exercises.length > 0 ? (
        <div className="space-y-8" aria-label="Exercise catalog">
          {exerciseGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-3 text-xl font-bold text-slate-950">{group.title}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.exercises.map((exercise) => (
                  <button key={exercise.id} type="button" onClick={() => setSelectedId(exercise.id)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-lg font-bold text-slate-950 group-hover:text-indigo-700">{exercise.title}</span>
                      {exercise.category ? <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{exercise.category}</span> : null}
                    </span>
                    {exercise.description ? <span className="mt-2 block text-sm leading-6 text-slate-600">{exercise.description}</span> : null}
                    <span className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                      <span>{exercise.syllable ? `Syllable: ${exercise.syllable}` : `${exercise.tempoBpm} BPM`}</span>
                      <span className="text-indigo-600">Open <span aria-hidden="true">&rarr;</span></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-600">
          <p className="font-semibold text-slate-800">No exercises yet</p>
          <p className="mt-1 text-sm">An administrator can add the first shared exercise.</p>
        </div>
      )}
    </main>
  );
}

export function ExerciseBrowser({ userId, isSignedIn, isAdmin }: { userId: string; isSignedIn: boolean; isAdmin: boolean }) {
  return <ExerciseWorkspace key={`${userId}:${isSignedIn}:${isAdmin}`} userId={userId} isSignedIn={isSignedIn} isAdmin={isAdmin} />;
}
