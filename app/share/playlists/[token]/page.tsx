import Link from "next/link";
import { cookies } from "next/headers";
import { getPlaylistImportsForSource, getSharedPlaylistByToken, getUserForSessionTokenHash } from "../../../../db/queries";
import { AUTH_SESSION_COOKIE_NAME, hashAuthToken } from "../../../lib/authTokens";
import type { Playlist } from "../../../types";
import { GuestWelcomePanel } from "../../../components/GuestWelcomePanel";
import { SharedPlaylistGuestPractice } from "./SharedPlaylistGuestPractice";
import { SharedPlaylistSignIn } from "./SharedPlaylistSignIn";

export const dynamic = "force-dynamic";

export default async function SharedPlaylistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [playlist, cookieStore] = await Promise.all([
    getSharedPlaylistByToken(token),
    cookies(),
  ]);
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const viewer = sessionToken ? await getUserForSessionTokenHash(hashAuthToken(sessionToken)) : null;
  const priorImports = playlist && viewer ? await getPlaylistImportsForSource(playlist.id, viewer.id) : [];

  if (!playlist) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <section className="mx-auto max-w-3xl rounded border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Cantare Music</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Playlist unavailable</h1>
          <p className="mt-3 text-gray-700">
            This playlist share link is no longer active.
          </p>
          <Link href="/" className="mt-5 inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Open Cantare
          </Link>
        </section>
      </main>
    );
  }

  const sortedSongs = [...playlist.songs].sort((a, b) => a.position - b.position);
  const practicePlaylist: Playlist = {
    ...playlist,
    songs: sortedSongs.map((song) => ({
      ...song,
      segments: song.segments.map((segment) => ({
        ...segment,
        lyricText: segment.lyricText ?? "",
      })),
    })),
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <section className="mx-auto max-w-4xl space-y-5">
        <header className="border-b border-gray-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Shared playlist</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-950">{playlist.name}</h1>
          <p className="mt-2 text-sm text-gray-600">
            By <span className="font-semibold text-gray-900">{playlist.owner.displayName}</span>{" "}
            <span className="text-gray-500">@{playlist.owner.username}</span>
          </p>
          {playlist.eventDate ? (
            <p className="mt-1 text-sm text-gray-500">{new Date(playlist.eventDate).toLocaleDateString()}</p>
          ) : null}
          {viewer ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <form action={`/api/share/playlists/${encodeURIComponent(token)}/import`} method="post">
                <button
                  type="submit"
                  className="inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Import playlist
                </button>
              </form>
              {priorImports.length > 0 ? (
                <form action={`/api/share/playlists/${encodeURIComponent(token)}/import`} method="post">
                  <input type="hidden" name="force" value="true" />
                  <button
                    type="submit"
                    className="inline-flex rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Import again
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="mt-5">
              <GuestWelcomePanel
                title="Welcome to Cantare"
                action={<SharedPlaylistSignIn returnTo={`/share/playlists/${encodeURIComponent(token)}`} />}
                footer="Sign in to import this playlist into your own library, or keep practicing here as a guest."
              />
            </div>
          )}
          {priorImports.length > 0 ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Already imported</p>
              <p className="mt-1">
                You imported this playlist before. Open your latest copy, or use Import again to make a separate new copy.
              </p>
              <Link
                href={`/#view=playlist_detail&playlist=${encodeURIComponent(priorImports[0].id)}`}
                className="mt-2 inline-flex font-semibold text-amber-950 underline"
              >
                Open imported copy
              </Link>
            </div>
          ) : null}
        </header>

        <SharedPlaylistGuestPractice playlist={practicePlaylist} />

        <ul className="space-y-3" data-testid="shared-playlist-song-list">
          {sortedSongs.length > 0 ? (
            sortedSongs.map((song, index) => (
              <li key={song.id} className="rounded border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-950">{song.title}</h2>
                    {song.artist ? <p className="text-sm text-gray-600">{song.artist}</p> : null}
                    {song.segments.length > 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {song.segments.length} {song.segments.length === 1 ? "section" : "sections"}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))
          ) : (
            <li className="rounded border border-gray-200 bg-white p-4 text-gray-600 shadow-sm">
              This playlist does not have songs yet.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
