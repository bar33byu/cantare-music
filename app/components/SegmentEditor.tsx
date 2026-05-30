"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segment } from '../types/index';
import { ReplaceAudioForm } from './ReplaceAudioForm';
import { MidiSetupPanel } from './MidiSetupPanel';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { toPlayableAudioUrl } from '../lib/audioUrls';
import { getPlaybackAnchoredNewSegmentPlacement } from '../lib/segmentTiming';

const MIN_SEGMENT_MS = 1000;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const BULK_IMPORT_ZOOM = 3;
const DEFAULT_TIMELINE_FALLBACK_MS = 60000;
const BULK_DURATION_PROBE_TIMEOUT_MS = 3000;
const BULK_REQUEST_RETRIES = 4;
const BULK_REQUEST_RETRY_DELAY_MS = 250;

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getTouchDistance(touches: TouchList): number {
  if (touches.length < 2) {
    return 0;
  }

  const [first, second] = [touches[0], touches[1]];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
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
  userId?: string;
  onSongUpdated?: () => void;
}

interface EditorDisclosureProps {
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  testId: string;
  toggleTestId?: string;
}

function EditorDisclosure({ title, description, open, onToggle, children, testId, toggleTestId }: EditorDisclosureProps) {
  return (
    <section data-testid={testId} className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        data-testid={toggleTestId ?? `${testId}-toggle`}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-950">{title}</span>
          {description ? <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span> : null}
        </span>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-600">
          {open ? '-' : '+'}
        </span>
      </button>
      {open ? <div className="border-t border-slate-100 px-4 py-3">{children}</div> : null}
    </section>
  );
}

