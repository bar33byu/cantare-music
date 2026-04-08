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
      // Get presigned URL from the API
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
        const errorText = await response.text();
        let errorMsg = 'Failed to get upload URL';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error || errorText;
        } catch {
          errorMsg = errorText || `Failed with status ${response.status}`;
        }
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      const { uploadUrl, key } = await response.json();

      // Upload file directly to R2 using the presigned URL.
      // Files are sent straight to R2, bypassing Vercel's 4.5 MB function payload limit.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            const errorMsg = `Upload failed with status ${xhr.status}: ${xhr.statusText}`;
            reject(new Error(errorMsg));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Direct upload to storage failed. This is usually a CORS or network issue.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

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