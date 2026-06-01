"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PracticeView from "./components/PracticeView";
import { PlaylistBrowser } from "./components/PlaylistBrowser";
import { PlaylistDetail } from "./components/PlaylistDetail";
import { PlaylistPracticeView } from "./components/PlaylistPracticeView";
import { GuestWelcomePanel } from "./components/GuestWelcomePanel";
import { SharedBrowser } from "./components/SharedBrowser";
import { SongForm } from "./components/SongForm";
import { SongBrowser } from "./components/SongBrowser";
import { SegmentEditor } from "./components/SegmentEditor";
import { makeSession } from "./lib/factories";
import {
  clearGuestProgress,
  getGuestProgressUserId,
  getGuestProgressSongIds,
  hasDeclinedGuestProgressClaim,
  hasGuestProgress,
  markGuestProgressClaimDeclined,
  markGuestSongProgress,
} from "./lib/guestProgress";
import type { DraftRecording, Playlist, Song } from "./types";
import {
  createPublicUsernameFromName,
  DEFAULT_USER_ID,
  getOrCreateAnonymousUserId,
  isAnonymousUserId,
  normalizeUserId,
  normalizeUsername,
  type KnownUser,
  USER_COOKIE_NAME,
} from "./lib/userContext";
import type { PreferredAudioVersion } from "./lib/audioUrls";

interface SongListItem {
  id: string;
  title: string;
  artist?: string;
  audioKey?: string;
  createdAt: string;
  lastPracticedAt?: string | null;
}

type AppView =
  | "library"
  | "song_practice"
  | "song_segment_editor"
  | "song_add"
  | "playlists"
  | "shared"
  | "playlist_detail"
  | "playlist_practice";

type SongEditorReturnView = "library" | "song_practice" | "playlist_detail";

interface HashRouteState {
  view: AppView;
  songId?: string;
  playlistId?: string;
  returnView?: SongEditorReturnView;
}

interface UserSettings {
  segmentPrerollMs: number;
  preferredAudioVersion: PreferredAudioVersion;
  currentUserId: string;
  users: KnownUser[];
}

interface BuildInfo {
  version: string;
  branch: string;
  commitSha?: string;
}

interface AccountDeletionState {
  requestedAt: string | null;
  scheduledFor: string | null;
}

type LibraryRecordingStatus = "idle" | "recording" | "saving" | "saved" | "error";

const LIBRARY_DRAFT_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const SETTINGS_STORAGE_KEY = "cantare:user-settings";
const DEFAULT_USER_SETTINGS: UserSettings = {
  segmentPrerollMs: 500,
  preferredAudioVersion: "part",
  currentUserId: DEFAULT_USER_ID,
  users: [{ id: DEFAULT_USER_ID, username: "default", name: "Default User", email: "", profileVisibility: "private" }],
};

function makeAnonymousKnownUser(id: string): KnownUser {
  return {
    id,
    username: id,
    name: "Guest",
    email: "",
    profileVisibility: "private",
  };
}

function normalizeKnownUsers(users: Array<Partial<KnownUser>> | undefined): KnownUser[] {
  if (!Array.isArray(users)) {
    return DEFAULT_USER_SETTINGS.users;
  }

  const deduped = new Map<string, KnownUser>();
  for (const user of users) {
    if (!user || typeof user.id !== "string" || typeof user.name !== "string") {
      continue;
    }
    const id = normalizeUserId(user.id);
    const username = normalizeUsername(user.username) || createPublicUsernameFromName(user.name || id);
    if (!deduped.has(id)) {
      deduped.set(id, {
        id,
        username,
        name: user.name.trim() || username,
        email: typeof user.email === "string" ? user.email.trim().toLowerCase() : "",
        avatarUrl: user.avatarUrl ?? null,
        profileVisibility: user.profileVisibility ?? "private",
        accountDeletionRequestedAt: user.accountDeletionRequestedAt ?? null,
        accountDeletionScheduledFor: user.accountDeletionScheduledFor ?? null,
        isAdmin: user.isAdmin ?? false,
      });
    }
  }

  if (!deduped.has(DEFAULT_USER_ID)) {
    deduped.set(DEFAULT_USER_ID, DEFAULT_USER_SETTINGS.users[0]);
  }

  return Array.from(deduped.values());
}

interface AuthSessionPayload {
  user?: KnownUser | null;
  actor?: KnownUser | null;
  effectiveUser?: KnownUser | null;
  isImpersonating?: boolean;
}

interface ImpersonationState {
  actor: KnownUser;
  effectiveUser: KnownUser;
}

function clampSegmentPrerollMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_USER_SETTINGS.segmentPrerollMs;
  }
  return Math.max(0, Math.min(2000, Math.round(value)));
}

