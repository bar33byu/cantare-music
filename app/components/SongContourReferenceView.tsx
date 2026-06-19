"use client";

import React from "react";
import type { PitchContourNote, Segment, Song } from "../types";
import type { MidiSegmentAnswerKey } from "../lib/midiGuidedTapPractice";
import { withUserIdHeader } from "../lib/userContext";
import { PitchContourThumbnail } from "./PitchContourThumbnail";

interface SongContourReferenceViewProps {
  song: Song;
  userId?: string;
  breadcrumbLabel?: string;
  onBack: () => void;
}

const MIN_REFERENCE_NOTE_DURATION_MS = 80;

function getMidiContourNotes(answerKey?: MidiSegmentAnswerKey): PitchContourNote[] {
  if (!answerKey || answerKey.notes.length === 0) {
    return [];
  }

  const pitches = answerKey.notes.map((note) => note.midiPitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const pitchRange = Math.max(1, maxPitch - minPitch);

  return answerKey.notes.map((note) => ({
    id: `midi-contour-${answerKey.segmentId}-${note.sourceWholeSongNoteIndex}`,
    timeOffsetMs: Math.max(0, Math.round(note.segmentLocalStartTimeSeconds * 1000)),
    durationMs: Math.max(MIN_REFERENCE_NOTE_DURATION_MS, Math.round(note.effectiveDurationSeconds * 1000)),
    lane: Math.min(1, Math.max(0, (note.midiPitch - minPitch) / pitchRange)),
  }));
}

function getSegmentContourNotes(
  segment: Segment,
  midiSegmentAnswerKeys: Record<string, MidiSegmentAnswerKey>
): PitchContourNote[] {
  if ((segment.pitchContourNotes?.length ?? 0) > 0) {
    return segment.pitchContourNotes ?? [];
  }

  return getMidiContourNotes(midiSegmentAnswerKeys[segment.id]);
}

function getSegmentDurationMs(segment: Segment): number {
  return Math.max(1, segment.endMs - segment.startMs);
}

export function SongContourReferenceView({
  song,
  userId,
  breadcrumbLabel = "Practice",
  onBack,
}: SongContourReferenceViewProps) {
  const [midiSegmentAnswerKeys, setMidiSegmentAnswerKeys] = React.useState<Record<string, MidiSegmentAnswerKey>>({});
  const [isMidiLoading, setIsMidiLoading] = React.useState(false);
  const [midiLoadFailed, setMidiLoadFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setIsMidiLoading(true);
    setMidiLoadFailed(false);
    setMidiSegmentAnswerKeys({});

    const loadMidiStatus = async () => {
      try {
        const response = await fetch(`/api/songs/${song.id}/midi`, withUserIdHeader({ cache: "no-store" }, userId));
        if (!response.ok) {
          throw new Error(`Failed to load MIDI contour (${response.status})`);
        }
        const payload = await response.json() as { segmentAnswerKeys?: Record<string, MidiSegmentAnswerKey> };
        if (!cancelled) {
          setMidiSegmentAnswerKeys(payload.segmentAnswerKeys ?? {});
        }
      } catch {
        if (!cancelled) {
          setMidiLoadFailed(true);
        }
      } finally {
        if (!cancelled) {
          setIsMidiLoading(false);
        }
      }
    };

    void loadMidiStatus();

    return () => {
      cancelled = true;
    };
  }, [song.id, userId]);

  const segmentRows = React.useMemo(
    () => song.segments.map((segment) => ({
      segment,
      notes: getSegmentContourNotes(segment, midiSegmentAnswerKeys),
    })),
    [midiSegmentAnswerKeys, song.segments]
  );
  const segmentRowsWithContour = segmentRows.filter((row) => row.notes.length > 0);
  const hasAnyContour = segmentRowsWithContour.length > 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-6xl print:max-w-none">
        <header className="mb-4 flex items-start justify-between gap-3 print:mb-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-indigo-500 hover:text-indigo-700 print:hidden"
            >
              <span aria-hidden="true" className="text-base leading-none">&#x2190;</span>
              {breadcrumbLabel}
            </button>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700 print:hidden">
              Contour reference
            </p>
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950 md:text-4xl print:text-2xl">
              {song.title}
            </h1>
            {song.artist ? (
              <p className="mt-1 text-sm text-slate-600 print:text-xs">{song.artist}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm transition hover:border-indigo-500 hover:bg-indigo-50 print:hidden"
            aria-label="Print contour reference"
            title="Print contour reference"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
          </button>
        </header>

        {!hasAnyContour && isMidiLoading ? (
          <div className="rounded-lg border border-indigo-100 bg-white p-6 text-sm text-slate-600 shadow-sm print:hidden">
            Loading contour reference...
          </div>
        ) : null}

        {!hasAnyContour && !isMidiLoading ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm print:border-gray-300 print:bg-white">
            {midiLoadFailed
              ? "Unable to load contour data right now."
              : "No contour data is available for this song yet."}
          </div>
        ) : null}

        {hasAnyContour ? (
          <div className="space-y-3 print:space-y-2">
            {segmentRowsWithContour.map(({ segment, notes }) => (
              <section
                key={segment.id}
                data-testid={`contour-reference-card-${segment.id}`}
                className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-3 shadow-sm print:border-slate-300 print:p-2 print:shadow-none"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] print:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] print:gap-2">
                  <div className="min-w-0">
                    <h2 className="mb-2 truncate text-base font-semibold text-slate-900 print:text-sm">
                      {segment.label}
                    </h2>
                    <PitchContourThumbnail
                      notes={notes}
                      segmentDurationMs={getSegmentDurationMs(segment)}
                      className="h-20 rounded-md border-indigo-200 bg-indigo-50/60 print:h-14"
                    />
                  </div>
                  {segment.lyricText.trim() ? (
                    <div className="hidden min-w-0 border-l border-slate-200 pl-3 text-sm leading-6 text-slate-700 lg:block print:block print:pl-2 print:text-xs print:leading-5">
                      <p className="whitespace-pre-wrap">{segment.lyricText}</p>
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
