import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, desc } from "drizzle-orm";
import { songs, segments, practiceRatings, playlists, playlistSongs } from "./schema";

// ── chainable mock builder ─────────────────────────────────────────────────────
// Creates a fluent mock object where every method returns itself and
// the object itself is a Promise resolving to `resolveValue`.
function makeChain(resolveValue: unknown = []) {
  const chain = {
    then: (res: Parameters<Promise<unknown>['then']>[0]) => Promise.resolve(resolveValue).then(res),
    catch: (rej: (e: unknown) => unknown) => Promise.resolve(resolveValue).catch(rej),
    finally: (fn: () => void) => Promise.resolve(resolveValue).finally(fn),
  } as Record<string, unknown> & PromiseLike<unknown>;
  const handler: ProxyHandler<typeof chain> = {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      const spy = vi.fn(() => new Proxy(chain, handler));
      (target as Record<string | symbol, unknown>)[prop] = spy;
      return spy;
    },
  };
  return new Proxy(chain, handler);
}

// Spies we want to inspect across tests
const selectSpy = vi.fn();
const insertSpy = vi.fn();
const updateSpy = vi.fn();
const deleteSpy = vi.fn();

vi.mock("./index", () => ({
  db: vi.fn(() => ({
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    delete: deleteSpy,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Lazily import queries AFTER mock is set up
async function getQueries() {
  return import("./queries");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getAllSongs", () => {
  it("calls select().from(songs).orderBy(desc(createdAt))", async () => {
    const chain = makeChain([]);
    selectSpy.mockReturnValue(chain);

    const { getAllSongs } = await getQueries();
    await getAllSongs();

    expect(selectSpy).toHaveBeenCalledOnce();
    // from() and orderBy() are called on the chain
    const fromSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["from"];
    expect(fromSpy).toHaveBeenCalledWith(songs);
    const orderBySpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["orderBy"];
    expect(orderBySpy).toHaveBeenCalledWith(desc(songs.createdAt));
  });

  it("falls back when last_practiced_at column is missing", async () => {
    const missingColumnChain = {
      from: vi.fn(() => {
        throw new Error('column "last_practiced_at" does not exist');
      }),
    };
    const fallbackRows = [
      {
        id: "song-1",
        title: "Song 1",
        artist: null,
        audioKey: null,
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
      },
    ];
    const fallbackChain = makeChain(fallbackRows);
    selectSpy
      .mockReturnValueOnce(missingColumnChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { getAllSongs } = await getQueries();
    const result = await getAllSongs();

    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        ...fallbackRows[0],
        lastPracticedAt: null,
      },
    ]);
  });

  it("falls back even when primary select fails with generic error", async () => {
    const failingChain = {
      from: vi.fn(() => {
        throw new Error('Failed query: select ...');
      }),
    };
    const fallbackRows = [
      {
        id: "song-9",
        title: "Fallback Song",
        artist: null,
        audioKey: null,
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
      },
    ];
    const fallbackChain = makeChain(fallbackRows);

    selectSpy
      .mockReturnValueOnce(failingChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { getAllSongs } = await getQueries();
    const result = await getAllSongs();

    expect(result).toEqual([
      {
        ...fallbackRows[0],
        lastPracticedAt: null,
      },
    ]);
  });
});

describe("deleteSong", () => {
  it("calls delete(songs).where(eq(songs.id, id))", async () => {
    const chain = makeChain();
    deleteSpy.mockReturnValue(chain);

    const { deleteSong } = await getQueries();
    await deleteSong("song-1");

    expect(deleteSpy).toHaveBeenCalledWith(songs);
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalledWith(eq(songs.id, "song-1"));
  });
});

describe("upsertSegments", () => {
  it("deletes existing segments then inserts new ones", async () => {
    const deleteChain = makeChain();
    const insertChain = makeChain([]);
    deleteSpy.mockReturnValue(deleteChain);
    insertSpy.mockReturnValue(insertChain);

    const { upsertSegments } = await getQueries();
    const newSegs = [
      { id: "s1", label: "Verse 1", order: 0, startMs: 0, endMs: 1000, lyricText: "Hello" },
    ];
    await upsertSegments("song-1", newSegs);

    // delete called first with segments table
    expect(deleteSpy).toHaveBeenCalledWith(segments);
    const deleteWhereSpy = (deleteChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(deleteWhereSpy).toHaveBeenCalledWith(eq(segments.songId, "song-1"));

    // insert called next
    expect(insertSpy).toHaveBeenCalledWith(segments);
    const valuesSpy = (insertChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith(
      [{ ...newSegs[0], songId: "song-1", pitchContourNotes: [] }]
    );
  });

  it("skips insert when segments array is empty", async () => {
    const deleteChain = makeChain();
    deleteSpy.mockReturnValue(deleteChain);

    const { upsertSegments } = await getQueries();
    await upsertSegments("song-1", []);

    expect(deleteSpy).toHaveBeenCalledWith(segments);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("falls back when pitch_contour_notes column is missing", async () => {
    const deleteChain = makeChain();
    const missingColumnChain = {
      values: vi.fn(() => {
        throw new Error('column "pitch_contour_notes" does not exist');
      }),
    };
    const fallbackInsertChain = makeChain([]);
    deleteSpy.mockReturnValue(deleteChain);
    insertSpy
      .mockReturnValueOnce(missingColumnChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackInsertChain);

    const { upsertSegments } = await getQueries();
    await upsertSegments("song-1", [
      { id: "s1", label: "Verse 1", order: 0, startMs: 0, endMs: 1000, lyricText: "Hello" },
    ]);

    const fallbackValuesSpy = (fallbackInsertChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(fallbackValuesSpy).toHaveBeenCalledWith([
      { id: "s1", label: "Verse 1", order: 0, startMs: 0, endMs: 1000, lyricText: "Hello", songId: "song-1" },
    ]);
  });
});

describe("updateSongAudioKey", () => {
  it("sets only audioKey, does not touch other fields", async () => {
    const chain = makeChain();
    updateSpy.mockReturnValue(chain);

    const { updateSongAudioKey } = await getQueries();
    await updateSongAudioKey("song-1", "r2/audio/song-1.mp3");

    expect(updateSpy).toHaveBeenCalledWith(songs);
    const setSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    // Only audioKey is passed — no title, artist, or createdAt
    expect(setSpy).toHaveBeenCalledWith({ audioKey: "r2/audio/song-1.mp3" });
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalledWith(eq(songs.id, "song-1"));
  });
});

describe("markSongPracticed", () => {
  it("updates lastPracticedAt for the song", async () => {
    const chain = makeChain();
    updateSpy.mockReturnValue(chain);

    const { markSongPracticed } = await getQueries();
    const practicedAt = new Date("2026-04-02T12:34:56.000Z");
    await markSongPracticed("song-1", practicedAt);

    expect(updateSpy).toHaveBeenCalledWith(songs);
    const setSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(setSpy).toHaveBeenCalledWith({ lastPracticedAt: practicedAt });
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalledWith(eq(songs.id, "song-1"));
  });

  it("no-ops when last_practiced_at column is missing", async () => {
    const failingChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => {
          throw new Error('column "last_practiced_at" of relation "songs" does not exist');
        }),
      })),
    };
    updateSpy.mockReturnValue(failingChain as unknown as ReturnType<typeof makeChain>);

    const { markSongPracticed } = await getQueries();
    await expect(markSongPracticed("song-1", new Date("2026-04-02T12:34:56.000Z"))).resolves.toBeUndefined();
  });

  it("no-ops when missing-column error is on cause", async () => {
    const error = new Error('Failed query: update "songs" set "last_practiced_at" = $1 where "songs"."id" = $2');
    (error as Error & { cause?: unknown }).cause = {
      code: '42703',
      message: 'column "last_practiced_at" of relation "songs" does not exist',
    };

    const failingChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => {
          throw error;
        }),
      })),
    };
    updateSpy.mockReturnValue(failingChain as unknown as ReturnType<typeof makeChain>);

    const { markSongPracticed } = await getQueries();
    await expect(markSongPracticed("song-1", new Date("2026-04-02T12:34:56.000Z"))).resolves.toBeUndefined();
  });
});