function normalizePreferredAudioVersion(value: unknown): PreferredAudioVersion {
  return value === "blend" ? "blend" : "part";
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

function parseStoredSettings(raw: string | null): UserSettings {
  if (!raw) {
    return DEFAULT_USER_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    const users = normalizeKnownUsers(parsed.users);
    const currentUserId = normalizeUserId(parsed.currentUserId ?? DEFAULT_USER_SETTINGS.currentUserId);
    return {
      segmentPrerollMs: clampSegmentPrerollMs(parsed.segmentPrerollMs ?? DEFAULT_USER_SETTINGS.segmentPrerollMs),
      preferredAudioVersion: normalizePreferredAudioVersion(parsed.preferredAudioVersion),
      currentUserId: users.some((user) => user.id === currentUserId) ? currentUserId : DEFAULT_USER_ID,
      users,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

function getGuestUserSettings(storedSettings: UserSettings, storage: Storage): UserSettings {
  const guestUserId = getOrCreateAnonymousUserId(storage);
  const users = storedSettings.users.some((user) => user.id === guestUserId)
    ? storedSettings.users
    : [...storedSettings.users, makeAnonymousKnownUser(guestUserId)];

  return {
    ...storedSettings,
    currentUserId: guestUserId,
    users,
  };
}

function mergeUsersWithDatabase(cachedUsers: KnownUser[], dbUsers: KnownUser[]): KnownUser[] {
  const merged = new Map<string, KnownUser>();

  for (const user of cachedUsers) {
    const id = normalizeUserId(user.id);
    const username = normalizeUsername(user.username) || createPublicUsernameFromName(user.name || id);
    merged.set(id, { ...user, id, username, name: user.name.trim() || username });
  }

  for (const user of dbUsers) {
    const id = normalizeUserId(user.id);
    const username = normalizeUsername(user.username) || createPublicUsernameFromName(user.name || id);
    merged.set(id, { ...user, id, username, name: user.name.trim() || username });
  }

  if (!merged.has(DEFAULT_USER_ID)) {
    merged.set(DEFAULT_USER_ID, DEFAULT_USER_SETTINGS.users[0]);
  }

  return Array.from(merged.values());
}

function parseHashRoute(hash: string): HashRouteState {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const view = params.get("view") as AppView | null;
  const songId = params.get("song") ?? undefined;
  const playlistId = params.get("playlist") ?? undefined;
  const returnViewParam = params.get("return") as SongEditorReturnView | null;

  const safeView: AppView =
    view === "song_practice" ||
    view === "song_segment_editor" ||
    view === "song_add" ||
    view === "playlists" ||
    view === "shared" ||
    view === "playlist_detail" ||
    view === "playlist_practice"
      ? view
      : "playlists";

  return {
    view: safeView,
    songId,
    playlistId,
    returnView:
      returnViewParam === "library" ||
      returnViewParam === "song_practice" ||
      returnViewParam === "playlist_detail"
        ? returnViewParam
        : undefined,
  };
}

function buildHashRoute(state: HashRouteState): string {
  const params = new URLSearchParams();
  params.set("view", state.view);
  if (state.songId) {
    params.set("song", state.songId);
  }
  if (state.playlistId) {
    params.set("playlist", state.playlistId);
  }
  if (state.returnView) {
    params.set("return", state.returnView);
  }
  return `#${params.toString()}`;
}

function UnifiedHeader({
  breadcrumb,
  title,
  action,
}: {
  breadcrumb?: { label: string; onClick?: () => void };
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        {breadcrumb ? (
          <div className="mb-1 flex items-center gap-2 text-sm text-gray-600">
            {breadcrumb.onClick ? (
              <button
                type="button"
                onClick={breadcrumb.onClick}
                className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-white"
              >
                {breadcrumb.label}
              </button>
            ) : (
              <span className="rounded-full border border-gray-300 px-3 py-1 text-gray-700">{breadcrumb.label}</span>
            )}
          </div>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
      </div>
      {action ?? null}
    </div>
  );
}

function getLibraryDraftRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  return LIBRARY_DRAFT_RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function getLibraryDraftRecordingExtension(contentType: string): string {
  const baseType = contentType.split(";")[0].trim().toLowerCase();
  if (baseType === "audio/mp4") return "m4a";
  if (baseType === "audio/ogg") return "ogg";
  if (baseType === "audio/wav") return "wav";
  if (baseType === "audio/mpeg" || baseType === "audio/mp3") return "mp3";
  return "webm";
}

function normalizeLibraryRecordingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Microphone permission was denied.";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No microphone was found.";
  }
  if (error.name === "NotReadableError") {
    return "The microphone is already in use.";
  }
  return error.message || fallback;
}

function formatLibraryDraftCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatAccountDeletionDate(value?: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(date);
}

function LibraryDraftRecorder({
  request,
  userId,
  refreshTrigger,
}: {
  request: (url: string, init?: RequestInit) => Promise<Response>;
  userId: string;
  refreshTrigger: number;
}) {
  const [recordingStatus, setRecordingStatus] = useState<LibraryRecordingStatus>("idle");
  const [recordingMessage, setRecordingMessage] = useState<string | null>(null);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [drafts, setDrafts] = useState<DraftRecording[]>([]);
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);
  const [selectedSongByDraft, setSelectedSongByDraft] = useState<Record<string, string>>({});
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const levelFrameRef = useRef<number | null>(null);

  const reviewingDraft = drafts.find((draft) => draft.id === reviewingDraftId) ?? null;

  const stopLevelMeter = useCallback(() => {
    if (levelFrameRef.current !== null) {
      window.cancelAnimationFrame(levelFrameRef.current);
      levelFrameRef.current = null;
    }
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    setRecordingLevel(0);
  }, []);

  const stopStream = useCallback(() => {
    stopLevelMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [stopLevelMeter]);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setRecordingLevel(0);
      return;
    }

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let total = 0;
        for (const sample of samples) {
          const centered = sample - 128;
          total += centered * centered;
        }
        setRecordingLevel(Math.min(1, Math.sqrt(total / samples.length) / 36));
        levelFrameRef.current = window.requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      setRecordingLevel(0);
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const response = await request("/api/draft-recordings", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { draftRecordings?: DraftRecording[] };
      setDrafts(Array.isArray(payload.draftRecordings) ? payload.draftRecordings : []);
    } catch {
      setDrafts([]);
    }
  }, [request]);

  const loadSongs = useCallback(async () => {
    try {
      const response = await request("/api/songs", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as SongListItem[];
      setSongs(Array.isArray(payload) ? payload : []);
    } catch {
      setSongs([]);
    }
  }, [request]);

  useEffect(() => {
    void loadDrafts();
    void loadSongs();
  }, [loadDrafts, loadSongs, refreshTrigger, userId]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  const saveRecordingBlob = useCallback(async (blob: Blob) => {
    const contentType = blob.type || "audio/webm";
    const extension = getLibraryDraftRecordingExtension(contentType);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `library-draft-recording-${timestamp}.${extension}`;

    const uploadUrlResponse = await request("/api/songs/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        contentType,
        size: blob.size,
        audioVersion: "draft",
      }),
    });
    if (!uploadUrlResponse.ok) {
      const payload = await uploadUrlResponse.json().catch(() => ({ error: "Failed to prepare draft upload" }));
      throw new Error(payload.error ?? `Failed to prepare draft upload (${uploadUrlResponse.status})`);
    }

    const { uploadUrl, key } = await uploadUrlResponse.json() as { uploadUrl?: string; key?: string };
    if (!uploadUrl || !key) {
      throw new Error("Draft upload response did not include an upload URL.");
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Draft upload failed (${uploadResponse.status})`);
    }

    const saveResponse = await request("/api/draft-recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioKey: key }),
    });
    if (!saveResponse.ok) {
      const payload = await saveResponse.json().catch(() => ({ error: "Failed to save draft recording" }));
      throw new Error(payload.error ?? `Failed to save draft recording (${saveResponse.status})`);
    }
    await loadDrafts();
  }, [loadDrafts, request]);

  const handleStartRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingStatus("error");
      setRecordingMessage("Recording is not available in this browser.");
      return;
    }

    try {
      setRecordingMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getLibraryDraftRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      chunksRef.current = [];
      startLevelMeter(stream);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const recordedType = recorder.mimeType || mimeType || "audio/webm";
        stopStream();
        recorderRef.current = null;

        window.setTimeout(() => void (async () => {
          const chunks = [...chunksRef.current];
          chunksRef.current = [];
          try {
            if (chunks.length === 0) {
              throw new Error("No audio was captured.");
            }
            const blob = new Blob(chunks, { type: recordedType });
            if (blob.size === 0) {
              throw new Error("No audio was captured.");
            }
            await saveRecordingBlob(blob);
            setRecordingStatus("saved");
            setRecordingMessage("Draft recording saved.");
          } catch (error) {
            setRecordingStatus("error");
            setRecordingMessage(normalizeLibraryRecordingError(error, "Failed to save draft recording."));
          }
        })(), 0);
      });

      recorderRef.current = recorder;
      recorder.start();
      setRecordingStatus("recording");
      setRecordingMessage("Recording...");
    } catch (error) {
      stopStream();
      recorderRef.current = null;
      setRecordingStatus("error");
      setRecordingMessage(normalizeLibraryRecordingError(error, "Could not start recording."));
    }
  }, [saveRecordingBlob, startLevelMeter, stopStream]);

  const handleStopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    setRecordingStatus("saving");
    setRecordingMessage("Saving draft recording...");
    recorder.stop();
  }, []);

  const handleAssignDraft = async (draftId: string) => {
    const songId = selectedSongByDraft[draftId] ?? "";
    if (!songId) {
      setAssignMessage("Choose a song first.");
      return;
    }

    setAssignMessage(null);
    try {
      const response = await request(`/api/draft-recordings/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to assign draft recording" }));
        throw new Error(payload.error ?? `Failed to assign draft recording (${response.status})`);
      }
      setReviewingDraftId(null);
      setSelectedSongByDraft((previous) => {
        const next = { ...previous };
        delete next[draftId];
        return next;
      });
      setAssignMessage("Draft recording added to song.");
      await loadDrafts();
    } catch (error) {
      setAssignMessage(error instanceof Error ? error.message : "Failed to assign draft recording.");
    }
  };

  const handleDiscardDraft = async (draftId: string) => {
    setAssignMessage(null);
    try {
      const response = await request(`/api/draft-recordings/${draftId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to discard draft recording" }));
        throw new Error(payload.error ?? `Failed to discard draft recording (${response.status})`);
      }
      if (reviewingDraftId === draftId) {
        setReviewingDraftId(null);
      }
      setAssignMessage("Draft recording discarded.");
      await loadDrafts();
    } catch (error) {
      setAssignMessage(error instanceof Error ? error.message : "Failed to discard draft recording.");
    }
  };

  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" data-testid="library-draft-recorder">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="library-recording-toggle"
          aria-pressed={recordingStatus === "recording"}
          onClick={() => {
            if (recordingStatus === "recording") {
              handleStopRecording();
            } else {
              void handleStartRecording();
            }
          }}
          disabled={recordingStatus === "saving"}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            recordingStatus === "recording"
              ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
              : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
          }`}
        >
          {recordingStatus === "recording" ? "Stop" : recordingStatus === "saving" ? "Saving..." : "Record"}
        </button>
        {recordingMessage ? (
          <span
            data-testid="library-recording-status"
            role={recordingStatus === "error" ? "alert" : "status"}
            className={`text-xs ${recordingStatus === "error" ? "text-red-700" : recordingStatus === "saved" ? "text-emerald-700" : "text-slate-600"}`}
          >
            {recordingMessage}
          </span>
        ) : null}
        {recordingStatus === "recording" ? (
          <div className="flex min-w-[96px] items-center gap-2" aria-label="Microphone input level" data-testid="library-recording-level">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                style={{ width: `${Math.max(4, Math.round(recordingLevel * 100))}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">Input</span>
          </div>
        ) : null}
      </div>

      {drafts.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Unassigned Draft Recordings</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{drafts.length}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {drafts.map((draft, index) => (
              <li key={draft.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{draft.title?.trim() || `Draft recording ${drafts.length - index}`}</p>
                    <p className="text-xs text-slate-500">{formatLibraryDraftCreatedAt(draft.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDiscardDraft(draft.id)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewingDraftId((current) => current === draft.id ? null : draft.id)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Review
                    </button>
                  </div>
                </div>
                {reviewingDraft?.id === draft.id ? (
                  <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/40 p-3" data-testid="library-draft-review">
                    <audio controls src={draft.audioUrl ?? ""} className="w-full" />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        aria-label="Choose song"
                        value={selectedSongByDraft[draft.id] ?? ""}
                        onChange={(event) => setSelectedSongByDraft((previous) => ({ ...previous, [draft.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value="">Choose song...</option>
                        {songs.map((song) => (
                          <option key={song.id} value={song.id}>
                            {song.title}{song.artist ? ` - ${song.artist}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAssignDraft(draft.id)}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Add to song
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {assignMessage ? (
            <p className={`mt-2 text-xs ${assignMessage.includes("Failed") || assignMessage.includes("Choose") ? "text-red-700" : "text-emerald-700"}`} role={assignMessage.includes("Failed") || assignMessage.includes("Choose") ? "alert" : "status"}>
              {assignMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SettingsSection({
  title,
  children,
  tone = "default",
  testId,
}: {
  title: string;
  children: ReactNode;
  tone?: "default" | "admin" | "muted";
  testId: string;
}) {
  const toneClass =
    tone === "admin"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "muted"
        ? "border-gray-200 bg-gray-50 text-gray-800"
        : "border-gray-200 bg-white text-gray-800";

  return (
    <details data-testid={testId} className={`group rounded-lg border ${toneClass}`}>
      <summary
        data-testid={`${testId}-toggle`}
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold"
      >
        <span>{title}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          &gt;
        </span>
      </summary>
      <div className="border-t border-current/10 px-3 pb-3 pt-3">
        {children}
      </div>
    </details>
  );
}

export default function Home({ buildInfo }: { buildInfo: BuildInfo }) {
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<AppView>("playlists");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistPracticeReturnView, setPlaylistPracticeReturnView] = useState<"playlists" | "shared">("playlists");
  const [playlistPracticeReadOnly, setPlaylistPracticeReadOnly] = useState(false);
  const [songEditorReturnView, setSongEditorReturnView] = useState<SongEditorReturnView>("library");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_USER_SETTINGS;
    }

    const storedSettings = parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
    return getGuestUserSettings(storedSettings, window.localStorage);
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountDeletion, setAccountDeletion] = useState<AccountDeletionState | null>(null);
  const [accountDeletionLoading, setAccountDeletionLoading] = useState(false);
  const [accountDeletionMessage, setAccountDeletionMessage] = useState("");
  const [guestClaimVisible, setGuestClaimVisible] = useState(false);
  const [guestClaimLoading, setGuestClaimLoading] = useState(false);
  const [guestClaimMessage, setGuestClaimMessage] = useState("");
  const [sessionActor, setSessionActor] = useState<KnownUser | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [adminUsers, setAdminUsers] = useState<KnownUser[]>([]);
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminSelectedUserId, setAdminSelectedUserId] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const settingsLoadedRef = useRef(false);
  const usersHydratedFromDbRef = useRef(false);
  const isApplyingHashRouteRef = useRef(false);
  const activeUserId = userSettings.currentUserId;
  const currentUser = useMemo(
    () => userSettings.users.find((user) => user.id === userSettings.currentUserId) ?? DEFAULT_USER_SETTINGS.users[0],
    [userSettings.currentUserId, userSettings.users]
  );
  const isSignedIn = Boolean((currentUser.email ?? "").trim() || (sessionActor?.email ?? "").trim());
  const appTitle = isSignedIn ? "Cantare Music" : "Cantare Music (Guest)";
  const adminActor = sessionActor?.isAdmin ? sessionActor : currentUser.isAdmin ? currentUser : null;

  const applyAuthenticatedUser = useCallback((user: KnownUser) => {
    setUserSettings((previous) => {
      const users = mergeUsersWithDatabase(previous.users, normalizeKnownUsers([user]));
      return {
        ...previous,
        currentUserId: normalizeUserId(user.id),
        users,
      };
    });
  }, []);

  const applyAuthSessionPayload = useCallback((payload: AuthSessionPayload) => {
    const actor = payload.actor ?? payload.user ?? null;
    const effectiveUser = payload.effectiveUser ?? payload.user ?? null;

    setSessionActor(actor);
    if (actor && effectiveUser && payload.isImpersonating) {
      setImpersonation({ actor, effectiveUser });
    } else {
      setImpersonation(null);
    }

    if (effectiveUser) {
      setUserSettings((previous) => {
        const users = mergeUsersWithDatabase(previous.users, normalizeKnownUsers([actor, effectiveUser].filter(Boolean) as KnownUser[]));
        return {
          ...previous,
          currentUserId: normalizeUserId(effectiveUser.id),
          users,
        };
      });
    }
  }, []);

  const withUserHeader = useCallback((init?: RequestInit): RequestInit | undefined => {
    return {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "X-User-ID": activeUserId,
      },
    };
  }, [activeUserId]);

  const request = useCallback((url: string, init?: RequestInit) => {
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  }, [withUserHeader]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/cantare-audio-sw.js").catch(() => {
        // The app still works without offline audio caching.
      });
    }

    const storedSettings = parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
    setUserSettings(getGuestUserSettings(storedSettings, window.localStorage));
    settingsLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const shouldCleanAuthParam = params.get("auth") === "signed-in";
    const cookieUserId = normalizeUserId(readCookieValue(USER_COOKIE_NAME));
    if ((cookieUserId === DEFAULT_USER_ID || isAnonymousUserId(cookieUserId)) && !shouldCleanAuthParam) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as AuthSessionPayload;
        if (!cancelled && (payload.user || payload.effectiveUser)) {
          applyAuthSessionPayload(payload);
          if (shouldCleanAuthParam) {
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
          }
        }
      } catch {
        // Session hydration is best-effort; the signed user cookie still scopes API requests.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyAuthSessionPayload]);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsLoadedRef.current) {
      return;
    }

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(userSettings));
    const cookieValue = encodeURIComponent(userSettings.currentUserId);
    document.cookie = `${USER_COOKIE_NAME}=${cookieValue}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [userSettings]);

  useEffect(() => {
    if (settingsOpen) {
      setProfileDisplayName(currentUser.name);
      setProfileMessage("");
    }
  }, [currentUser.name, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || !isSignedIn) {
      setAccountDeletion(null);
      setAccountDeletionMessage("");
      return;
    }

    let cancelled = false;

    const loadAccountDeletion = async () => {
      setAccountDeletionLoading(true);
      try {
        const response = await fetch("/api/users/me/deletion", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load account deletion");
        }
        const payload = (await response.json()) as { deletion?: AccountDeletionState };
        if (!cancelled) {
          setAccountDeletion(payload.deletion ?? { requestedAt: null, scheduledFor: null });
        }
      } catch {
        if (!cancelled) {
          setAccountDeletion(null);
        }
      } finally {
        if (!cancelled) {
          setAccountDeletionLoading(false);
        }
      }
    };

    void loadAccountDeletion();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, settingsOpen]);

  useEffect(() => {
    if (!isSignedIn || typeof window === "undefined") {
      setGuestClaimVisible(false);
      return;
    }

    setGuestClaimVisible(hasGuestProgress() && !hasDeclinedGuestProgressClaim(currentUser.id));
    setGuestClaimMessage("");
  }, [currentUser.id, isSignedIn]);

  useEffect(() => {
    if (!settingsOpen || usersHydratedFromDbRef.current) {
      return;
    }

    let cancelled = false;

    const hydrateUsersFromDatabase = async () => {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { users?: KnownUser[] };
        if (!Array.isArray(payload.users) || payload.users.length === 0) {
          return;
        }

        const dbUsers = normalizeKnownUsers(payload.users);
        if (cancelled) {
          return;
        }

        setUserSettings((previous) => {
          const users = mergeUsersWithDatabase(previous.users, dbUsers);
          const currentUserId = users.some((user) => user.id === previous.currentUserId)
            ? previous.currentUserId
            : DEFAULT_USER_ID;

          return {
            ...previous,
            users,
            currentUserId,
          };
        });
      } catch {
        // Keep local cache fallback when DB users endpoint is unavailable.
      } finally {
        usersHydratedFromDbRef.current = true;
      }
    };

    void hydrateUsersFromDatabase();

    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || !adminActor?.isAdmin) {
      return;
    }

    let cancelled = false;

    const loadAdminUsers = async () => {
      setAdminLoading(true);
      setAdminMessage("");
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load users");
        }
        const payload = (await response.json()) as { users?: KnownUser[] };
        if (cancelled) {
          return;
        }
        const users = normalizeKnownUsers(payload.users);
        setAdminUsers(users);
        setAdminSelectedUserId((previous) => previous || users.find((user) => user.id !== currentUser.id)?.id || users[0]?.id || "");
      } catch {
        if (!cancelled) {
          setAdminMessage("Could not load users.");
        }
      } finally {
        if (!cancelled) {
          setAdminLoading(false);
        }
      }
    };

    void loadAdminUsers();

    return () => {
      cancelled = true;
    };
  }, [adminActor?.isAdmin, currentUser.id, settingsOpen]);

  const handleMagicLinkRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authEmail.trim()) {
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim() }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      setAuthMessage(payload.message ?? "If that email can sign in to Cantare, a login link is on the way.");
    } catch {
      setAuthMessage("If that email can sign in to Cantare, a login link is on the way.");
    } finally {
      setAuthLoading(false);
    }
  };
  const guestSignInForm = (
    <>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleMagicLinkRequest}>
        <label htmlFor="guest-sign-in-email" className="text-sm font-medium text-gray-700">
          Email for magic link
        </label>
        <input
          id="guest-sign-in-email"
          type="email"
          value={authEmail}
          onChange={(event) => setAuthEmail(event.target.value)}
          placeholder="Email address"
          className="min-w-0 rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 sm:col-start-1 sm:row-start-2"
        />
        <button
          type="submit"
          disabled={authLoading || !authEmail.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-start-2 sm:row-start-2"
        >
          Email magic link
        </button>
      </form>
      {authMessage ? (
        <p className="mt-2 text-xs text-gray-600" role="status">
          {authMessage}
        </p>
      ) : (
        <p className="mt-2 text-xs text-gray-600">
          Enter your email and Cantare will mail you a secure sign-in link. No password required.
        </p>
      )}
    </>
  );

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = profileDisplayName.trim();
    if (!displayName) {
      setProfileMessage("Display name is required.");
      return;
    }

    setProfileSaving(true);
    setProfileMessage("");
    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!response.ok) {
        throw new Error("Failed to update profile");
      }
      const payload = (await response.json()) as AuthSessionPayload;
      if (payload.user) {
        applyAuthenticatedUser(payload.user);
        setProfileDisplayName(payload.user.name);
      }
      setProfileMessage("Profile saved.");
      usersHydratedFromDbRef.current = false;
    } catch {
      setProfileMessage("Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleScheduleAccountDeletion = async () => {
    if (accountDeletionLoading) {
      return;
    }

    const confirmationDate = formatAccountDeletionDate(
      (() => {
        const future = new Date();
        future.setDate(future.getDate() + 30);
        return future.toISOString();
      })()
    );

    const confirmed = window.confirm(
      `Schedule this account for permanent deletion on ${confirmationDate}? You can cancel anytime before then.`
    );
    if (!confirmed) {
      return;
    }

    setAccountDeletionLoading(true);
    setAccountDeletionMessage("");
    try {
      const response = await fetch("/api/users/me/deletion", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { deletion?: AccountDeletionState; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to schedule account deletion");
      }
      setAccountDeletion(payload.deletion ?? { requestedAt: null, scheduledFor: null });
      setAccountDeletionMessage("Account scheduled for deletion.");
      usersHydratedFromDbRef.current = false;
    } catch (error) {
      setAccountDeletionMessage(error instanceof Error ? error.message : "Could not schedule account deletion.");
    } finally {
      setAccountDeletionLoading(false);
    }
  };

  const handleCancelAccountDeletion = async () => {
    if (accountDeletionLoading) {
      return;
    }

    const confirmed = window.confirm("Cancel the scheduled account deletion?");
    if (!confirmed) {
      return;
    }

    setAccountDeletionLoading(true);
    setAccountDeletionMessage("");
    try {
      const response = await fetch("/api/users/me/deletion", { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { deletion?: AccountDeletionState; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to cancel account deletion");
      }
      setAccountDeletion(payload.deletion ?? { requestedAt: null, scheduledFor: null });
      setAccountDeletionMessage("Scheduled account deletion canceled.");
      usersHydratedFromDbRef.current = false;
    } catch (error) {
      setAccountDeletionMessage(error instanceof Error ? error.message : "Could not cancel account deletion.");
    } finally {
      setAccountDeletionLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } catch {
      // Clear local state even if the server-side revoke request cannot complete.
    } finally {
      const guestUserId = typeof window === "undefined" ? DEFAULT_USER_ID : getOrCreateAnonymousUserId(window.localStorage);
      setUserSettings((previous) => ({
        ...previous,
        currentUserId: guestUserId,
        users: previous.users.some((user) => user.id === guestUserId)
          ? previous.users
          : [...previous.users, makeAnonymousKnownUser(guestUserId)],
      }));
      setSessionActor(null);
      setImpersonation(null);
      setSelectedSong(null);
      setSelectedPlaylist(null);
      setRefreshTrigger((previous) => previous + 1);
      setActiveView("playlists");
      setAuthMessage("Signed out.");
      setAuthLoading(false);
    }
  };

  const handleStartImpersonation = async () => {
    if (!adminSelectedUserId) {
      return;
    }

    setAdminLoading(true);
    setAdminMessage("");
    try {
      const response = await fetch("/api/admin/impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: adminSelectedUserId }),
      });
      if (!response.ok) {
        throw new Error("Failed to start impersonation");
      }
      const payload = (await response.json()) as AuthSessionPayload;
      applyAuthSessionPayload(payload);
      setSelectedSong(null);
      setSelectedPlaylist(null);
      setRefreshTrigger((previous) => previous + 1);
      setActiveView("playlists");
      setSettingsOpen(false);
    } catch {
      setAdminMessage("Could not start impersonation.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleStopImpersonation = async () => {
    setAdminLoading(true);
    setAdminMessage("");
    try {
      const response = await fetch("/api/admin/impersonation", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Failed to stop impersonation");
      }
      const payload = (await response.json()) as AuthSessionPayload;
      applyAuthSessionPayload(payload);
      setSelectedSong(null);
      setSelectedPlaylist(null);
      setRefreshTrigger((previous) => previous + 1);
      setActiveView("playlists");
    } catch {
      setAdminMessage("Could not exit impersonation.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleClaimGuestProgress = async () => {
    const songIds = getGuestProgressSongIds();
    if (songIds.length === 0) {
      clearGuestProgress();
      setGuestClaimVisible(false);
      return;
    }

    setGuestClaimLoading(true);
    setGuestClaimMessage("");
    try {
      const response = await fetch("/api/guest-progress/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds, guestUserId: getGuestProgressUserId() ?? activeUserId }),
      });
      if (!response.ok) {
        throw new Error("Failed to import guest progress");
      }

      clearGuestProgress();
      setGuestClaimVisible(false);
      setRefreshTrigger((previous) => previous + 1);
      setSelectedSong(null);
      setSelectedPlaylist(null);
      setActiveView("playlists");
    } catch {
      setGuestClaimMessage("Could not import guest progress. Your local progress is still here.");
    } finally {
      setGuestClaimLoading(false);
    }
  };

  const handleDeclineGuestProgressClaim = () => {
    markGuestProgressClaimDeclined(currentUser.id);
    setGuestClaimVisible(false);
    setGuestClaimMessage("");
  };

  const impersonationBanner = impersonation ? (
    <div
      className="sticky top-0 z-30 border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950 shadow-sm"
      data-testid="impersonation-banner"
      role="status"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <span className="font-bold uppercase tracking-wide">Impersonating</span>{" "}
          <span className="font-semibold">{impersonation.actor.name}</span>
          {impersonation.actor.email ? <span> ({impersonation.actor.email})</span> : null}
          <span className="mx-2">acting as</span>
          <span className="font-semibold">{impersonation.effectiveUser.name}</span>
          {impersonation.effectiveUser.email ? <span> ({impersonation.effectiveUser.email})</span> : null}
        </div>
        <button
          type="button"
          data-testid="stop-impersonation"
          onClick={() => {
            void handleStopImpersonation();
          }}
          disabled={adminLoading}
          className="w-fit rounded border border-amber-500 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Exit impersonation
        </button>
      </div>
    </div>
  ) : null;

  const filteredAdminUsers = adminUsers.filter((user) => {
    const query = adminUserSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return (
      user.name.toLowerCase().includes(query) ||
      user.username.toLowerCase().includes(query) ||
      (user.email ?? "").toLowerCase().includes(query)
    );
  });
  const selectedAdminUserIsVisible = filteredAdminUsers.some((user) => user.id === adminSelectedUserId);

  const loadSongById = useCallback(async (songId: string): Promise<Song | null> => {
    const response = await request(`/api/songs/${songId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Song;
  }, [request]);

  const loadPlaylistById = useCallback(async (playlistId: string): Promise<Playlist | null> => {
    const response = await request(`/api/playlists/${playlistId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Playlist;
  }, [request]);

  const applyHashRoute = useCallback(async (hash: string) => {
    isApplyingHashRouteRef.current = true;
    try {
      const route = parseHashRoute(hash);

      if (route.view === "library") {
        setSelectedSong(null);
        setSelectedPlaylist(null);
        setActiveView("library");
        return;
      }

      if (route.view === "playlists") {
        setSelectedSong(null);
        setActiveView("playlists");
        return;
      }

      if (route.view === "song_add") {
        setSelectedSong(null);
        setActiveView("song_add");
        return;
      }

      if (route.view === "playlist_detail" || route.view === "playlist_practice") {
        if (!route.playlistId) {
          setActiveView("playlists");
          return;
        }
        const playlist = await loadPlaylistById(route.playlistId);
        if (!playlist) {
          setActiveView("playlists");
          return;
        }
        setSelectedPlaylist(playlist);
        setActiveView(route.view);
        return;
      }

      if (route.view === "song_practice" || route.view === "song_segment_editor") {
        if (!route.songId) {
          setActiveView("library");
          return;
        }
        const song = await loadSongById(route.songId);
        if (!song) {
          setActiveView("library");
          return;
        }
        setSelectedSong(song);
        if (route.playlistId) {
          const playlist = await loadPlaylistById(route.playlistId);
          if (playlist) {
            setSelectedPlaylist(playlist);
          }
        }
        if (route.view === "song_segment_editor" && route.returnView) {
          setSongEditorReturnView(route.returnView);
        }
        setActiveView(route.view);
      }
    } finally {
      isApplyingHashRouteRef.current = false;
    }
  }, [loadPlaylistById, loadSongById]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onHashChange = () => {
      void applyHashRoute(window.location.hash);
    };
    const onPopState = () => {
      void applyHashRoute(window.location.hash);
    };

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onPopState);
    const currentHash = window.location.hash;
    if (currentHash) {
      void applyHashRoute(currentHash);
    } else {
      window.history.replaceState(null, "", buildHashRoute({ view: "playlists" }));
    }

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
    };
  }, [applyHashRoute]);

  const currentHash = useMemo(() => {
    if (activeView === "song_practice" && selectedSong) {
      return buildHashRoute({
        view: "song_practice",
        songId: selectedSong.id,
        playlistId: selectedPlaylist?.id,
      });
    }

    if (activeView === "song_segment_editor" && selectedSong) {
      return buildHashRoute({
        view: "song_segment_editor",
        songId: selectedSong.id,
        playlistId: selectedPlaylist?.id,
        returnView: songEditorReturnView,
      });
    }

    if ((activeView === "playlist_detail" || activeView === "playlist_practice") && selectedPlaylist) {
      return buildHashRoute({ view: activeView, playlistId: selectedPlaylist.id });
    }

    return buildHashRoute({ view: activeView });
  }, [activeView, selectedPlaylist, selectedSong, songEditorReturnView]);

  useEffect(() => {
    if (typeof window === "undefined" || isApplyingHashRouteRef.current) {
      return;
    }
    if (window.location.hash === currentHash) {
      return;
    }
    window.history.pushState(null, "", currentHash);
  }, [currentHash]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let lastRefreshAt = 0;
    const maybeRefreshAfterResume = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 1500) {
        return;
      }
      lastRefreshAt = now;
      setRefreshTrigger((previous) => previous + 1);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeRefreshAfterResume();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        maybeRefreshAfterResume();
      }
    };

    window.addEventListener("focus", maybeRefreshAfterResume);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", maybeRefreshAfterResume);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const openSongEditor = async (songId: string, returnView: SongEditorReturnView) => {
    try {
      const fullSong = await loadSongById(songId);
      if (!fullSong) throw new Error("Failed to fetch song");
      setSelectedSong(fullSong);
      setSongEditorReturnView(returnView);
      setActiveView("song_segment_editor");
    } catch (err) {
      console.error("Failed to load song:", err);
    }
  };

  const handleSongCreated = (songId: string) => {
    markGuestSongProgress(songId, activeUserId);
    void openSongEditor(songId, "library");
  };

  const handleSongDeleted = (songId: string) => {
    setRefreshTrigger((prev) => prev + 1);
    if (selectedSong?.id === songId) {
      setSelectedSong(null);
      setActiveView("library");
    }
  };

  const handleSelectSong = async (song: SongListItem) => {
    try {
      const fullSong = await loadSongById(song.id);
      if (!fullSong) throw new Error("Failed to fetch song details");
      setSelectedSong(fullSong);
      setActiveView("song_practice");
    } catch (err) {
      console.error("Failed to load song:", err);
    }
  };

  const refreshSelectedSong = async () => {
    if (!selectedSong) return;
    try {
      const response = await request(`/api/songs/${selectedSong.id}`);
      if (!response.ok) throw new Error("Failed to refresh song");
      const fullSong: Song = await response.json();
      setSelectedSong(fullSong);
    } catch (err) {
      console.error("Failed to refresh selected song:", err);
    }
  };

  const refreshSelectedPlaylist = async () => {
    if (!selectedPlaylist) return;
    try {
      const response = await request(`/api/playlists/${selectedPlaylist.id}`);
      if (!response.ok) throw new Error("Failed to refresh playlist");
      const fullPlaylist: Playlist = await response.json();
      setSelectedPlaylist(fullPlaylist);
    } catch (err) {
      console.error("Failed to refresh selected playlist:", err);
    }
  };

  const handleBackToPractice = async () => {
    await refreshSelectedSong();
    setActiveView("song_practice");
  };

  const handleExitSongEditor = async () => {
    if (songEditorReturnView === "song_practice") {
      await handleBackToPractice();
      return;
    }

    if (songEditorReturnView === "playlist_detail") {
      setSelectedSong(null);
      setActiveView("playlist_detail");
      return;
    }

    setSelectedSong(null);
    setRefreshTrigger((previous) => previous + 1);
    setActiveView("library");
  };

  const guestClaimPrompt = guestClaimVisible ? (
    <div
      className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-lg border border-indigo-200 bg-white p-4 shadow-xl"
      data-testid="guest-claim-prompt"
      role="dialog"
      aria-label="Import guest progress"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Import guest practice progress?</h2>
          <p className="mt-1 text-sm text-gray-600">
            We found practice progress from before you signed in. Import it into this account.
          </p>
          {guestClaimMessage ? (
            <p className="mt-2 text-xs text-amber-700" role="status">
              {guestClaimMessage}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="guest-claim-decline"
            onClick={handleDeclineGuestProgressClaim}
            disabled={guestClaimLoading}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Not now
          </button>
          <button
            type="button"
            data-testid="guest-claim-import"
            onClick={() => {
              void handleClaimGuestProgress();
            }}
            disabled={guestClaimLoading}
            className="rounded border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guestClaimLoading ? "Importing" : "Import"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (activeView === "song_practice" && selectedSong) {
    const session = makeSession({ songId: selectedSong.id });
    const breadcrumbRootLabel = selectedPlaylist?.name ?? "Songs";
    const handleBreadcrumbRootClick = () => {
      setSelectedSong(null);
      if (selectedPlaylist) {
        void (async () => {
          if (!playlistPracticeReadOnly) {
            await refreshSelectedPlaylist();
          }
          setActiveView("playlist_practice");
        })();
        return;
      }
      setRefreshTrigger((previous) => previous + 1);
      setActiveView("library");
    };

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        {impersonationBanner}
        {guestClaimPrompt}
        <div className="max-w-4xl mx-auto">
          <PracticeView
            song={selectedSong}
            userId={activeUserId}
            persistProgress={!playlistPracticeReadOnly}
            readOnlyDataUserId={playlistPracticeReadOnly ? selectedPlaylist?.owner?.id : undefined}
            initialSession={session}
            onDraftRecordingSaved={refreshSelectedSong}
            breadcrumbRootLabel={breadcrumbRootLabel}
            onBreadcrumbRootClick={handleBreadcrumbRootClick}
            segmentPrerollMs={userSettings.segmentPrerollMs}
            preferredAudioVersion={userSettings.preferredAudioVersion}
            onPreferredAudioVersionChange={(version) => {
              setUserSettings((previous) => ({ ...previous, preferredAudioVersion: version }));
            }}
            onEditSongClick={() => {
              setSongEditorReturnView("song_practice");
              setActiveView("song_segment_editor");
            }}
          />
        </div>
      </div>
    );
  }

  if (activeView === "song_segment_editor" && selectedSong) {
    const backLabel = songEditorReturnView === "playlist_detail"
      ? "\u2190 Back to Playlist"
      : songEditorReturnView === "song_practice"
        ? "\u2190 Back to Practice"
        : "\u2190 Back to Songs";

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        {impersonationBanner}
        {guestClaimPrompt}
        <div className="max-w-4xl mx-auto">
          <UnifiedHeader
            breadcrumb={{
              label: songEditorReturnView === "playlist_detail" ? "Playlist" : songEditorReturnView === "song_practice" ? "Practice" : "Songs",
              onClick: () => {
                void handleExitSongEditor();
              },
            }}
            title={`Edit ${selectedSong.title}`}
            action={
              <button
                data-testid="song-editor-back"
                onClick={() => void handleExitSongEditor()}
                className="rounded bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-800"
              >
                {backLabel}
              </button>
            }
          />
          <SegmentEditor
            songId={selectedSong.id}
            userId={activeUserId}
            onSongUpdated={refreshSelectedSong}
            onSongDeleted={handleSongDeleted}
          />
        </div>
      </div>
    );
  }

  if (activeView === "song_add") {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        {impersonationBanner}
        {guestClaimPrompt}
        <div className="max-w-2xl mx-auto">
          <UnifiedHeader
            breadcrumb={{
              label: "Songs",
              onClick: () => {
                setRefreshTrigger((previous) => previous + 1);
                setActiveView("library");
              },
            }}
            title="Add New Song"
          />
          <div className="bg-white p-6 rounded-lg shadow">
            <SongForm userId={activeUserId} onSuccess={handleSongCreated} />
          </div>
        </div>
      </div>
    );
  }

  if (activeView === "playlist_detail" && selectedPlaylist) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        {impersonationBanner}
        {guestClaimPrompt}
        <div className="mx-auto max-w-4xl">
          <PlaylistDetail
            key={`playlist-detail:${activeUserId}:${selectedPlaylist.id}`}
            playlistId={selectedPlaylist.id}
            userId={activeUserId}
            onBack={() => setActiveView("playlists")}
            onPractice={(playlist) => {
              setSelectedPlaylist(playlist);
              setPlaylistPracticeReturnView("playlists");
              setPlaylistPracticeReadOnly(false);
              setActiveView("playlist_practice");
            }}
            onEditSong={(songId) => {
              void openSongEditor(songId, "playlist_detail");
            }}
          />
        </div>
      </div>
    );
  }

  if (activeView === "playlist_practice" && selectedPlaylist) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        {impersonationBanner}
        {guestClaimPrompt}
        <div className="mx-auto max-w-4xl">
          <PlaylistPracticeView
            playlist={selectedPlaylist}
            userId={activeUserId}
            persistProgress={!playlistPracticeReadOnly}
            preferredAudioVersion={userSettings.preferredAudioVersion}
            onPreferredAudioVersionChange={(version) => {
              setUserSettings((previous) => ({ ...previous, preferredAudioVersion: version }));
            }}
            onExit={() => {
              setSelectedPlaylist(null);
              setPlaylistPracticeReadOnly(false);
              setActiveView(playlistPracticeReturnView);
            }}
            onManage={playlistPracticeReadOnly ? undefined : () => setActiveView("playlist_detail")}
            onSelectSong={(song) => {
              setSelectedSong(song);
              setActiveView("song_practice");

              if (playlistPracticeReadOnly) {
                return;
              }

              void (async () => {
                try {
                  const fullSong = await loadSongById(song.id);
                  if (!fullSong) {
                    return;
                  }
                  setSelectedSong((current) => (current?.id === fullSong.id ? fullSong : current));
                } catch (err) {
                  console.error("Failed to refresh song:", err);
                }
              })();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {impersonationBanner}
      {guestClaimPrompt}
      <div className="max-w-4xl mx-auto">
        <UnifiedHeader
          title={appTitle}
          action={
            <button
              type="button"
              data-testid="home-settings-toggle"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition hover:border-gray-400 hover:text-gray-900"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.66.26 1.09.9 1.09 1.61V11a2 2 0 0 1 0 2v.39c0 .71-.43 1.35-1.09 1.61z" />
              </svg>
            </button>
          }
        />

        {settingsOpen ? (
          <div className="fixed inset-0 z-40" data-testid="settings-overlay">
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
              className="absolute inset-0 bg-black/20"
            />
            <section
              aria-label="Settings"
              className="absolute inset-x-4 bottom-4 top-16 flex w-auto flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100dvh-6rem)] sm:w-[min(92vw,24rem)]"
              data-testid="settings-panel"
            >
              <div className="mb-4 flex shrink-0 items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div data-testid="settings-scroll-body" className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2 pr-1">
                <SettingsSection title="Playback" tone="muted" testId="settings-section-playback">
                  <div>
                    <p className="text-sm text-gray-700">Default audio</p>
                    <div
                      className="mt-1 inline-flex rounded border border-gray-300 bg-white p-0.5"
                      data-testid="settings-audio-preference-toggle"
                    >
                      {([
                        ["part", "Part"],
                        ["blend", "Blend"],
                      ] as const).map(([version, label]) => (
                        <button
                          key={version}
                          type="button"
                          data-testid={`settings-audio-preference-${version}`}
                          aria-pressed={userSettings.preferredAudioVersion === version}
                          onClick={() => setUserSettings((previous) => ({ ...previous, preferredAudioVersion: version }))}
                          className={`rounded px-3 py-1 text-sm font-semibold ${
                            userSettings.preferredAudioVersion === version
                              ? "bg-indigo-600 text-white"
                              : "text-indigo-700 hover:bg-indigo-50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label htmlFor="segment-preroll-slider" className="mt-3 block text-sm text-gray-700">
                    Segment preroll: <span className="font-semibold">{(userSettings.segmentPrerollMs / 1000).toFixed(1)}s</span>
                  </label>
                  <input
                    id="segment-preroll-slider"
                    data-testid="segment-preroll-slider"
                    type="range"
                    min={0}
                    max={2000}
                    step={50}
                    value={userSettings.segmentPrerollMs}
                    onChange={(event) => {
                      const nextValue = clampSegmentPrerollMs(Number(event.target.value));
                      setUserSettings((previous) => ({ ...previous, segmentPrerollMs: nextValue }));
                    }}
                    className="mt-2 w-full"
                  />
                  <p className="mt-2 text-xs text-gray-600">
                    Starts segment playback slightly early to avoid clipped phrase starts on some devices.
                  </p>

                </SettingsSection>

                <SettingsSection title="Account" testId="settings-section-account">
                  {isSignedIn ? (
                    <>
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-gray-200 bg-gray-50 p-2 text-sm">
                        <dt className="font-medium text-gray-700">Email</dt>
                        <dd data-testid="settings-current-email" className="break-all text-gray-800">
                          {currentUser.email}
                        </dd>
                        <dt className="font-medium text-gray-700">Username</dt>
                        <dd data-testid="settings-current-username" className="text-gray-800">
                          @{currentUser.username}
                        </dd>
                      </dl>
                      <form className="mt-3 grid gap-2" onSubmit={handleProfileSave}>
                        <label htmlFor="profile-display-name" className="text-sm font-medium text-gray-700">
                          Display name
                        </label>
                        <input
                          id="profile-display-name"
                          data-testid="profile-display-name"
                          type="text"
                          value={profileDisplayName}
                          onChange={(event) => setProfileDisplayName(event.target.value)}
                          className="min-w-0 rounded border border-gray-300 px-2 py-1 text-sm text-gray-800"
                        />
                        <button
                          type="submit"
                          disabled={profileSaving || !profileDisplayName.trim() || profileDisplayName.trim() === currentUser.name}
                          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Save profile
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => {
                          void handleSignOut();
                        }}
                        disabled={authLoading}
                        className="mt-3 rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Sign out
                      </button>
                      <div className="mt-4 rounded border border-red-200 bg-red-50 p-3" data-testid="settings-account-deletion">
                        <p className="text-sm font-semibold text-red-900">Danger zone</p>
                        {accountDeletion?.scheduledFor ? (
                          <p className="mt-1 text-xs text-red-900">
                            This account is scheduled for permanent deletion on {formatAccountDeletionDate(accountDeletion.scheduledFor)}.
                            You can cancel it any time before then.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-red-900">
                            Deleting your account permanently removes your songs, playlists, draft recordings, practice history, and sign-in access after a 30-day warning period.
                          </p>
                        )}
                        <button
                          type="button"
                          data-testid={accountDeletion?.scheduledFor ? "cancel-account-deletion-button" : "schedule-account-deletion-button"}
                          onClick={() => {
                            void (accountDeletion?.scheduledFor ? handleCancelAccountDeletion() : handleScheduleAccountDeletion());
                          }}
                          disabled={accountDeletionLoading}
                          className={`mt-3 rounded border px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                            accountDeletion?.scheduledFor
                              ? "border-red-300 bg-white text-red-800 hover:bg-red-100"
                              : "border-red-600 bg-red-600 text-white hover:bg-red-700"
                          }`}
                        >
                          {accountDeletionLoading
                            ? "Working..."
                            : accountDeletion?.scheduledFor
                              ? "Cancel scheduled deletion"
                              : "Delete account in 30 days"}
                        </button>
                        {accountDeletionMessage ? (
                          <p className="mt-2 text-xs text-red-900" role="status">
                            {accountDeletionMessage}
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-gray-600">
                        Enter your email and Cantare will mail you a secure sign-in link. No password required.
                      </p>
                      <form className="mt-3 grid gap-2" onSubmit={handleMagicLinkRequest}>
                        <label htmlFor="settings-sign-in-email" className="text-sm font-medium text-gray-700">
                          Email for magic link
                        </label>
                        <input
                          id="settings-sign-in-email"
                          type="email"
                          value={authEmail}
                          onChange={(event) => setAuthEmail(event.target.value)}
                          placeholder="Email address"
                          className="min-w-0 rounded border border-gray-300 px-2 py-1 text-sm text-gray-800"
                        />
                        <button
                          type="submit"
                          disabled={authLoading || !authEmail.trim()}
                          className="rounded border border-indigo-300 px-3 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Email magic link
                        </button>
                      </form>
                      {authMessage ? (
                        <p className="mt-2 text-xs text-gray-600" role="status">
                          {authMessage}
                        </p>
                      ) : null}
                    </>
                  )}
                  {isSignedIn && profileMessage ? (
                    <p className="mt-2 text-xs text-gray-600" role="status">
                      {profileMessage}
                    </p>
                  ) : null}
                </SettingsSection>
                {adminActor?.isAdmin ? (
                  <SettingsSection title="Admin" tone="admin" testId="settings-section-admin">
                    <div className="grid gap-2">
                      <label htmlFor="admin-user-search" className="text-sm font-medium text-amber-950">
                        Impersonate user
                      </label>
                      <input
                        id="admin-user-search"
                        data-testid="admin-user-search"
                        type="search"
                        value={adminUserSearch}
                        onChange={(event) => setAdminUserSearch(event.target.value)}
                        placeholder="Search name, username, or email"
                        className="min-w-0 rounded border border-amber-300 bg-white px-2 py-1 text-sm text-gray-900"
                      />
                      <select
                        data-testid="admin-impersonation-user-select"
                        value={selectedAdminUserIsVisible ? adminSelectedUserId : ""}
                        onChange={(event) => setAdminSelectedUserId(event.target.value)}
                        disabled={adminLoading || filteredAdminUsers.length === 0}
                        className="min-w-0 rounded border border-amber-300 bg-white px-2 py-1 text-sm text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {filteredAdminUsers.length === 0 ? (
                          <option value="">No users found</option>
                        ) : (
                          filteredAdminUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name} {user.email ? `(${user.email})` : `@${user.username}`}
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="button"
                        data-testid="admin-start-impersonation"
                        onClick={() => {
                          void handleStartImpersonation();
                        }}
                        disabled={adminLoading || !adminSelectedUserId || !selectedAdminUserIsVisible}
                        className="rounded border border-amber-500 bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {adminLoading ? "Working" : "Start impersonation"}
                      </button>
                      {impersonation ? (
                        <button
                          type="button"
                          data-testid="settings-stop-impersonation"
                          onClick={() => {
                            void handleStopImpersonation();
                          }}
                          disabled={adminLoading}
                          className="rounded border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Exit impersonation
                        </button>
                      ) : null}
                      {adminMessage ? (
                        <p className="text-xs text-amber-900" role="status">
                          {adminMessage}
                        </p>
                      ) : null}
                    </div>
                  </SettingsSection>
                ) : null}
                <SettingsSection title="Build" tone="muted" testId="settings-section-build">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-gray-600">
                    <dt className="font-medium text-gray-700">Version</dt>
                    <dd data-testid="settings-build-version">v{buildInfo.version}</dd>
                    <dt className="font-medium text-gray-700">Branch</dt>
                    <dd data-testid="settings-build-branch">{buildInfo.branch}</dd>
                    {buildInfo.commitSha ? (
                      <>
                        <dt className="font-medium text-gray-700">Commit</dt>
                        <dd data-testid="settings-build-commit">{buildInfo.commitSha.slice(0, 7)}</dd>
                      </>
                    ) : null}
                  </dl>
                </SettingsSection>
              </div>
            </section>
          </div>
        ) : null}

        {/* Tab navigation */}
        <div className="flex gap-0 mb-6 border-b border-gray-300">
          <button
            data-testid="playlists-tab"
            onClick={() => {
              setSelectedSong(null);
              setActiveView("playlists");
            }}
            className={`px-4 py-3 font-medium transition-colors ${
              activeView === "playlists"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Playlists
          </button>
          <button
            data-testid="library-tab"
            onClick={() => {
              setSelectedPlaylist(null);
              setActiveView("library");
            }}
            className={`px-4 py-3 font-medium transition-colors ${
              activeView === "library"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Library
          </button>
          <button
            data-testid="shared-tab"
            onClick={() => {
              setSelectedSong(null);
              setSelectedPlaylist(null);
              setActiveView("shared");
            }}
            className={`px-4 py-3 font-medium transition-colors ${
              activeView === "shared"
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Shared
          </button>
        </div>

        {activeView === "library" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="new-song-button"
                onClick={() => setActiveView("song_add")}
                className="rounded bg-indigo-600 px-4 py-2 text-white"
              >
                New Song
              </button>
            </div>
            <LibraryDraftRecorder
              request={request}
              userId={activeUserId}
              refreshTrigger={refreshTrigger}
            />
            <SongBrowser
              key={`songs:${activeUserId}:${refreshTrigger}`}
              onSelectSong={handleSelectSong}
              onDeleteSong={handleSongDeleted}
              selectedSongId={selectedSong?.id || null}
              refreshTrigger={refreshTrigger}
              userId={activeUserId}
            />
          </>
        ) : null}

        {activeView === "playlists" ? (
          <>
            {!isSignedIn ? (
              <GuestWelcomePanel className="mb-6" action={guestSignInForm} />
            ) : null}
            <PlaylistBrowser
              key={`playlists:${activeUserId}:${refreshTrigger}`}
              userId={activeUserId}
              refreshTrigger={refreshTrigger}
              onSelectPlaylist={async (playlist) => {
                try {
                  const response = await request(`/api/playlists/${playlist.id}`);
                  if (!response.ok) throw new Error("Failed to fetch playlist");
                  const fullPlaylist: Playlist = await response.json();
                  setSelectedPlaylist(fullPlaylist);
                  setPlaylistPracticeReturnView("playlists");
                  setPlaylistPracticeReadOnly(false);
                  setActiveView("playlist_practice");
                } catch (err) {
                  console.error("Failed to load playlist:", err);
                }
              }}
              onManagePlaylist={(playlist) => {
                setSelectedPlaylist(playlist);
                setActiveView("playlist_detail");
              }}
            />
          </>
        ) : null}

        {activeView === "shared" ? (
          isSignedIn ? (
            <SharedBrowser
              userId={activeUserId}
              onPracticeAsGuest={(playlist) => {
                setSelectedPlaylist(playlist);
                setPlaylistPracticeReturnView("shared");
                setPlaylistPracticeReadOnly(true);
                setActiveView("playlist_practice");
              }}
              onOpenCopiedPlaylist={async (playlistId) => {
                try {
                  const response = await request(`/api/playlists/${playlistId}`);
                  if (!response.ok) throw new Error("Failed to fetch playlist");
                  const fullPlaylist: Playlist = await response.json();
                  setSelectedPlaylist(fullPlaylist);
                  setPlaylistPracticeReturnView("playlists");
                  setPlaylistPracticeReadOnly(false);
                  setActiveView("playlist_detail");
                } catch (err) {
                  console.error("Failed to load copied playlist:", err);
                }
              }}
            />
          ) : (
            <GuestWelcomePanel
              title="Welcome to Cantare"
              action={guestSignInForm}
              footer="Public shared playlists are available to signed-in users. Direct playlist share links still work without signing in."
            />
          )
        ) : null}
      </div>
    </div>
  );
}
