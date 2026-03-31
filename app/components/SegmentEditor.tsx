"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Segment } from '../types/index';
import { ReplaceAudioForm } from './ReplaceAudioForm';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { getDefaultNewSegmentPlacement, getPlaybackAnchoredNewSegmentPlacement } from '../lib/segmentTiming';

const MIN_SEGMENT_MS = 1000;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

type ResizeEdge = 'start' | 'end';

interface ActiveInteraction {
  segmentId: string;
  type: 'resize' | 'move';
  edge?: ResizeEdge;
  startClientX: number;
  initialStartMs: number;
  initialEndMs: number;
  pointerId: number;
}

interface SegmentEditorProps {
  songId: string;
  onBack?: () => void;
  onSongUpdated?: () => void;
}

export function SegmentEditor({ songId, onBack, onSongUpdated }: SegmentEditorProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [showReplaceAudio, setShowReplaceAudio] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [stableDurationMs, setStableDurationMs] = useState(0);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const { isPlaying, isReady, currentMs, durationMs, play, pause, seek } = useAudioPlayer(audioUrl);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId]
  );

  const updateLocalSegment = (segmentId: string, updates: Partial<Segment>) => {
    setSegments((previous) =>
      previous.map((segment) => (segment.id === segmentId ? { ...segment, ...updates } : segment))
    );
  };

  const saveSegmentPatch = async (segmentId: string, updates: Partial<Segment>) => {
    try {
      setSavingSegmentId(segmentId);
      const response = await fetch(`/api/songs/${songId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Patch failed');
      }

      setRefreshKey((previous) => previous + 1);
    } finally {
      setSavingSegmentId(null);
    }
  };

  const createSegment = async () => {
    const basePlacement = isReady
      ? getPlaybackAnchoredNewSegmentPlacement(segments, currentMs)
      : getDefaultNewSegmentPlacement(segments);

    const payload = {
      id: crypto.randomUUID(),
      label: `Section ${segments.length + 1}`,
      startMs: basePlacement.startMs,
      endMs: basePlacement.endMs,
      lyricText: '',
    };

    const response = await fetch(`/api/songs/${songId}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Create failed');
    }

    setSelectedSegmentId(payload.id);
    setRefreshKey((previous) => previous + 1);
  };

  const handleAddNew = async () => {
    setDeleteError(null);
    try {
      await createSegment();
    } catch {
      setDeleteError('Failed to create segment. Please try again.');
    }
  };

  const handleDelete = async (segment: Segment) => {
    setDeleteError(null);
    try {
      const response = await fetch(`/api/songs/${songId}/segments/${segment.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      if (selectedSegmentId === segment.id) {
        setSelectedSegmentId(null);
      }
      setRefreshKey((prev) => prev + 1);
    } catch {
      setDeleteError('Failed to delete segment. Please try again.');
    }
  };

  const timelineDurationMs = useMemo(() => {
    const maxEnd = Math.max(0, ...segments.map((segment) => segment.endMs));
    const maxPlaybackDuration = Math.max(0, durationMs, stableDurationMs);
    const candidate = Math.max(maxEnd, maxPlaybackDuration);
    return candidate > 0 ? candidate : 60000;
  }, [durationMs, segments, stableDurationMs]);

  const zoomPercent = Math.round(zoom * 100);

  const orderedSegments = useMemo(
    () => [...segments].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id)),
    [segments]
  );

  const msFromClientX = (clientX: number): number => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || timelineDurationMs <= 0) {
      return 0;
    }
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * timelineDurationMs);
  };

  const handleInteractionMove = (clientX: number, pointerId: number) => {
    if (!activeInteraction || pointerId !== activeInteraction.pointerId) {
      return;
    }

    const rawMs = msFromClientX(clientX);
    const target = segments.find((segment) => segment.id === activeInteraction.segmentId);
    if (!target) {
      return;
    }

    if (activeInteraction.type === 'move') {
      const startPointerMs = msFromClientX(activeInteraction.startClientX);
      const deltaMs = rawMs - startPointerMs;
      const segmentDuration = activeInteraction.initialEndMs - activeInteraction.initialStartMs;
      const maxStart = Math.max(0, timelineDurationMs - segmentDuration);
      const nextStartMs = Math.max(0, Math.min(maxStart, activeInteraction.initialStartMs + deltaMs));
      const nextEndMs = nextStartMs + segmentDuration;
      updateLocalSegment(target.id, { startMs: nextStartMs, endMs: nextEndMs });
      return;
    }

    if (activeInteraction.edge === 'start') {
      const nextStartMs = Math.max(0, Math.min(rawMs, target.endMs - MIN_SEGMENT_MS));
      updateLocalSegment(target.id, { startMs: nextStartMs });
      return;
    }

    const nextEndMs = Math.min(timelineDurationMs, Math.max(rawMs, target.startMs + MIN_SEGMENT_MS));
    updateLocalSegment(target.id, { endMs: nextEndMs });
  };

  const finishInteraction = async (pointerId: number) => {
    if (!activeInteraction || pointerId !== activeInteraction.pointerId) {
      return;
    }

    const target = segments.find((segment) => segment.id === activeInteraction.segmentId);
    setActiveInteraction(null);
    if (!target) {
      return;
    }

    try {
      await saveSegmentPatch(target.id, { startMs: target.startMs, endMs: target.endMs });
    } catch {
      setDeleteError('Failed to save segment timing. Please try again.');
    }
  };

  useEffect(() => {
    if (!activeInteraction) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      handleInteractionMove(event.clientX, event.pointerId);
    };

    const handlePointerDone = (event: PointerEvent) => {
      void finishInteraction(event.pointerId);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerDone);
    window.addEventListener('pointercancel', handlePointerDone);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerDone);
      window.removeEventListener('pointercancel', handlePointerDone);
    };
  }, [activeInteraction, finishInteraction, handleInteractionMove]);

  useEffect(() => {
    if (durationMs > 0) {
      setStableDurationMs((previous) => Math.max(previous, durationMs));
    }
  }, [durationMs]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      pause();
      return;
    }
    const safeDuration = timelineDurationMs > 0 ? timelineDurationMs : Number.POSITIVE_INFINITY;
    const startMs = Math.max(0, Math.min(currentMs, safeDuration));
    play(startMs, safeDuration);
  };

  useEffect(() => {
    let cancelled = false;

    const loadSegments = async () => {
      try {
        const response = await fetch(`/api/songs/${songId}/segments`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Segment[];
        if (!cancelled) {
          setSegments(data.sort((a, b) => a.order - b.order));
        }
      } catch {
        // SegmentList owns user-facing fetch errors, so this stays silent.
      }
    };

    void loadSegments();

    return () => {
      cancelled = true;
    };
  }, [songId, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    const loadSong = async () => {
      try {
        const response = await fetch(`/api/songs/${songId}`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { audioUrl?: string; title?: string };
        if (!cancelled) {
          setAudioUrl(data.audioUrl ?? '');
          setSongTitle(data.title ?? '');
          setTitleDraft(data.title ?? '');
        }
      } catch {
        if (!cancelled) {
          setAudioUrl('');
        }
      }
    };

    void loadSong();

    return () => {
      cancelled = true;
    };
  }, [songId]);

  const saveSongTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === songTitle) return;
    setSavingTitle(true);
    try {
      const response = await fetch(`/api/songs/${songId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (response.ok) {
        setSongTitle(trimmed);
        onSongUpdated?.();
      }
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Edit Song</h2>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              ← Back to Practice
            </button>
          )}
        </div>
      </div>

      {/* Song title */}
      <div className="mb-4 rounded-lg border border-indigo-100 bg-white p-4 shadow-sm">
        <label className="block text-xs font-semibold text-indigo-700 mb-1">Song title</label>
        <div className="flex items-center gap-2">
          <input
            data-testid="segment-editor-title-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => { void saveSongTitle(); }}
            onKeyDown={(event) => { if (event.key === 'Enter') { void saveSongTitle(); } }}
            className="flex-1 rounded border border-indigo-200 px-3 py-1.5 text-base font-medium text-gray-900"
            placeholder="Song title"
          />
          {savingTitle && <span className="text-xs text-indigo-500">Saving…</span>}
        </div>
      </div>

      {/* Replace audio (collapsible) */}
      <div className="mb-4">
        <button
          type="button"
          data-testid="segment-editor-replace-audio-toggle"
          onClick={() => setShowReplaceAudio((previous) => !previous)}
          className="text-sm text-indigo-600 hover:underline"
        >
          {showReplaceAudio ? '▲ Hide audio replacement' : '▼ Replace audio file'}
        </button>
        {showReplaceAudio && (
          <div className="mt-2">
            <ReplaceAudioForm songId={songId} onReplaced={onSongUpdated} />
          </div>
        )}
      </div>

      {deleteError && (
        <div role="alert" className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {deleteError}
        </div>
      )}

      <div className="mb-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-indigo-800">Sections</p>
            <button
              type="button"
              data-testid="segment-editor-new-section"
              onClick={handleAddNew}
              className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              + New section
            </button>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">Drag top bar to move · Drag edges to resize</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="segment-editor-zoom-out"
                onClick={() => setZoom((previous) => Math.max(MIN_ZOOM, previous - ZOOM_STEP))}
                className="h-8 w-8 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                -
              </button>
              <span data-testid="segment-editor-zoom-label" className="w-12 text-center text-xs text-indigo-700">
                {zoomPercent}%
              </span>
              <button
                type="button"
                data-testid="segment-editor-zoom-in"
                onClick={() => setZoom((previous) => Math.min(MAX_ZOOM, previous + ZOOM_STEP))}
                className="h-8 w-8 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-indigo-300">
          <div
            ref={boardRef}
            data-testid="segment-editor-board"
            className="relative h-[560px] min-w-full overflow-hidden bg-gradient-to-b from-indigo-50/40 to-white"
            style={{ width: `${zoomPercent}%` }}
          >
          {orderedSegments.map((segment, index) => {
            const left = (segment.startMs / timelineDurationMs) * 100;
            const width = Math.max(1.5, ((segment.endMs - segment.startMs) / timelineDurationMs) * 100);
            const lane = index % 2;
            const isSelected = segment.id === selectedSegment?.id;
            return (
              <div
                key={segment.id}
                data-testid={`segment-block-${segment.id}`}
                className={[
                  'absolute rounded-md border-2 bg-white/75 backdrop-blur-sm transition-shadow',
                  isSelected ? 'border-indigo-700 shadow-md' : 'border-indigo-400 shadow-sm',
                ].join(' ')}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  top: lane === 0 ? '24px' : '56px',
                  height: lane === 0 ? 'calc(100% - 44px)' : 'calc(100% - 76px)',
                }}
                onClick={() => setSelectedSegmentId(segment.id)}
              >
                <button
                  type="button"
                  aria-label={`Move ${segment.label}`}
                  className="absolute left-0 right-0 top-0 z-20 h-7 cursor-grab border-b border-indigo-300 bg-indigo-100/80 text-xs text-indigo-600/60 select-none"
                  onPointerDown={(event) => {
                    setSelectedSegmentId(segment.id);
                    setActiveInteraction({
                      segmentId: segment.id,
                      type: 'move',
                      pointerId: event.pointerId,
                      startClientX: event.clientX,
                      initialStartMs: segment.startMs,
                      initialEndMs: segment.endMs,
                    });
                  }}
                >
                  ⠿
                </button>
                <button
                  type="button"
                  aria-label={`Resize start ${segment.label}`}
                  className="absolute inset-y-0 left-0 z-30 w-3 cursor-col-resize rounded-l bg-indigo-500/35"
                  onPointerDown={(event) => {
                    setSelectedSegmentId(segment.id);
                    setActiveInteraction({
                      segmentId: segment.id,
                      type: 'resize',
                      edge: 'start',
                      pointerId: event.pointerId,
                      startClientX: event.clientX,
                      initialStartMs: segment.startMs,
                      initialEndMs: segment.endMs,
                    });
                  }}
                />
                <button
                  type="button"
                  aria-label={`Resize end ${segment.label}`}
                  className="absolute inset-y-0 right-0 z-30 w-3 cursor-col-resize rounded-r bg-indigo-500/35"
                  onPointerDown={(event) => {
                    setSelectedSegmentId(segment.id);
                    setActiveInteraction({
                      segmentId: segment.id,
                      type: 'resize',
                      edge: 'end',
                      pointerId: event.pointerId,
                      startClientX: event.clientX,
                      initialStartMs: segment.startMs,
                      initialEndMs: segment.endMs,
                    });
                  }}
                />

                <div className="relative z-10 flex h-full flex-col gap-2 p-2 pt-9">
                  <label className="text-center text-sm font-semibold text-indigo-900">{segment.label}</label>
                  <textarea
                    value={segment.lyricText}
                    onChange={(event) => updateLocalSegment(segment.id, { lyricText: event.target.value })}
                    onBlur={() => {
                      void saveSegmentPatch(segment.id, { lyricText: segment.lyricText });
                    }}
                    className="min-h-[180px] flex-1 rounded border border-indigo-200 px-2 py-2 text-sm leading-5 resize-none overflow-y-auto"
                    placeholder="lyrics"
                  />
                  <div className="mt-auto flex items-center justify-between text-xs text-indigo-700">
                    <span>{Math.floor(segment.startMs / 1000)}s</span>
                    <span>{Math.floor(segment.endMs / 1000)}s</span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      data-testid={`segment-delete-${segment.id}`}
                      onClick={() => {
                        void handleDelete(segment);
                      }}
                      className="h-8 w-8 rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    >
                      X
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {timelineDurationMs > 0 && (
            <div
              data-testid="segment-editor-canvas-playhead"
              className="pointer-events-none absolute inset-y-0 z-40 w-0.5 bg-rose-500/80"
              style={{ left: `${Math.max(0, Math.min(100, (currentMs / timelineDurationMs) * 100))}%` }}
            />
          )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-sm text-indigo-800">
          <span>0:00</span>
          <span>{Math.floor(timelineDurationMs / 60000)}:{String(Math.floor((timelineDurationMs % 60000) / 1000)).padStart(2, '0')}</span>
        </div>

        <div data-testid="segment-editor-song-timeline" className="mt-4 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-3">
          <div className="overflow-x-auto">
            <div className="relative h-5 min-w-full rounded bg-indigo-100" style={{ width: `${zoomPercent}%` }}>
            {orderedSegments.map((segment) => {
              const left = (segment.startMs / timelineDurationMs) * 100;
              const width = Math.max(0.8, ((segment.endMs - segment.startMs) / timelineDurationMs) * 100);
              return (
                <div
                  key={`timeline-${segment.id}`}
                  data-testid={`song-timeline-segment-${segment.id}`}
                  className="absolute inset-y-0 rounded bg-indigo-400/55"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}
            <div
              data-testid="song-timeline-playhead"
              className="absolute inset-y-0 w-0.5 bg-indigo-800"
              style={{ left: `${Math.max(0, Math.min(100, (currentMs / timelineDurationMs) * 100))}%` }}
            />
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={timelineDurationMs}
            step={100}
            value={Math.max(0, Math.min(currentMs, timelineDurationMs))}
            onChange={(event) => seek(Number(event.target.value))}
            data-testid="segment-editor-song-seek"
            className="mt-2 w-full accent-indigo-700"
          />

          <div className="mt-1 flex items-center justify-between text-xs text-indigo-800">
            <span>0:00</span>
            <span>{Math.floor(Math.max(0, currentMs) / 60000)}:{String(Math.floor((Math.max(0, currentMs) % 60000) / 1000)).padStart(2, '0')}</span>
            <span>{Math.floor(timelineDurationMs / 60000)}:{String(Math.floor((timelineDurationMs % 60000) / 1000)).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-indigo-100 bg-white p-4" data-testid="segment-editor-playback-controls">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            data-testid="segment-editor-play-toggle"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-indigo-400 text-lg text-indigo-700 hover:bg-indigo-50"
          >
            {isPlaying ? '||' : '>'}
          </button>
          <span data-testid="segment-editor-current-ms" className="text-sm text-gray-600">
            {Math.floor(currentMs)}
          </span>
          {savingSegmentId ? <span className="text-xs text-indigo-600">Saving...</span> : null}
        </div>
        {selectedSegment ? (
          <div className="grid gap-2 md:grid-cols-[160px,1fr]">
            <label className="text-sm font-medium text-gray-700">Selected label</label>
            <input
              data-testid="segment-editor-label-input"
              value={selectedSegment.label}
              onChange={(event) => updateLocalSegment(selectedSegment.id, { label: event.target.value })}
              onBlur={() => {
                void saveSegmentPatch(selectedSegment.id, { label: selectedSegment.label });
              }}
              className="rounded border border-indigo-200 px-2 py-1 text-sm"
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500">Select a segment block to edit label and lyrics.</p>
        )}
      </div>
    </div>
  );
}