describe("createSegment", () => {
  it("inserts segment and returns it", async () => {
    const mockSegment = {
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
      pitchContourNotes: [],
    };
    const chain = makeChain([mockSegment]);
    insertSpy.mockReturnValue(chain);

    const { createSegment } = await getQueries();
    const result = await createSegment(mockSegment);

    expect(insertSpy).toHaveBeenCalledWith(segments);
    const valuesSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith(mockSegment);
    const returningSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["returning"];
    expect(returningSpy).toHaveBeenCalled();
    expect(result).toEqual(mockSegment);
  });

  it("defaults pitchContourNotes to empty array when omitted", async () => {
    const mockSegment = {
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
      pitchContourNotes: [],
    };
    const chain = makeChain([mockSegment]);
    insertSpy.mockReturnValue(chain);

    const { createSegment } = await getQueries();
    await createSegment({
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
    });

    const valuesSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith({
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
      pitchContourNotes: [],
    });
  });

  it("falls back when pitch_contour_notes column is missing", async () => {
    const missingColumnChain = {
      values: vi.fn(() => {
        throw new Error('column "pitch_contour_notes" does not exist');
      }),
    };
    const fallbackRows = [{
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
    }];
    const fallbackChain = makeChain(fallbackRows);
    insertSpy
      .mockReturnValueOnce(missingColumnChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { createSegment } = await getQueries();
    const result = await createSegment({
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
      pitchContourNotes: [{ id: "n-1", timeOffsetMs: 0, durationMs: 100, lane: 0.5 }],
    });

    const fallbackValuesSpy = (fallbackChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(fallbackValuesSpy).toHaveBeenCalledWith({
      id: "seg-1",
      songId: "song-1",
      label: "Verse 1",
      order: 1,
      startMs: 0,
      endMs: 1000,
      lyricText: "Lyrics here",
    });
    expect(result).toEqual({ ...fallbackRows[0], pitchContourNotes: [] });
  });
});

describe("updateSegment", () => {
  it("updates segment fields", async () => {
    const chain = makeChain();
    updateSpy.mockReturnValue(chain);

    const { updateSegment } = await getQueries();
    await updateSegment("seg-1", { label: "Chorus", startMs: 500 });

    expect(updateSpy).toHaveBeenCalledWith(segments);
    const setSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(setSpy).toHaveBeenCalledWith({ label: "Chorus", startMs: 500 });
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalledWith(eq(segments.id, "seg-1"));
  });

  it("falls back when pitch_contour_notes column is missing", async () => {
    const missingColumnChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => {
          throw new Error('column "pitch_contour_notes" does not exist');
        }),
      })),
    };
    const fallbackChain = makeChain();
    updateSpy
      .mockReturnValueOnce(missingColumnChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { updateSegment } = await getQueries();
    await updateSegment("seg-1", {
      label: "Chorus",
      pitchContourNotes: [{ id: "n-1", timeOffsetMs: 0, durationMs: 100, lane: 0.5 }],
    });

    const fallbackSetSpy = (fallbackChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(fallbackSetSpy).toHaveBeenCalledWith({ label: "Chorus" });
  });

  it("throws migration-required error when only pitch contour notes are updated on a legacy schema", async () => {
    const missingColumnChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => {
          throw new Error('column "pitch_contour_notes" does not exist');
        }),
      })),
    };
    updateSpy.mockReturnValueOnce(missingColumnChain as unknown as ReturnType<typeof makeChain>);

    const { updateSegment } = await getQueries();
    await expect(updateSegment("seg-1", {
      pitchContourNotes: [{ id: "n-1", timeOffsetMs: 0, durationMs: 100, lane: 0.5 }],
    })).rejects.toMatchObject({ code: "PITCH_CONTOUR_MIGRATION_REQUIRED" });

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getSegmentsBySongId", () => {
  it("falls back when pitch_contour_notes column is missing", async () => {
    const missingColumnChain = {
      from: vi.fn(() => {
        throw new Error('column "pitch_contour_notes" does not exist');
      }),
    };
    const fallbackRows = [
      {
        id: "seg-1",
        songId: "song-1",
        label: "Verse 1",
        order: 0,
        startMs: 0,
        endMs: 1000,
        lyricText: "Lyrics here",
      },
    ];
    const fallbackChain = makeChain(fallbackRows);
    selectSpy
      .mockReturnValueOnce(missingColumnChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { getSegmentsBySongId } = await getQueries();
    const result = await getSegmentsBySongId("song-1");

    expect(result).toEqual([
      {
        ...fallbackRows[0],
        pitchContourNotes: [],
      },
    ]);
  });
});

