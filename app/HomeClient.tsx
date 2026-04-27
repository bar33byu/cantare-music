"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import PracticeView from "./components/PracticeView";
import { PlaylistBrowser } from "./components/PlaylistBrowser";
import { PlaylistDetail } from "./components/PlaylistDetail";
import { PlaylistPracticeView } from "./components/PlaylistPracticeView";
import { SongForm } from "./components/SongForm";
import { SongBrowser } from "./components/SongBrowser";
import { SegmentEditor } from "./components/SegmentEditor";
import { makeSession } from "./lib/factories";
import type { Playlist, Song } from "./types";
import { createUserIdFromName, DEFAULT_USER_ID, normalizeUserId, type KnownUser, USER_COOKIE_NAME } from "./lib/userContext";

interface SongListItem {
  id: string;
  title: string;
  artist?: string;
  audioKey?: string;
  createdAt: string;
  lastPracticedAt?: string | null;
}

type ViewMode = "list" | "practice" | "segment_editor" | "add";

type AppView =
  | "library"
  | "song_practice"
  | "song_segment_editor"
  | "song_add"
  | "playlists"
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
  collapseLyricLineBreaks: boolean;
  currentUserId: string;
  users: KnownUser[];
}

const SETTINGS_STORAGE_KEY = "cantare:user-settings";
const DEFAULT_USER_SETTINGS: UserSettings = {
  segmentPrerollMs: 500,
  collapseLyricLineBreaks: false,
  currentUserId: DEFAULT_USER_ID,
  users: [{ id: DEFAULT_USER_ID, name: "Default User" }],
};

function normalizeKnownUsers(users: KnownUser[] | undefined): KnownUser[] {
  if (!Array.isArray(users)) {
    return DEFAULT_USER_SETTINGS.users;
  }

  const deduped = new Map<string, KnownUser>();
  for (const user of users) {
    if (!user || typeof user.id !== "string" || typeof user.name !== "string") {
      continue;
    }
    const id = normalizeUserId(user.id);
    if (!deduped.has(id)) {
      deduped.set(id, { id, name: user.name.trim() || id });
    }
  }

  if (!deduped.has(DEFAULT_USER_ID)) {
    deduped.set(DEFAULT_USER_ID, { id: DEFAULT_USER_ID, name: "Default User" });
  }

  return Array.from(deduped.values());
}

function clampSegmentPrerollMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_USER_SETTINGS.segmentPrerollMs;
  }
  return Math.max(0, Math.min(2000, Math.round(value)));
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
      collapseLyricLineBreaks: Boolean(parsed.collapseLyricLineBreaks),
      currentUserId: users.some((user) => user.id === currentUserId) ? currentUserId : DEFAULT_USER_ID,
      users,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

