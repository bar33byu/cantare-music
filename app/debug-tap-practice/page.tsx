"use client";

import React from "react";
import { buildContourDirectionEvents, compareContourAttemptDetailed, type ContourDirection } from "../lib/contourPractice";
import type { PitchContourNote, Song } from "../types";

interface SongSummary {
  id: string;
  title: string;
  artist?: string;
  hasSegments?: boolean;
  hasTapKeys?: boolean;
}

interface TapSessionSummary {
  id: string;
  songId: string;
  startedAt: string;
  tapCount: number;
}

interface PersistedTap {
  id: string;
  segmentId: string;
  noteId: string;
  timeOffsetMs: number;
  durationMs: number;
  lane: number;
  createdAt: string;
}

interface TapSessionDetail {
  id: string;
  songId: string;
  startedAt: string;
  taps: PersistedTap[];
}

interface ApiErrorPayload {
  error?: string;
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

function formatLane(value: number): string {
  return value.toFixed(3);
}

function directionGlyph(direction: ContourDirection): string {
  if (direction === "up") {
    return "^";
  }
  if (direction === "down") {
    return "v";
  }
  return "=";
}

function directionLabel(direction: ContourDirection): string {
  if (direction === "up") {
    return "Up";
  }
  if (direction === "down") {
    return "Down";
  }
  return "Same";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore parse failures.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function statusClass(status: "matched" | "mismatched" | "pending"): string {
  if (status === "matched") {
    return "bg-emerald-100 text-emerald-900 border-emerald-200";
  }
  if (status === "mismatched") {
    return "bg-rose-100 text-rose-900 border-rose-200";
  }
  return "bg-amber-100 text-amber-900 border-amber-200";
}

export default function DebugTapPracticePage() {
  const [songs, setSongs] = React.useState<SongSummary[]>([]);
  const [songsLoading, setSongsLoading] = React.useState(true);
  const [selectedSongId, setSelectedSongId] = React.useState<string>("");
  const [querySongId, setQuerySongId] = React.useState<string | null>(null);
  const [querySessionId, setQuerySessionId] = React.useState<string | null>(null);

  const [songDetail, setSongDetail] = React.useState<Song | null>(null);
  const [sessions, setSessions] = React.useState<TapSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);

  const [selectedSessionId, setSelectedSessionId] = React.useState<string>("");
  const [sessionDetail, setSessionDetail] = React.useState<TapSessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = React.useState(false);

  const [timeToleranceMs, setTimeToleranceMs] = React.useState(400);
  const [sameDeadZone, setSameDeadZone] = React.useState(0.05);
  const [durationToleranceRatio, setDurationToleranceRatio] = React.useState(0.6);
  const [selectedSegmentId, setSelectedSegmentId] = React.useState("all");

  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const songId = params.get("songId");
    const sessionId = params.get("sessionId");
    setQuerySongId(songId);
    setQuerySessionId(sessionId);
  }, []);

  const loadSongs = React.useCallback(async () => {
    setSongsLoading(true);
    setError(null);
    try {
      const data = await fetchJson<SongSummary[]>("/api/songs");
      setSongs(data);
      if (data.length > 0) {
        setSelectedSongId((previous) => {
          if (previous) {
            return previous;
          }
          if (querySongId && data.some((song) => song.id === querySongId)) {
            return querySongId;
          }
          return data[0].id;
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load songs");
    } finally {
      setSongsLoading(false);
    }
  }, [querySongId]);

  React.useEffect(() => {
    void loadSongs();
  }, [loadSongs]);

  const loadSongContext = React.useCallback(async (songId: string) => {
    if (!songId) {
      setSongDetail(null);
      setSessions([]);
      setSelectedSessionId("");
      setSessionDetail(null);
      return;
    }

    setSessionsLoading(true);
    setError(null);
    try {
      const [song, sessionsPayload] = await Promise.all([
        fetchJson<Song>(`/api/songs/${songId}`),
        fetchJson<{ sessions: TapSessionSummary[] }>(`/api/songs/${songId}/tap-sessions`),
      ]);

      setSongDetail(song);
      setSessions(sessionsPayload.sessions);
      setSelectedSegmentId("all");

      if (sessionsPayload.sessions.length > 0) {
        setSelectedSessionId((previous) => {
          if (querySessionId && sessionsPayload.sessions.some((session) => session.id === querySessionId)) {
            return querySessionId;
          }
          const stillExists = sessionsPayload.sessions.some((session) => session.id === previous);
          return stillExists ? previous : sessionsPayload.sessions[0].id;
        });
      } else {
        setSelectedSessionId("");
        setSessionDetail(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load song data");
      setSongDetail(null);
      setSessions([]);
      setSelectedSessionId("");
      setSessionDetail(null);
    } finally {
      setSessionsLoading(false);
    }
  }, [querySessionId]);

  React.useEffect(() => {
    void loadSongContext(selectedSongId);
  }, [selectedSongId, loadSongContext]);

  const loadSessionDetail = React.useCallback(async (songId: string, sessionId: string) => {
    if (!songId || !sessionId) {
      setSessionDetail(null);
      return;
    }

    setSessionLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<{ session: TapSessionDetail }>(`/api/songs/${songId}/tap-sessions/${sessionId}`);
      setSessionDetail(payload.session);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load session detail");
      setSessionDetail(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessionDetail(selectedSongId, selectedSessionId);
  }, [selectedSongId, selectedSessionId, loadSessionDetail]);

  const perSegmentRows = React.useMemo(() => {
    if (!songDetail || !sessionDetail) {
      return [];
    }

    return songDetail.segments
      .map((segment) => {
        const answerNotes = [...(segment.pitchContourNotes ?? [])].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
        const attemptNotes = sessionDetail.taps
          .filter((tap) => tap.segmentId === segment.id)
          .map<PitchContourNote>((tap) => ({
            id: tap.id,
            timeOffsetMs: tap.timeOffsetMs,
            durationMs: tap.durationMs,
            lane: tap.lane,
          }))
          .sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);

        const match = compareContourAttemptDetailed(answerNotes, attemptNotes, {
          timeToleranceMs,
          sameDeadZone,
          durationToleranceRatio,
        });

        const answerEvents = buildContourDirectionEvents(answerNotes, { sameDeadZone });
        const attemptEvents = buildContourDirectionEvents(attemptNotes, { sameDeadZone });

        return {
          segment,
          answerNotes,
          attemptNotes,
          match,
          answerEvents,
          attemptEvents,
        };
      })
      .filter((row) => row.answerNotes.length > 0 || row.attemptNotes.length > 0)
      .filter((row) => selectedSegmentId === "all" || row.segment.id === selectedSegmentId);
  }, [songDetail, sessionDetail, timeToleranceMs, sameDeadZone, durationToleranceRatio, selectedSegmentId]);

  const overall = React.useMemo(() => {
    if (perSegmentRows.length === 0) {
      return { matchedEvents: 0, totalEvents: 0, score: 0 };
    }

    const matchedEvents = perSegmentRows.reduce((sum, row) => sum + row.match.matchedEvents, 0);
    const totalEvents = perSegmentRows.reduce((sum, row) => sum + row.match.totalEvents, 0);

    return {
      matchedEvents,
      totalEvents,
      score: totalEvents === 0 ? 1 : matchedEvents / totalEvents,
    };
  }, [perSegmentRows]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_28%),radial-gradient(circle_at_top_right,#fde68a,transparent_34%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[28px] border border-white/70 bg-white/85 px-6 py-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Debug Interface</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Tap Practice Session Inspector</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review persisted tap attempts against answer-key contour notes and inspect how match scoring reacts to threshold changes.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Song</span>
              <select
                value={selectedSongId}
                onChange={(event) => setSelectedSongId(event.target.value)}
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
                disabled={songsLoading || songs.length === 0}
              >
                {songs.length === 0 ? <option value="">No songs</option> : null}
                {songs.map((song) => (
                  <option key={song.id} value={song.id}>
                    {song.title}{song.artist ? ` - ${song.artist}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Session</span>
              <select
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
                disabled={sessionsLoading || sessions.length === 0}
              >
                {sessions.length === 0 ? <option value="">No saved sessions</option> : null}
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {new Date(session.startedAt).toLocaleString()} ({session.tapCount} taps)
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Segment</span>
              <select
                value={selectedSegmentId}
                onChange={(event) => setSelectedSegmentId(event.target.value)}
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
                disabled={!songDetail}
              >
                <option value="all">All segments with data</option>
                {(songDetail?.segments ?? []).map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSongs()}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh songs
            </button>
            <button
              type="button"
              onClick={() => void loadSongContext(selectedSongId)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={!selectedSongId}
            >
              Refresh sessions
            </button>
            <button
              type="button"
              onClick={() => void loadSessionDetail(selectedSongId, selectedSessionId)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={!selectedSongId || !selectedSessionId}
            >
              Refresh session detail
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Time tolerance ms</span>
              <input
                type="number"
                min={0}
                step={10}
                value={timeToleranceMs}
                onChange={(event) => setTimeToleranceMs(Math.max(0, Number(event.target.value) || 0))}
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
              />
            </label>
            <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Same dead zone</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={sameDeadZone}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSameDeadZone(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)));
                }}
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
              />
            </label>
            <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Duration tolerance ratio</span>
              <input
                type="number"
                min={0}
                step={0.05}
                value={durationToleranceRatio}
                onChange={(event) => setDurationToleranceRatio(Math.max(0, Number(event.target.value) || 0))}
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
          ) : null}
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Matched events</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{overall.matchedEvents}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total answer events</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{overall.totalEvents}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Overall score</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{Math.round(overall.score * 100)}%</p>
          </article>
        </section>

        {songsLoading || sessionsLoading || sessionLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
            Loading data...
          </section>
        ) : null}

        {!selectedSongId ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
            Select a song to inspect tap sessions.
          </section>
        ) : null}

        {selectedSongId && !selectedSessionId && !sessionsLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
            This song has no persisted tap sessions yet.
          </section>
        ) : null}

        {perSegmentRows.length === 0 && selectedSessionId && !sessionLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
            No comparable answer-key or attempt data found for this session.
          </section>
        ) : null}

        {perSegmentRows.map((row) => (
          <section key={row.segment.id} className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{row.segment.label}</h2>
                <p className="text-sm text-slate-600">
                  Segment window: {formatMs(row.segment.startMs)} to {formatMs(row.segment.endMs)}
                </p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                Score: {Math.round(row.match.score * 100)}% ({row.match.matchedEvents}/{row.match.totalEvents})
              </div>
            </header>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <article className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">Answer key notes</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="text-sky-900">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Note id</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Duration</th>
                        <th className="pb-2">Lane</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.answerNotes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-2 text-slate-500">No answer notes.</td>
                        </tr>
                      ) : (
                        row.answerNotes.map((note, index) => (
                          <tr key={note.id} className="border-t border-sky-100 text-slate-800">
                            <td className="py-1.5">{index + 1}</td>
                            <td className="py-1.5">{note.id}</td>
                            <td className="py-1.5">{formatMs(note.timeOffsetMs)}</td>
                            <td className="py-1.5">{formatMs(note.durationMs)}</td>
                            <td className="py-1.5">{formatLane(note.lane)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-800">Attempt taps</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="text-indigo-900">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Tap id</th>
                        <th className="pb-2">Source note id</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Duration</th>
                        <th className="pb-2">Lane</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.attemptNotes.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-2 text-slate-500">No persisted taps.</td>
                        </tr>
                      ) : (
                        row.attemptNotes.map((note, index) => {
                          const status = row.match.attemptNoteStatuses[note.id] ?? "pending";
                          const sourceNoteId = sessionDetail?.taps.find((tap) => tap.id === note.id)?.noteId ?? "-";
                          return (
                            <tr key={note.id} className="border-t border-indigo-100 text-slate-800">
                              <td className="py-1.5">{index + 1}</td>
                              <td className="py-1.5">{note.id}</td>
                              <td className="py-1.5">{sourceNoteId}</td>
                              <td className="py-1.5">{formatMs(note.timeOffsetMs)}</td>
                              <td className="py-1.5">{formatMs(note.durationMs)}</td>
                              <td className="py-1.5">{formatLane(note.lane)}</td>
                              <td className="py-1.5">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(status)}`}>
                                  {status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Answer direction events</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[340px] text-left text-sm">
                    <thead>
                      <tr className="text-slate-800">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Direction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.answerEvents.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-2 text-slate-500">Need at least two answer notes.</td>
                        </tr>
                      ) : (
                        row.answerEvents.map((event, index) => (
                          <tr key={`${row.segment.id}-answer-event-${index}`} className="border-t border-slate-100 text-slate-700">
                            <td className="py-1.5">{index + 1}</td>
                            <td className="py-1.5">{formatMs(event.timeOffsetMs)}</td>
                            <td className="py-1.5">{directionGlyph(event.direction)} {directionLabel(event.direction)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Attempt direction events</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[340px] text-left text-sm">
                    <thead>
                      <tr className="text-slate-800">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Direction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.attemptEvents.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-2 text-slate-500">Need at least two taps.</td>
                        </tr>
                      ) : (
                        row.attemptEvents.map((event, index) => (
                          <tr key={`${row.segment.id}-attempt-event-${index}`} className="border-t border-slate-100 text-slate-700">
                            <td className="py-1.5">{index + 1}</td>
                            <td className="py-1.5">{formatMs(event.timeOffsetMs)}</td>
                            <td className="py-1.5">{directionGlyph(event.direction)} {directionLabel(event.direction)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
