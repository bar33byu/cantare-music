"use client";

import * as React from "react";
import {
  createAdaptiveNoiseGateState,
  detectPitchYin,
  foldPitchToReferenceOctave,
  frequencyToMidi,
  midiToFrequency,
  MIN_PITCH_CONFIDENCE,
  updateAdaptiveNoiseGate,
  type AdaptiveNoiseGateState,
} from "../lib/pitchPractice";

export interface WarmupPitchTracePoint {
  beat: number;
  midi: number;
}

export const WARMUP_MIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const NEAR_TARGET_CONFIDENCE = 0.45;
const NEAR_TARGET_MAX_SEMITONES = 0.85;
const NEAR_TARGET_MIN_RMS = 0.0015;

export function getWarmupCaptureTailSeconds(latencyMs: number): number {
  const safeLatencyMs = Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0;
  return (safeLatencyMs + 80) / 1000;
}

export function useWarmupPitchTrace(input: {
  isPlaying: boolean;
  playheadBeat: number;
  repetitionIndex: number;
  exerciseStartBeat: number;
  exerciseEndBeat: number;
  tempoBpm: number;
  tempoPercent: number;
  latencyMs: number;
  pitchTargets: Array<{ startBeat: number; midi: number }>;
}) {
  const [isListening, setIsListening] = React.useState(false);
  const [status, setStatus] = React.useState("Microphone off");
  const [points, setPoints] = React.useState<WarmupPitchTracePoint[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const contextRef = React.useRef<AudioContext | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const gateRef = React.useRef<AdaptiveNoiseGateState>(createAdaptiveNoiseGateState());
  const recentRef = React.useRef<number[]>([]);
  const smoothedRef = React.useRef<number | null>(null);
  const targetMidiRef = React.useRef<number | null>(null);
  const inputRef = React.useRef(input);
  React.useEffect(() => { inputRef.current = input; }, [input]);

  const stop = React.useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    gateRef.current = createAdaptiveNoiseGateState();
    recentRef.current = [];
    smoothedRef.current = null;
    targetMidiRef.current = null;
    setIsListening(false);
    setStatus("Microphone off");
  }, []);

  const start = React.useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("Microphone pitch tracking requires HTTPS or localhost");
      return;
    }
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setStatus("This browser does not support microphone pitch tracking");
      return;
    }
    setStatus("Starting microphone...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: WARMUP_MIC_AUDIO_CONSTRAINTS,
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
      setIsListening(true);
      setStatus("Listening");
      const samples = new Float32Array(analyser.fftSize);
      let lastAnalysisAt = 0;
      let lastAcceptedAt = 0;

      const analyze = () => {
        if (contextRef.current !== context) return;
        const now = performance.now();
        if (now - lastAnalysisAt < 40) {
          frameRef.current = requestAnimationFrame(analyze);
          return;
        }
        lastAnalysisAt = now;
        const current = inputRef.current;
        const secondsPerBeat = 60 / current.tempoBpm / (current.tempoPercent / 100);
        const beat = current.playheadBeat - current.latencyMs / 1000 / secondsPerBeat;
        const target = current.pitchTargets.reduce<{ startBeat: number; midi: number } | null>(
          (active, candidate) => candidate.startBeat <= beat ? candidate : active,
          null
        );
        analyser.getFloatTimeDomainData(samples);
        const guidedDetection = target
          ? detectPitchYin(samples, context.sampleRate, {
              minFrequencyHz: midiToFrequency(target.midi - 5),
              maxFrequencyHz: midiToFrequency(target.midi + 5),
              minRms: 0,
              minConfidence: 0,
            })
          : null;
        const broadDetection = detectPitchYin(samples, context.sampleRate, { minRms: 0, minConfidence: 0 });
        const detection = target && guidedDetection ? guidedDetection : broadDetection;
        if (detection) {
          const detectedMidi = frequencyToMidi(detection.frequencyHz);
          const midi = target ? foldPitchToReferenceOctave(detectedMidi, target.midi) : detectedMidi;
          const nearTarget = Boolean(target)
            && Math.abs(midi - target!.midi) <= NEAR_TARGET_MAX_SEMITONES
            && detection.confidence >= NEAR_TARGET_CONFIDENCE
            && detection.rms >= NEAR_TARGET_MIN_RMS;
          const gate = updateAdaptiveNoiseGate(gateRef.current, detection, {
            calibrating: !current.isPlaying,
            minConfidence: target ? NEAR_TARGET_CONFIDENCE : MIN_PITCH_CONFIDENCE,
          });
          gateRef.current = gate.state;
          if ((gate.accepted || nearTarget) && current.isPlaying) {
            if (targetMidiRef.current !== (target?.midi ?? null)) {
              recentRef.current = [];
              smoothedRef.current = null;
              targetMidiRef.current = target?.midi ?? null;
            }
            recentRef.current = [...recentRef.current, midi].slice(-3);
            const sorted = [...recentRef.current].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const previous = smoothedRef.current;
            const smoothed = previous === null || now - lastAcceptedAt > 220
              ? median
              : previous + (median - previous) * 0.48;
            smoothedRef.current = smoothed;
            lastAcceptedAt = now;
            if (beat >= current.exerciseStartBeat && beat <= current.exerciseEndBeat) {
              setPoints((existing) => [...existing, { beat, midi: smoothed }].slice(-500));
            }
          }
        }
        frameRef.current = requestAnimationFrame(analyze);
      };
      analyze();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const embedded = window.self !== window.top;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus(embedded
          ? "Microphone access is blocked by this embedded browser. Open this page in Chrome, Edge, or Safari"
          : "Microphone permission was denied. Allow microphone access in the browser's site settings and try again");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus("No microphone was found");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setStatus("The microphone is already in use or unavailable");
      } else {
        setStatus("Could not start the microphone");
      }
    }
  }, []);

  React.useEffect(() => {
    recentRef.current = [];
    smoothedRef.current = null;
    targetMidiRef.current = null;
    setPoints([]);
  }, [input.repetitionIndex]);
  React.useEffect(() => stop, [stop]);

  return { isListening, status, points, start, stop, clear: () => setPoints([]) };
}
