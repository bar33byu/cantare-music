"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

interface SharedSongImportButtonProps {
  priorImportCount: number;
}

export function SharedSongImportButton({ priorImportCount }: SharedSongImportButtonProps) {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const importSong = async (force: boolean) => {
    if (!token) {
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/share/songs/${encodeURIComponent(token)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const payload = await response.json().catch(() => ({})) as { status?: string; error?: string; song?: { title?: string } };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to import this song.");
      }

      if (payload.status === "already_imported") {
        setMessage("You already copied this song. Use Import again to make another snapshot.");
      } else {
        setMessage(`Imported${payload.song?.title ? ` "${payload.song.title}"` : ""}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import this song.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void importSong(priorImportCount > 0)}
        disabled={busy}
        className="inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Importing..." : priorImportCount > 0 ? "Import another snapshot" : "Import song"}
      </button>
      {message ? (
        <p className="text-sm text-gray-600" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
