"use client";

import { useState, type ReactNode } from "react";
import { useUploadAudio } from "../hooks/useUploadAudio";

interface ReplaceAudioFormProps {
  songId: string;
  userId?: string;
  onReplaced?: () => void;
  mode?: 'upload' | 'replace';
  audioUrl?: string;
  alternateAudioUrl?: string;
  children?: ReactNode;
}

type AudioVersion = 'prominent' | 'blend';

type VersionState = {
  file: File | null;
  error: string | null;
  success: string | null;
};

const VERSION_DETAILS: Record<AudioVersion, { label: string; description: string; patchKey: 'audioKey' | 'alternateAudioKey' }> = {
  prominent: {
    label: 'Prominent',
    description: 'The teaching-forward recording used as the main practice audio.',
    patchKey: 'audioKey',
  },
  blend: {
    label: 'Blend',
    description: 'The blended reference recording for practicing in context.',
    patchKey: 'alternateAudioKey',
  },
};

export function ReplaceAudioForm({
  songId,
  userId,
  onReplaced,
  mode = 'replace',
  audioUrl = '',
  alternateAudioUrl = '',
  children,
}: ReplaceAudioFormProps) {
  const { upload, uploading, progress, error: uploadError } = useUploadAudio(userId);
  const [versionState, setVersionState] = useState<Record<AudioVersion, VersionState>>({
    prominent: { file: null, error: null, success: null },
    blend: { file: null, error: null, success: null },
  });

  const isUpload = mode === 'upload';
  const hasAudio: Record<AudioVersion, boolean> = {
    prominent: Boolean(audioUrl.trim()),
    blend: Boolean(alternateAudioUrl.trim()),
  };

  const updateVersionState = (version: AudioVersion, updates: Partial<VersionState>) => {
    setVersionState((previous) => ({
      ...previous,
      [version]: { ...previous[version], ...updates },
    }));
  };

  const handleSubmit = async (audioVersion: AudioVersion) => {
    const file = versionState[audioVersion].file;
    if (!file) {
      updateVersionState(audioVersion, { error: `Select an MP3 file for ${VERSION_DETAILS[audioVersion].label} first.` });
      return;
    }

    updateVersionState(audioVersion, { error: null, success: null });

    try {
      const uploadedKey = await upload(songId, file, audioVersion);
      const details = VERSION_DETAILS[audioVersion];
      const response = await fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "X-User-ID": userId } : {}),
        },
        body: JSON.stringify({ [details.patchKey]: uploadedKey }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed to update song audio" }));
        throw new Error(data.error || "Failed to update song audio");
      }

      updateVersionState(audioVersion, {
        file: null,
        success: `${details.label} audio ${hasAudio[audioVersion] ? 'replaced' : 'uploaded'} successfully.`,
      });
      onReplaced?.();
    } catch (err) {
      updateVersionState(audioVersion, { error: err instanceof Error ? err.message : "Audio replacement failed" });
    }
  };

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" data-testid="replace-audio-card">
      <h3 className="text-lg font-semibold text-gray-900">{isUpload ? 'Upload Audio' : 'Audio File'}</h3>
      <p className="mt-1 text-sm text-gray-500">
        {isUpload ? 'Upload an MP3 file to enable segment editing.' : 'Choose between replacing the source files below or recording a temporary draft take further down.'}
      </p>

      {!isUpload ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <h4 className="text-sm font-semibold text-slate-900">Upload or replace files</h4>
          <p className="mt-1 text-xs text-slate-600">
            Use these slots for the main practice audio and the blended reference mix.
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(['prominent', 'blend'] as const).map((version) => {
          const details = VERSION_DETAILS[version];
          const populated = hasAudio[version];
          const state = versionState[version];
          const sectionError = state.error || uploadError;
          return (
            <div
              key={version}
              data-testid={`replace-audio-section-${version}`}
              className={`rounded-lg border p-4 ${populated ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-gray-900">{details.label}</h4>
                  <p className="mt-1 text-sm text-gray-600">{details.description}</p>
                </div>
                <span
                  data-testid={`replace-audio-status-${version}`}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${populated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                >
                  {populated ? 'Uploaded' : 'Missing'}
                </span>
              </div>

              <div className="mt-4">
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3"
                  data-testid={`replace-audio-input-${version}`}
                  onChange={(e) => {
                    updateVersionState(version, {
                      file: e.target.files?.[0] ?? null,
                      success: null,
                      error: null,
                    });
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {state.file ? (
                <p className="mt-2 truncate text-xs text-gray-600" data-testid={`replace-audio-selected-${version}`}>
                  Selected: {state.file.name}
                </p>
              ) : null}

              {sectionError && (
                <p className="mt-3 text-sm text-red-600" role="alert" data-testid={`replace-audio-error-${version}`}>
                  {sectionError}
                </p>
              )}

              {state.success && (
                <p className="mt-3 text-sm text-green-700" data-testid={`replace-audio-success-${version}`}>
                  {state.success}
                </p>
              )}

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void handleSubmit(version)}
                  disabled={uploading}
                  data-testid={`replace-audio-submit-${version}`}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {uploading
                    ? (populated ? "Replacing..." : "Uploading...")
                    : populated
                      ? `Replace ${details.label}`
                      : `Upload ${details.label}`}
                </button>
              </div>
            </div>
          );
        })}
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

      {children}
    </section>
  );
}
