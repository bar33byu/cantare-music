"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { PitchContourNote, Segment } from '../types/index';
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

interface ActiveContourCapture {
  pointerId: number;
  startedAt: number;
  startedCurrentMs: number;
  lane: number;
}

interface ActiveContourDrag {
  pointerId: number;
  segmentId: string;
  noteId: string;
  mode: 'move' | 'resize-start' | 'resize-end';
  startClientX: number;
  initialTimeOffsetMs: number;
  initialDurationMs: number;
}

const MIN_CONTOUR_NOTE_MS = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function constrainMonophonicPlacement(
  notes: PitchContourNote[],
  noteId: string,
  proposedStartMs: number,
  proposedDurationMs: number,
  segmentDurationMs: number
): { timeOffsetMs: number; durationMs: number } {
  const safeDuration = Math.max(MIN_CONTOUR_NOTE_MS, segmentDurationMs);
  const others = notes
    .filter((note) => note.id !== noteId)
    .slice()
    .sort((left, right) => left.timeOffsetMs - right.timeOffsetMs || left.id.localeCompare(right.id));

  let insertIndex = others.findIndex((note) => proposedStartMs < note.timeOffsetMs);
  if (insertIndex === -1) {
    insertIndex = others.length;
  }

  const previous = insertIndex > 0 ? others[insertIndex - 1] : null;
  const next = insertIndex < others.length ? others[insertIndex] : null;

  const minStartMs = previous
    ? previous.timeOffsetMs + Math.max(MIN_CONTOUR_NOTE_MS, previous.durationMs)
    : 0;
  const maxEndMs = next ? next.timeOffsetMs : safeDuration;
  const maxStartMs = Math.max(minStartMs, maxEndMs - MIN_CONTOUR_NOTE_MS);

  const timeOffsetMs = clamp(Math.round(proposedStartMs), minStartMs, maxStartMs);
  const maxDurationMs = Math.max(MIN_CONTOUR_NOTE_MS, maxEndMs - timeOffsetMs);
  const durationMs = clamp(Math.round(proposedDurationMs), MIN_CONTOUR_NOTE_MS, maxDurationMs);

  return {
    timeOffsetMs,
    durationMs,
  };
}

