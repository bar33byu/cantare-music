"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VocalExercise } from "../lib/vocalExercise";
import { withUserIdHeader } from "../lib/userContext";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function createPracticeSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Some embedded browsers expose crypto but reject randomUUID calls.
  }
  return `warmup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function selectionStorageKey(userId: string): string {
  return `cantare:warmup-set:v1:${userId || "guest"}`;
}

function readSavedSelection(userId: string): string[] | null {
  try {
    const value = window.localStorage.getItem(selectionStorageKey(userId));
    if (value === null) return null;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
  } catch {
    return null;
  }
}

interface WarmupCardProps {
  exercise: VocalExercise;
  index: number;
  enabled: boolean;
  active: boolean;
  isAdmin: boolean;
  duration: number | undefined;
  onToggle: () => void;
  onPlay: () => void;
  onSave: (changes: { title: string; lyricHint: string }) => Promise<void>;
}

function WarmupCard({ exercise, index, enabled, active, isAdmin, duration, onToggle, onPlay, onSave }: WarmupCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(exercise.title);
  const [lyricHint, setLyricHint] = useState(exercise.lyricHint ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(exercise.title);
    setLyricHint(exercise.lyricHint ?? "");
  }, [exercise.lyricHint, exercise.title]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ title, lyricHint });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this warmup");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm transition ${active ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200"}`} data-testid={`warmup-card-${exercise.id}`}>
      <div className="flex items-start gap-4">
        <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={enabled} onChange={onToggle} aria-label={`Include ${exercise.title} in set`} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" />
          <span className="sr-only">Include in set</span>
        </label>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Warmup {index + 1}</p>
          {editing ? (
            <label className="mt-1 grid gap-1 text-sm font-semibold text-slate-700">
              Title
              <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-base" />
            </label>
          ) : <h3 className="mt-1 text-xl font-bold text-slate-950">{exercise.title}</h3>}
        </div>
        {duration !== undefined ? <span className="shrink-0 text-sm tabular-nums text-slate-500">{formatTime(duration)}</span> : null}
      </div>

      <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" aria-label={`Lyric hints for ${exercise.title}`}>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-800">Lyric hints</p>
        {editing ? (
          <textarea value={lyricHint} maxLength={2_000} rows={4} onChange={(event) => setLyricHint(event.target.value)} placeholder="Add the syllables, words, breaths, or technique reminders you want while singing." className="mt-2 w-full resize-y rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800" />
        ) : (
          <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${exercise.lyricHint ? "text-slate-800" : "italic text-slate-500"}`}>
            {exercise.lyricHint || "No lyric hints yet."}
          </p>
        )}
      </section>

      {error ? <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onPlay} disabled={!exercise.audioUrl} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {active ? "Restart" : "Play"}
        </button>
        {isAdmin && !editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700">Edit title & hints</button> : null}
        {editing ? (
          <>
            <button type="button" onClick={() => void save()} disabled={saving || !title.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? "Saving..." : "Save"}</button>
            <button type="button" onClick={() => { setEditing(false); setTitle(exercise.title); setLyricHint(exercise.lyricHint ?? ""); setError(null); }} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function ExerciseWorkspace({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [exercises, setExercises] = useState<VocalExercise[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string> | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playRequestId, setPlayRequestId] = useState(0);
  const [isRoutine, setIsRoutine] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeSessionRef = useRef<{ id: string; startedAt: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/exercises", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load warmups");
        const payload = await response.json() as { exercises?: VocalExercise[] };
        const recorded = (payload.exercises ?? [])
          .filter((exercise) => Boolean(exercise.audioUrl))
          .sort((left, right) => (left.routinePosition ?? Number.MAX_SAFE_INTEGER) - (right.routinePosition ?? Number.MAX_SAFE_INTEGER) || left.title.localeCompare(right.title));
        if (cancelled) return;
        setExercises(recorded);
        const saved = readSavedSelection(userId);
        const validIds = new Set(recorded.map((exercise) => exercise.id));
        setEnabledIds(new Set(saved === null ? validIds : saved.filter((id) => validIds.has(id))));
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load warmups");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const enabledExercises = useMemo(() => exercises.filter((exercise) => enabledIds?.has(exercise.id)), [enabledIds, exercises]);
  const currentExercise = exercises.find((exercise) => exercise.id === currentId) ?? null;

  const finishSession = useCallback(() => {
    const active = activeSessionRef.current;
    if (!active) return;
    activeSessionRef.current = null;
    const completedAt = new Date();
    void fetch(`/api/exercise-practice-sessions/${active.id}`, withUserIdHeader({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: completedAt.toISOString(), durationSeconds: Math.max(0, (Date.now() - active.startedAt) / 1000) }),
    }, userId)).catch(() => undefined);
  }, [userId]);

  useEffect(() => () => finishSession(), [finishSession]);

  const play = useCallback((exercise: VocalExercise, routine: boolean) => {
    finishSession();
    setPlaybackError(null);
    setIsRoutine(routine);
    setCurrentId(exercise.id);
    setPlayRequestId((previous) => previous + 1);
    const sessionId = createPracticeSessionId();
    const startedAt = new Date();
    activeSessionRef.current = { id: sessionId, startedAt: startedAt.getTime() };
    void fetch("/api/exercise-practice-sessions", withUserIdHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, exerciseId: exercise.id, startedAt: startedAt.toISOString(), tempoPercent: 100, repetitionCount: 1 }),
    }, userId)).catch(() => undefined);
  }, [finishSession, userId]);

  useEffect(() => {
    if (!currentExercise || !audioRef.current) return;
    const audio = audioRef.current;
    let cancelled = false;
    const resetWhenReady = () => {
      if (cancelled) return;
      try { audio.currentTime = 0; } catch { /* The new source will begin at zero naturally. */ }
    };

    try {
      audio.currentTime = 0;
    } catch {
      audio.addEventListener("loadedmetadata", resetWhenReady, { once: true });
    }

    try {
      const result = audio.play();
      void result?.catch((error: unknown) => {
        if (cancelled) return;
        setPlaybackError(error instanceof Error ? error.message : "Playback could not start");
        setIsRoutine(false);
      });
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : "Playback could not start");
      setIsRoutine(false);
    }

    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", resetWhenReady);
    };
  }, [currentExercise, playRequestId]);

  const handleEnded = () => {
    finishSession();
    if (!isRoutine || !currentExercise) {
      setCurrentId(null);
      return;
    }
    const currentIndex = enabledExercises.findIndex((exercise) => exercise.id === currentExercise.id);
    const next = enabledExercises[currentIndex + 1];
    if (next) play(next, true);
    else {
      setCurrentId(null);
      setIsRoutine(false);
    }
  };

  const persistSelection = (next: Set<string>) => {
    setEnabledIds(next);
    try { window.localStorage.setItem(selectionStorageKey(userId), JSON.stringify(Array.from(next))); } catch { /* Storage may be unavailable. */ }
  };

  const saveExercise = async (exercise: VocalExercise, changes: { title: string; lyricHint: string }) => {
    const response = await fetch(`/api/exercises/${encodeURIComponent(exercise.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const payload = await response.json().catch(() => ({})) as { exercise?: VocalExercise; error?: string };
    if (!response.ok || !payload.exercise) throw new Error(payload.error ?? "Could not save this warmup");
    setExercises((previous) => previous.map((item) => item.id === exercise.id ? payload.exercise! : item));
  };

  if (isLoading) return <p className="p-6 text-sm text-slate-600">Loading warmups...</p>;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6" data-testid="exercise-browser">
      <header className="rounded-2xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-200">Recorded vocal routine</p>
        <h1 className="mt-2 text-3xl font-bold">Warmups</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">Choose the exercises you want, then play the set straight through and sing along. Your choices are saved on this device.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => enabledExercises[0] && play(enabledExercises[0], true)} disabled={enabledExercises.length === 0} className="rounded-lg bg-white px-5 py-2.5 font-bold text-indigo-900 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-indigo-300">
            Play set ({enabledExercises.length})
          </button>
          <button type="button" onClick={() => persistSelection(new Set(exercises.map((exercise) => exercise.id)))} className="rounded-lg border border-indigo-300 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Select all</button>
          <button type="button" onClick={() => persistSelection(new Set())} className="rounded-lg border border-indigo-300 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Clear set</button>
        </div>
      </header>

      {loadError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{loadError}</p> : null}
      {playbackError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{playbackError}</p> : null}

      <section className={`sticky top-3 z-10 rounded-2xl border border-indigo-200 bg-white/95 p-4 shadow-lg backdrop-blur ${currentExercise ? "" : "hidden"}`} aria-label="Warmup player">
        {currentExercise ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Now playing</p><p className="truncate font-bold text-slate-950">{currentExercise.title}</p></div>
              {isRoutine ? <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Set {enabledExercises.findIndex((item) => item.id === currentExercise.id) + 1} of {enabledExercises.length}</span> : null}
            </div>
          </>
        ) : null}
        <audio ref={audioRef} src={currentExercise?.audioUrl} controls preload="metadata" className="w-full" onEnded={handleEnded} onLoadedMetadata={(event) => {
          if (currentExercise) setDurations((previous) => ({ ...previous, [currentExercise.id]: event.currentTarget.duration }));
        }} onError={() => setPlaybackError("This warmup audio could not be loaded.")} />
      </section>

      <div className="grid gap-4 md:grid-cols-2" aria-label="Warmup catalog">
        {exercises.map((exercise, index) => (
          <WarmupCard key={exercise.id} exercise={exercise} index={index} enabled={Boolean(enabledIds?.has(exercise.id))} active={currentId === exercise.id} isAdmin={isAdmin} duration={durations[exercise.id]} onToggle={() => {
            const next = new Set(enabledIds ?? []);
            if (next.has(exercise.id)) next.delete(exercise.id); else next.add(exercise.id);
            persistSelection(next);
          }} onPlay={() => play(exercise, false)} onSave={(changes) => saveExercise(exercise, changes)} />
        ))}
      </div>

      {exercises.length === 0 && !loadError ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"><p className="font-semibold text-slate-800">No recorded warmups yet</p><p className="mt-1 text-sm text-slate-600">Run the recorded warmup import after deploying the database migration.</p></div> : null}
    </main>
  );
}

export function ExerciseBrowser({ userId, isAdmin }: { userId: string; isSignedIn: boolean; isAdmin: boolean }) {
  return <ExerciseWorkspace key={`${userId}:${isAdmin}`} userId={userId} isAdmin={isAdmin} />;
}
