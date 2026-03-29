"use client";

import { useState, useEffect } from "react";
import PracticeView from "./components/PracticeView";
import { SongForm } from "./components/SongForm";
import { makeSession } from "./lib/factories";

interface Song {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  segments: Segment[];
  createdAt: string;
  updatedAt: string;
}

interface Segment {
  id: string;
  songId: string;
  order: number;
  label: string;
  lyricText: string;
  startMs: number;
  endMs: number;
}

type ViewMode = "list" | "practice" | "add";

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/songs");
      if (!response.ok) throw new Error("Failed to fetch songs");
      const data = await response.json();
      setSongs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load songs");
    } finally {
      setLoading(false);
    }
  };

  const handleSongCreated = (songId: string) => {
    fetchSongs(); // Refresh the song list
    setViewMode("list");
  };

  const handleSelectSong = (song: Song) => {
    setSelectedSong(song);
    setViewMode("practice");
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
          <button
            onClick={handleBackToList}
            className="mb-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            ← Back to Songs
          </button>
          <PracticeView song={selectedSong} initialSession={session} />
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

        {loading && <div className="text-center py-8">Loading songs...</div>}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {songs.map((song) => (
              <div
                key={song.id}
                className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleSelectSong(song)}
              >
                <h3 className="text-xl font-semibold mb-2">{song.title}</h3>
                {song.artist && (
                  <p className="text-gray-600 mb-2">{song.artist}</p>
                )}
                <p className="text-sm text-gray-500">
                  {song.segments.length} segments
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Created {new Date(song.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}

            {songs.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                <p className="text-lg mb-4">No songs yet</p>
                <button
                  onClick={() => setViewMode("add")}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add Your First Song
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