export function SegmentEditor({ songId, onBack, onSongUpdated }: SegmentEditorProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
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
  const [bulkSeparator, setBulkSeparator] = useState('*');
  const [replaceExistingOnBulk, setReplaceExistingOnBulk] = useState(true);
  const [bulkImportPending, setBulkImportPending] = useState(false);
  const [songMetaRefreshToken, setSongMetaRefreshToken] = useState(0);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const contourZoneRef = useRef<HTMLDivElement | null>(null);
  const [activeContourCapture, setActiveContourCapture] = useState<ActiveContourCapture | null>(null);
  const contourPreviewRef = useRef<HTMLDivElement | null>(null);
  const [activeContourDrag, setActiveContourDrag] = useState<ActiveContourDrag | null>(null);
  const songPitchStripRef = useRef<HTMLDivElement | null>(null);
  const [activeSongContourCapture, setActiveSongContourCapture] = useState<ActiveContourCapture | null>(null);

  const parsedAudioKey = useMemo(() => parseAudioKey(audioUrl), [audioUrl]);
  const proxyAudioUrl = useMemo(() => buildProxyAudioUrl(parsedAudioKey), [parsedAudioKey]);
  const hasAttachedAudio = audioUrl.trim().length > 0;
  const audioDisplayName = useMemo(() => {
    if (parsedAudioKey) {
      const segments = parsedAudioKey.split('/');
      return segments[segments.length - 1] || parsedAudioKey;
    }

    const trimmed = audioUrl.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = new URL(trimmed, 'http://localhost');
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      return decodeURIComponent(pathSegments[pathSegments.length - 1] || trimmed);
    } catch {
      return trimmed;
    }
  }, [audioUrl, parsedAudioKey]);
  const playbackAudioUrl = useMemo(() => {
    if (useProxyFallback && proxyAudioUrl) {
      return proxyAudioUrl;
    }
    return toPlayableAudioUrl(audioUrl);
  }, [audioUrl, proxyAudioUrl, useProxyFallback]);

  const {
    isPlaying,
    isReady,
    currentMs,
    durationMs,
    playbackRate = 1,
    playbackError,
    play,
    pause,
    seek,
    setPlaybackRate,
  } = useAudioPlayer(playbackAudioUrl);

  const timelineDurationMs = useMemo(() => {
    const maxEnd = Math.max(0, ...segments.map((segment) => segment.endMs));
    const maxPlaybackDuration = Math.max(0, durationMs, stableDurationMs);
    const candidate = Math.max(maxEnd, maxPlaybackDuration);
    return candidate > 0 ? candidate : 60000;
  }, [durationMs, segments, stableDurationMs]);

  const orderedSegments = useMemo(
    () => [...segments].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id)),
    [segments]
  );

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId]
  );
  const playbackPositionSegment = useMemo(() => {
    if (orderedSegments.length === 0) {
      return null;
    }

    const exact = orderedSegments.find((segment) => currentMs >= segment.startMs && currentMs < segment.endMs);
    if (exact) {
      return exact;
    }

    if (currentMs < orderedSegments[0].startMs) {
      return orderedSegments[0];
    }

    return orderedSegments[orderedSegments.length - 1];
  }, [currentMs, orderedSegments]);
  const contourPanelSegment = isPlaying ? playbackPositionSegment : selectedSegment ?? playbackPositionSegment;
  const contourPanelDurationMs = contourPanelSegment
    ? Math.max(MIN_SEGMENT_MS, contourPanelSegment.endMs - contourPanelSegment.startMs)
    : MIN_SEGMENT_MS;

  const contourPanelContourNotes = useMemo(
    () => contourPanelSegment?.pitchContourNotes ?? [],
    [contourPanelSegment]
  );

  const plottedContourNotes = useMemo(() => {
    if (!contourPanelSegment) {
      return [];
    }

    const durationMs = Math.max(1, contourPanelSegment.endMs - contourPanelSegment.startMs);
    return contourPanelContourNotes.map((note) => {
      const leftPercent = clamp((note.timeOffsetMs / durationMs) * 100, 0, 100);
      const widthPercent = clamp((note.durationMs / durationMs) * 100, 1.5, 100 - leftPercent);
      return {
        ...note,
        leftPercent,
        widthPercent,
        topPercent: (1 - clamp(note.lane, 0, 1)) * 100,
      };
    });
  }, [contourPanelContourNotes, contourPanelSegment]);

  const plottedSongContourNotes = useMemo(() => {
    if (timelineDurationMs <= 0) {
      return [];
    }

    return orderedSegments.flatMap((segment) => {
      const segmentDurationMs = Math.max(1, segment.endMs - segment.startMs);
      return (segment.pitchContourNotes ?? []).map((note) => {
        const absoluteStartMs = segment.startMs + note.timeOffsetMs;
        return {
          id: note.id,
          segmentId: segment.id,
          leftPercent: clamp((absoluteStartMs / timelineDurationMs) * 100, 0, 100),
          widthPercent: clamp((note.durationMs / timelineDurationMs) * 100, 0.5, 100),
          topPercent: (1 - clamp(note.lane, 0, 1)) * 100,
          segmentDurationMs,
        };
      });
    });
  }, [orderedSegments, timelineDurationMs]);

  const updateLocalSegment = (segmentId: string, updates: Partial<Segment>) => {
    setSegments((previous) =>
      previous.map((segment) => (segment.id === segmentId ? { ...segment, ...updates } : segment))
    );
  };

  const updateLocalPitchContourNotes = (segmentId: string, notes: PitchContourNote[]) => {
    updateLocalSegment(segmentId, { pitchContourNotes: notes });
  };

  const savePitchContourNotes = async (segmentId: string, notes: PitchContourNote[]) => {
    updateLocalPitchContourNotes(segmentId, notes);
    try {
      await saveSegmentPatch(segmentId, { pitchContourNotes: notes }, { refresh: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save pitch contour notes. Please try again.';
      setDeleteError(message);
    }
  };

  const getSegmentAtMs = (ms: number): Segment | null => {
    if (orderedSegments.length === 0) {
      return null;
    }

    const exact = orderedSegments.find((segment) => ms >= segment.startMs && ms < segment.endMs);
    if (exact) {
      return exact;
    }

    if (ms < orderedSegments[0].startMs) {
      return orderedSegments[0];
    }

    return orderedSegments[orderedSegments.length - 1];
  };

  const getLaneFromClientY = (clientY: number, rect: DOMRect): number => {
    if (!rect || rect.height <= 0) {
      return 0.5;
    }

    const ratio = clamp((clientY - rect.top) / rect.height, 0, 1);
    return Number((1 - ratio).toFixed(3));
  };

  const commitContourCapture = async (capture: ActiveContourCapture, endedCurrentMs: number) => {
    const targetSegment = getSegmentAtMs(capture.startedCurrentMs);
    if (!targetSegment) {
      return;
    }

    const existingNotes = targetSegment.pitchContourNotes ?? [];
    const segmentDurationMs = Math.max(1, targetSegment.endMs - targetSegment.startMs);
    const startedCurrentMs = clamp(capture.startedCurrentMs, targetSegment.startMs, targetSegment.endMs);
    const timeOffsetMs = clamp(startedCurrentMs - targetSegment.startMs, 0, segmentDurationMs);
    const endedMs = clamp(endedCurrentMs, targetSegment.startMs, targetSegment.endMs);
    const timelineHeldMs = Math.max(0, endedMs - startedCurrentMs);
    const wallHeldMs = Math.max(0, Math.round((Date.now() - capture.startedAt) * playbackRate));
    const elapsedMs = Math.max(MIN_CONTOUR_NOTE_MS, timelineHeldMs > 0 ? timelineHeldMs : wallHeldMs);
    const nextNote: PitchContourNote = {
      id: crypto.randomUUID(),
      timeOffsetMs,
      durationMs: elapsedMs,
      lane: capture.lane,
    };
    const placement = constrainMonophonicPlacement(
      existingNotes,
      nextNote.id,
      nextNote.timeOffsetMs,
      nextNote.durationMs,
      segmentDurationMs
    );
    const nextNotes = [...existingNotes, {
      ...nextNote,
      ...placement,
    }].sort((left, right) => left.timeOffsetMs - right.timeOffsetMs || left.id.localeCompare(right.id));
    await savePitchContourNotes(targetSegment.id, nextNotes);
  };

  const handleContourPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (orderedSegments.length === 0) {
      return;
    }

    const rect = contourZoneRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const lane = getLaneFromClientY(event.clientY, rect);
    setActiveContourCapture({
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startedCurrentMs: currentMs,
      lane,
    });

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleContourPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeContourCapture || activeContourCapture.pointerId !== event.pointerId) {
      return;
    }

    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const capture = activeContourCapture;
    setActiveContourCapture(null);
    void commitContourCapture(capture, currentMs);
  };

  const handleContourPreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (orderedSegments.length === 0) {
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }

    const rect = contourPreviewRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const lane = getLaneFromClientY(event.clientY, rect);
    setActiveContourCapture({
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startedCurrentMs: currentMs,
      lane,
    });

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleContourPreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeContourCapture || activeContourCapture.pointerId !== event.pointerId) {
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }

    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const capture = activeContourCapture;
    setActiveContourCapture(null);
    void commitContourCapture(capture, currentMs);
  };

  const commitSongContourCapture = async (capture: ActiveContourCapture, endedCurrentMs: number) => {
    const targetSegment = getSegmentAtMs(capture.startedCurrentMs);
    if (!targetSegment) {
      return;
    }

    const segmentDurationMs = Math.max(1, targetSegment.endMs - targetSegment.startMs);
    const startedCurrentMs = clamp(capture.startedCurrentMs, targetSegment.startMs, targetSegment.endMs);
    const endedMs = clamp(endedCurrentMs, targetSegment.startMs, targetSegment.endMs);
    const timeOffsetMs = clamp(startedCurrentMs - targetSegment.startMs, 0, segmentDurationMs);
    const timelineHeldMs = Math.max(0, endedMs - startedCurrentMs);
    const wallHeldMs = Math.max(0, Math.round((Date.now() - capture.startedAt) * playbackRate));
    const elapsedMs = Math.max(MIN_CONTOUR_NOTE_MS, timelineHeldMs > 0 ? timelineHeldMs : wallHeldMs);
    const nextNote: PitchContourNote = {
      id: crypto.randomUUID(),
      timeOffsetMs,
      durationMs: elapsedMs,
      lane: capture.lane,
    };
    const existingNotes = targetSegment.pitchContourNotes ?? [];
    const placement = constrainMonophonicPlacement(
      existingNotes,
      nextNote.id,
      nextNote.timeOffsetMs,
      nextNote.durationMs,
      segmentDurationMs
    );
    const nextNotes = [...existingNotes, {
      ...nextNote,
      ...placement,
    }].sort((left, right) => left.timeOffsetMs - right.timeOffsetMs || left.id.localeCompare(right.id));
    await savePitchContourNotes(targetSegment.id, nextNotes);
  };

  const handleSongPitchPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (orderedSegments.length === 0) {
      return;
    }

    const rect = songPitchStripRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const lane = getLaneFromClientY(event.clientY, rect);
    setActiveSongContourCapture({
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startedCurrentMs: currentMs,
      lane,
    });

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleSongPitchPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSongContourCapture || activeSongContourCapture.pointerId !== event.pointerId) {
      return;
    }

    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const capture = activeSongContourCapture;
    setActiveSongContourCapture(null);
    void commitSongContourCapture(capture, currentMs);
  };

  const handleUndoLastContourNote = async () => {
    if (!contourPanelSegment || contourPanelContourNotes.length === 0) {
      return;
    }

    await savePitchContourNotes(contourPanelSegment.id, contourPanelContourNotes.slice(0, -1));
  };

  const handleClearContourNotes = async () => {
    if (!contourPanelSegment || contourPanelContourNotes.length === 0) {
      return;
    }

    await savePitchContourNotes(contourPanelSegment.id, []);
  };

  const updateContourNoteFromPointer = (clientX: number, clientY: number) => {
    if (!activeContourDrag) {
      return;
    }

    const draggedSegment = segments.find((segment) => segment.id === activeContourDrag.segmentId);
    if (!draggedSegment) {
      return;
    }

    const previewRect = contourPreviewRef.current?.getBoundingClientRect();
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
      return;
    }

    const durationMs = Math.max(1, draggedSegment.endMs - draggedSegment.startMs);
    const deltaRatioX = (clientX - activeContourDrag.startClientX) / previewRect.width;
    const deltaMs = Math.round(deltaRatioX * durationMs);
    const ratioY = clamp((clientY - previewRect.top) / previewRect.height, 0, 1);
    const nextLane = Number((1 - ratioY).toFixed(3));
    const allNotes = draggedSegment.pitchContourNotes ?? [];
    const nextNotes = allNotes.map((note) => {
      if (note.id !== activeContourDrag.noteId) {
        return note;
      }

      let proposedStartMs = note.timeOffsetMs;
      let proposedDurationMs = note.durationMs;

      if (activeContourDrag.mode === 'move') {
        proposedStartMs = activeContourDrag.initialTimeOffsetMs + deltaMs;
        proposedDurationMs = activeContourDrag.initialDurationMs;
      } else if (activeContourDrag.mode === 'resize-start') {
        const endMs = activeContourDrag.initialTimeOffsetMs + activeContourDrag.initialDurationMs;
        proposedStartMs = activeContourDrag.initialTimeOffsetMs + deltaMs;
        proposedDurationMs = Math.max(MIN_CONTOUR_NOTE_MS, endMs - proposedStartMs);
      } else {
        proposedStartMs = activeContourDrag.initialTimeOffsetMs;
        proposedDurationMs = activeContourDrag.initialDurationMs + deltaMs;
      }

      const placement = constrainMonophonicPlacement(
        allNotes,
        note.id,
        proposedStartMs,
        proposedDurationMs,
        durationMs
      );

      return {
        ...note,
        ...placement,
        lane: activeContourDrag.mode === 'move' ? nextLane : note.lane,
      };
    });
    updateLocalPitchContourNotes(draggedSegment.id, nextNotes);
  };

  useEffect(() => {
    if (!activeContourDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activeContourDrag.pointerId) {
        return;
      }
      updateContourNoteFromPointer(event.clientX, event.clientY);
    };

    const handlePointerDone = (event: PointerEvent) => {
      if (event.pointerId !== activeContourDrag.pointerId) {
        return;
      }

      const draggedSegment = segments.find((segment) => segment.id === activeContourDrag.segmentId);
      setActiveContourDrag(null);
      if (!draggedSegment) {
        return;
      }
      void savePitchContourNotes(activeContourDrag.segmentId, draggedSegment.pitchContourNotes ?? []);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerDone);
    window.addEventListener('pointercancel', handlePointerDone);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerDone);
      window.removeEventListener('pointercancel', handlePointerDone);
    };
  }, [activeContourDrag, segments]);

  const saveSegmentPatch = async (
    segmentId: string,
    updates: Partial<Segment>,
    options: { refresh?: boolean } = {}
  ) => {
    const shouldRefresh = options.refresh ?? true;
    try {
      setSavingSegmentId(segmentId);
      const response = await fetch(`/api/songs/${songId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        let errorMessage = 'Patch failed';
        try {
          const payload = await response.json() as { error?: string };
          if (payload.error) {
            errorMessage = payload.error;
          }
        } catch {
          // Ignore JSON parse errors and keep fallback message.
        }
        throw new Error(errorMessage);
      }

      if (shouldRefresh) {
        setRefreshKey((previous) => previous + 1);
      }
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

  const resolveAudioDurationMs = async (sourceUrl: string): Promise<number | null> => {
    if (!sourceUrl || typeof window === 'undefined') {
      return null;
    }

    return new Promise<number | null>((resolve) => {
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.crossOrigin = 'anonymous';
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4000);

      const cleanup = () => {
        probe.removeEventListener('loadedmetadata', handleLoadedMetadata);
        probe.removeEventListener('loadeddata', handleLoadedMetadata);
        probe.removeEventListener('durationchange', handleLoadedMetadata);
        probe.removeEventListener('canplay', handleLoadedMetadata);
        probe.removeEventListener('error', handleError);
        window.clearTimeout(timeoutId);
      };

      const handleLoadedMetadata = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0) {
          cleanup();
          resolve(Math.round(probe.duration * 1000));
          return;
        }
      };

      const handleError = () => {
        cleanup();
        resolve(null);
      };

      probe.addEventListener('loadedmetadata', handleLoadedMetadata);
      probe.addEventListener('loadeddata', handleLoadedMetadata);
      probe.addEventListener('durationchange', handleLoadedMetadata);
      probe.addEventListener('canplay', handleLoadedMetadata);
      probe.addEventListener('error', handleError);
      probe.src = sourceUrl;
      probe.load();
    });
  };

  useEffect(() => {
    if (!hasAttachedAudio || !playbackAudioUrl) {
      return;
    }

    let cancelled = false;
    const loadDuration = async () => {
      const resolvedDurationMs = await resolveAudioDurationMs(playbackAudioUrl);
      if (!cancelled && resolvedDurationMs && resolvedDurationMs > 0) {
        setStableDurationMs(resolvedDurationMs);
      }
    };

    void loadDuration();

    return () => {
      cancelled = true;
    };
  }, [hasAttachedAudio, playbackAudioUrl]);

  const handleBulkImport = async () => {
    setDeleteError(null);

    const sections = parseBulkSections(bulkText, bulkSeparator);
    if (sections.length === 0) {
      setDeleteError('Bulk import needs at least one section split by the separator.');
      return;
    }

    setBulkImportPending(true);
    let successfulOperations = 0;
    let failureReason = '';
    let failingSegmentIndex: number | null = null;

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
      let effectiveDurationMs = timelineDurationMs;
      const knownDurationMs = Math.max(durationMs, stableDurationMs);

      if (hasAttachedAudio && knownDurationMs <= 0 && playbackAudioUrl) {
        const resolvedDurationMs = await resolveAudioDurationMs(playbackAudioUrl);
        if (resolvedDurationMs && resolvedDurationMs > 0) {
          setStableDurationMs(resolvedDurationMs);
          effectiveDurationMs = Math.max(effectiveDurationMs, resolvedDurationMs);
        }
      }

      // Ensure duration is an integer to prevent float values in database
      effectiveDurationMs = Math.round(effectiveDurationMs);
      const timings = buildBulkTimings(sections.length, effectiveDurationMs);

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
              failingSegmentIndex = i + 1;
              failureReason = message;
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
            failingSegmentIndex = i + 1;
            failureReason = message;
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
            failingSegmentIndex = i + 1;
            failureReason = message;
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
        const errorDetail = failureReason ? ` Section ${failingSegmentIndex} failed: ${failureReason}` : '';
        setDeleteError(`Bulk import partially completed. ${successfulOperations} of ${sections.length} sections created.${errorDetail} Reloading timeline.`);
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
          pitchContourNotes: restored.pitchContourNotes ?? [],
        }),
      });
      if (!response.ok) throw new Error('Restore failed');
      setSelectedSegmentId(restored.id);
      setRefreshKey((prev) => prev + 1);
    } catch {
      setDeleteError('Failed to restore section. Please try again.');
    }
  };

  const zoomPercent = Math.round(zoom * 100);

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
      setStableDurationMs(Math.round(durationMs));
    }
  }, [durationMs]);

  useEffect(() => {
    if (!playbackAudioUrl) {
      setStableDurationMs(0);
    }
  }, [playbackAudioUrl]);

  useEffect(() => {
    setUseProxyFallback(false);
  }, [songId, songMetaRefreshToken]);

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
    if (!hasAttachedAudio) {
      return;
    }

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
  }, [songId, songMetaRefreshToken]);

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

        <div
          data-testid="segment-editor-audio-status"
          className={`mt-3 rounded-md border px-3 py-2 ${hasAttachedAudio ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">Audio file</span>
            <span
              data-testid="segment-editor-audio-status-badge"
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${hasAttachedAudio ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
            >
              {hasAttachedAudio ? 'Attached' : 'Missing'}
            </span>
          </div>
          <p data-testid="segment-editor-audio-status-text" className="mt-1 text-sm text-gray-700">
            {hasAttachedAudio
              ? `Current file: ${audioDisplayName}`
              : 'No audio file uploaded yet. Upload one so sections can be timed against playback.'}
          </p>
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
          {showReplaceAudio
            ? '▲ Hide audio replacement'
            : hasAttachedAudio
              ? '▼ Replace audio file'
              : '▼ Upload audio file'}
        </button>
        {showReplaceAudio && (
          <div className="mt-2">
            <ReplaceAudioForm
              songId={songId}
              onReplaced={() => {
                setSongMetaRefreshToken((previous) => previous + 1);
                onSongUpdated?.();
              }}
            />
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
                  placeholder="*"
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
                '*',
                'Verse 2 line 1',
                'Verse 2 line 2',
              ].join('\n')}
              className="mt-1 h-36 w-full rounded border border-indigo-300 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-indigo-700">
              Default separator is <strong>*</strong>. Each block becomes one section, spaced evenly across the full song.
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
                  <input
                    data-testid={`segment-inline-label-input-${segment.id}`}
                    value={segment.label}
                    onChange={(event) => updateLocalSegment(segment.id, { label: event.target.value })}
                    onBlur={() => {
                      void saveSegmentPatch(segment.id, { label: segment.label });
                    }}
                    className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-center text-sm font-semibold text-indigo-900"
                  />
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
          <div
            data-testid="segment-editor-song-pitch-strip"
            className="relative mb-3 h-12 overflow-x-auto rounded bg-emerald-50"
            onPointerDown={handleSongPitchPointerDown}
            onPointerUp={handleSongPitchPointerUp}
            onPointerCancel={() => setActiveSongContourCapture(null)}
          >
            <div ref={songPitchStripRef} className="relative h-full min-w-full" style={{ width: `${zoomPercent}%` }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`song-pitch-grid-${index}`}
                  className="absolute inset-x-0 border-t border-emerald-200"
                  style={{ top: `${index * 50}%` }}
                />
              ))}
              {plottedSongContourNotes.map((note) => (
                <div
                  key={`song-pitch-${note.segmentId}-${note.id}`}
                  data-testid={`song-pitch-note-${note.segmentId}-${note.id}`}
                  className="absolute h-1.5 rounded-full bg-emerald-500/80"
                  style={{
                    left: `${note.leftPercent}%`,
                    width: `${note.widthPercent}%`,
                    top: `calc(${note.topPercent}% - 0.1875rem)`,
                  }}
                />
              ))}
            </div>
          </div>
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

      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="segment-editor-playback-controls">
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Speed</span>
          {[0.5, 0.75, 1].map((rate) => (
            <button
              key={`speed-${rate}`}
              type="button"
              data-testid={`segment-editor-speed-${Math.round(rate * 100)}`}
              onClick={() => setPlaybackRate?.(rate)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${Math.abs(playbackRate - rate) < 0.01 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}
            >
              {rate}x
            </button>
          ))}
        </div>
        <div className="mb-2 flex items-center justify-center gap-2">
          <button
            type="button"
            data-testid="segment-editor-skip-back"
            onClick={() => handleSkipBy(-5000)}
            aria-label="Skip backward 5 seconds"
            disabled={!isReady}
            className="flex h-9 w-[84px] items-center justify-center rounded-xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 8H5v4" />
                <path d="M5 12a7 7 0 1 0 2-5" />
              </svg>
              <span>-5</span>
            </span>
          </button>
          <button
            type="button"
            data-testid="segment-editor-play-toggle"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={!hasAttachedAudio}
            className="h-9 w-[72px] rounded-xl bg-indigo-600 text-lg text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            data-testid="segment-editor-skip-forward"
            onClick={() => handleSkipBy(5000)}
            aria-label="Skip forward 5 seconds"
            disabled={!isReady}
            className="flex h-9 w-[84px] items-center justify-center rounded-xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 8h4v4" />
                <path d="M19 12a7 7 0 1 1-2-5" />
              </svg>
              <span>+5</span>
            </span>
          </button>
        </div>
        <div className="mb-2 flex items-center justify-center gap-2 text-sm text-gray-600">
          <span data-testid="segment-editor-current-ms">{formatMs(currentMs)}</span>
          <span className="text-gray-400">/</span>
          <span>{formatMs(timelineDurationMs)}</span>
          {savingSegmentId ? <span className="ml-2 text-xs text-indigo-600">Saving...</span> : null}
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
          <p className="text-sm text-gray-500">Select a section block to edit its label and lyrics.</p>
        )}
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm" data-testid="segment-editor-pitch-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-emerald-900">Pitch contour authoring</h3>
            <p className="text-sm text-emerald-700">
              {contourPanelSegment
                ? `Capture follows the playback position across the full song. Notes currently land in ${contourPanelSegment.label}.`
                : 'Add sections to begin capturing pitch contour notes.'}
            </p>
            {contourPanelSegment ? (
              <p data-testid="segment-editor-pitch-target-label" className="mt-1 text-xs font-medium uppercase tracking-wide text-emerald-600">
                Current target: {contourPanelSegment.label}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="segment-editor-pitch-undo"
              onClick={() => { void handleUndoLastContourNote(); }}
              disabled={!contourPanelSegment || contourPanelContourNotes.length === 0}
              className="rounded border border-emerald-300 px-3 py-1.5 text-sm text-emerald-800 disabled:opacity-40"
            >
              Undo last
            </button>
            <button
              type="button"
              data-testid="segment-editor-pitch-clear"
              onClick={() => { void handleClearContourNotes(); }}
              disabled={!contourPanelSegment || contourPanelContourNotes.length === 0}
              className="rounded border border-emerald-300 px-3 py-1.5 text-sm text-emerald-800 disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_88px]">
          <div>
            <div
              ref={contourPreviewRef}
              data-testid="segment-editor-pitch-preview"
              className="relative h-52 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 via-white to-emerald-50"
              onPointerDown={handleContourPreviewPointerDown}
              onPointerUp={handleContourPreviewPointerUp}
              onPointerCancel={() => setActiveContourCapture(null)}
            >
              <div className="absolute inset-0">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`pitch-grid-${index}`}
                    className="absolute inset-x-0 border-t border-emerald-200/80"
                    style={{ top: `${index * 25}%` }}
                  />
                ))}
              </div>
              {contourPanelSegment ? (
                <>
                  {plottedContourNotes.map((note) => (
                    <div
                      key={note.id}
                      data-testid={`segment-editor-pitch-note-${note.id}`}
                      className="absolute h-4"
                      style={{
                        left: `${note.leftPercent}%`,
                        width: `${note.widthPercent}%`,
                        top: `calc(${note.topPercent}% - 0.5rem)`,
                      }}
                    >
                      <button
                        type="button"
                        data-testid={`segment-editor-pitch-note-start-${note.id}`}
                        aria-label={`Resize contour note start ${note.id}`}
                        className="absolute inset-y-0 left-0 w-2 rounded-l-full bg-emerald-800/90"
                        onPointerDown={(event) => {
                          setActiveContourDrag({
                            pointerId: event.pointerId,
                            segmentId: contourPanelSegment.id,
                            noteId: note.id,
                            mode: 'resize-start',
                            startClientX: event.clientX,
                            initialTimeOffsetMs: note.timeOffsetMs,
                            initialDurationMs: note.durationMs,
                          });
                        }}
                      />
                      <button
                        type="button"
                        data-testid={`segment-editor-pitch-note-move-${note.id}`}
                        aria-label={`Adjust contour note at ${note.timeOffsetMs}ms`}
                        className="absolute inset-y-0 left-2 right-2 cursor-grab rounded-full bg-emerald-600/80"
                        onPointerDown={(event) => {
                          setActiveContourDrag({
                            pointerId: event.pointerId,
                            segmentId: contourPanelSegment.id,
                            noteId: note.id,
                            mode: 'move',
                            startClientX: event.clientX,
                            initialTimeOffsetMs: note.timeOffsetMs,
                            initialDurationMs: note.durationMs,
                          });
                        }}
                        onDoubleClick={() => {
                          const nextNotes = contourPanelContourNotes.filter((entry) => entry.id !== note.id);
                          void savePitchContourNotes(contourPanelSegment.id, nextNotes);
                        }}
                      />
                      <button
                        type="button"
                        data-testid={`segment-editor-pitch-note-end-${note.id}`}
                        aria-label={`Resize contour note end ${note.id}`}
                        className="absolute inset-y-0 right-0 w-2 rounded-r-full bg-emerald-800/90"
                        onPointerDown={(event) => {
                          setActiveContourDrag({
                            pointerId: event.pointerId,
                            segmentId: contourPanelSegment.id,
                            noteId: note.id,
                            mode: 'resize-end',
                            startClientX: event.clientX,
                            initialTimeOffsetMs: note.timeOffsetMs,
                            initialDurationMs: note.durationMs,
                          });
                        }}
                      />
                    </div>
                  ))}
                  <div
                    data-testid="segment-editor-pitch-playhead"
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-rose-500"
                    style={{
                      left: `${clamp(((currentMs - contourPanelSegment.startMs) / contourPanelDurationMs) * 100, 0, 100)}%`,
                    }}
                  />
                </>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-emerald-800">
              <span>Low</span>
              <span data-testid="segment-editor-pitch-count">{contourPanelContourNotes.length} notes</span>
              <span>High</span>
            </div>
            <p className="mt-1 text-xs text-emerald-700">Tip: Hold longer to create longer notes. You can still drag note bodies/handles to refine.</p>
          </div>

          <div
            ref={contourZoneRef}
            data-testid="segment-editor-pitch-tap-zone"
            className={`relative rounded-2xl border-2 border-dashed px-3 py-4 text-center ${contourPanelSegment ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-gray-50 text-gray-400'}`}
            onPointerDown={handleContourPointerDown}
            onPointerUp={handleContourPointerUp}
            onPointerCancel={() => setActiveContourCapture(null)}
          >
            <div className="pointer-events-none flex h-full min-h-[208px] flex-col items-center justify-between text-xs font-semibold uppercase tracking-[0.18em]">
              <span>High</span>
              <span className="max-w-[4rem] leading-4">Tap and hold</span>
              <span>Low</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
