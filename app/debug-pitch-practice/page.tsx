"use client";

import * as React from "react";
import Link from "next/link";
import {
  centsBetween,
  detectPitchYin,
  frequencyToMidi,
  midiToPitchName,
  updatePitchStability,
  type PitchStabilityState,
} from "../lib/pitchPractice";

type DebugStatus = "idle" | "starting" | "running" | "error";

interface PitchSnapshot {
  atMs: number;
  frequencyHz: number;
  midiPitch: number;
  confidence: number;
  rms: number;
  stableMidiPitch: number | null;
  accepted: boolean;
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-600";

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
  const [targetMidiPitch, setTargetMidiPitch] = React.useState(60);
  const [echoCancellation, setEchoCancellation] = React.useState(true);
  const [noiseSuppression, setNoiseSuppression] = React.useState(false);
  const [autoGainControl, setAutoGainControl] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<PitchSnapshot | null>(null);
  const [waveform, setWaveform] = React.useState<number[]>([]);
  const [history, setHistory] = React.useState<PitchSnapshot[]>([]);
  const [audioInfo, setAudioInfo] = React.useState<{ sampleRate: number; contextState: string; trackSettings: MediaTrackSettings } | null>(null);

  const streamRef = React.useRef<MediaStream | null>(null);
  const contextRef = React.useRef<AudioContext | null>(null);
  const animationRef = React.useRef<number | null>(null);
  const stabilityRef = React.useRef<PitchStabilityState>({ frames: [] });
  const settingsRef = React.useRef({ minFrequencyHz, maxFrequencyHz, yinThreshold, minRms, minConfidence, stabilityMs, maxSpreadCents });

