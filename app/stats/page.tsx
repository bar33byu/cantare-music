import Link from "next/link";
import { headers } from "next/headers";
import { getPracticeStatsSummary, type PracticeStatsRange, type StatsBucket } from "../../db/queries";
import { resolveEffectiveRequestUserId } from "../api/_user";

function formatWholeNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function labelForBucket(label: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${label}T00:00:00.000Z`));
  }
  if (/^\d{4}-\d{2}$/.test(label)) {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(`${label}-01T00:00:00.000Z`));
  }
  return label;
}

function Metric({ label, value, accent = "text-slate-950", href }: { label: string; value: string; accent?: string; href?: string }) {
  const content = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
  return href ? <a href={href} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{content}</a> : content;
}

function BucketChart({ title, buckets }: { title: string; buckets: StatsBucket[] }) {
  const maxSeconds = Math.max(1, ...buckets.map((bucket) => bucket.seconds));
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <div className="mt-4 grid gap-3">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-sm">
            <span className="truncate font-medium text-slate-600" title={bucket.label}>{labelForBucket(bucket.label)}</span>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400"
                style={{ width: `${Math.max(3, (bucket.seconds / maxSeconds) * 100)}%` }}
              />
            </div>
            <span className="text-right font-semibold tabular-nums text-slate-700">{formatDuration(bucket.seconds)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const RANGE_OPTIONS: Array<{ value: PracticeStatsRange; label: string }> = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: "all", label: "All time" },
];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const requestedRange = (await searchParams).range;
  const range: PracticeStatsRange = requestedRange === "90" ? 90 : requestedRange === "all" ? "all" : 30;
  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "30 days";
  const requestHeaders = await headers();
  const userId = await resolveEffectiveRequestUserId(new Request("http://cantare.local/stats", { headers: requestHeaders }));
  const stats = await getPracticeStatsSummary(userId, new Date(), range);
  const topWeekday = [...stats.exercises.weekday].sort((a, b) => b.seconds - a.seconds || b.sessionCount - a.sessionCount)[0];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Cantare stats</p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950">Practice Dashboard</h1>
          </div>
          <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700">
            Back to Cantare
          </Link>
        </div>

        <nav aria-label="Dashboard time frame" className="mb-6 flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {RANGE_OPTIONS.map((option) => {
            const isSelected = option.value === range;
            return (
              <Link
                key={option.value}
                href={`/stats?range=${option.value}`}
                aria-current={isSelected ? "page" : undefined}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${isSelected ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Songs stored" value={formatWholeNumber(stats.songs.total)} />
          <Metric label="Mastered 80%+" value={formatWholeNumber(stats.songs.masteredAbove80)} accent="text-emerald-700" />
          <Metric label={`Songs practiced · ${rangeLabel}`} value={formatWholeNumber(stats.songs.practicedInRange)} accent="text-indigo-700" />
          <Metric label="Untouched 6+ months" value={formatWholeNumber(stats.songs.untouchedOverSixMonths)} accent="text-rose-700" href="#untouched-songs" />
        </section>

        <section className="mt-6 grid gap-3 lg:grid-cols-4">
          <Metric label={`Song practice time · ${rangeLabel}`} value={formatDuration(stats.songPractice.totalSeconds)} accent="text-sky-700" />
          <Metric label={`Song practice days · ${rangeLabel}`} value={formatWholeNumber(stats.songPractice.practicedDays)} />
          <Metric label={`Exercise practice time · ${rangeLabel}`} value={formatDuration(stats.exercises.totalSeconds)} accent="text-indigo-700" />
          <Metric label={`Exercise practice days · ${rangeLabel}`} value={formatWholeNumber(stats.exercises.practicedDays)} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Song Pulse</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">Average mastery of started songs</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{stats.songs.averageMasteryPercent}%</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Never practiced</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{stats.songs.neverPracticed}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Stalest song</dt>
                <dd className="mt-1 font-bold text-slate-950">{stats.songs.stalestSong?.title ?? "No songs yet"}</dd>
                <dd className="text-slate-600">{formatDate(stats.songs.stalestSong?.lastPracticedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Exercise Rhythm · {rangeLabel}</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Exercise sessions logged</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.exercises.totalSessions}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Average per practiced day</dt>
                <dd className="font-bold tabular-nums text-slate-950">{formatDuration(stats.exercises.averageSecondsPerPracticedDay)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Best weekday</dt>
                <dd className="font-bold tabular-nums text-slate-950">{topWeekday?.seconds ? `${topWeekday.label} (${formatDuration(topWeekday.seconds)})` : "Not enough data"}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Song Practice Time · {rangeLabel}</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Sessions logged</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.songPractice.totalSessions}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Average per practiced day</dt>
                <dd className="font-bold tabular-nums text-slate-950">{formatDuration(stats.songPractice.averageSecondsPerPracticedDay)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Average per session</dt>
                <dd className="font-bold tabular-nums text-slate-950">{formatDuration(stats.songPractice.averageSecondsPerSession)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Playlist Footprint</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Songs in at least one playlist</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.playlists.songsInAnyPlaylist}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Songs not in any playlist</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.playlists.songsNotInAnyPlaylist}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Average placements per song</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.playlists.averagePlacementsPerSong}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Average songs per playlist</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.playlists.averagePlacementsPerPlaylist}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Performed playlists</dt>
                <dd className="font-bold tabular-nums text-slate-950">{stats.playlists.performedPlaylists}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <BucketChart
            title={`Song Activity by ${range === 30 ? "Day" : range === 90 ? "Week" : "Month"}`}
            buckets={range === 30 ? stats.songPractice.daily : range === 90 ? stats.songPractice.weekly : stats.songPractice.monthly}
          />
          <BucketChart
            title={`Exercise Activity by ${range === 30 ? "Day" : range === 90 ? "Week" : "Month"}`}
            buckets={range === 30 ? stats.exercises.daily : range === 90 ? stats.exercises.weekly : stats.exercises.monthly}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <BucketChart title={`Exercise Practice by Weekday · ${rangeLabel}`} buckets={stats.exercises.weekday} />
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Song Sessions · {rangeLabel}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 py-2 pr-3">Song</th>
                    <th className="border-b border-slate-200 py-2 pr-3">Date</th>
                    <th className="border-b border-slate-200 py-2 pr-3 text-right">Time</th>
                    <th className="border-b border-slate-200 py-2 text-right">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.songPractice.recentSessions.length > 0 ? stats.songPractice.recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td className="border-b border-slate-100 py-2 pr-3 font-medium text-slate-900">{session.songTitle ?? "Song"}</td>
                      <td className="border-b border-slate-100 py-2 pr-3 text-slate-600">{formatDate(session.startedAt)}</td>
                      <td className="border-b border-slate-100 py-2 pr-3 text-right font-semibold tabular-nums">{formatDuration(session.durationSeconds)}</td>
                      <td className="border-b border-slate-100 py-2 text-right text-slate-600">{session.source}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="py-5 text-slate-600" colSpan={4}>Song practice time will appear here after you open songs for practice.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <section id="untouched-songs" className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Untouched Songs</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 py-2 pr-3">Song</th>
                    <th className="border-b border-slate-200 py-2 pr-3">Last practiced</th>
                    <th className="border-b border-slate-200 py-2 text-right">Mastery</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.songs.untouchedSongs.length > 0 ? stats.songs.untouchedSongs.map((song) => (
                    <tr key={song.id}>
                      <td className="border-b border-slate-100 py-2 pr-3">
                        <span className="font-medium text-slate-900">{song.title}</span>
                        {song.artist ? <span className="block text-xs text-slate-500">{song.artist}</span> : null}
                      </td>
                      <td className="border-b border-slate-100 py-2 pr-3 text-slate-600">{formatDate(song.lastPracticedAt)}</td>
                      <td className="border-b border-slate-100 py-2 text-right font-semibold tabular-nums">{song.masteryPercent}%</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="py-5 text-slate-600" colSpan={3}>Nothing is older than six months. Nice.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Most Playlisted Songs</h2>
            <div className="mt-4 space-y-3">
              {stats.playlists.mostIncludedSongs.length > 0 ? stats.playlists.mostIncludedSongs.map((song) => (
                <div key={song.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{song.title}</p>
                    <p className="text-sm font-bold tabular-nums text-indigo-700">{song.playlistCount}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{song.playlistNames.join(", ")}</p>
                </div>
              )) : (
                <p className="text-sm text-slate-600">Playlist inclusion stats will appear after songs are added to playlists.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Most Performed Songs</h2>
            <div className="mt-4 space-y-3">
              {stats.playlists.mostPerformedSongs.length > 0 ? stats.playlists.mostPerformedSongs.map((song) => (
                <div key={song.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{song.title}</p>
                    <p className="text-sm font-bold tabular-nums text-indigo-700">{song.performanceCount}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{song.performanceDates.map((date) => date === "undated" ? "Undated" : formatDate(date)).join(", ")}</p>
                </div>
              )) : (
                <p className="text-sm text-slate-600">Mark retired playlists as Performed to build performance counts.</p>
              )}
            </div>
          </section>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Exercise Sessions · {rangeLabel}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 py-2 pr-3">Exercise</th>
                    <th className="border-b border-slate-200 py-2 pr-3">Date</th>
                    <th className="border-b border-slate-200 py-2 pr-3 text-right">Time</th>
                    <th className="border-b border-slate-200 py-2 text-right">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.exercises.recentSessions.length > 0 ? stats.exercises.recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td className="border-b border-slate-100 py-2 pr-3 font-medium text-slate-900">{session.exerciseTitle ?? "Exercise"}</td>
                      <td className="border-b border-slate-100 py-2 pr-3 text-slate-600">{formatDate(session.startedAt)}</td>
                      <td className="border-b border-slate-100 py-2 pr-3 text-right font-semibold tabular-nums">{formatDuration(session.durationSeconds)}</td>
                      <td className="border-b border-slate-100 py-2 text-right tabular-nums text-slate-600">{session.tempoPercent}%</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="py-5 text-slate-600" colSpan={4}>Exercise playback time will appear here after you practice.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
        </section>
      </div>
    </main>
  );
}