function mergeUsersWithDatabase(cachedUsers: KnownUser[], dbUsers: KnownUser[]): KnownUser[] {
  const merged = new Map<string, KnownUser>();

  for (const user of cachedUsers) {
    const id = normalizeUserId(user.id);
    merged.set(id, { id, name: user.name.trim() || id });
  }

  for (const user of dbUsers) {
    const id = normalizeUserId(user.id);
    merged.set(id, { id, name: user.name.trim() || id });
  }

  if (!merged.has(DEFAULT_USER_ID)) {
    merged.set(DEFAULT_USER_ID, { id: DEFAULT_USER_ID, name: "Default User" });
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
    view === "playlist_detail" ||
    view === "playlist_practice"
      ? view
      : "library";

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

export default function Home() {
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<AppView>("playlists");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [songEditorReturnView, setSongEditorReturnView] = useState<SongEditorReturnView>("library");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [newUserName, setNewUserName] = useState("");
  const settingsLoadedRef = useRef(false);
  const usersHydratedFromDbRef = useRef(false);
  const isApplyingHashRouteRef = useRef(false);
  const activeUserId = userSettings.currentUserId;

  const withUserHeader = (init?: RequestInit): RequestInit | undefined => {
    return {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "X-User-ID": activeUserId,
      },
    };
  };

  const request = (url: string, init?: RequestInit) => {
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedSettings = parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
    setUserSettings(storedSettings);
    settingsLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsLoadedRef.current) {
      return;
    }

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(userSettings));
    const cookieValue = encodeURIComponent(userSettings.currentUserId);
    document.cookie = `${USER_COOKIE_NAME}=${cookieValue}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [userSettings]);

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

  const handleSwitchUser = (nextUserId: string) => {
    const normalized = normalizeUserId(nextUserId);
    setUserSettings((previous) => ({ ...previous, currentUserId: normalized }));
    setSelectedSong(null);
    setSelectedPlaylist(null);
    setRefreshTrigger((previous) => previous + 1);
    setActiveView("playlists");
  };

  const handleAddUser = async () => {
    const trimmed = newUserName.trim();
    if (!trimmed) {
      return;
    }

    const id = createUserIdFromName(trimmed);
    setUserSettings((previous) => {
      const existing = previous.users.find((user) => user.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        return { ...previous, currentUserId: existing.id };
      }

      return {
        ...previous,
        currentUserId: id,
        users: [...previous.users, { id, name: trimmed }],
      };
    });
    setNewUserName("");
    setSelectedSong(null);
    setSelectedPlaylist(null);
    setRefreshTrigger((previous) => previous + 1);
    setActiveView("playlists");

    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: trimmed }),
      });
      usersHydratedFromDbRef.current = false;
    } catch {
      // Local cache already has the user; DB sync can retry later.
    }
  };

  const loadSongById = async (songId: string): Promise<Song | null> => {
    const response = await request(`/api/songs/${songId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Song;
  };

  const loadPlaylistById = async (playlistId: string): Promise<Playlist | null> => {
    const response = await request(`/api/playlists/${playlistId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Playlist;
  };

  const applyHashRoute = async (hash: string) => {
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
  };

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
  }, []);

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

  const handleBackToList = () => {
    setSelectedSong(null);
    setRefreshTrigger((previous) => previous + 1);
    setActiveView("library");
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

  if (activeView === "song_practice" && selectedSong) {
    const session = makeSession({ songId: selectedSong.id });
    const breadcrumbRootLabel = selectedPlaylist?.name ?? "Songs";
    const handleBreadcrumbRootClick = () => {
      setSelectedSong(null);
      if (selectedPlaylist) {
        void (async () => {
          await refreshSelectedPlaylist();
          setActiveView("playlist_practice");
        })();
        return;
      }
      setRefreshTrigger((previous) => previous + 1);
      setActiveView("library");
    };

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <PracticeView
            song={selectedSong}
            initialSession={session}
            breadcrumbRootLabel={breadcrumbRootLabel}
            onBreadcrumbRootClick={handleBreadcrumbRootClick}
            segmentPrerollMs={userSettings.segmentPrerollMs}
            collapseLyricLineBreaks={userSettings.collapseLyricLineBreaks}
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
            onSongUpdated={refreshSelectedSong}
          />
        </div>
      </div>
    );
  }

  if (activeView === "song_add") {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
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
            <SongForm onSuccess={handleSongCreated} />
          </div>
        </div>
      </div>
    );
  }

  if (activeView === "playlist_detail" && selectedPlaylist) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-4xl">
          <PlaylistDetail
            key={`playlist-detail:${activeUserId}:${selectedPlaylist.id}`}
            playlistId={selectedPlaylist.id}
            userId={activeUserId}
            onBack={() => setActiveView("playlists")}
            onPractice={(playlist) => {
              setSelectedPlaylist(playlist);
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
        <div className="mx-auto max-w-4xl">
          <PlaylistPracticeView
            playlist={selectedPlaylist}
            userId={activeUserId}
            onExit={() => setActiveView("playlists")}
            onManage={() => setActiveView("playlist_detail")}
            onSelectSong={(song) => {
              setSelectedSong(song);
              setActiveView("song_practice");

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
      <div className="max-w-4xl mx-auto">
        <UnifiedHeader
          breadcrumb={{ label: "Cantare" }}
          title="Cantare Music"
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
              className="absolute right-4 top-20 w-[min(92vw,24rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
              data-testid="settings-panel"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <h3 className="text-sm font-semibold text-gray-800">Playback</h3>
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

                  <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      data-testid="settings-collapse-line-breaks-toggle"
                      type="checkbox"
                      checked={userSettings.collapseLyricLineBreaks}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setUserSettings((previous) => ({ ...previous, collapseLyricLineBreaks: checked }));
                      }}
                    />
                    Compact lyric wrapping (ignore pasted line breaks)
                  </label>
                  <p className="mt-1 text-xs text-gray-600">
                    Shows lyrics as a continuous paragraph to reduce vertical scrolling during practice.
                  </p>
                </div>

                <div className="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500">
                  <h3 className="text-sm font-semibold text-gray-800">User</h3>
                  <label htmlFor="active-user" className="mt-3 block text-sm text-gray-700">
                    Active user
                  </label>
                  <select
                    id="active-user"
                    data-testid="active-user-select"
                    value={userSettings.currentUserId}
                    onChange={(event) => handleSwitchUser(event.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
                  >
                    {userSettings.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(event) => setNewUserName(event.target.value)}
                      placeholder="Add user name"
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-800"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleAddUser();
                      }}
                      className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Add
                    </button>
                  </div>
                </div>
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
        </div>

        {activeView === "library" ? (
          <>
            <SongBrowser
              key={`songs:${activeUserId}:${refreshTrigger}`}
              onSelectSong={handleSelectSong}
              onDeleteSong={handleSongDeleted}
              selectedSongId={selectedSong?.id || null}
              refreshTrigger={refreshTrigger}
              userId={activeUserId}
            />
            {/* Plus button for adding songs */}
            <button
              onClick={() => setActiveView("song_add")}
              title="Add Song"
              className="fixed top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </>
        ) : null}

        {activeView === "playlists" ? (
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
        ) : null}
      </div>
    </div>
  );
}
