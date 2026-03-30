"use client";

import { useState, useEffect } from "react";
import PracticeView from "./components/PracticeView";
import { SongForm } from "./components/SongForm";
import { SongBrowser } from "./components/SongBrowser";
import { SegmentEditor } from "./components/SegmentEditor";
import { makeSession } from "./lib/factories";
import type { Song, Segment } from "./types";

interface SongListItem {
  id: string;
  title: string;
  artist?: string;
  audioKey?: string;
  createdAt: string;
}

type ViewMode = "list" | "practice" | "segment_editor" | "add";

export default function Home() {
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSongCreated = (songId: string) => {
    setRefreshTrigger(prev => prev + 1); // Trigger refresh of song list
    setViewMode("list");
  };

  const handleSelectSong = async (song: SongListItem) => {
    try {
      const response = await fetch(`/api/songs/${song.id}`);
      if (!response.ok) throw new Error("Failed to fetch song details");
      const fullSong: Song = await response.json();
      setSelectedSong(fullSong);
      setViewMode("practice");
    } catch (err) {
      console.error("Failed to load song:", err);
      // For now, just log the error. In a real app, you'd show a toast or error message
    }
  };

  const handleBackToList = () => {
    setSelectedSong(null);
    setViewMode("list");
  };

  if (viewMode === "practice" && selectedSong) {
    const session = makeSession({ songId: selectedSong.id });
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 mb-4">
            <button
              onClick={handleBackToList}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              ← Back to Songs
            </button>
            <button
              onClick={() => setViewMode("segment_editor")}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              Edit Segments
            </button>
          </div>
          <PracticeView song={selectedSong} initialSession={session} />
        </div>
      </div>
    );
  }

  if (viewMode === "segment_editor" && selectedSong) {
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
            onBack={() => setViewMode("practice")}
          />
        </div>
      </div>
    );
  }

  if (viewMode === "add") {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setViewMode("list")}
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Cantare Music</h1>
          <button
            onClick={() => setViewMode("add")}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Song
          </button>
        </div>

        <SongBrowser
          onSelectSong={handleSelectSong}
          selectedSongId={selectedSong?.id || null}
          refreshTrigger={refreshTrigger}
        />
      </div>
    </div>
  );
}
