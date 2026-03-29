import { useState, FormEvent } from 'react';
import { useUploadAudio } from '../hooks/useUploadAudio';

interface SongFormProps {
  onSuccess: (songId: string) => void;
}

export function SongForm({ onSuccess }: SongFormProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const { upload, uploading, progress, error: uploadError } = useUploadAudio(songId || '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      // Create song record
      const createResponse = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), artist: artist.trim() || undefined }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({ error: 'Failed to create song' }));
        throw new Error(errorData.error || 'Failed to create song');
      }

      const song = await createResponse.json();
      const newSongId = song.id;
      setSongId(newSongId);

      // Upload file if selected
      if (selectedFile) {
        const audioKey = await upload(selectedFile);

        // Update song with audioKey
        const updateResponse = await fetch(`/api/songs/${newSongId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioKey }),
        });

        if (!updateResponse.ok) {
          throw new Error('Failed to update song with audio key');
        }
      }

      onSuccess(newSongId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
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
        <label htmlFor="artist" className="block text-sm font-medium text-gray-700">
          Artist
        </label>
        <input
          id="artist"
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          data-testid="song-artist-input"
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
    </form>
  );
}