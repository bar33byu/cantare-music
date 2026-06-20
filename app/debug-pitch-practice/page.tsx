"use client";

import * as React from "react";
import Link from "next/link";
import type { Song } from "../types";
import type { WholeSongMidiAnswerKey, WholeSongMidiAnswerKeyNote } from "../lib/midiGuidedTapPractice";
import {
  centsBetween,
  detectPitchYin,
  frequencyToMidi,
  getWholeSongPitchTarget,
  midiToPitchName,
  updatePitchStability,
  type PitchStabilityState,
} from "../lib/pitchPractice";

type DebugStatus = "idle" | "starting" | "running" | "error";

interface PitchSnapshot {
  atMs: number;
  songPlaybackMs: number;
  frequencyHz: number;
  midiPitch: number;
  confidence: number;
  rms: number;
  stableMidiPitch: number | null;
  accepted: boolean;
  requiredStabilityMs: number;
  transitionGraceMs: number;
  inTransitionGrace: boolean;
  expectedMidiPitch: number | null;
  broadMidiPitch: number;
  guidedCandidateUsed: boolean;
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-600";
const DEFAULT_DEBUG_SONG_ID = "0e513a82-8fd5-4dd2-9b54-c046a46ceaed";

function microphoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The selected microphone is unavailable or already in use.";
  return error instanceof Error ? error.message : "Could not start the microphone.";
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function midiToFrequency(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function commonPitchNames(frames: PitchSnapshot[], acceptedOnly: boolean): string {
  const counts = new Map<string, number>();
  for (const frame of frames) {
    if (acceptedOnly && !frame.accepted) continue;
    const name = midiToPitchName(frame.midiPitch);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name}:${count}`).join(", ") || "none";
}

function nearestMidiNote(notes: WholeSongMidiAnswerKeyNote[], playbackMs: number): WholeSongMidiAnswerKeyNote | null {
  return getWholeSongPitchTarget(notes, playbackMs)?.note ?? null;
}

export default function DebugPitchPracticePage() {
  const [status, setStatus] = React.useState<DebugStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState("");
  const [fftSize, setFftSize] = React.useState(2048);
  const [minFrequencyHz, setMinFrequencyHz] = React.useState(65);
  const [maxFrequencyHz, setMaxFrequencyHz] = React.useState(1050);
  const [yinThreshold, setYinThreshold] = React.useState(0.15);
  const [minRms, setMinRms] = React.useState(0.012);
  const [minConfidence, setMinConfidence] = React.useState(0.72);
  const [stabilityMs, setStabilityMs] = React.useState(120);
  const [maxSpreadCents, setMaxSpreadCents] = React.useState(35);
  const [adaptiveTimingEnabled, setAdaptiveTimingEnabled] = React.useState(true);
  const [targetMidiPitch, setTargetMidiPitch] = React.useState(60);
  const [songIdInput, setSongIdInput] = React.useState(DEFAULT_DEBUG_SONG_ID);
  const [song, setSong] = React.useState<Song | null>(null);
  const [songLoading, setSongLoading] = React.useState(false);
  const [songError, setSongError] = React.useState<string | null>(null);
  const [wholeSongKey, setWholeSongKey] = React.useState<WholeSongMidiAnswerKey | null>(null);
  const [playbackMs, setPlaybackMs] = React.useState(0);
  const [followPlayback, setFollowPlayback] = React.useState(true);
  const [audioVersion, setAudioVersion] = React.useState<"part" | "blend">("part");
  const [echoCancellation, setEchoCancellation] = React.useState(true);
  const [noiseSuppression, setNoiseSuppression] = React.useState(false);
  const [autoGainControl, setAutoGainControl] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<PitchSnapshot | null>(null);
  const [waveform, setWaveform] = React.useState<number[]>([]);
  const [history, setHistory] = React.useState<PitchSnapshot[]>([]);
  const [audioInfo, setAudioInfo] = React.useState<{ sampleRate: number; contextState: string; trackSettings: MediaTrackSettings } | null>(null);
  const [captureActive, setCaptureActive] = React.useState(false);
  const [diagnosticReport, setDiagnosticReport] = React.useState("");
  const [copyStatus, setCopyStatus] = React.useState("");

  const streamRef = React.useRef<MediaStream | null>(null);
  const songAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const contextRef = React.useRef<AudioContext | null>(null);
  const animationRef = React.useRef<number | null>(null);
  const stabilityRef = React.useRef<PitchStabilityState>({ frames: [] });
  const settingsRef = React.useRef({ minFrequencyHz, maxFrequencyHz, yinThreshold, minRms, minConfidence, stabilityMs, maxSpreadCents });
  const playbackMsRef = React.useRef(playbackMs);
  const wholeSongKeyRef = React.useRef(wholeSongKey);
  const adaptiveTimingEnabledRef = React.useRef(adaptiveTimingEnabled);
  const detectorTargetIndexRef = React.useRef<number | null>(null);
  const captureActiveRef = React.useRef(false);
  const captureStartedAtRef = React.useRef<number | null>(null);
  const diagnosticFramesRef = React.useRef<PitchSnapshot[]>([]);
  const noCandidateFramesRef = React.useRef(0);

  React.useEffect(() => {
    settingsRef.current = { minFrequencyHz, maxFrequencyHz, yinThreshold, minRms, minConfidence, stabilityMs, maxSpreadCents };
  }, [maxFrequencyHz, maxSpreadCents, minConfidence, minFrequencyHz, minRms, stabilityMs, yinThreshold]);

  React.useEffect(() => {
    playbackMsRef.current = playbackMs;
  }, [playbackMs]);

  React.useEffect(() => {
    wholeSongKeyRef.current = wholeSongKey;
  }, [wholeSongKey]);

  React.useEffect(() => {
    adaptiveTimingEnabledRef.current = adaptiveTimingEnabled;
    stabilityRef.current = { frames: [] };
  }, [adaptiveTimingEnabled]);

  const refreshDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const nextDevices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
    setDevices(nextDevices);
    setDeviceId((current) => current || nextDevices[0]?.deviceId || "");
  }, []);

  React.useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const loadSong = React.useCallback(async (requestedSongId: string) => {
    const normalizedSongId = requestedSongId.trim();
    if (!normalizedSongId) return;
    setSongLoading(true);
    setSongError(null);
    try {
      const [songResponse, midiResponse] = await Promise.all([
        fetch(`/api/songs/${encodeURIComponent(normalizedSongId)}`, { cache: "no-store" }),
        fetch(`/api/songs/${encodeURIComponent(normalizedSongId)}/midi`, { cache: "no-store" }),
      ]);
      if (!songResponse.ok) throw new Error(`Song request failed (${songResponse.status})`);
      if (!midiResponse.ok) throw new Error(`MIDI request failed (${midiResponse.status})`);
      const nextSong = await songResponse.json() as Song;
      const midiPayload = await midiResponse.json() as { wholeSongAnswerKey?: WholeSongMidiAnswerKey | null };
      setSong(nextSong);
      setWholeSongKey(midiPayload.wholeSongAnswerKey ?? null);
      setPlaybackMs(0);
      if (!midiPayload.wholeSongAnswerKey?.notes.length) setSongError("This song does not have a complete aligned MIDI answer key.");
    } catch (caught) {
      setSong(null);
      setWholeSongKey(null);
      setSongError(caught instanceof Error ? caught.message : "Could not load song context.");
    } finally {
      setSongLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSong(DEFAULT_DEBUG_SONG_ID);
  }, [loadSong]);

  const stop = React.useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    stabilityRef.current = { frames: [] };
    setStatus("idle");
    setAudioInfo(null);
  }, []);

  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(async () => {
    stop();
    setStatus("starting");
    setError(null);
    setHistory([]);
    setSnapshot(null);
    if (!window.isSecureContext) {
      setStatus("error");
      setError("Microphone access requires HTTPS or localhost.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("getUserMedia is unavailable in this browser.");
      return;
    }
    const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setStatus("error");
      setError("Web Audio is unavailable in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
      });
      const context = new AudioContextConstructor();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      const track = stream.getAudioTracks()[0];
      setAudioInfo({ sampleRate: context.sampleRate, contextState: context.state, trackSettings: track?.getSettings() ?? {} });
      setStatus("running");
      void refreshDevices();

      const samples = new Float32Array(analyser.fftSize);
      let lastAnalysisAt = 0;
      const analyze = () => {
        if (!contextRef.current) return;
        const now = performance.now();
        if (now - lastAnalysisAt < 40) {
          animationRef.current = requestAnimationFrame(analyze);
          return;
        }
        lastAnalysisAt = now;
        analyser.getFloatTimeDomainData(samples);
        const settings = settingsRef.current;
        const precisePlaybackMs = songAudioRef.current ? songAudioRef.current.currentTime * 1000 : playbackMsRef.current;
        const target = getWholeSongPitchTarget(wholeSongKeyRef.current?.notes ?? [], precisePlaybackMs);
        const broad = detectPitchYin(samples, context.sampleRate, {
          minFrequencyHz: settings.minFrequencyHz,
          maxFrequencyHz: settings.maxFrequencyHz,
          threshold: settings.yinThreshold,
          minRms: 0,
          minConfidence: 0,
        });
        const guided = target ? detectPitchYin(samples, context.sampleRate, {
          minFrequencyHz: midiToFrequency(target.note.midiPitch - 2),
          maxFrequencyHz: midiToFrequency(target.note.midiPitch + 2),
          threshold: settings.yinThreshold,
          minRms: 0,
          minConfidence: 0,
        }) : null;
        const guidedCandidateUsed = Boolean(guided && guided.rms >= settings.minRms && guided.confidence >= settings.minConfidence);
        const raw = guidedCandidateUsed ? guided : broad;
        const sampledWaveform = Array.from({ length: 128 }, (_, index) => samples[Math.floor(index * samples.length / 128)] ?? 0);
        setWaveform(sampledWaveform);
        if (raw) {
          const midiPitch = frequencyToMidi(raw.frequencyHz);
          const accepted = raw.rms >= settings.minRms && raw.confidence >= settings.minConfidence;
          if (target && detectorTargetIndexRef.current !== target.noteIndex) {
            stabilityRef.current = { frames: [] };
            detectorTargetIndexRef.current = target.noteIndex;
          }
          const adaptiveTiming = target?.timing;
          const requiredStabilityMs = adaptiveTimingEnabledRef.current && adaptiveTiming ? adaptiveTiming.stabilityMs : settings.stabilityMs;
          const transitionGraceMs = adaptiveTimingEnabledRef.current && adaptiveTiming ? adaptiveTiming.transitionGraceMs : 0;
          const inTransitionGrace = Boolean(adaptiveTimingEnabledRef.current && target?.inTransitionGrace);
          const stability = updatePitchStability(stabilityRef.current, accepted && !inTransitionGrace ? {
            atMs: now,
            midiPitch,
            confidence: raw.confidence,
            rms: raw.rms,
          } : null, { stabilityMs: requiredStabilityMs, maxSpreadCents: settings.maxSpreadCents });
          stabilityRef.current = stability.state;
          const nextSnapshot: PitchSnapshot = { atMs: now, songPlaybackMs: precisePlaybackMs, frequencyHz: raw.frequencyHz, midiPitch, confidence: raw.confidence, rms: raw.rms, stableMidiPitch: stability.stableMidiPitch, accepted, requiredStabilityMs, transitionGraceMs, inTransitionGrace, expectedMidiPitch: target?.note.midiPitch ?? null, broadMidiPitch: broad ? frequencyToMidi(broad.frequencyHz) : midiPitch, guidedCandidateUsed };
          setSnapshot(nextSnapshot);
          setHistory((current) => [...current, nextSnapshot].slice(-300));
          if (captureActiveRef.current) {
            diagnosticFramesRef.current.push(nextSnapshot);
            if (diagnosticFramesRef.current.length > 5000) diagnosticFramesRef.current.shift();
          }
        } else {
          stabilityRef.current = { frames: [] };
          setSnapshot(null);
          if (captureActiveRef.current) noCandidateFramesRef.current += 1;
        }
        animationRef.current = requestAnimationFrame(analyze);
      };
      analyze();
    } catch (caught) {
      setStatus("error");
      setError(microphoneError(caught));
    }
  }, [autoGainControl, deviceId, echoCancellation, fftSize, noiseSuppression, refreshDevices, stop]);

  const activeMidiNote = React.useMemo<WholeSongMidiAnswerKeyNote | null>(() => {
    return getWholeSongPitchTarget(wholeSongKey?.notes ?? [], playbackMs)?.note ?? null;
  }, [playbackMs, wholeSongKey]);
  const activeAdaptiveTarget = React.useMemo(() => getWholeSongPitchTarget(wholeSongKey?.notes ?? [], playbackMs), [playbackMs, wholeSongKey]);
  const effectiveTargetMidiPitch = followPlayback && activeMidiNote ? activeMidiNote.midiPitch : targetMidiPitch;
  const activeSegment = song?.segments.find((segment) => playbackMs >= segment.startMs && playbackMs < segment.endMs) ?? null;
  const activeNoteIndex = activeMidiNote ? (wholeSongKey?.notes.findIndex((note) => note.index === activeMidiNote.index) ?? -1) : -1;
  const nearbyNotes = activeNoteIndex >= 0 ? wholeSongKey?.notes.slice(Math.max(0, activeNoteIndex - 4), activeNoteIndex + 5) ?? [] : wholeSongKey?.notes.slice(0, 9) ?? [];
  const detectedCents = snapshot ? centsBetween(snapshot.midiPitch, effectiveTargetMidiPitch) : null;
  const stableCents = snapshot?.stableMidiPitch !== null && snapshot?.stableMidiPitch !== undefined
    ? centsBetween(snapshot.stableMidiPitch, effectiveTargetMidiPitch)
    : null;
  const rejectionReason = !snapshot
    ? "No periodic pitch candidate"
    : snapshot.rms < minRms
      ? `Below RMS gate (${snapshot.rms.toFixed(4)} < ${minRms.toFixed(4)})`
      : snapshot.confidence < minConfidence
        ? `Below confidence gate (${snapshot.confidence.toFixed(3)} < ${minConfidence.toFixed(3)})`
        : snapshot.inTransitionGrace
          ? `Inside ${snapshot.transitionGraceMs} ms transition grace`
        : snapshot.stableMidiPitch === null
          ? `Pitch candidate accepted; waiting for ${snapshot.requiredStabilityMs} ms stability`
          : "Stable pitch accepted";

  const rollStartMs = Math.max(0, playbackMs - 4000);
  const rollEndMs = rollStartMs + 8000;
  const rollCenterPitch = activeMidiNote?.midiPitch ?? effectiveTargetMidiPitch;
  const rollMinPitch = rollCenterPitch - 6;
  const rollMaxPitch = rollCenterPitch + 6;
  const rollX = (ms: number) => ((ms - rollStartMs) / (rollEndMs - rollStartMs)) * 100;
  const rollY = (midiPitch: number) => ((rollMaxPitch - midiPitch) / (rollMaxPitch - rollMinPitch)) * 100;
  const rollNotes = (wholeSongKey?.notes ?? []).filter((note) => {
    const noteStartMs = note.tappedStartTimeSeconds * 1000;
    const noteEndMs = noteStartMs + note.effectiveDurationSeconds * 1000;
    return noteEndMs >= rollStartMs && noteStartMs <= rollEndMs && note.midiPitch >= rollMinPitch && note.midiPitch <= rollMaxPitch;
  });
  const rollDetections = history.filter((item) => item.songPlaybackMs >= rollStartMs && item.songPlaybackMs <= rollEndMs && item.midiPitch >= rollMinPitch && item.midiPitch <= rollMaxPitch);
  const rawRollPoints = rollDetections.map((item) => `${rollX(item.songPlaybackMs)},${rollY(item.midiPitch)}`).join(" ");
  const currentStablePitch = snapshot?.stableMidiPitch ?? null;
  const currentPitchMatches = currentStablePitch !== null && Math.abs(centsBetween(currentStablePitch, effectiveTargetMidiPitch)) <= 50;
  const waveformPoints = waveform.map((sample, index) => `${(index / Math.max(1, waveform.length - 1)) * 100},${50 - sample * 45}`).join(" ");

  const startDiagnosticCapture = React.useCallback(() => {
    diagnosticFramesRef.current = [];
    noCandidateFramesRef.current = 0;
    captureStartedAtRef.current = performance.now();
    captureActiveRef.current = true;
    setCaptureActive(true);
    setDiagnosticReport("");
    setCopyStatus("");
  }, []);

  const stopAndBuildDiagnosticReport = React.useCallback(() => {
    captureActiveRef.current = false;
    setCaptureActive(false);
    const frames = diagnosticFramesRef.current;
    const noCandidateFrames = noCandidateFramesRef.current;
    const elapsedMs = Math.max(0, performance.now() - (captureStartedAtRef.current ?? performance.now()));
    const rmsValues = frames.map((frame) => frame.rms);
    const confidenceValues = frames.map((frame) => frame.confidence);
    const belowRms = frames.filter((frame) => frame.rms < minRms).length;
    const belowConfidence = frames.filter((frame) => frame.rms >= minRms && frame.confidence < minConfidence).length;
    const inGrace = frames.filter((frame) => frame.accepted && frame.inTransitionGrace).length;
    const acceptedFrames = frames.filter((frame) => frame.accepted && !frame.inTransitionGrace);
    const stableFrames = acceptedFrames.filter((frame) => frame.stableMidiPitch !== null);
    const comparableStableFrames = stableFrames.filter((frame) => frame.expectedMidiPitch !== null);
    const matchedFrames = comparableStableFrames.filter((frame) => Math.abs(centsBetween(frame.stableMidiPitch!, frame.expectedMidiPitch!)) <= 50);
    const guidedFrames = frames.filter((frame) => frame.guidedCandidateUsed);
    const playbackMovedMs = frames.length > 1 ? Math.max(...frames.map((frame) => frame.songPlaybackMs)) - Math.min(...frames.map((frame) => frame.songPlaybackMs)) : 0;
    const mostlyQuiet = percentile(rmsValues, 0.9) < minRms;
    const recentStable = stableFrames.slice(-20).map((frame) => {
      const expected = frame.expectedMidiPitch === null ? "none" : `${midiToPitchName(frame.expectedMidiPitch)}(${frame.expectedMidiPitch})`;
      const cents = frame.expectedMidiPitch === null ? "n/a" : String(centsBetween(frame.stableMidiPitch!, frame.expectedMidiPitch));
      return `  t=${(frame.songPlaybackMs / 1000).toFixed(2)}s voice=${midiToPitchName(frame.stableMidiPitch!)}(${frame.stableMidiPitch!.toFixed(2)}) expected=${expected} cents=${cents} source=${frame.guidedCandidateUsed ? "target-band" : "broad"} broad=${midiToPitchName(frame.broadMidiPitch)}(${frame.broadMidiPitch.toFixed(2)}) rms=${frame.rms.toFixed(4)} conf=${frame.confidence.toFixed(3)}`;
    });
    const report = [
      "Cantare pitch diagnostic report",
      `Generated: ${new Date().toISOString()}`,
      `Song: ${song?.title ?? "not loaded"} (${song?.id ?? songIdInput})`,
      `Capture duration: ${(elapsedMs / 1000).toFixed(1)}s; playback moved: ${(playbackMovedMs / 1000).toFixed(1)}s`,
      "",
      "Important: a raw YIN candidate is not an accepted vocal pitch.",
      `Frames: ${frames.length + noCandidateFrames}; raw candidates: ${frames.length}; no candidate: ${noCandidateFrames}`,
      `Rejected below RMS: ${belowRms}; rejected below confidence: ${belowConfidence}; rejected in transition grace: ${inGrace}`,
      `Accepted voiced frames: ${acceptedFrames.length}; stable frames: ${stableFrames.length}`,
      `Target-band overrides: ${guidedFrames.length}/${frames.length}`,
      `Stable MIDI matches (±50 cents): ${matchedFrames.length}/${comparableStableFrames.length}`,
      `Quiet-input assessment: ${mostlyQuiet ? "90% of RMS readings were below the voice gate" : "RMS exceeded the voice gate during at least 10% of capture"}`,
      "",
      `RMS min/p50/p90/max: ${(rmsValues.length ? Math.min(...rmsValues) : 0).toFixed(5)} / ${percentile(rmsValues, 0.5).toFixed(5)} / ${percentile(rmsValues, 0.9).toFixed(5)} / ${(rmsValues.length ? Math.max(...rmsValues) : 0).toFixed(5)} (gate ${minRms.toFixed(5)})`,
      `Confidence p50/p90: ${percentile(confidenceValues, 0.5).toFixed(3)} / ${percentile(confidenceValues, 0.9).toFixed(3)} (gate ${minConfidence.toFixed(3)})`,
      `Most common selected candidates: ${commonPitchNames(frames, false)}`,
      `Most common accepted selected candidates: ${commonPitchNames(frames, true)}`,
      "",
      `Detector: FFT=${fftSize}; frequency=${minFrequencyHz}-${maxFrequencyHz}Hz; YIN threshold=${yinThreshold}; max spread=${maxSpreadCents} cents`,
      `Timing: adaptive=${adaptiveTimingEnabled}; fallback stability=${stabilityMs}ms`,
      `Browser processing requested: echo=${echoCancellation}; noiseSuppression=${noiseSuppression}; autoGain=${autoGainControl}`,
      `Audio context: sampleRate=${audioInfo?.sampleRate ?? "unknown"}; state=${audioInfo?.contextState ?? "unknown"}`,
      `Track settings: ${JSON.stringify(audioInfo?.trackSettings ?? {})}`,
      "",
      "Last stable frames:",
      ...(recentStable.length > 0 ? recentStable : ["  none"]),
    ].join("\n");
    setDiagnosticReport(report);
  }, [adaptiveTimingEnabled, audioInfo, autoGainControl, echoCancellation, fftSize, maxFrequencyHz, maxSpreadCents, minConfidence, minFrequencyHz, minRms, noiseSuppression, song, songIdInput, stabilityMs, yinThreshold]);

  const copyDiagnosticReport = React.useCallback(async () => {
    if (!diagnosticReport) return;
    try {
      await navigator.clipboard.writeText(diagnosticReport);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Select the report text and copy it manually");
    }
  }, [diagnosticReport]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Isolated diagnostic</p>
            <h1 className="mt-1 text-3xl font-bold">Microphone Pitch Test</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">No song data is loaded and nothing is saved. This page shows the raw YIN candidate before practice-mode gates, then identifies exactly which gate accepts or rejects it.</p>
          </div>
          <Link href="/" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100">Back home</Link>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1"><span className={labelClass}>Input device</span><select className={inputClass} value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={status === "running"}>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
            <button type="button" onClick={status === "running" ? stop : start} disabled={status === "starting"} className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white ${status === "running" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{status === "running" ? "Stop microphone" : status === "starting" ? "Starting..." : "Start microphone"}</button>
          </div>
          {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p> : null}
          <p className={`mt-3 text-sm font-semibold ${snapshot?.stableMidiPitch !== null && snapshot ? "text-emerald-700" : snapshot?.accepted ? "text-amber-700" : "text-slate-600"}`}>{status === "running" ? rejectionReason : "Microphone stopped"}</p>
        </section>

        <section className="mt-5 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm" data-testid="pitch-debug-song-context">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-72 flex-1"><span className={labelClass}>Song ID</span><input className={inputClass} value={songIdInput} onChange={(event) => setSongIdInput(event.target.value)} /></label>
            <button type="button" onClick={() => void loadSong(songIdInput)} disabled={songLoading} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{songLoading ? "Loading..." : "Load song"}</button>
          </div>
          {songError ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{songError}</p> : null}
          {song ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-lg font-bold">{song.title}</p><p className="text-sm text-slate-500">{song.artist || "Unknown artist"} · {wholeSongKey?.notes.length ?? 0} aligned MIDI notes</p></div>
                {song.alternateAudioUrl ? <div className="inline-flex rounded-full border border-indigo-200 p-0.5">{(["part", "blend"] as const).map((version) => <button key={version} type="button" onClick={() => setAudioVersion(version)} className={`rounded-full px-3 py-1 text-xs font-semibold ${audioVersion === version ? "bg-indigo-600 text-white" : "text-indigo-700"}`}>{version === "part" ? "Part" : "Blend"}</button>)}</div> : null}
              </div>
              <audio
                ref={songAudioRef}
                className="mt-3 w-full"
                controls
                src={audioVersion === "blend" && song.alternateAudioUrl ? song.alternateAudioUrl : song.audioUrl}
                onTimeUpdate={(event) => setPlaybackMs(event.currentTarget.currentTime * 1000)}
                onSeeked={(event) => setPlaybackMs(event.currentTarget.currentTime * 1000)}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={followPlayback} onChange={(event) => setFollowPlayback(event.target.checked)} />Follow aligned MIDI during playback</label>
                <span>Time: {(playbackMs / 1000).toFixed(2)}s</span>
                <span>Section: {activeSegment?.label ?? "Outside sections"}</span>
                <span className="font-bold text-indigo-700">Expected: {activeMidiNote?.pitchName ?? "--"} ({activeMidiNote?.midiPitch ?? "--"})</span>
                {activeAdaptiveTarget ? <span className="font-semibold text-emerald-700">Adaptive: {activeAdaptiveTarget.timing.stabilityMs} ms stable · {activeAdaptiveTarget.timing.transitionGraceMs} ms grace/side{activeAdaptiveTarget.inTransitionGrace ? " · in grace now" : ""}</span> : null}
              </div>
              {nearbyNotes.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{nearbyNotes.map((note) => <button key={note.index} type="button" onClick={() => { setFollowPlayback(false); setTargetMidiPitch(note.midiPitch); }} className={`rounded-lg border px-2 py-1 text-xs font-semibold ${note.index === activeMidiNote?.index && followPlayback ? "border-indigo-500 bg-indigo-100 text-indigo-900" : "border-slate-200 bg-slate-50 text-slate-700"}`} title={`${note.tappedStartTimeSeconds.toFixed(2)} seconds`}>{note.pitchName} · {note.tappedStartTimeSeconds.toFixed(1)}s</button>)}</div> : null}
            </div>
          ) : null}
        </section>

        <section className="mt-5 rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm" data-testid="pitch-diagnostic-report">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold">Shareable diagnostic report</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Start the microphone, begin capture, stay quiet for about 5 seconds, then play and sing for 10–20 seconds. Stop the capture and share the generated text. No audio is recorded or saved.</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={startDiagnosticCapture} disabled={status !== "running" || captureActive} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Start diagnostic capture</button><button type="button" onClick={stopAndBuildDiagnosticReport} disabled={!captureActive} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Stop and generate report</button></div>
          </div>
          {captureActive ? <p className="mt-3 font-semibold text-cyan-700">Capturing pitch decisions now...</p> : null}
          {diagnosticReport ? <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Copy everything below</span><button type="button" onClick={() => void copyDiagnosticReport()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Copy report</button></div><textarea readOnly value={diagnosticReport} aria-label="Pitch diagnostic report text" className="h-96 w-full rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-xs leading-5 text-emerald-200" />{copyStatus ? <p className="mt-2 text-sm font-medium text-slate-600">{copyStatus}</p> : null}</div> : null}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Broad YIN candidate" value={snapshot ? `${midiToPitchName(snapshot.broadMidiPitch)} (${snapshot.broadMidiPitch.toFixed(2)})` : "--"} />
                <Metric label={snapshot?.guidedCandidateUsed ? "Target-band detected" : "Broad detected"} value={snapshot ? `${midiToPitchName(snapshot.midiPitch)} (${snapshot.midiPitch.toFixed(2)})` : "--"} />
                <Metric label="Confidence" value={formatNumber(snapshot?.confidence, 3)} tone={snapshot && snapshot.confidence >= minConfidence ? "good" : "warn"} />
                <Metric label="RMS level" value={formatNumber(snapshot?.rms, 4)} tone={snapshot && snapshot.rms >= minRms ? "good" : "warn"} />
                <Metric label="Stable note" value={snapshot?.stableMidiPitch !== null && snapshot?.stableMidiPitch !== undefined ? `${midiToPitchName(snapshot.stableMidiPitch)} (${snapshot.stableMidiPitch.toFixed(2)})` : "--"} />
                <Metric label="Target note" value={`${midiToPitchName(effectiveTargetMidiPitch)} (${effectiveTargetMidiPitch})`} />
                <Metric label="Raw cents to target" value={detectedCents === null ? "--" : `${detectedCents > 0 ? "+" : ""}${detectedCents}`} tone={detectedCents !== null && Math.abs(detectedCents) <= 50 ? "good" : "warn"} />
                <Metric label="Stable cents" value={stableCents === null ? "--" : `${stableCents > 0 ? "+" : ""}${stableCents}`} tone={stableCents !== null && Math.abs(stableCents) <= 50 ? "good" : "warn"} />
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${Math.min(100, (snapshot?.rms ?? 0) * 500)}%` }} /></div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Waveform</h2>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-36 w-full rounded-xl bg-slate-950"><line x1="0" y1="50" x2="100" y2="50" stroke="rgb(71 85 105)" strokeWidth="0.5" /><polyline points={waveformPoints} fill="none" stroke="rgb(52 211 153)" strokeWidth="0.8" /></svg>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="pitch-comparison-roll">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold">MIDI and detected pitch piano roll</h2><p className="text-xs text-slate-500">MIDI blocks and your detected pitch share the same time and pitch axes. The bold line is the current playback position.</p></div>
                <div className={`rounded-full px-3 py-1 text-sm font-bold ${currentStablePitch === null ? "bg-slate-100 text-slate-600" : currentPitchMatches ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                  {currentStablePitch === null ? "Waiting for stable pitch" : currentPitchMatches ? "MATCH" : "OFF PITCH"}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-indigo-500" />Expected MIDI</span><span><i className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-sky-400" />Raw detected pitch</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Matched stable pitch</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />Off-pitch stable pitch</span></div>
              <div className="mt-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                <div className="relative h-72 text-[10px] font-semibold text-slate-500">{Array.from({ length: 13 }, (_, index) => { const pitch = rollMaxPitch - index; return <span key={pitch} className="absolute right-0 -translate-y-1/2" style={{ top: `${rollY(pitch)}%` }}>{midiToPitchName(pitch)}</span>; })}</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-72 w-full rounded-xl bg-slate-950" aria-label="Expected MIDI and detected pitch piano roll">
                  {Array.from({ length: 13 }, (_, index) => { const pitch = rollMaxPitch - index; return <line key={`grid-${pitch}`} x1="0" y1={rollY(pitch)} x2="100" y2={rollY(pitch)} stroke={pitch % 12 === 0 ? "rgb(100 116 139)" : "rgb(51 65 85)"} strokeWidth="0.35" />; })}
                  {rollNotes.map((note) => {
                    const startMs = note.tappedStartTimeSeconds * 1000;
                    const width = Math.max(0.8, (note.effectiveDurationSeconds * 1000 / (rollEndMs - rollStartMs)) * 100);
                    return <rect key={`midi-${note.index}`} x={Math.max(0, rollX(startMs))} y={rollY(note.midiPitch) - 3.2} width={Math.min(width, 100 - Math.max(0, rollX(startMs)))} height="6.4" rx="1" fill="rgb(99 102 241)" opacity={note.index === activeMidiNote?.index ? "1" : "0.68"}><title>{`${note.pitchName} at ${note.tappedStartTimeSeconds.toFixed(2)}s`}</title></rect>;
                  })}
                  <polyline points={rawRollPoints} fill="none" stroke="rgb(56 189 248)" strokeWidth="0.8" opacity="0.8" />
                  {rollDetections.filter((item) => item.stableMidiPitch !== null).map((item, index) => {
                    const stablePitch = item.stableMidiPitch!;
                    const expected = nearestMidiNote(wholeSongKey?.notes ?? [], item.songPlaybackMs);
                    const matched = expected ? Math.abs(centsBetween(stablePitch, expected.midiPitch)) <= 50 : false;
                    return <circle key={`stable-${item.atMs}-${index}`} cx={rollX(item.songPlaybackMs)} cy={rollY(stablePitch)} r="1.4" fill={matched ? "rgb(34 197 94)" : "rgb(244 63 94)"}><title>{`${midiToPitchName(stablePitch)} ${expected ? `vs ${expected.pitchName}` : ""}`}</title></circle>;
                  })}
                  <line x1={rollX(playbackMs)} y1="0" x2={rollX(playbackMs)} y2="100" stroke="rgb(250 204 21)" strokeWidth="1.1" />
                </svg>
              </div>
              <div className="ml-16 mt-1 flex justify-between text-[10px] text-slate-500"><span>{(rollStartMs / 1000).toFixed(1)}s</span><span>{(playbackMs / 1000).toFixed(1)}s</span><span>{(rollEndMs / 1000).toFixed(1)}s</span></div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Detector settings</h2>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"><span>Adapt timing to active MIDI duration</span><input type="checkbox" checked={adaptiveTimingEnabled} onChange={(event) => setAdaptiveTimingEnabled(event.target.checked)} /></label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberSetting label="Manual target MIDI" value={targetMidiPitch} min={24} max={108} step={1} onChange={(value) => { setFollowPlayback(false); setTargetMidiPitch(value); }} />
                <label><span className={labelClass}>FFT size</span><select className={inputClass} value={fftSize} onChange={(event) => setFftSize(Number(event.target.value))} disabled={status === "running"}>{[2048, 4096, 8192].map((size) => <option key={size}>{size}</option>)}</select></label>
                <NumberSetting label="Min frequency" value={minFrequencyHz} min={30} max={500} step={1} onChange={setMinFrequencyHz} />
                <NumberSetting label="Max frequency" value={maxFrequencyHz} min={200} max={2000} step={10} onChange={setMaxFrequencyHz} />
                <NumberSetting label="YIN threshold" value={yinThreshold} min={0.05} max={0.5} step={0.01} onChange={setYinThreshold} />
                <NumberSetting label="Minimum RMS" value={minRms} min={0} max={0.1} step={0.001} onChange={setMinRms} />
                <NumberSetting label="Min confidence" value={minConfidence} min={0} max={1} step={0.01} onChange={setMinConfidence} />
                <NumberSetting label={adaptiveTimingEnabled ? "Fallback stability ms" : "Stability ms"} value={stabilityMs} min={40} max={500} step={10} onChange={setStabilityMs} />
                <NumberSetting label="Max spread cents" value={maxSpreadCents} min={5} max={150} step={5} onChange={setMaxSpreadCents} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Browser processing</h2>
              <div className="mt-3 space-y-2">{[["Echo cancellation", echoCancellation, setEchoCancellation], ["Noise suppression", noiseSuppression, setNoiseSuppression], ["Automatic gain", autoGainControl, setAutoGainControl]].map(([label, checked, setter]) => <label key={label as string} className="flex items-center justify-between gap-3 text-sm"><span>{label as string}</span><input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(event.target.checked)} disabled={status === "running"} /></label>)}</div>
              <p className="mt-3 text-xs text-slate-500">Restart the microphone after changing these options.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Audio context</h2>
              <dl className="mt-3 space-y-2 text-sm"><InfoRow label="Sample rate" value={audioInfo ? `${audioInfo.sampleRate} Hz` : "--"} /><InfoRow label="Context state" value={audioInfo?.contextState ?? "--"} /><InfoRow label="Track sample rate" value={String(audioInfo?.trackSettings.sampleRate ?? "--")} /><InfoRow label="Channel count" value={String(audioInfo?.trackSettings.channelCount ?? "--")} /><InfoRow label="Echo cancellation" value={String(audioInfo?.trackSettings.echoCancellation ?? "--")} /><InfoRow label="Noise suppression" value={String(audioInfo?.trackSettings.noiseSuppression ?? "--")} /><InfoRow label="Automatic gain" value={String(audioInfo?.trackSettings.autoGainControl ?? "--")} /></dl>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return <div className={`rounded-xl border p-3 ${tone === "good" ? "border-emerald-200 bg-emerald-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-lg font-bold">{value}</p></div>;
}

function NumberSetting({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label><span className={labelClass}>{label}</span><input className={inputClass} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="break-all text-right font-medium">{value}</dd></div>;
}
