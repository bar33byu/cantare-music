import { useState } from 'react';

interface UseUploadAudioReturn {
  upload: (file: File) => Promise<string>;
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
      // Get presigned URL
      const response = await fetch('/api/songs/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload URL request failed' }));
        const errorMsg = errorData.error || 'Failed to get upload URL';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      const { uploadUrl, key } = await response.json();

      // Upload file using XMLHttpRequest for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            const errorMsg = `Upload failed with status ${xhr.status}`;
            setError(errorMsg);
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          const errorMsg = 'Upload failed due to network error';
          setError(errorMsg);
          reject(new Error(errorMsg));
        };

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

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