describe("deleteSegment", () => {
  it("deletes segment by id", async () => {
    const chain = makeChain();
    deleteSpy.mockReturnValue(chain);

    const { deleteSegment } = await getQueries();
    await deleteSegment("seg-1");

    expect(deleteSpy).toHaveBeenCalledWith(segments);
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalledWith(eq(segments.id, "seg-1"));
  });
});

describe("getRatingsForSong", () => {
  it("returns ratings ordered by ratedAt desc for a song", async () => {
    const ratedAt = new Date("2026-03-31T12:00:00.000Z");
    const rows = [
      {
        id: "r-1",
        segmentId: "seg-1",
        rating: 4,
        ratedAt,
      },
    ];
    const chain = makeChain(rows);
    selectSpy.mockReturnValue(chain);

    const { getRatingsForSong } = await getQueries();
    const result = await getRatingsForSong("song-1");

    expect(selectSpy).toHaveBeenCalledOnce();
    const fromSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["from"];
    expect(fromSpy).toHaveBeenCalledWith(practiceRatings);
    const orderBySpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["orderBy"];
    expect(orderBySpy).toHaveBeenCalledWith(desc(practiceRatings.ratedAt));
    expect(result).toEqual([
      {
        id: "r-1",
        segmentId: "seg-1",
        rating: 4,
        ratedAt: "2026-03-31T12:00:00.000Z",
      },
    ]);
  });

  it("dedupes to latest rating per segment", async () => {
    const rows = [
      {
        id: "r-new",
        segmentId: "seg-1",
        rating: 5,
        ratedAt: new Date("2026-04-01T12:00:00.000Z"),
      },
      {
        id: "r-old",
        segmentId: "seg-1",
        rating: 2,
        ratedAt: new Date("2026-03-01T12:00:00.000Z"),
      },
      {
        id: "r-2",
        segmentId: "seg-2",
        rating: 3,
        ratedAt: new Date("2026-03-15T12:00:00.000Z"),
      },
    ];
    const chain = makeChain(rows);
    selectSpy.mockReturnValue(chain);

    const { getRatingsForSong } = await getQueries();
    const result = await getRatingsForSong("song-1");

    expect(result).toEqual([
      {
        id: "r-new",
        segmentId: "seg-1",
        rating: 5,
        ratedAt: "2026-04-01T12:00:00.000Z",
      },
      {
        id: "r-2",
        segmentId: "seg-2",
        rating: 3,
        ratedAt: "2026-03-15T12:00:00.000Z",
      },
    ]);
  });
});

