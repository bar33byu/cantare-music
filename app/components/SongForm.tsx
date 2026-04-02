import { useState, FormEvent } from 'react';
import { useUploadAudio } from '../hooks/useUploadAudio';

interface SongFormProps {
  onSuccess: (songId: string) => void;
}

export function SongForm({ onSuccess }: SongFormProps) {
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const { upload, uploading, progress, error: uploadError } = useUploadAudio();

  const appendDebug = (message: string) => {
    setDebugLog((prev) => [...prev, `${new Date().toISOString()} - ${message}`]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      appendDebug(`POST /api/songs payload: ${JSON.stringify({ title: title.trim() })}`);
      // Create song record
      const createResponse = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });

      appendDebug(`Received status ${createResponse.status} from /api/songs`);

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({ error: 'Failed to create song' }));
        throw new Error(errorData.error || 'Failed to create song');
      }

      const song = await createResponse.json();
      const newSongId = song.id;
      appendDebug(`Created song id=${newSongId}`);

      // Upload file if selected
      if (selectedFile) {
        appendDebug(`Uploading audio file ${selectedFile.name} for song ${newSongId}`);
        const audioKey = await upload(newSongId, selectedFile);
        appendDebug(`Upload result key=${audioKey}`);

        // Update song with audioKey
        const updateResponse = await fetch(`/api/songs/${newSongId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioKey }),
        });

        appendDebug(`PATCH /api/songs/${newSongId} status=${updateResponse.status}`);

        if (!updateResponse.ok) {
          const updateError = await updateResponse.json().catch(() => null);
          const msg = (updateError && (updateError as any).error) || 'Failed to update song with audio key';
          throw new Error(msg);
        }
      }

      onSuccess(newSongId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      appendDebug(`Error: ${errorMsg}`);
      setError(errorMsg);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const displayError = error || uploadError;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Title *
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          data-testid="song-title-input"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="audioFile" className="block text-sm font-medium text-gray-700">
          Audio File (MP3)
        </label>
        <input
          id="audioFile"
          type="file"
          accept="audio/mpeg,audio/mp3"
          onChange={handleFileChange}
          data-testid="audio-file-input"
          className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <p className="mt-1 text-sm text-gray-500">Max 15 MB</p>
        {uploading && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-1">{progress}% uploaded</p>
          </div>
        )}
      </div>

      {displayError && (
        <div data-testid="song-form-error" className="text-red-600 text-sm">
          {displayError}
        </div>
      )}

      <button
        type="submit"
        disabled={uploading}
        data-testid="song-form-submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? 'Creating Song...' : 'Create Song'}
      </button>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setDebugMode((prev) => !prev)}
          className="px-3 py-1 text-xs font-medium text-white bg-gray-700 rounded hover:bg-gray-800"
        >
          {debugMode ? 'Hide Debug Info' : 'Show Debug Info'}
        </button>
      </div>

      {debugMode && (
        <div className="mt-3 p-3 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-700 max-h-48 overflow-y-auto">
          <p className="font-semibold mb-1">Debug log</p>
          {debugLog.length === 0 && <p className="text-gray-500">No debug entries yet</p>}
          <ul>
            {debugLog.map((entry, idx) => (
              <li key={idx} className="leading-5 whitespace-pre-wrap">
                {entry}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}