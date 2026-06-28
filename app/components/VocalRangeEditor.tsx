"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { midiNoteName, type VocalRange } from "../lib/vocalExercise";
import {
  createAdaptiveNoiseGateState,
  detectPitchYin,
  frequencyToMidi,
  midiToFrequency,
  MIN_PITCH_CONFIDENCE,
  updateAdaptiveNoiseGate,
  type AdaptiveNoiseGateState,
} from "../lib/pitchPractice";

const DEFAULT_RANGE: VocalRange = { low: 45, high: 64 };
const KEYBOARD_LOW = 36;
const KEYBOARD_HIGH = 84;

type RangeEndpoint = "low" | "high";

function clampMidi(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.max(KEYBOARD_LOW, Math.min(KEYBOARD_HIGH, Math.round(value)));
}

function rangeLabel(range: VocalRange): string {
  return `${midiNoteName(range.low)} to ${midiNoteName(range.high)}`;
}

function PianoRangeKeyboard({
  range,
  activeEndpoint,
  onEndpointChange,
  onChoose,
}: {
  range: VocalRange;
  activeEndpoint: RangeEndpoint;
  onEndpointChange: (endpoint: RangeEndpoint) => void;
  onChoose: (midi: number, endpoint: RangeEndpoint) => void;
}) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const notes = useMemo(() => Array.from({ length: KEYBOARD_HIGH - KEYBOARD_LOW + 1 }, (_, index) => KEYBOARD_LOW + index), []);

  const playPitch = (midi: number) => {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "triangle";
    oscillator.frequency.value = midiToFrequency(midi);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.setValueAtTime(0.18, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
  };

  useEffect(() => () => {
    void audioContextRef.current?.close().catch(() => undefined);
  }, []);

  return (
    <div className="mt-3">
      <div className="mb-2 inline-flex rounded border border-gray-300 bg-white p-0.5" data-testid="vocal-range-endpoint-toggle">
        {(["low", "high"] as const).map((endpoint) => (
          <button
            key={endpoint}
            type="button"
            aria-pressed={activeEndpoint === endpoint}
            onClick={() => onEndpointChange(endpoint)}
            className={`rounded px-3 py-1 text-xs font-semibold ${
              activeEndpoint === endpoint ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            {endpoint === "low" ? "Low" : "High"}
          </button>
        ))}
      </div>
      <div
        className="flex h-20 overflow-hidden rounded border border-gray-300 bg-white"
        aria-label="Piano keyboard range selector"
        data-testid="vocal-range-keyboard"
      >
        {notes.map((midi) => {
          const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
          const isLow = midi === range.low;
          const isHigh = midi === range.high;
          const isInside = midi >= range.low && midi <= range.high;
          return (
            <button
              key={midi}
              type="button"
              title={midiNoteName(midi)}
              aria-label={`${midiNoteName(midi)} ${activeEndpoint === "low" ? "lowest" : "highest"} range note`}
              onClick={() => {
                playPitch(midi);
                onChoose(midi, activeEndpoint);
              }}
              className={`relative min-w-0 flex-1 border-r border-gray-300 last:border-r-0 ${
                isBlack ? "bg-gray-800" : "bg-white"
              } ${isInside ? "shadow-[inset_0_-10px_0_rgba(79,70,229,0.18)]" : ""} focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
            >
              {isLow ? <span className="absolute inset-x-0 bottom-1 mx-auto h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" /> : null}
              {isHigh ? <span className="absolute inset-x-0 top-1 mx-auto h-2 w-2 rounded-full bg-rose-600" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs font-semibold text-gray-600">
        <span>Low {midiNoteName(range.low)}</span>
        <span>{range.high - range.low + 1} semitones</span>
        <span>High {midiNoteName(range.high)}</span>
      </div>
    </div>
  );
}

export function VocalRangeEditor({ userId }: { userId: string }) {
  const [range, setRange] = useState<VocalRange>(DEFAULT_RANGE);
  const [activeEndpoint, setActiveEndpoint] = useState<RangeEndpoint>("low");
  const [message, setMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [detectedRange, setDetectedRange] = useState<VocalRange | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const gateRef = useRef<AdaptiveNoiseGateState>(createAdaptiveNoiseGateState());
  const detectedMidiRef = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/users/me/vocal-range", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load vocal range");
        const payload = await response.json() as { range?: VocalRange | null };
        if (!cancelled && payload.range) setRange(payload.range);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load vocal range");
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const saveRange = useCallback(async (nextRange: VocalRange, successMessage = "Vocal range saved") => {
    const safeRange = {
      low: clampMidi(Math.min(nextRange.low, nextRange.high)),
      high: clampMidi(Math.max(nextRange.low, nextRange.high)),
    };
    setRange(safeRange);
    setMessage("Saving...");
    try {
      const response = await fetch("/api/users/me/vocal-range", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeRange),
      });
      if (!response.ok) throw new Error("Unable to save vocal range");
      const payload = await response.json() as { range: VocalRange };
      setRange(payload.range);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save vocal range");
    }
  }, []);

  const stopListening = useCallback((options: { reportResult?: boolean } = { reportResult: true }) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    gateRef.current = createAdaptiveNoiseGateState();
    if (!options.reportResult) return;
    setIsListening(false);
    if (detectedMidiRef.current.length > 0) {
      const detected = detectedMidiRef.current;
      const nextDetected = {
        low: clampMidi(Math.min(...detected)),
        high: clampMidi(Math.max(...detected)),
      };
      setDetectedRange(nextDetected);
      setMessage(`Detected ${rangeLabel(nextDetected)}`);
    } else {
      setMessage("No steady pitch detected");
    }
  }, []);

  const startListening = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Microphone range detection requires HTTPS or localhost");
      return;
    }
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setMessage("This browser does not support microphone range detection");
      return;
    }
    setMessage("Starting microphone...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      const context = new AudioContextCtor();
      if (context.state === "suspended") await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      gateRef.current = createAdaptiveNoiseGateState();
      detectedMidiRef.current = [];
      setDetectedRange(null);
      setIsListening(true);
      setMessage("Listening for a sustained ooh");
      const samples = new Float32Array(analyser.fftSize);
      let lastAnalysisAt = 0;

      const analyze = () => {
        if (contextRef.current !== context) return;
        const now = performance.now();
        if (now - lastAnalysisAt >= 45) {
          lastAnalysisAt = now;
          analyser.getFloatTimeDomainData(samples);
          const detection = detectPitchYin(samples, context.sampleRate, {
            minFrequencyHz: midiToFrequency(KEYBOARD_LOW),
            maxFrequencyHz: midiToFrequency(KEYBOARD_HIGH),
            minRms: 0,
            minConfidence: MIN_PITCH_CONFIDENCE,
          });
          if (detection) {
            const gate = updateAdaptiveNoiseGate(gateRef.current, detection);
            gateRef.current = gate.state;
            if (gate.accepted) {
              const midi = clampMidi(frequencyToMidi(detection.frequencyHz));
              detectedMidiRef.current = [...detectedMidiRef.current, midi].slice(-240);
              const low = Math.min(...detectedMidiRef.current);
              const high = Math.max(...detectedMidiRef.current);
              setDetectedRange({ low, high });
            }
          }
        }
        frameRef.current = requestAnimationFrame(analyze);
      };
      analyze();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Microphone permission was denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("No microphone was found");
      } else {
        setMessage("Could not start the microphone");
      }
    }
  };

  useEffect(() => () => stopListening({ reportResult: false }), [stopListening]);

  return (
    <div className="mt-4 rounded border border-indigo-100 bg-indigo-50/60 p-3" data-testid="profile-vocal-range-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-indigo-950">Vocal range</p>
          <p className="text-xs text-indigo-900">{rangeLabel(range)}</p>
        </div>
        <div className="rounded bg-white px-2 py-1 text-xs font-semibold text-indigo-800 shadow-sm">
          {range.high - range.low + 1} semitones
        </div>
      </div>

      <PianoRangeKeyboard
        range={range}
        activeEndpoint={activeEndpoint}
        onEndpointChange={setActiveEndpoint}
        onChoose={(midi, endpoint) => {
          const nextRange = endpoint === "low"
            ? { low: midi, high: Math.max(midi, range.high) }
            : { low: Math.min(range.low, midi), high: midi };
          void saveRange(nextRange, `${endpoint === "low" ? "Lowest" : "Highest"} note saved`);
        }}
      />

      <div className="mt-4 rounded border border-emerald-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { void (isListening ? stopListening() : startListening()); }}
            className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            {isListening ? "Stop ooh" : "Detect with ooh"}
          </button>
          {detectedRange ? (
            <button
              type="button"
              onClick={() => void saveRange(detectedRange, "Detected range saved")}
              className="rounded border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Save detected
            </button>
          ) : null}
        </div>
        {detectedRange ? (
          <p className="mt-2 text-xs font-medium text-emerald-900">
            Detected {rangeLabel(detectedRange)}
          </p>
        ) : null}
      </div>

      {message ? (
        <p className="mt-2 text-xs text-indigo-900" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