  React.useEffect(() => {
    settingsRef.current = { minFrequencyHz, maxFrequencyHz, yinThreshold, minRms, minConfidence, stabilityMs, maxSpreadCents };
  }, [maxFrequencyHz, maxSpreadCents, minConfidence, minFrequencyHz, minRms, stabilityMs, yinThreshold]);

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
        const raw = detectPitchYin(samples, context.sampleRate, {
          minFrequencyHz: settings.minFrequencyHz,
          maxFrequencyHz: settings.maxFrequencyHz,
          threshold: settings.yinThreshold,
          minRms: 0,
          minConfidence: 0,
        });
        const sampledWaveform = Array.from({ length: 128 }, (_, index) => samples[Math.floor(index * samples.length / 128)] ?? 0);
        setWaveform(sampledWaveform);
        if (raw) {
          const midiPitch = frequencyToMidi(raw.frequencyHz);
          const accepted = raw.rms >= settings.minRms && raw.confidence >= settings.minConfidence;
          const stability = updatePitchStability(stabilityRef.current, accepted ? {
            atMs: now,
            midiPitch,
            confidence: raw.confidence,
            rms: raw.rms,
          } : null, { stabilityMs: settings.stabilityMs, maxSpreadCents: settings.maxSpreadCents });
          stabilityRef.current = stability.state;
          const nextSnapshot: PitchSnapshot = { atMs: now, frequencyHz: raw.frequencyHz, midiPitch, confidence: raw.confidence, rms: raw.rms, stableMidiPitch: stability.stableMidiPitch, accepted };
          setSnapshot(nextSnapshot);
          setHistory((current) => [...current, nextSnapshot].slice(-150));
        } else {
          stabilityRef.current = { frames: [] };
          setSnapshot(null);
        }
        animationRef.current = requestAnimationFrame(analyze);
      };
      analyze();
    } catch (caught) {
      setStatus("error");
      setError(microphoneError(caught));
    }
  }, [autoGainControl, deviceId, echoCancellation, fftSize, noiseSuppression, refreshDevices, stop]);

  const detectedCents = snapshot ? centsBetween(snapshot.midiPitch, targetMidiPitch) : null;
  const stableCents = snapshot?.stableMidiPitch !== null && snapshot?.stableMidiPitch !== undefined
    ? centsBetween(snapshot.stableMidiPitch, targetMidiPitch)
    : null;
  const rejectionReason = !snapshot
    ? "No periodic pitch candidate"
    : snapshot.rms < minRms
      ? `Below RMS gate (${snapshot.rms.toFixed(4)} < ${minRms.toFixed(4)})`
      : snapshot.confidence < minConfidence
        ? `Below confidence gate (${snapshot.confidence.toFixed(3)} < ${minConfidence.toFixed(3)})`
        : snapshot.stableMidiPitch === null
          ? "Pitch candidate accepted; waiting for stability"
          : "Stable pitch accepted";

  const pitchPoints = history.map((item, index) => {
    const x = history.length <= 1 ? 0 : (index / (history.length - 1)) * 100;
    const y = 50 - (item.midiPitch - targetMidiPitch) * 12.5;
    return `${x},${Math.max(0, Math.min(100, y))}`;
  }).join(" ");
  const waveformPoints = waveform.map((sample, index) => `${(index / Math.max(1, waveform.length - 1)) * 100},${50 - sample * 45}`).join(" ");

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

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Raw frequency" value={`${formatNumber(snapshot?.frequencyHz, 1)} Hz`} />
                <Metric label="Detected note" value={snapshot ? `${midiToPitchName(snapshot.midiPitch)} (${snapshot.midiPitch.toFixed(2)})` : "--"} />
                <Metric label="Confidence" value={formatNumber(snapshot?.confidence, 3)} tone={snapshot && snapshot.confidence >= minConfidence ? "good" : "warn"} />
                <Metric label="RMS level" value={formatNumber(snapshot?.rms, 4)} tone={snapshot && snapshot.rms >= minRms ? "good" : "warn"} />
                <Metric label="Stable note" value={snapshot?.stableMidiPitch !== null && snapshot?.stableMidiPitch !== undefined ? `${midiToPitchName(snapshot.stableMidiPitch)} (${snapshot.stableMidiPitch.toFixed(2)})` : "--"} />
                <Metric label="Target note" value={`${midiToPitchName(targetMidiPitch)} (${targetMidiPitch})`} />
                <Metric label="Raw cents to target" value={detectedCents === null ? "--" : `${detectedCents > 0 ? "+" : ""}${detectedCents}`} tone={detectedCents !== null && Math.abs(detectedCents) <= 50 ? "good" : "warn"} />
                <Metric label="Stable cents" value={stableCents === null ? "--" : `${stableCents > 0 ? "+" : ""}${stableCents}`} tone={stableCents !== null && Math.abs(stableCents) <= 50 ? "good" : "warn"} />
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${Math.min(100, (snapshot?.rms ?? 0) * 500)}%` }} /></div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Waveform</h2>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-36 w-full rounded-xl bg-slate-950"><line x1="0" y1="50" x2="100" y2="50" stroke="rgb(71 85 105)" strokeWidth="0.5" /><polyline points={waveformPoints} fill="none" stroke="rgb(52 211 153)" strokeWidth="0.8" /></svg>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Pitch trace around target</h2>
              <p className="text-xs text-slate-500">Vertical range is approximately ±4 semitones. Green points passed RMS and confidence gates; the line shows all raw candidates.</p>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-48 w-full rounded-xl bg-slate-950"><line x1="0" y1="50" x2="100" y2="50" stroke="rgb(250 204 21)" strokeWidth="0.7" /><polyline points={pitchPoints} fill="none" stroke="rgb(96 165 250)" strokeWidth="0.8" />{history.map((item, index) => <circle key={`${item.atMs}-${index}`} cx={history.length <= 1 ? 0 : index / (history.length - 1) * 100} cy={Math.max(0, Math.min(100, 50 - (item.midiPitch - targetMidiPitch) * 12.5))} r="0.8" fill={item.accepted ? "rgb(52 211 153)" : "rgb(251 113 133)"} />)}</svg>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Detector settings</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberSetting label="Target MIDI" value={targetMidiPitch} min={24} max={108} step={1} onChange={setTargetMidiPitch} />
                <label><span className={labelClass}>FFT size</span><select className={inputClass} value={fftSize} onChange={(event) => setFftSize(Number(event.target.value))} disabled={status === "running"}>{[2048, 4096, 8192].map((size) => <option key={size}>{size}</option>)}</select></label>
                <NumberSetting label="Min frequency" value={minFrequencyHz} min={30} max={500} step={1} onChange={setMinFrequencyHz} />
                <NumberSetting label="Max frequency" value={maxFrequencyHz} min={200} max={2000} step={10} onChange={setMaxFrequencyHz} />
                <NumberSetting label="YIN threshold" value={yinThreshold} min={0.05} max={0.5} step={0.01} onChange={setYinThreshold} />
                <NumberSetting label="Minimum RMS" value={minRms} min={0} max={0.1} step={0.001} onChange={setMinRms} />
                <NumberSetting label="Min confidence" value={minConfidence} min={0} max={1} step={0.01} onChange={setMinConfidence} />
                <NumberSetting label="Stability ms" value={stabilityMs} min={40} max={500} step={10} onChange={setStabilityMs} />
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
