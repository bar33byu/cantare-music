import { useState } from 'react';

const MAX_SERVER_FALLBACK_SIZE = 4_000_000;

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

  const uploadViaServer = async (songId: string, file: File, key?: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('songId', songId);

    if (key) {
      formData.append('key', key);
    }

    const response = await fetch('/api/songs/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = 'Failed to upload audio via server fallback';
      try {
        const errorData = JSON.parse(errorText);
        errorMsg = errorData.error || errorMsg;
      } catch {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    if (!data?.key || typeof data.key !== 'string') {
      throw new Error('Server fallback upload returned an invalid storage key');
    }

    return data.key;
  };

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
      try {
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
      } catch (directUploadError) {
        const message = directUploadError instanceof Error ? directUploadError.message : 'Direct upload failed';

        if (file.size > MAX_SERVER_FALLBACK_SIZE) {
          throw new Error(`${message} Server fallback is limited to files up to 4 MB on this deployment.`);
        }

        const fallbackKey = await uploadViaServer(songId, file, key);
        setProgress(100);
        setUploading(false);
        return fallbackKey;
      }

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