describe("getLatestRatingTimeBySongIds", () => {
  it("returns latest rating timestamp per song", async () => {
    const rows = [
      {
        songId: "song-1",
        ratedAt: new Date("2026-04-02T10:00:00.000Z"),
      },
      {
        songId: "song-1",
        ratedAt: new Date("2026-04-01T10:00:00.000Z"),
      },
      {
        songId: "song-2",
        ratedAt: new Date("2026-04-02T09:00:00.000Z"),
      },
    ];
    const chain = makeChain(rows);
    selectSpy.mockReturnValue(chain);

    const { getLatestRatingTimeBySongIds } = await getQueries();
    const result = await getLatestRatingTimeBySongIds(["song-1", "song-2"]);

    expect(result["song-1"]).toEqual(new Date("2026-04-02T10:00:00.000Z"));
    expect(result["song-2"]).toEqual(new Date("2026-04-02T09:00:00.000Z"));
  });
});

describe("getSongKnowledgeBySongIds", () => {
  it("returns rounded percentage based on latest rating per segment", async () => {
    const rows = [
      {
        songId: "song-1",
        segmentId: "seg-1",
        rating: 5,
        ratedAt: new Date("2026-04-02T10:00:00.000Z"),
      },
      {
        songId: "song-1",
        segmentId: "seg-1",
        rating: 2,
        ratedAt: new Date("2026-04-01T10:00:00.000Z"),
      },
      {
        songId: "song-1",
        segmentId: "seg-2",
        rating: 3,
        ratedAt: new Date("2026-04-02T09:00:00.000Z"),
      },
      {
        songId: "song-2",
        segmentId: "seg-3",
        rating: 4,
        ratedAt: new Date("2026-04-02T08:00:00.000Z"),
      },
    ];
    const chain = makeChain(rows);
    selectSpy.mockReturnValue(chain);

    const { getSongKnowledgeBySongIds } = await getQueries();
    const result = await getSongKnowledgeBySongIds(["song-1", "song-2"]);

    // song-1 latest ratings: 5 and 3 => avg 4 => 80%
    expect(result["song-1"]).toBe(80);
    // song-2 latest rating: 4 => 80%
    expect(result["song-2"]).toBe(80);
  });
});

