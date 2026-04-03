"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Segment } from '../types/index';
import { ReplaceAudioForm } from './ReplaceAudioForm';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { buildProxyAudioUrl, parseAudioKey, toPlayableAudioUrl } from '../lib/audioUrls';
import { getDefaultNewSegmentPlacement, getPlaybackAnchoredNewSegmentPlacement } from '../lib/segmentTiming';

const MIN_SEGMENT_MS = 1000;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

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
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const [songTitle, setSongTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [showReplaceAudio, setShowReplaceAudio] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [lastDeletedSection, setLastDeletedSection] = useState<Segment | null>(null);
  const [undoDismissTimer, setUndoDismissTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stableDurationMs, setStableDurationMs] = useState(0);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSeparator, setBulkSeparator] = useState('***');
  const [replaceExistingOnBulk, setReplaceExistingOnBulk] = useState(true);
  const [bulkImportPending, setBulkImportPending] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const proxyAudioUrl = useMemo(() => buildProxyAudioUrl(parseAudioKey(audioUrl)), [audioUrl]);
  const playbackAudioUrl = useMemo(() => {
    if (useProxyFallback && proxyAudioUrl) {
      return proxyAudioUrl;
    }
    return toPlayableAudioUrl(audioUrl);
  }, [audioUrl, proxyAudioUrl, useProxyFallback]);

  const { isPlaying, isReady, currentMs, durationMs, playbackError, play, pause, seek } = useAudioPlayer(playbackAudioUrl);

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

  const getNextSectionNumber = () => {
    const numbers = segments
      .map((s) => {
        const match = s.label.match(/Section (\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);
    return Math.max(0, ...numbers) + 1;
  };

  const createSegment = async () => {
    const basePlacement = isReady
      ? getPlaybackAnchoredNewSegmentPlacement(segments, currentMs)
      : getDefaultNewSegmentPlacement(segments);

    const payload = {
      id: crypto.randomUUID(),
      label: `Section ${getNextSectionNumber()}`,
      startMs: Math.round(basePlacement.startMs),
      endMs: Math.round(basePlacement.endMs),
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
      setDeleteError('Failed to create section. Please try again.');
    }
  };

  const parseBulkSections = (text: string, separator: string): string[] => {
    const normalizedSeparator = separator.trim();
    if (!normalizedSeparator) {
      return [];
    }

    return text
      .split(normalizedSeparator)
      .map((section) => section.trim())
      .filter((section) => section.length > 0);
  };

  const buildBulkTimings = (sectionCount: number, totalDurationMs: number) => {
    const safeTotalDuration = Math.max(totalDurationMs, sectionCount * MIN_SEGMENT_MS);

    return Array.from({ length: sectionCount }, (_, index) => {
      const startMs = Math.round((index * safeTotalDuration) / sectionCount);
      const endMs = index === sectionCount - 1
        ? safeTotalDuration
        : Math.round(((index + 1) * safeTotalDuration) / sectionCount);

      return {
        startMs,
        endMs: Math.max(endMs, startMs + MIN_SEGMENT_MS),
      };
    });
  };

  const handleBulkImport = async () => {
    setDeleteError(null);

    const sections = parseBulkSections(bulkText, bulkSeparator);
    if (sections.length === 0) {
      setDeleteError('Bulk import needs at least one section split by the separator.');
      return;
    }

    setBulkImportPending(true);
    let successfulOperations = 0;

    const readErrorMessage = async (response: Response, fallback: string) => {
      try {
        const payload = (await response.json()) as { error?: string };
        return payload.error || fallback;
      } catch {
        return fallback;
      }
    };

    const requestWithRetry = async (
      makeRequest: () => Promise<Response>,
      retries: number = 2
    ): Promise<Response> => {
      let lastResponse: Response | null = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const response = await makeRequest();
        if (response.ok) {
          return response;
        }
        lastResponse = response;
      }

      if (lastResponse) {
        return lastResponse;
      }

      throw new Error('Request failed before receiving a response.');
    };

    try {
      const timings = buildBulkTimings(sections.length, timelineDurationMs);

      if (replaceExistingOnBulk) {
        const orderedExisting = [...segments].sort((a, b) => a.order - b.order);

        for (let i = 0; i < sections.length; i += 1) {
          const existing = orderedExisting[i];

          if (existing) {
            const patchResponse = await requestWithRetry(() =>
              fetch(`/api/songs/${songId}/segments/${existing.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  label: `Section ${i + 1}`,
                  startMs: timings[i].startMs,
                  endMs: timings[i].endMs,
                  lyricText: sections[i],
                }),
              })
            );

            if (!patchResponse.ok) {
              const message = await readErrorMessage(
                patchResponse,
                `Failed to update section ${i + 1}.`
              );
              throw new Error(message);
            }
            successfulOperations += 1;
            continue;
          }

          const createResponse = await requestWithRetry(() =>
            fetch(`/api/songs/${songId}/segments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                label: `Section ${i + 1}`,
                startMs: timings[i].startMs,
                endMs: timings[i].endMs,
                lyricText: sections[i],
              }),
            })
          );

          if (!createResponse.ok) {
            const message = await readErrorMessage(
              createResponse,
              `Failed to create section ${i + 1}.`
            );
            throw new Error(message);
          }
          successfulOperations += 1;
        }

        // Best-effort cleanup of extra trailing sections beyond the imported count.
        // If deletes fail (for example due to historical rating references), keep them.
        for (let i = sections.length; i < orderedExisting.length; i += 1) {
          const extra = orderedExisting[i];
          const deleteResponse = await fetch(`/api/songs/${songId}/segments/${extra.id}`, {
            method: 'DELETE',
          });
          if (!deleteResponse.ok) {
            // Non-fatal: preserve extras instead of failing the whole import.
            break;
          }
        }
      } else {
        for (let i = 0; i < sections.length; i += 1) {
          const createResponse = await requestWithRetry(() =>
            fetch(`/api/songs/${songId}/segments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                label: `Section ${i + 1}`,
                startMs: timings[i].startMs,
                endMs: timings[i].endMs,
                lyricText: sections[i],
              }),
            })
          );

          if (!createResponse.ok) {
            const message = await readErrorMessage(
              createResponse,
              `Failed to create section ${i + 1}.`
            );
            throw new Error(message);
          }
          successfulOperations += 1;
        }
      }

      setShowBulkImport(false);
      setBulkText('');
      setRefreshKey((previous) => previous + 1);
      setSelectedSegmentId(null);
    } catch (error) {
      if (successfulOperations > 0) {
        setDeleteError('Bulk import partially completed. New sections were created; reloading timeline.');
        setShowBulkImport(false);
        setRefreshKey((previous) => previous + 1);
      } else {
        const message = error instanceof Error ? error.message : 'Bulk import failed. Please review the separator and try again.';
        setDeleteError(message);
      }
    } finally {
      setBulkImportPending(false);
    }
  };

  const dismissUndo = () => {
    setLastDeletedSection(null);
    setUndoDismissTimer(null);
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
      // Stash for undo, auto-dismiss after 10s
      setLastDeletedSection(segment);
      if (undoDismissTimer) clearTimeout(undoDismissTimer);
      setUndoDismissTimer(setTimeout(dismissUndo, 10_000));
      setRefreshKey((prev) => prev + 1);
    } catch {
      setDeleteError('Failed to delete section. Please try again.');
    }
  };

  const handleUndoDelete = async () => {
    if (!lastDeletedSection) return;
    const restored = lastDeletedSection;
    dismissUndo();
    try {
      const response = await fetch(`/api/songs/${songId}/segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: restored.id,
          label: restored.label,
          startMs: Math.round(restored.startMs),
          endMs: Math.round(restored.endMs),
          lyricText: restored.lyricText,
        }),
      });
      if (!response.ok) throw new Error('Restore failed');
      setSelectedSegmentId(restored.id);
      setRefreshKey((prev) => prev + 1);
    } catch {
      setDeleteError('Failed to restore section. Please try again.');
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
      setDeleteError('Failed to save section timing. Please try again.');
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

  useEffect(() => {
    setUseProxyFallback(false);
  }, [songId]);

  useEffect(() => {
    if (!playbackError || useProxyFallback || !proxyAudioUrl) {
      return;
    }
    setUseProxyFallback(true);
  }, [playbackError, proxyAudioUrl, useProxyFallback]);

  // Clean up undo timer on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (undoDismissTimer) clearTimeout(undoDismissTimer);
    };
  }, [undoDismissTimer]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      pause();
      return;
    }
    const safeDuration = timelineDurationMs > 0 ? timelineDurationMs : Number.POSITIVE_INFINITY;
    const startMs = Math.max(0, Math.min(currentMs, safeDuration));
    play(startMs, safeDuration);
  };

  const handleSkipBy = (deltaMs: number) => {
    const safeDuration = timelineDurationMs > 0 ? timelineDurationMs : Math.max(durationMs, currentMs, 0);
    const targetMs = Math.max(0, Math.min(safeDuration, currentMs + deltaMs));
    seek(targetMs);
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

      {lastDeletedSection && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>Section &ldquo;{lastDeletedSection.label}&rdquo; deleted.</span>
          <button
            type="button"
            data-testid="segment-editor-undo-delete"
            onClick={() => { void handleUndoDelete(); }}
            className="font-semibold underline hover:no-underline"
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissUndo}
            className="ml-auto text-amber-600 hover:text-amber-900"
          >
            ✕
          </button>
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
            <button
              type="button"
              data-testid="segment-editor-bulk-open"
              onClick={() => {
                setDeleteError(null);
                setShowBulkImport((previous) => !previous);
              }}
              className="px-3 py-1 border border-indigo-300 text-indigo-700 text-sm rounded hover:bg-indigo-50"
            >
              Bulk Lyrics
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

        <div className="mb-3 flex flex-col items-center gap-2 rounded-lg bg-indigo-50/40 p-3">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              data-testid="segment-editor-skip-back"
              onClick={() => handleSkipBy(-5000)}
              aria-label="Skip backward 5 seconds"
              disabled={!isReady}
              className="flex h-8 w-[76px] items-center justify-center rounded-xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 text-xs"
            >
              <span className="inline-flex items-center gap-1 font-semibold">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 8H5v4" />
                  <path d="M5 12a7 7 0 1 0 2-5" />
                </svg>
                <span>-5s</span>
              </span>
            </button>
            <button
              type="button"
              data-testid="segment-editor-play-toggle"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="h-8 w-12 rounded-xl bg-indigo-600 text-base text-white hover:bg-indigo-700"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              data-testid="segment-editor-skip-forward"
              onClick={() => handleSkipBy(5000)}
              aria-label="Skip forward 5 seconds"
              disabled={!isReady}
              className="flex h-8 w-[76px] items-center justify-center rounded-xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 text-xs"
            >
              <span className="inline-flex items-center gap-1 font-semibold">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 8h4v4" />
                  <path d="M19 12a7 7 0 1 1-2-5" />
                </svg>
                <span>+5s</span>
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span data-testid="segment-editor-current-ms">{formatMs(currentMs)}</span>
            <span className="text-gray-400">/</span>
            <span>{formatMs(timelineDurationMs)}</span>
            {savingSegmentId ? <span className="text-indigo-600">Saving...</span> : null}
          </div>
        </div>

        {showBulkImport ? (
          <div data-testid="segment-editor-bulk-panel" className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="mb-2 grid gap-2 md:grid-cols-[1fr,180px]">
              <label className="text-xs font-semibold text-indigo-800">
                Separator token
                <input
                  data-testid="segment-editor-bulk-separator"
                  value={bulkSeparator}
                  onChange={(event) => setBulkSeparator(event.target.value)}
                  className="mt-1 w-full rounded border border-indigo-300 bg-white px-2 py-1 text-sm"
                  placeholder="***"
                />
              </label>
              <label className="mt-5 inline-flex items-center gap-2 text-xs text-indigo-900">
                <input
                  data-testid="segment-editor-bulk-replace"
                  type="checkbox"
                  checked={replaceExistingOnBulk}
                  onChange={(event) => setReplaceExistingOnBulk(event.target.checked)}
                />
                Replace existing sections
              </label>
            </div>
            <label className="block text-xs font-semibold text-indigo-800">Paste all lyrics</label>
            <textarea
              data-testid="segment-editor-bulk-text"
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={[
                'Verse 1 line 1',
                'Verse 1 line 2',
                '***',
                'Verse 2 line 1',
                'Verse 2 line 2',
              ].join('\n')}
              className="mt-1 h-36 w-full rounded border border-indigo-300 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-indigo-700">
              Default separator is <strong>***</strong>. Each block becomes one section, spaced evenly across the full song.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                data-testid="segment-editor-bulk-submit"
                onClick={() => { void handleBulkImport(); }}
                disabled={bulkImportPending}
                className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {bulkImportPending ? 'Creating sections...' : 'Create sections'}
              </button>
              <button
                type="button"
                data-testid="segment-editor-bulk-cancel"
                onClick={() => setShowBulkImport(false)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

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
                  height: lane === 0 ? 'calc(100% - 76px)' : 'calc(100% - 44px)',
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
                  {editingLabelId === segment.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={segment.label}
                      onChange={(event) => updateLocalSegment(segment.id, { label: event.target.value })}
                      onBlur={() => {
                        void saveSegmentPatch(segment.id, { label: segment.label });
                        setEditingLabelId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void saveSegmentPatch(segment.id, { label: segment.label });
                          setEditingLabelId(null);
                        }
                        if (event.key === 'Escape') {
                          setEditingLabelId(null);
                        }
                      }}
                      className="text-center text-sm font-semibold text-indigo-900 rounded border border-indigo-400 px-1 py-0.5"
                    />
                  ) : (
                    <label
                      onClick={() => setEditingLabelId(segment.id)}
                      className="text-center text-sm font-semibold text-indigo-900 cursor-pointer hover:bg-indigo-50 rounded px-1 py-0.5"
                    >
                      {segment.label}
                    </label>
                  )}
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
                  <div className="flex justify-center">
                    <button
                      type="button"
                      data-testid={`segment-delete-${segment.id}`}
                      onClick={() => {
                        void handleDelete(segment);
                      }}
                      className="h-8 w-8 rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"
                      aria-label={`Delete ${segment.label}`}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
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

    </div>
  );
}
