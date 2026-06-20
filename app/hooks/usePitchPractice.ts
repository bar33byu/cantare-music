"use client";

import * as React from "react";
import type { MidiSegmentAnswerKey } from "../lib/midiGuidedTapPractice";
import {
  centsBetween,
  detectPitchYin,
  findMidiNoteAtOffset,
  frequencyToMidi,
  getAdaptivePitchTiming,
  mergeVoicePitchAttempt,
  midiToFrequency,
  midiToPitchName,
  scoreVoicePitchAttempts,
  updatePitchStability,
  type PitchStabilityState,
  type VoicePitchAttempt,
} from "../lib/pitchPractice";

export type PitchPracticeStatus = "off" | "starting" | "listening" | "quiet" | "error";

function microphoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied. Allow microphone access and try Sing again.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The microphone is already in use or unavailable.";
  return "Cantare could not start the microphone.";
}

export function usePitchPractice(input: {
  enabled: boolean;
  isPlaying: boolean;
  currentMs: number;
  getCurrentMs?: () => number;
  segmentStartMs: number;
  answerKey: MidiSegmentAnswerKey | null;
  resetToken: number;
}) {
  const [status, setStatus] = React.useState<PitchPracticeStatus>("off");
  const [error, setError] = React.useState<string | null>(null);
  const [attempts, setAttempts] = React.useState<VoicePitchAttempt[]>([]);
  const [attemptSegmentId, setAttemptSegmentId] = React.useState<string | null>(input.answerKey?.segmentId ?? null);
  const [live, setLive] = React.useState<{ detectedMidiPitch: number; detectedName: string; targetMidiPitch?: number; targetName?: string; centsError?: number; level: number } | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const contextRef = React.useRef<AudioContext | null>(null);
  const animationRef = React.useRef<number | null>(null);
  const stabilityRef = React.useRef<PitchStabilityState>({ frames: [] });
  const targetNoteIndexRef = React.useRef<number | null>(null);
  const inputRef = React.useRef(input);
  React.useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const stop = React.useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    stabilityRef.current = { frames: [] };
    setLive(null);
  }, []);

  React.useEffect(() => {
    if (!input.enabled) {
      stop();
      setStatus("off");
      setError(null);
      return;
    }
    if (typeof window === "undefined" || !window.isSecureContext) {
      setStatus("error");
      setError("Sing requires a secure HTTPS connection.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("This browser does not support microphone pitch practice.");
      return;
    }
    const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setStatus("error");
      setError("This browser does not support Web Audio pitch detection.");
      return;
    }

    let cancelled = false;
    setStatus("starting");
    setError(null);
    void navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    }).then(async (stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContextConstructor();
      if (context.state === "suspended") await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      const samples = new Float32Array(analyser.fftSize);
      let quietSince = performance.now();
      let lastAnalysisAt = 0;

      const analyze = () => {
        if (cancelled) return;
        const now = performance.now();
        if (now - lastAnalysisAt < 40) {
          animationRef.current = requestAnimationFrame(analyze);
          return;
        }
        lastAnalysisAt = now;
        analyser.getFloatTimeDomainData(samples);
        const current = inputRef.current;
        if (!current.isPlaying || !current.answerKey) {
          stabilityRef.current = { frames: [] };
          targetNoteIndexRef.current = null;
          setStatus("listening");
        } else {
          const liveCurrentMs = current.getCurrentMs?.() ?? current.currentMs;
          const offsetMs = liveCurrentMs - current.segmentStartMs;
          const targetNote = findMidiNoteAtOffset(current.answerKey, offsetMs, 0);
          const timing = targetNote ? getAdaptivePitchTiming(targetNote.effectiveDurationSeconds * 1000) : null;
          const scoringNote = targetNote && timing
            ? findMidiNoteAtOffset(current.answerKey, offsetMs, timing.transitionGraceMs)
            : null;
          if (targetNote && targetNoteIndexRef.current !== targetNote.sourceWholeSongNoteIndex) {
            stabilityRef.current = { frames: [] };
            targetNoteIndexRef.current = targetNote.sourceWholeSongNoteIndex;
          }
          const broadDetection = detectPitchYin(samples, context.sampleRate);
          const guidedDetection = targetNote ? detectPitchYin(samples, context.sampleRate, {
            minFrequencyHz: midiToFrequency(targetNote.midiPitch - 2),
            maxFrequencyHz: midiToFrequency(targetNote.midiPitch + 2),
          }) : null;
          const detection = guidedDetection ?? broadDetection;
          if (!detection) {
            if (now - quietSince > 1500) setStatus("quiet");
            animationRef.current = requestAnimationFrame(analyze);
            return;
          }
          quietSince = now;
          setStatus("listening");
          const detectedMidiPitch = frequencyToMidi(detection.frequencyHz);
          const stability = scoringNote ? updatePitchStability(stabilityRef.current, {
            atMs: now,
            midiPitch: detectedMidiPitch,
            confidence: detection.confidence,
            rms: detection.rms,
          }, { stabilityMs: timing?.stabilityMs, windowMs: scoringNote.effectiveDurationSeconds * 1000 }) : { state: stabilityRef.current, stableMidiPitch: null };
          stabilityRef.current = stability.state;
          const centsError = targetNote ? centsBetween(detectedMidiPitch, targetNote.midiPitch) : undefined;
          setLive({
            detectedMidiPitch,
            detectedName: midiToPitchName(detectedMidiPitch),
            targetMidiPitch: targetNote?.midiPitch,
            targetName: targetNote?.pitchName,
            centsError,
            level: detection.rms,
          });
          if (scoringNote && stability.stableMidiPitch !== null) {
            const stableMidiPitch = stability.stableMidiPitch;
            const stableCentsError = centsBetween(stableMidiPitch, scoringNote.midiPitch);
            setAttemptSegmentId(current.answerKey.segmentId);
            setAttempts((previous) => mergeVoicePitchAttempt(previous, {
              sourceWholeSongNoteIndex: scoringNote.sourceWholeSongNoteIndex,
              detectedMidiPitch: stableMidiPitch,
              centsError: stableCentsError,
            }));
          }
        }
        animationRef.current = requestAnimationFrame(analyze);
      };
      analyze();
    }).catch((caught) => {
      if (!cancelled) {
        setStatus("error");
        setError(microphoneError(caught));
      }
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [input.enabled, stop]);

  React.useEffect(() => {
    setAttempts([]);
    setAttemptSegmentId(input.answerKey?.segmentId ?? null);
    stabilityRef.current = { frames: [] };
  }, [input.answerKey?.segmentId, input.resetToken]);

  const score = React.useMemo(
    () => input.answerKey && attemptSegmentId === input.answerKey.segmentId ? scoreVoicePitchAttempts(input.answerKey, attempts) : null,
    [attemptSegmentId, attempts, input.answerKey]
  );

  return { status, error, attempts, score, live, clear: () => setAttempts([]), stop };
}