describe("saveRatings", () => {
  it("replaces existing rows per segment with latest ratings", async () => {
    const deleteChain = makeChain();
    const insertChain = makeChain([]);
    deleteSpy.mockReturnValue(deleteChain);
    insertSpy.mockReturnValue(insertChain);

    const { saveRatings } = await getQueries();
    await saveRatings([
      {
        segmentId: "seg-1",
        rating: 5,
        ratedAt: new Date("2026-03-31T12:00:00.000Z"),
      },
      {
        segmentId: "seg-2",
        rating: 3,
        ratedAt: new Date("2026-03-31T12:01:00.000Z"),
      },
      {
        segmentId: "seg-1",
        rating: 4,
        ratedAt: new Date("2026-03-31T12:02:00.000Z"),
      },
    ]);

    expect(deleteSpy).toHaveBeenCalledWith(practiceRatings);
    const deleteWhereSpy = (deleteChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(deleteWhereSpy).toHaveBeenCalled();

    expect(insertSpy).toHaveBeenCalledWith(practiceRatings);
    const valuesSpy = (insertChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith([
      {
        id: expect.any(String),
        segmentId: "seg-1",
        rating: 4,
        ratedAt: new Date("2026-03-31T12:02:00.000Z"),
      },
      {
        id: expect.any(String),
        segmentId: "seg-2",
        rating: 3,
        ratedAt: new Date("2026-03-31T12:01:00.000Z"),
      },
    ]);
  });

  it("skips insert when there are no ratings", async () => {
    const { saveRatings } = await getQueries();
    await saveRatings([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("deleteRatingsForSong", () => {
  it("deletes ratings for all segments of a song", async () => {
    const selectChain = makeChain([{ id: "seg-1" }, { id: "seg-2" }]);
    const deleteChain = makeChain();
    selectSpy.mockReturnValue(selectChain);
    deleteSpy.mockReturnValue(deleteChain);

    const { deleteRatingsForSong } = await getQueries();
    await deleteRatingsForSong("song-1");

    const fromSpy = (selectChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["from"];
    expect(fromSpy).toHaveBeenCalledWith(segments);
    expect(deleteSpy).toHaveBeenCalledWith(practiceRatings);
    const whereSpy = (deleteChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalled();
  });

  it("does not delete when song has no segments", async () => {
    const selectChain = makeChain([]);
    selectSpy.mockReturnValue(selectChain);

    const { deleteRatingsForSong } = await getQueries();
    await deleteRatingsForSong("song-1");

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe("getAllPlaylists", () => {
  it("excludes retired playlists by default", async () => {
    const chain = makeChain([]);
    selectSpy.mockReturnValue(chain);

    const { getAllPlaylists } = await getQueries();
    await getAllPlaylists();

    // getAllPlaylists now calls select twice (once for playlists, once for playlistSongs)
    expect(selectSpy).toHaveBeenCalledTimes(2);
    const fromSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["from"];
    expect(fromSpy).toHaveBeenCalledWith(playlists);
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalled();
  });

  it("includes retired playlists when includeRetired is true", async () => {
    const chain = makeChain([]);
    selectSpy.mockReturnValue(chain);

    const { getAllPlaylists } = await getQueries();
    await getAllPlaylists(true);

    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).not.toHaveBeenCalled();
  });
});

describe("createPlaylist", () => {
  it("inserts and returns playlist summary", async () => {
    const createdAt = new Date("2026-03-31T00:00:00.000Z");
    const insertChain = makeChain([
      { id: "pl-1", name: "Sunday Set", eventDate: "2026-04-04", isRetired: false, createdAt },
    ]);
    insertSpy.mockReturnValue(insertChain);

    const { createPlaylist } = await getQueries();
    const result = await createPlaylist({ name: "Sunday Set", eventDate: "2026-04-04" });

    expect(insertSpy).toHaveBeenCalledWith(playlists);
    expect(result.id).toBe("pl-1");
    expect(result.name).toBe("Sunday Set");
  });
});

describe("deletePlaylist", () => {
  it("deletes only from playlists table", async () => {
    const chain = makeChain();
    deleteSpy.mockReturnValue(chain);

    const { deletePlaylist } = await getQueries();
    await deletePlaylist("pl-1");

    expect(deleteSpy).toHaveBeenCalledWith(playlists);
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalled();
  });
});

describe("reorderPlaylistSongs", () => {
  it("issues updates for each ordered song", async () => {
    const chain = makeChain();
    updateSpy.mockReturnValue(chain);

    const { reorderPlaylistSongs } = await getQueries();
    await reorderPlaylistSongs("pl-1", ["song-2", "song-1"]);

    expect(updateSpy).toHaveBeenCalledWith(playlistSongs);
    const setSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(setSpy).toHaveBeenCalledWith({ position: 1 });
  });
});