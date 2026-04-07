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
  const [activeView, setActiveView] = useState<AppView>("library");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [songEditorReturnView, setSongEditorReturnView] = useState<SongEditorReturnView>("library");
  const [isHydrated, setIsHydrated] = useState(false);
  const isApplyingHashRouteRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const loadSongById = async (songId: string): Promise<Song | null> => {
    const response = await fetch(`/api/songs/${songId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Song;
  };

  const loadPlaylistById = async (playlistId: string): Promise<Playlist | null> => {
    const response = await fetch(`/api/playlists/${playlistId}`);
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
    if (!isHydrated || typeof window === "undefined") {
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
      window.history.replaceState(null, "", buildHashRoute({ view: "library" }));
    }

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
    };
  }, [isHydrated]);

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
    if (!isHydrated || typeof window === "undefined" || isApplyingHashRouteRef.current) {
      return;
    }
    if (window.location.hash === currentHash) {
      return;
    }
    window.history.pushState(null, "", currentHash);
  }, [currentHash, isHydrated]);

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
      const response = await fetch(`/api/songs/${selectedSong.id}`);
      if (!response.ok) throw new Error("Failed to refresh song");
      const fullSong: Song = await response.json();
      setSelectedSong(fullSong);
    } catch (err) {
      console.error("Failed to refresh selected song:", err);
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
        setActiveView("playlist_practice");
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
            playlistId={selectedPlaylist.id}
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
            onExit={() => setActiveView("playlists")}
            onManage={() => setActiveView("playlist_detail")}
            onSelectSong={async (songId) => {
              try {
                const fullSong = await loadSongById(songId);
                if (!fullSong) throw new Error("Failed to fetch song");
                setSelectedSong(fullSong);
                setActiveView("song_practice");
              } catch (err) {
                console.error("Failed to load song:", err);
              }
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
        />

        {/* Tab navigation */}
        <div className="flex gap-0 mb-6 border-b border-gray-300">
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
        </div>

        {activeView === "library" ? (
          <>
            <SongBrowser
              onSelectSong={handleSelectSong}
              onDeleteSong={handleSongDeleted}
              selectedSongId={selectedSong?.id || null}
              refreshTrigger={refreshTrigger}
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
            onSelectPlaylist={async (playlist) => {
              try {
                const response = await fetch(`/api/playlists/${playlist.id}`);
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