export function SegmentEditor({ songId, userId, onSongUpdated }: SegmentEditorProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [alternateAudioUrl, setAlternateAudioUrl] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [showReplaceAudio, setShowReplaceAudio] = useState(false);
  const [showMidiSetup, setShowMidiSetup] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [lastDeletedSection, setLastDeletedSection] = useState<Segment | null>(null);
  const [undoDismissTimer, setUndoDismissTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stableDurationMs, setStableDurationMs] = useState(0);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSeparator, setBulkSeparator] = useState('');
  const [replaceExistingOnBulk, setReplaceExistingOnBulk] = useState(true);
  const [bulkImportPending, setBulkImportPending] = useState(false);
  const [songLoaded, setSongLoaded] = useState(false);
  const [songLoadKey, setSongLoadKey] = useState(0);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const pinchZoomRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  const hasAnyAudio = Boolean(audioUrl.trim() || alternateAudioUrl.trim());
  const playbackAudioUrl = useMemo(
    () => toPlayableAudioUrl(audioUrl.trim() || alternateAudioUrl.trim()),
    [audioUrl, alternateAudioUrl]
  );

  const audioPlayer = useAudioPlayer(playbackAudioUrl);
  const {
    isPlaying,
    isReady,
    currentMs,
    durationMs,
    play,
    pause,
    seek,
  } = audioPlayer;

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId]
  );

  const withUserHeader = useCallback((init?: RequestInit): RequestInit | undefined => {
    if (!userId) {
      return init;
    }

    const headers = new Headers(init?.headers);
    headers.set('X-User-ID', userId);

    return {
      ...init,
      headers,
    };
  }, [userId]);

  const request = useCallback((url: string, init?: RequestInit) => {
    return fetch(url, withUserHeader(init));
  }, [withUserHeader]);

  const updateLocalSegment = (segmentId: string, updates: Partial<Segment>) => {
    setSegments((previous) =>
      previous.map((segment) => (segment.id === segmentId ? { ...segment, ...updates } : segment))
    );
  };

  const saveSegmentPatch = async (segmentId: string, updates: Partial<Segment>) => {
    try {
      setSavingSegmentId(segmentId);
      const response = await request(`/api/songs/${songId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Patch failed');
      }
    } finally {
      setSavingSegmentId(null);
    }
  };

  const getNextSectionNumber = () => {
    const numbers = segments
      .map((s) => {
        const match = s.label.match(/^(?:Section\s+)?(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);
    return Math.max(0, ...numbers) + 1;
  };

  const createSegment = async () => {
    const basePlacement = getPlaybackAnchoredNewSegmentPlacement(segments, currentMs);

    const payload = {
      id: crypto.randomUUID(),
      label: String(getNextSectionNumber()),
      startMs: Math.round(basePlacement.startMs),
      endMs: Math.round(basePlacement.endMs),
      lyricText: '',
    };

    const response = await request(`/api/songs/${songId}/segments`, {
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
      return text
        .split(/\n\s*\n+/)
        .map((section) => section.trim())
        .filter((section) => section.length > 0);
    }

    return text
      .split(normalizedSeparator)
      .map((section) => section.trim())
      .filter((section) => section.length > 0);
  };

  const buildBulkTimings = (sectionCount: number, totalDurationMs: number) => {
    const gapUnits = 2 + Math.max(0, sectionCount - 1) * 0.5;
    const totalUnits = sectionCount + gapUnits;
    const safeTotalDuration = Math.round(Math.max(totalDurationMs, totalUnits * MIN_SEGMENT_MS));
    const segmentDuration = safeTotalDuration / totalUnits;
    const betweenSegmentGap = segmentDuration / 2;
    let cursorMs = segmentDuration;

    return Array.from({ length: sectionCount }, () => {
      const startMs = Math.round(cursorMs);
      const endMs = Math.round(cursorMs + segmentDuration);
      cursorMs += segmentDuration + betweenSegmentGap;

      return {
        startMs,
        endMs: Math.max(endMs, startMs + MIN_SEGMENT_MS),
      };
    });
  };

  const probeAudioDurationMs = async (url: string): Promise<number | null> => {
    if (!url) {
      return null;
    }

    return new Promise((resolve) => {
      const audio = new Audio(url);
      let settled = false;

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('error', onError);
      };

      const settle = (value: number | null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      const onLoadedMetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          settle(Math.round(audio.duration * 1000));
          return;
        }
        settle(null);
      };

      const onError = () => settle(null);

      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('error', onError);
      audio.load?.();

      window.setTimeout(() => settle(null), BULK_DURATION_PROBE_TIMEOUT_MS);
    });
  };

  const probeAudioDurationCandidatesMs = async (candidates: Array<string | null | undefined>): Promise<number | null> => {
    for (const candidate of candidates) {
      const normalized = candidate?.trim();
      if (!normalized) {
        continue;
      }

      const duration = await probeAudioDurationMs(normalized);
      if (duration && duration > 0) {
        return duration;
      }
    }

    return null;
  };

  const resolveBulkDurationMs = async (): Promise<number> => {
    const knownDuration = Math.max(durationMs, stableDurationMs);
    if (knownDuration > 0) {
      return knownDuration;
    }

    const probedDuration = await probeAudioDurationCandidatesMs([playbackAudioUrl]);
    if (probedDuration && probedDuration > 0) {
      setStableDurationMs((previous) => Math.max(previous, probedDuration));
      return probedDuration;
    }

    const maxEnd = Math.max(0, ...segments.map((segment) => segment.endMs));
    return Math.max(maxEnd, DEFAULT_TIMELINE_FALLBACK_MS);
  };

  const handleBulkImport = async () => {
    setDeleteError(null);

    const sections = parseBulkSections(bulkText, bulkSeparator);
    if (sections.length === 0) {
      setDeleteError('Bulk import needs at least one section split by a blank line or custom separator.');
      return;
    }

    setBulkImportPending(true);
    const failures: Array<{ section: number; message: string }> = [];
    let hadExtraDeleteFailure = false;

    const readErrorMessage = async (response: Response, fallback: string) => {
      try {
        const payload = (await response.json()) as { error?: string };
        const message = payload.error || fallback;
        return `${message} (${response.status})`;
      } catch {
        return `${fallback} (${response.status})`;
      }
    };

    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const requestWithRetry = async (
      makeRequest: () => Promise<Response>,
      retries: number = BULK_REQUEST_RETRIES,
      retryDelayMs: number = BULK_REQUEST_RETRY_DELAY_MS
    ): Promise<Response> => {
      let lastResponse: Response | null = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const response = await makeRequest();
        if (response.ok) {
          return response;
        }
        lastResponse = response;
        if (attempt < retries) {
          await wait(retryDelayMs * (attempt + 1));
        }
      }

      if (lastResponse) {
        return lastResponse;
      }

      throw new Error('Request failed before receiving a response.');
    };

    try {
      const bulkDurationMs = await resolveBulkDurationMs();
      const timings = buildBulkTimings(sections.length, bulkDurationMs);

      if (replaceExistingOnBulk) {
        const orderedExisting = [...segments].sort((a, b) => a.order - b.order);

        for (let i = 0; i < sections.length; i += 1) {
          const existing = orderedExisting[i];

          if (existing) {
            const patchResponse = await requestWithRetry(() =>
              request(`/api/songs/${songId}/segments/${existing.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  label: String(i + 1),
                  startMs: timings[i].startMs,
                  endMs: timings[i].endMs,
                  lyricText: sections[i],
                }),
              })
            );

            if (!patchResponse.ok) {
              const patchMessage = await readErrorMessage(
                patchResponse,
                `Failed to update section ${i + 1}.`
              );
              failures.push({ section: i + 1, message: patchMessage });
              continue;
            }
            continue;
          }

          const createResponse = await requestWithRetry(() =>
            request(`/api/songs/${songId}/segments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                label: String(i + 1),
                startMs: timings[i].startMs,
                endMs: timings[i].endMs,
                lyricText: sections[i],
              }),
            })
          );

          if (!createResponse.ok) {
            const createMessage = await readErrorMessage(
              createResponse,
              `Failed to create section ${i + 1}.`
            );
            failures.push({ section: i + 1, message: createMessage });
            continue;
          }
        }

        // Best-effort cleanup of extra trailing sections beyond the imported count.
        // If deletes fail (for example due to historical rating references), keep them.
        for (let i = sections.length; i < orderedExisting.length; i += 1) {
          const extra = orderedExisting[i];
          const deleteResponse = await request(`/api/songs/${songId}/segments/${extra.id}`, {
            method: 'DELETE',
          });
          if (!deleteResponse.ok) {
            // Non-fatal: preserve extras instead of failing the whole import.
            hadExtraDeleteFailure = true;
            break;
          }
        }
      } else {
        for (let i = 0; i < sections.length; i += 1) {
          const createResponse = await requestWithRetry(() =>
            request(`/api/songs/${songId}/segments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                label: String(i + 1),
                startMs: timings[i].startMs,
                endMs: timings[i].endMs,
                lyricText: sections[i],
              }),
            })
          );

          if (!createResponse.ok) {
            const createMessage = await readErrorMessage(
              createResponse,
              `Failed to create section ${i + 1}.`
            );
            failures.push({ section: i + 1, message: createMessage });
            continue;
          }
        }
      }

      setRefreshKey((previous) => previous + 1);
      setSelectedSegmentId(null);

      if (failures.length > 0) {
        const failedSections = failures.map((failure) => failure.section).join(', ');
        const firstFailure = failures[0]?.message ? ` First error: ${failures[0].message}` : '';
        setShowBulkImport(true);
        setDeleteError(`Bulk import completed with issues. Failed sections: ${failedSections}.${firstFailure}`);
      } else if (hadExtraDeleteFailure) {
        setDeleteError('Bulk import completed, but one or more extra sections could not be deleted.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk import failed. Please review the separator and try again.';
      setDeleteError(message);
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
      const response = await request(`/api/songs/${songId}/segments/${segment.id}`, {
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
      const response = await request(`/api/songs/${songId}/segments`, {
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
    return candidate > 0 ? candidate : DEFAULT_TIMELINE_FALLBACK_MS;
  }, [durationMs, segments, stableDurationMs]);

  const clampZoom = useCallback((nextZoom: number) => {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  }, []);

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

  const handleBoardSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    seek(msFromClientX(event.clientX));
  };

  const handleBoardTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      if (event.touches.length < 2) {
        pinchZoomRef.current = null;
      }
      return;
    }

    pinchZoomRef.current = {
      startDistance: getTouchDistance(event.touches),
      startZoom: zoom,
    };
  }, [zoom]);

  const handleBoardTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchZoomRef.current) {
      return;
    }

    const nextDistance = getTouchDistance(event.touches);
    if (nextDistance <= 0 || pinchZoomRef.current.startDistance <= 0) {
      return;
    }

    event.preventDefault();
    const rawZoom = pinchZoomRef.current.startZoom * (nextDistance / pinchZoomRef.current.startDistance);
    const nextZoom = clampZoom(rawZoom);
    setZoom((previous) => (Math.abs(previous - nextZoom) < 0.01 ? previous : nextZoom));
  }, [clampZoom]);

  const handleBoardTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchZoomRef.current = null;
    }
  }, []);

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
    setStableDurationMs(0);
  }, [audioUrl]);

  useEffect(() => {
    if (durationMs > 0) {
      setStableDurationMs((previous) => Math.max(previous, durationMs));
    }
  }, [durationMs]);

  useEffect(() => {
    let cancelled = false;

    const preloadDuration = async () => {
      if (!playbackAudioUrl || durationMs > 0 || stableDurationMs > 0) {
        return;
      }

      const probedDuration = await probeAudioDurationCandidatesMs([playbackAudioUrl]);
      if (!cancelled && probedDuration && probedDuration > 0) {
        setStableDurationMs((previous) => Math.max(previous, probedDuration));
      }
    };

    void preloadDuration();

    return () => {
      cancelled = true;
    };
  }, [durationMs, playbackAudioUrl, stableDurationMs]);

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
    const atOrPastEnd =
      Number.isFinite(safeDuration) &&
      safeDuration > 0 &&
      currentMs >= Math.max(0, safeDuration - 250);
    const startMs = atOrPastEnd
      ? 0
      : Math.max(0, Math.min(currentMs, safeDuration));
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
        const response = await request(`/api/songs/${songId}/segments`, { cache: 'no-store' });
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
  }, [request, songId, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    const loadSong = async () => {
      try {
        const response = await request(`/api/songs/${songId}`, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { audioUrl?: string; alternateAudioUrl?: string; title?: string };
        if (!cancelled) {
          setAudioUrl(data.audioUrl ?? '');
          setAlternateAudioUrl(data.alternateAudioUrl ?? '');
          setSongTitle(data.title ?? '');
          setTitleDraft(data.title ?? '');
          setSongLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setAudioUrl('');
          setAlternateAudioUrl('');
          setSongLoaded(true);
        }
      }
    };

    void loadSong();

    return () => {
      cancelled = true;
    };
  }, [request, songId, songLoadKey]);

  const handleAudioUploaded = () => {
    setSongLoadKey((previous) => previous + 1);
    onSongUpdated?.();
  };

  const saveSongTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === songTitle) return;
    setSavingTitle(true);
    try {
      const response = await request(`/api/songs/${songId}`, {
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

  if (songLoaded && !hasAnyAudio) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Edit Song</h2>
        </div>
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
        <ReplaceAudioForm
          songId={songId}
          userId={userId}
          audioUrl={audioUrl}
          alternateAudioUrl={alternateAudioUrl}
          onReplaced={handleAudioUploaded}
          mode="upload"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Edit Song</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Start with the title and optional setup tools, then use the sections workspace to line up lyrics with the recording.
        </p>
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
      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="mb-2 text-xs leading-5 text-slate-600">
          Replace audio only when the source recording changes. Section timings and lyrics are preserved.
        </p>
        <button
          type="button"
          data-testid="segment-editor-replace-audio-toggle"
          onClick={() => setShowReplaceAudio((previous) => !previous)}
          aria-expanded={showReplaceAudio}
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline"
        >
          <span
            aria-hidden="true"
            className={[
              'inline-block text-xs transition-transform duration-200',
              showReplaceAudio ? 'rotate-90' : 'rotate-0',
            ].join(' ')}
          >
            ▶
          </span>
          <span>Replace audio file</span>
        </button>
        {showReplaceAudio && (
          <div className="mt-2">
            <ReplaceAudioForm
              songId={songId}
              userId={userId}
              audioUrl={audioUrl}
              alternateAudioUrl={alternateAudioUrl}
              onReplaced={handleAudioUploaded}
            />
          </div>
        )}
      </div>

      <div className="mb-4">
        <EditorDisclosure
          title="Contour and Tap setup"
          description="Use MIDI setup when you want contour thumbnails or Tap practice. Leave it closed when you are only editing lyrics."
          open={showMidiSetup}
          onToggle={() => setShowMidiSetup((previous) => !previous)}
          testId="segment-editor-midi-panel"
        >
          <MidiSetupPanel songId={songId} audioPlayer={audioPlayer} request={request} />
        </EditorDisclosure>
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
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-800">Sections</p>
              <p className="text-xs leading-5 text-slate-600">Create rough sections first, then drag their edges to match the audio.</p>
            </div>
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
                setShowBulkImport((previous) => {
                  const next = !previous;
                  if (next) {
                    setZoom(BULK_IMPORT_ZOOM);
                  }
                  return next;
                });
              }}
              className="px-3 py-1 border border-indigo-300 text-indigo-700 text-sm rounded hover:bg-indigo-50"
            >
              Bulk lyrics import
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <p className="w-full text-xs text-gray-500 md:w-auto">Drag top bar to move • Drag edges to resize</p>
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <button
                type="button"
                data-testid="segment-editor-zoom-out"
                onClick={() => setZoom((previous) => clampZoom(previous - ZOOM_STEP))}
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
                onClick={() => setZoom((previous) => clampZoom(previous + ZOOM_STEP))}
                className="h-8 w-8 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {showBulkImport ? (
          <div data-testid="segment-editor-bulk-panel" className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-indigo-950">Bulk lyrics import</p>
                <p className="mt-1 text-xs leading-5 text-indigo-800">
                  Paste the full text here first. Blank lines create sections, then the editor spaces them across the full recording so you can fine tune the timing below.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-indigo-900">
                <input
                  data-testid="segment-editor-bulk-replace"
                  type="checkbox"
                  checked={replaceExistingOnBulk}
                  onChange={(event) => setReplaceExistingOnBulk(event.target.checked)}
                />
                Replace existing sections
              </label>
            </div>
            <details className="mb-2 text-xs text-indigo-800">
              <summary className="cursor-pointer font-semibold">Custom separator</summary>
              <label className="mt-2 block">
                Separator token
                <input
                  data-testid="segment-editor-bulk-separator"
                  value={bulkSeparator}
                  onChange={(event) => setBulkSeparator(event.target.value)}
                  className="mt-1 w-44 rounded border border-indigo-300 bg-white px-2 py-1 text-sm"
                  placeholder="Blank line"
                />
              </label>
            </details>
            <label className="block text-xs font-semibold text-indigo-800">Paste all lyrics</label>
            <textarea
              data-testid="segment-editor-bulk-text"
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={[
                'Verse 1 line 1',
                'Verse 1 line 2',
                '',
                'Verse 2 line 1',
                'Verse 2 line 2',
              ].join('\n')}
              className="mt-1 h-96 w-full rounded border border-indigo-300 bg-white px-3 py-2 text-sm"
            />
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

        <div>
          <div className="min-w-0">
          <div
            ref={boardScrollRef}
            data-testid="segment-editor-board-scroll"
            className="overflow-x-auto rounded-lg border border-indigo-300 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-indigo-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-indigo-300"
            style={{ touchAction: 'pan-x pinch-zoom' }}
            onTouchStart={handleBoardTouchStart}
            onTouchMove={handleBoardTouchMove}
            onTouchEnd={handleBoardTouchEnd}
            onTouchCancel={handleBoardTouchEnd}
          >
            <div
              ref={boardRef}
              data-testid="segment-editor-board"
              className="relative h-[560px] min-w-full overflow-hidden bg-gradient-to-b from-indigo-50/40 to-white"
              style={{ width: `${zoomPercent}%` }}
              onClick={handleBoardSeek}
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
                  className="absolute left-0 right-0 top-0 z-20 h-7 cursor-grab border-b border-indigo-300 bg-indigo-100/80 text-xs text-indigo-600/60 select-none touch-none"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (typeof event.currentTarget.setPointerCapture === 'function') {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
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
                  className="absolute inset-y-0 left-0 z-30 w-4 cursor-col-resize rounded-l bg-indigo-500/35 touch-none"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (typeof event.currentTarget.setPointerCapture === 'function') {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
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
                  className="absolute inset-y-0 right-0 z-30 w-4 cursor-col-resize rounded-r bg-indigo-500/35 touch-none"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (typeof event.currentTarget.setPointerCapture === 'function') {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
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
                      data-testid="segment-editor-label-input"
                      autoFocus
                      type="text"
                      value={segment.label}
                      onChange={(event) => updateLocalSegment(segment.id, { label: event.target.value })}
                      onBlur={(event) => {
                        const nextLabel = event.currentTarget.value;
                        updateLocalSegment(segment.id, { label: nextLabel });
                        void saveSegmentPatch(segment.id, { label: nextLabel });
                        setEditingLabelId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          const nextLabel = event.currentTarget.value;
                          updateLocalSegment(segment.id, { label: nextLabel });
                          void saveSegmentPatch(segment.id, { label: nextLabel });
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
                    onBlur={(event) => {
                      const nextLyricText = event.currentTarget.value;
                      updateLocalSegment(segment.id, { lyricText: nextLyricText });
                      void saveSegmentPatch(segment.id, { lyricText: nextLyricText });
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
          <span>{formatMs(timelineDurationMs)}</span>
        </div>
          </div>
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
            <span data-testid="segment-editor-current-ms">{formatMs(currentMs)}</span>
            <span>{formatMs(timelineDurationMs)}</span>
          </div>
          {savingSegmentId ? (
            <p className="mt-1 text-xs text-indigo-600">Saving...</p>
          ) : null}
        </div>

        <div className="sticky bottom-2 z-50 mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            data-testid="segment-editor-skip-back"
            onClick={() => handleSkipBy(-5000)}
            aria-label="Skip backward 5 seconds"
            disabled={!isReady}
            className="flex h-10 w-11 items-center justify-center rounded-xl border border-indigo-300 bg-white/95 text-indigo-700 shadow-lg shadow-indigo-100 backdrop-blur hover:bg-indigo-50 disabled:opacity-40"
          >
            <span className="inline-flex items-center justify-center">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <rect x="4" y="4.25" width="2.25" height="9.5" rx="1" />
                <path d="M8.1 9a1.2 1.2 0 0 1 .55-1.01l6.8-4.35A1.2 1.2 0 0 1 17.3 4.65v8.7a1.2 1.2 0 0 1-1.85 1.01l-6.8-4.35A1.2 1.2 0 0 1 8.1 9Z" />
                <text x="12" y="22" textAnchor="middle" className="fill-current text-[8px] font-bold">5</text>
              </svg>
              <span className="sr-only">-5s</span>
            </span>
          </button>
          <button
            type="button"
            data-testid="segment-editor-bottom-play-toggle"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pause from bottom controls' : 'Play from bottom controls'}
            className="flex h-12 min-w-28 items-center justify-center rounded-2xl bg-indigo-600 px-5 text-lg font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            data-testid="segment-editor-skip-forward"
            onClick={() => handleSkipBy(5000)}
            aria-label="Skip forward 5 seconds"
            disabled={!isReady}
            className="flex h-10 w-11 items-center justify-center rounded-xl border border-indigo-300 bg-white/95 text-indigo-700 shadow-lg shadow-indigo-100 backdrop-blur hover:bg-indigo-50 disabled:opacity-40"
          >
            <span className="inline-flex items-center justify-center">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M6.7 4.65a1.2 1.2 0 0 1 1.85-1.01l6.8 4.35a1.2 1.2 0 0 1 0 2.02l-6.8 4.35a1.2 1.2 0 0 1-1.85-1.01v-8.7Z" />
                <rect x="17.75" y="4.25" width="2.25" height="9.5" rx="1" />
                <text x="12" y="22" textAnchor="middle" className="fill-current text-[8px] font-bold">5</text>
              </svg>
              <span className="sr-only">+5s</span>
            </span>
          </button>
        </div>
      </div>

    </div>
  );
}
