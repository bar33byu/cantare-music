import { useState } from 'react';

interface UseUploadAudioReturn {
  upload: (songId: string, file: File) => Promise<string>;
  uploading: boolean;
  progress: number;
  error: string | null;
}

export function useUploadAudio(): UseUploadAudioReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (songId: string, file: File): Promise<string> => {
    setError(null);
    setProgress(0);

    // Validate file
    if (file.size > 15_000_000) {
      const errorMsg = 'File size exceeds 15MB limit';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    if (!['audio/mpeg', 'audio/mp3'].includes(file.type)) {
      const errorMsg = 'File must be MP3 format';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    if (!songId) {
      const errorMsg = 'Song ID is required for upload';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setUploading(true);

    try {
      // Upload file via multipart form data to the API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('songId', songId);

      const response = await fetch('/api/songs/upload-url', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'Upload failed';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error || errorText;
        } catch {
          errorMsg = errorText || `Upload failed with status ${response.status}`;
        }
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      const { key } = await response.json();

      setProgress(100);
      setUploading(false);
      return key;
    } catch (err) {
      setUploading(false);
      const errorMsg = err instanceof Error ? err.message : 'Unknown upload error';
      setError(errorMsg);
      throw err;
    }
  };

  return { upload, uploading, progress, error };
}