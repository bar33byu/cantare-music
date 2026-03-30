"use client";

import { useState } from "react";
import { useUploadAudio } from "../hooks/useUploadAudio";

interface ReplaceAudioFormProps {
  songId: string;
  onReplaced?: () => void;
}

export function ReplaceAudioForm({ songId, onReplaced }: ReplaceAudioFormProps) {
  const { upload, uploading, progress, error: uploadError } = useUploadAudio();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!file) {
      setError("Select an MP3 file first.");
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const audioKey = await upload(songId, file);
      const response = await fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioKey }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed to update song audio" }));
        throw new Error(data.error || "Failed to update song audio");
      }

      setSuccess("Audio replaced successfully.");
      setFile(null);
      onReplaced?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio replacement failed");
    }
  };

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" data-testid="replace-audio-card">
      <h3 className="text-lg font-semibold text-gray-900">Replace Audio</h3>
      <p className="mt-1 text-sm text-gray-500">
        Upload a new MP3 while keeping segment boundaries and lyrics.
      </p>

      <div className="mt-3">
        <input
          type="file"
          accept="audio/mpeg,audio/mp3"
          data-testid="replace-audio-input"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setSuccess(null);
            setError(null);
          }}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </div>

      {uploading && (
        <div className="mt-3">
          <div className="h-2.5 w-full rounded-full bg-gray-200">
            <div
              className="h-2.5 rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-600">{progress}% uploaded</p>
        </div>
      )}

      {(error || uploadError) && (
        <p className="mt-3 text-sm text-red-600" role="alert" data-testid="replace-audio-error">
          {error || uploadError}
        </p>
      )}

      {success && (
        <p className="mt-3 text-sm text-green-700" data-testid="replace-audio-success">
          {success}
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={uploading}
          data-testid="replace-audio-submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {uploading ? "Replacing..." : "Replace Audio"}
        </button>
      </div>
    </section>
  );
}
