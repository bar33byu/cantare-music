import Link from "next/link";
import { cookies } from "next/headers";
import { getSharedSongByToken, getSongImportsForSource, getUserForSessionTokenHash } from "../../../../db/queries";
import { AUTH_SESSION_COOKIE_NAME, hashAuthToken } from "../../../lib/authTokens";
import { GuestWelcomePanel } from "../../../components/GuestWelcomePanel";
import type { Song } from "../../../types";
import { SharedSongImportButton } from "./SharedSongImportButton";
import { SharedSongPractice } from "./SharedSongPractice";

export const dynamic = "force-dynamic";

export default async function SharedSongPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [sharedSong, cookieStore] = await Promise.all([
    getSharedSongByToken(token),
    cookies(),
  ]);
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const viewer = sessionToken ? await getUserForSessionTokenHash(hashAuthToken(sessionToken)) : null;
  const sourceSongId = sharedSong?.sourceSongId ?? sharedSong?.id ?? "";
  const priorImports = sharedSong && viewer ? await getSongImportsForSource(sourceSongId, viewer.id) : [];
  const viewerOwnsSong = Boolean(sharedSong && viewer && sharedSong.owner.id === viewer.id);

  if (!sharedSong) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <section className="mx-auto max-w-3xl rounded border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Cantare Music</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Song unavailable</h1>
          <p className="mt-3 text-gray-700">This song share link is no longer active.</p>
          <Link href="/" className="mt-5 inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Open Cantare
          </Link>
        </section>
      </main>
    );
  }

  const practiceSong: Song = {
    id: sharedSong.id,
    sourceSongId: sharedSong.sourceSongId ?? null,
    title: sharedSong.title,
    artist: sharedSong.artist,
    audioUrl: sharedSong.audioUrl,
    alternateAudioUrl: sharedSong.alternateAudioUrl,
    audioTrimStartMs: sharedSong.audioTrimStartMs ?? null,
    audioTrimEndMs: sharedSong.audioTrimEndMs ?? null,
    shareToken: sharedSong.shareToken ?? null,
    sharedAt: sharedSong.sharedAt ?? null,
    shareAudioMode: sharedSong.shareAudioMode,
    pitchContourNotes: [],
    hasMidiContour: sharedSong.hasMidiContour,
    segments: sharedSong.segments.map((segment) => ({
      ...segment,
      lyricText: segment.lyricText ?? "",
    })),
    createdAt: sharedSong.createdAt,
    updatedAt: sharedSong.updatedAt,
    lastPracticedAt: null,
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <section className="mx-auto max-w-4xl space-y-5">
        <header className="border-b border-gray-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Shared song</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-950">{sharedSong.title}</h1>
          {sharedSong.artist ? <p className="mt-1 text-lg text-gray-700">{sharedSong.artist}</p> : null}
          <p className="mt-2 text-sm text-gray-600">
            By <span className="font-semibold text-gray-900">{sharedSong.owner.displayName}</span>{" "}
            <span className="text-gray-500">@{sharedSong.owner.username}</span>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Open Cantare
            </Link>
            {viewer && !viewerOwnsSong ? <SharedSongImportButton priorImportCount={priorImports.length} /> : null}
          </div>
          {!viewer ? (
            <div className="mt-5">
              <GuestWelcomePanel
                title="Welcome to Cantare"
                footer="Sign in from Cantare to import this song into your own library, or keep practicing here as a guest."
              />
            </div>
          ) : null}
          {priorImports.length > 0 && !viewerOwnsSong ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Already imported</p>
              <p className="mt-1">You copied this song before. Import again to create a separate snapshot.</p>
            </div>
          ) : null}
        </header>

        <SharedSongPractice song={practiceSong} />
      </section>
    </main>
  );
}
