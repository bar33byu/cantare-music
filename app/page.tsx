"use client";

import { useState } from "react";
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

export default function Home() {
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<AppView>("library");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  const handleSongCreated = (songId: string) => {
    setRefreshTrigger(prev => prev + 1); // Trigger refresh of song list
    setActiveView("library");
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
      const response = await fetch(`/api/songs/${song.id}`);
      if (!response.ok) throw new Error("Failed to fetch song details");
      const fullSong: Song = await response.json();
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
            onEditSongClick={() => setActiveView("song_segment_editor")}
          />
        </div>
      </div>
    );
  }

  if (activeView === "song_segment_editor" && selectedSong) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleBackToList}
            className="mb-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            ← Back to Songs
          </button>
          <SegmentEditor
            songId={selectedSong.id}
            onBack={() => void handleBackToPractice()}
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
          <button
            onClick={() => {
              setRefreshTrigger((previous) => previous + 1);
              setActiveView("library");
            }}
            className="mb-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            ← Back to Songs
          </button>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Add New Song</h2>
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
                const response = await fetch(`/api/songs/${songId}`);
                if (!response.ok) throw new Error("Failed to fetch song");
                const fullSong: Song = await response.json();
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Cantare Music</h1>
        </div>

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
