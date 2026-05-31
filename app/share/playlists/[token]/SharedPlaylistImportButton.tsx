"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SharedPlaylistImportButtonProps {
  priorImportCount: number;
}

interface ImportResponse {
  playlist?: { id?: string; name?: string };
  redirectTo?: string;
  error?: string;
}

export function SharedPlaylistImportButton({ priorImportCount }: SharedPlaylistImportButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");

  const hasPriorImport = priorImportCount > 0;

  const handleConfirmImport = async () => {
    setIsImporting(true);
    setError("");
    try {
      const response = await fetch(window.location.pathname.replace(/\/$/, "") + "/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: hasPriorImport }),
      });
      const payload = await response.json().catch(() => ({})) as ImportResponse;
      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.error || "Unable to import this playlist right now.");
      }
      router.push(payload.redirectTo);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to import this playlist right now.");
      setIsImporting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmOpen(true);
          setError("");
        }}
        className="inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        {hasPriorImport ? "Import updated copy" : "Import playlist"}
      </button>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-gray-950">
              {isImporting ? "Importing playlist..." : hasPriorImport ? "Import another copy?" : "Import this playlist?"}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-gray-600">
              <p>
                You&apos;ll get a copy of this playlist and a copy of every song in it.
              </p>
              {hasPriorImport ? (
                <p>
                  You&apos;ve already imported this playlist before, so this import will create another playlist copy with a distinct name.
                  The songs will also be copied again with updated names so duplicates are easy to tell apart.
                </p>
              ) : (
                <p>
                  This can take a moment. Once it finishes, Cantare will open your imported copy automatically.
                </p>
              )}
              {isImporting ? (
                <p className="font-medium text-indigo-700">
                  Your click was captured. Cantare is building the copy now.
                </p>
              ) : null}
              {error ? (
                <p className="font-medium text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!isImporting) {
                    setConfirmOpen(false);
                  }
                }}
                disabled={isImporting}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImporting ? "Please wait" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmImport()}
                disabled={isImporting}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImporting ? "Importing..." : hasPriorImport ? "Import another copy" : "Start import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
