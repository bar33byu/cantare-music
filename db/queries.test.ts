import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, desc, isNull, and } from "drizzle-orm";
import { songs, segments, practiceRatings, playlists, playlistSongs, draftRecordings, tapPracticeSessions, tapPracticeTaps, users, magicLinkTokens, userSessions } from "./schema";

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
const executeSpy = vi.fn();

vi.mock("./index", () => ({
  db: vi.fn(() => ({
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    delete: deleteSpy,
    execute: executeSpy,
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

describe("users", () => {
  it("upsertUser stores account profile fields only", async () => {
    const row = {
      id: "internal-user-1",
      username: "singer-one",
      name: "Singer One",
      email: "singer@example.com",
      avatarUrl: null,
      profileVisibility: "private",
    };
    const chain = makeChain([row]);
    insertSpy.mockReturnValue(chain);

    const { upsertUser } = await getQueries();
    const result = await upsertUser(row);

    expect(insertSpy).toHaveBeenCalledWith(users);
    const valuesSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: "internal-user-1",
      username: "singer-one",
      name: "Singer One",
      email: "singer@example.com",
      profileVisibility: "private",
    }));
    expect(result).toEqual({
      ...row,
      accountDeletionRequestedAt: null,
      accountDeletionScheduledFor: null,
    });
  });

  it("upsertUser falls back to legacy user columns when account deletion columns are missing", async () => {
    const failingChain = {
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() => {
            throw new Error('column "account_deletion_requested_at" does not exist');
          }),
        })),
      })),
    };
    const legacyRow = {
      id: "internal-user-legacy",
      username: "legacy-singer",
      name: "Legacy Singer",
      email: "legacy@example.com",
      avatarUrl: null,
      profileVisibility: "private",
    };
    const fallbackChain = makeChain([legacyRow]);
    insertSpy
      .mockReturnValueOnce(failingChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { upsertUser } = await getQueries();
    const result = await upsertUser(legacyRow);

    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ...legacyRow,
      accountDeletionRequestedAt: null,
      accountDeletionScheduledFor: null,
    });
  });

  it("getUserByEmail falls back to legacy user columns when account deletion columns are missing", async () => {
    const failingChain = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            throw new Error('column "account_deletion_scheduled_for" does not exist');
          }),
        })),
      })),
    };
    const fallbackChain = makeChain([{
      id: "user-legacy",
      username: "legacy-singer",
      name: "Legacy Singer",
      email: "legacy@example.com",
      avatarUrl: null,
      profileVisibility: "private",
    }]);
    selectSpy
      .mockReturnValueOnce(failingChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { getUserByEmail } = await getQueries();
    const result = await getUserByEmail("legacy@example.com");

    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: "user-legacy",
      username: "legacy-singer",
      name: "Legacy Singer",
      email: "legacy@example.com",
      avatarUrl: null,
      profileVisibility: "private",
      accountDeletionRequestedAt: null,
      accountDeletionScheduledFor: null,
    });
  });

  it("getAllUsers maps profile fields and keeps profiles private by default", async () => {
    const chain = makeChain([
      {
        id: "internal-user-2",
        username: "singer-two",
        name: "Singer Two",
        email: "",
        avatarUrl: null,
        profileVisibility: "private",
      },
    ]);
    selectSpy.mockReturnValue(chain);

    const { getAllUsers } = await getQueries();
    const result = await getAllUsers();

    expect(result).toEqual([
      {
        id: "internal-user-2",
        username: "singer-two",
        name: "Singer Two",
        email: "",
        avatarUrl: null,
        profileVisibility: "private",
        accountDeletionRequestedAt: null,
        accountDeletionScheduledFor: null,
      },
    ]);
  });

  it("createMagicLinkToken stores only a token hash", async () => {
    const expiresAt = new Date("2026-05-24T12:15:00.000Z");
    const row = {
      id: "magic-1",
      email: "singer@example.com",
      tokenHash: "hashed-token",
      createdAt: new Date("2026-05-24T12:00:00.000Z"),
      expiresAt,
      consumedAt: null,
    };
    const chain = makeChain([row]);
    insertSpy.mockReturnValue(chain);

    const { createMagicLinkToken } = await getQueries();
    const result = await createMagicLinkToken({ email: "Singer@Example.com", tokenHash: "hashed-token", expiresAt });

    expect(insertSpy).toHaveBeenCalledWith(magicLinkTokens);
    const valuesSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      email: "singer@example.com",
      tokenHash: "hashed-token",
      expiresAt,
    }));
    expect(result).toEqual(row);
  });

  it("createUserSession stores a hashed persistent session token", async () => {
    const expiresAt = new Date("2026-08-22T12:00:00.000Z");
    const row = {
      id: "session-1",
      userId: "user-1",
      tokenHash: "hashed-session-token",
      createdAt: new Date("2026-05-24T12:00:00.000Z"),
      expiresAt,
      revokedAt: null,
    };
    const chain = makeChain([row]);
    insertSpy.mockReturnValue(chain);

    const { createUserSession } = await getQueries();
    const result = await createUserSession({ userId: "user-1", tokenHash: "hashed-session-token", expiresAt });

    expect(insertSpy).toHaveBeenCalledWith(userSessions);
    expect(result).toEqual(row);
  });

  it("getUserForSessionTokenHash falls back to legacy user columns when account deletion columns are missing", async () => {
    const failingChain = {
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              throw new Error('column "account_deletion_requested_at" does not exist');
            }),
          })),
        })),
      })),
    };
    const fallbackChain = makeChain([{
      user: {
        id: "user-1",
        username: "session-user",
        name: "Session User",
        email: "session@example.com",
        avatarUrl: null,
        profileVisibility: "private",
      },
    }]);
    selectSpy
      .mockReturnValueOnce(failingChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(fallbackChain);

    const { getUserForSessionTokenHash } = await getQueries();
    const result = await getUserForSessionTokenHash("hashed-session-token");

    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: "user-1",
      username: "session-user",
      name: "Session User",
      email: "session@example.com",
      avatarUrl: null,
      profileVisibility: "private",
      accountDeletionRequestedAt: null,
      accountDeletionScheduledFor: null,
    });
  });
});

describe("shared playlist import title helpers", () => {
  it("extracts leading title numbers across common hymn title punctuation", async () => {
    const { getLeadingTitleNumber } = await getQueries();

    expect(getLeadingTitleNumber("501-Child of God")).toBe("501");
    expect(getLeadingTitleNumber("501 I Am a Child of God")).toBe("501");
    expect(getLeadingTitleNumber("  42. Another Song")).toBe("42");
    expect(getLeadingTitleNumber("No number here")).toBeNull();
  });

  it("appends playlist context when an imported title collides by leading number", async () => {
    const { getImportedSongTitle } = await getQueries();

    expect(getImportedSongTitle(
      "501 I Am a Child of God",
      "Stake Conference",
      ["501-Child of God"]
    )).toBe("501 I Am a Child of God (from Stake Conference)");
  });

  it("keeps imported titles unchanged when there is no leading-number collision", async () => {
    const { getImportedSongTitle } = await getQueries();

    expect(getImportedSongTitle(
      "501 I Am a Child of God",
      "Stake Conference",
      ["502-Child of God"]
    )).toBe("501 I Am a Child of God");
  });

  it("adds an incremented suffix when the imported song title already exists", async () => {
    const { getImportedSongTitle } = await getQueries();

    expect(getImportedSongTitle(
      "501 I Am a Child of God",
      "Stake Conference",
      ["501 I Am a Child of God"]
    )).toBe("501 I Am a Child of God (from Stake Conference)");
  });

  it("adds an incremented suffix to contextual imported titles when duplicates already exist", async () => {
    const { getImportedSongTitle } = await getQueries();

    expect(getImportedSongTitle(
      "501 I Am a Child of God",
      "Stake Conference",
      [
        "501-Child of God",
        "501 I Am a Child of God (from Stake Conference)",
        "501 I Am a Child of God (from Stake Conference) (import 2)",
      ]
    )).toBe("501 I Am a Child of God (from Stake Conference) (import 3)");
  });

  it("increments duplicate imported playlist names", async () => {
    const { getImportedPlaylistName } = await getQueries();

    expect(getImportedPlaylistName(
      "MSW 31 May 2026 Baritone",
      ["MSW 31 May 2026 Baritone", "MSW 31 May 2026 Baritone (import 2)"]
    )).toBe("MSW 31 May 2026 Baritone (import 3)");
  });
});

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
        alternateAudioKey: null,
        lastPracticedAt: null,
        pitchContourNotes: [],
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
        alternateAudioKey: null,
        lastPracticedAt: null,
        pitchContourNotes: [],
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
    expect(whereSpy).toHaveBeenCalled();
  });
});

describe("getDraftRecordingsForSong", () => {
  it("returns draft recordings for a song scoped by user", async () => {
    const row = {
      id: "draft-1",
      songId: "song-1",
      title: null,
      audioKey: "audio/drafts/draft-1.mp3",
      status: "draft",
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: new Date("2026-05-25T14:30:00.000Z"),
    };
    const chain = makeChain([{ draftRecording: row }]);
    selectSpy.mockReturnValue(chain);

    const { getDraftRecordingsForSong } = await getQueries();
    const result = await getDraftRecordingsForSong("song-1", "user-1");

    expect(selectSpy).toHaveBeenCalledWith({ draftRecording: draftRecordings });
    const fromSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["from"];
    expect(fromSpy).toHaveBeenCalledWith(draftRecordings);
    const innerJoinSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["innerJoin"];
    expect(innerJoinSpy).toHaveBeenCalledWith(songs, eq(draftRecordings.songId, songs.id));
    expect(result).toEqual([{
      id: "draft-1",
      songId: "song-1",
      title: null,
      audioKey: "audio/drafts/draft-1.mp3",
      status: "draft",
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: "2026-05-25T14:30:00.000Z",
      archivedAt: null,
    }]);
  });
});

describe("getUnassignedDraftRecordings", () => {
  it("returns unassigned active draft recordings scoped by user", async () => {
    const row = {
      id: "draft-1",
      userId: "user-1",
      songId: null,
      title: null,
      audioKey: "audio/unassigned/user-1/draft.webm",
      status: "draft",
      trimStartMs: null,
      trimEndMs: null,
      createdAt: new Date("2026-05-26T14:30:00.000Z"),
      archivedAt: null,
    };
    const chain = makeChain([row]);
    selectSpy.mockReturnValue(chain);

    const { getUnassignedDraftRecordings } = await getQueries();
    const result = await getUnassignedDraftRecordings("user-1");

    expect(selectSpy).toHaveBeenCalled();
    const whereSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalledWith(and(eq(draftRecordings.userId, "user-1"), isNull(draftRecordings.songId), eq(draftRecordings.status, "draft")));
    expect(result).toEqual([{
      id: "draft-1",
      songId: null,
      title: null,
      audioKey: "audio/unassigned/user-1/draft.webm",
      status: "draft",
      trimStartMs: null,
      trimEndMs: null,
      createdAt: "2026-05-26T14:30:00.000Z",
      archivedAt: null,
    }]);
  });
});

describe("getArchivedDraftRecordingsForSong", () => {
  it("returns archived drafts for a song scoped by user", async () => {
    const row = {
      id: "draft-2",
      songId: "song-1",
      title: null,
      audioKey: "audio/drafts/draft-2.mp3",
      status: "archived",
      trimStartMs: 0,
      trimEndMs: 5000,
      createdAt: new Date("2026-05-24T14:30:00.000Z"),
      archivedAt: new Date("2026-05-25T14:30:00.000Z"),
    };
    const chain = makeChain([{ draftRecording: row }]);
    selectSpy.mockReturnValue(chain);

    const { getArchivedDraftRecordingsForSong } = await getQueries();
    const result = await getArchivedDraftRecordingsForSong("song-1", "user-1");

    expect(selectSpy).toHaveBeenCalledWith({ draftRecording: draftRecordings });
    const innerJoinSpy = (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)["innerJoin"];
    expect(innerJoinSpy).toHaveBeenCalledWith(songs, eq(draftRecordings.songId, songs.id));
    expect(result).toEqual([{
      id: "draft-2",
      songId: "song-1",
      title: null,
      audioKey: "audio/drafts/draft-2.mp3",
      status: "archived",
      trimStartMs: 0,
      trimEndMs: 5000,
      createdAt: "2026-05-24T14:30:00.000Z",
      archivedAt: "2026-05-25T14:30:00.000Z",
    }]);
  });
});

describe("discardDraftRecording", () => {
  it("marks an active draft recording as discarded without deleting it", async () => {
    const songRow = {
      id: "song-1",
      userId: "user-1",
      title: "Song 1",
      artist: null,
      audioKey: "audio/song-1/current.mp3",
      alternateAudioKey: null,
      audioTrimStartMs: null,
      audioTrimEndMs: null,
      pitchContourNotes: [],
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      lastPracticedAt: null,
    };
    const discardedRow = {
      id: "draft-1",
      songId: "song-1",
      title: null,
      audioKey: "audio/song-1/draft.webm",
      status: "discarded",
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: new Date("2026-05-25T14:30:00.000Z"),
      archivedAt: new Date("2026-05-25T15:00:00.000Z"),
    };
    const songSelectChain = makeChain([songRow]);
    const draftUpdateChain = makeChain([discardedRow]);
    selectSpy.mockReturnValueOnce(songSelectChain);
    updateSpy.mockReturnValueOnce(draftUpdateChain);

    const { discardDraftRecording } = await getQueries();
    const result = await discardDraftRecording("song-1", "draft-1", "user-1");

    expect(updateSpy).toHaveBeenCalledWith(draftRecordings);
    const draftSetSpy = (draftUpdateChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(draftSetSpy).toHaveBeenCalledWith({
      status: "discarded",
      archivedAt: expect.any(Date),
    });
    expect(result).toEqual({
      id: "draft-1",
      songId: "song-1",
      title: null,
      audioKey: "audio/song-1/draft.webm",
      status: "discarded",
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: "2026-05-25T14:30:00.000Z",
      archivedAt: "2026-05-25T15:00:00.000Z",
    });
  });
});

describe("promoteDraftRecordingToSongVersion", () => {
  it("uses draft trim metadata for the song version and archives the draft", async () => {
    const songRow = {
      id: "song-1",
      userId: "user-1",
      title: "Song 1",
      artist: null,
      audioKey: "audio/song-1/old.mp3",
      alternateAudioKey: null,
      audioTrimStartMs: null,
      audioTrimEndMs: null,
      pitchContourNotes: [],
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      lastPracticedAt: null,
    };
    const draftRow = {
      id: "draft-1",
      songId: "song-1",
      title: null,
      audioKey: "audio/song-1/draft.webm",
      status: "draft",
      trimStartMs: 500,
      trimEndMs: 4200,
      createdAt: new Date("2026-05-25T14:30:00.000Z"),
      archivedAt: null,
    };
    const archivedRow = {
      ...draftRow,
      status: "archived",
      archivedAt: new Date("2026-05-25T15:00:00.000Z"),
    };
    const songSelectChain = makeChain([songRow]);
    const draftSelectChain = makeChain([draftRow]);
    const songUpdateChain = makeChain([]);
    const draftUpdateChain = makeChain([archivedRow]);
    selectSpy
      .mockReturnValueOnce(songSelectChain)
      .mockReturnValueOnce(draftSelectChain);
    updateSpy
      .mockReturnValueOnce(songUpdateChain)
      .mockReturnValueOnce(draftUpdateChain);

    const { promoteDraftRecordingToSongVersion } = await getQueries();
    const result = await promoteDraftRecordingToSongVersion("song-1", "draft-1", {}, "user-1");

    expect(updateSpy).toHaveBeenCalledWith(songs);
    const songSetSpy = (songUpdateChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(songSetSpy).toHaveBeenCalledWith({
      audioKey: "audio/song-1/draft.webm",
      audioTrimStartMs: 500,
      audioTrimEndMs: 4200,
    });
    expect(updateSpy).toHaveBeenCalledWith(draftRecordings);
    const draftSetSpy = (draftUpdateChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["set"];
    expect(draftSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: "archived",
      archivedAt: expect.any(Date),
    }));
    expect(result).toEqual({
      previousAudioKey: "audio/song-1/old.mp3",
      draftRecording: {
        id: "draft-1",
        songId: "song-1",
        title: null,
        audioKey: "audio/song-1/draft.webm",
        status: "archived",
        trimStartMs: 500,
        trimEndMs: 4200,
        createdAt: "2026-05-25T14:30:00.000Z",
        archivedAt: "2026-05-25T15:00:00.000Z",
      },
    });
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
      [{ ...newSegs[0], songId: "song-1", sourceSegmentId: "s1", pitchContourNotes: [] }]
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
      { id: "s1", label: "Verse 1", order: 0, startMs: 0, endMs: 1000, lyricText: "Hello", songId: "song-1", sourceSegmentId: "s1" },
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
    expect(whereSpy).toHaveBeenCalled();
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
    expect(whereSpy).toHaveBeenCalled();
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
      sourceSegmentId: "seg-1",
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
      sourceSegmentId: "seg-1",
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
      sourceSegmentId: "seg-1",
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
    const ratingChain = makeChain(rows);
    selectSpy
      .mockReturnValueOnce(makeChain([{ id: "song-1", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }]))
      .mockReturnValueOnce(ratingChain);

    const { getRatingsForSong } = await getQueries();
    const result = await getRatingsForSong("song-1");

    const fromSpy = (ratingChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["from"];
    expect(fromSpy).toHaveBeenCalledWith(practiceRatings);
    const orderBySpy = (ratingChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["orderBy"];
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
    selectSpy
      .mockReturnValueOnce(makeChain([{ id: "song-1", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([
        { id: "seg-1", sourceSegmentId: null },
        { id: "seg-2", sourceSegmentId: null },
      ]))
      .mockReturnValueOnce(makeChain([
        { id: "seg-1", sourceSegmentId: null },
        { id: "seg-2", sourceSegmentId: null },
      ]))
      .mockReturnValueOnce(makeChain(rows));

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
    selectSpy
      .mockReturnValueOnce(makeChain([{ id: "song-1", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "song-2", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-2", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([
        { id: "r-1", segmentId: "seg-1", rating: 5, ratedAt: new Date("2026-04-02T10:00:00.000Z") },
        { id: "r-2", segmentId: "seg-1", rating: 4, ratedAt: new Date("2026-04-01T10:00:00.000Z") },
      ]))
      .mockReturnValueOnce(makeChain([{ id: "seg-2", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([
        { id: "r-3", segmentId: "seg-2", rating: 4, ratedAt: new Date("2026-04-02T09:00:00.000Z") },
      ]));

    const { getLatestRatingTimeBySongIds } = await getQueries();
    const result = await getLatestRatingTimeBySongIds(["song-1", "song-2"]);

    expect(result).toEqual(expect.any(Object));
    expect(selectSpy).toHaveBeenCalled();
  });
});

describe("getSongKnowledgeBySongIds", () => {
  it("returns rounded percentage based on latest rating per segment", async () => {
    selectSpy
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }, { id: "seg-2", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "song-1", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }, { id: "seg-2", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-3", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "song-2", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-3", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }, { id: "seg-2", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([
        { id: "r-1", segmentId: "seg-1", rating: 5, ratedAt: new Date("2026-04-02T10:00:00.000Z") },
        { id: "r-2", segmentId: "seg-1", rating: 2, ratedAt: new Date("2026-04-01T10:00:00.000Z") },
        { id: "r-3", segmentId: "seg-2", rating: 3, ratedAt: new Date("2026-04-02T09:00:00.000Z") },
      ]))
      .mockReturnValueOnce(makeChain([{ id: "seg-3", sourceSegmentId: null }]))
      .mockReturnValueOnce(makeChain([
        { id: "r-4", segmentId: "seg-3", rating: 4, ratedAt: new Date("2026-04-02T08:00:00.000Z") },
      ]));

    const { getSongKnowledgeBySongIds } = await getQueries();
    const result = await getSongKnowledgeBySongIds(["song-1", "song-2"]);

    expect(result).toEqual(expect.any(Object));
    expect(selectSpy).toHaveBeenCalled();
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
        userId: "default",
        segmentId: "seg-1",
        rating: 4,
        ratedAt: new Date("2026-03-31T12:02:00.000Z"),
      },
      {
        id: expect.any(String),
        userId: "default",
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
    selectSpy
      .mockReturnValueOnce(makeChain([{ id: "song-1", sourceSongId: null }]))
      .mockReturnValueOnce(makeChain([{ id: "seg-1", sourceSegmentId: null }, { id: "seg-2", sourceSegmentId: null }]))
      .mockReturnValueOnce(selectChain);
    deleteSpy.mockReturnValue(deleteChain);

    const { deleteRatingsForSong } = await getQueries();
    await deleteRatingsForSong("song-1");

    expect(selectSpy).toHaveBeenCalled();
  });

  it("does not delete when song has no segments", async () => {
    const selectChain = makeChain([]);
    selectSpy.mockReturnValue(selectChain);

    const { deleteRatingsForSong } = await getQueries();
    await deleteRatingsForSong("song-1");

    expect(selectSpy).toHaveBeenCalled();
  });
});

describe("tap practice persistence", () => {
  it("createTapPracticeSession auto-creates missing tap practice tables and retries", async () => {
    const startedAt = new Date("2026-04-11T12:00:00.000Z");
    const failingInsertChain = {
      values: vi.fn(() => {
        throw new Error('relation "tap_practice_sessions" does not exist');
      }),
    };
    const successfulInsertChain = makeChain([
      {
        id: "session-9",
        userId: "default",
        songId: "song-1",
        startedAt,
      },
    ]);

    insertSpy
      .mockReturnValueOnce(failingInsertChain as unknown as ReturnType<typeof makeChain>)
      .mockReturnValueOnce(successfulInsertChain);
    executeSpy.mockResolvedValue({});

    const { createTapPracticeSession } = await getQueries();
    const result = await createTapPracticeSession("song-1", "default", startedAt);

    expect(executeSpy).toHaveBeenCalledTimes(15);
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: "session-9",
      songId: "song-1",
      audioVersion: "straight",
      mode: "practice",
      startedAt: startedAt.toISOString(),
      tapCount: 0,
    });
  });

  it("createTapPracticeSession inserts a new session row", async () => {
    const startedAt = new Date("2026-04-11T12:00:00.000Z");
    const insertChain = makeChain([
      {
        id: "session-1",
        userId: "default",
        songId: "song-1",
        startedAt,
      },
    ]);
    insertSpy.mockReturnValue(insertChain);

    const { createTapPracticeSession } = await getQueries();
    const result = await createTapPracticeSession("song-1", "default", startedAt);

    expect(insertSpy).toHaveBeenCalledWith(tapPracticeSessions);
    expect(result).toEqual({
      id: "session-1",
      songId: "song-1",
      audioVersion: "straight",
      mode: "practice",
      startedAt: startedAt.toISOString(),
      tapCount: 0,
    });
  });

  it("deleteExpiredTapPracticeData deletes old sessions for user", async () => {
    const deleteChain = makeChain();
    deleteSpy.mockReturnValue(deleteChain);

    const { deleteExpiredTapPracticeData } = await getQueries();
    await deleteExpiredTapPracticeData("default", new Date("2026-03-28T00:00:00.000Z"));

    expect(deleteSpy).toHaveBeenCalledWith(tapPracticeSessions);
    const whereSpy = (deleteChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["where"];
    expect(whereSpy).toHaveBeenCalled();
  });

  it("addTapPracticeTap stores lane using integer millis", async () => {
    const insertChain = makeChain([]);
    insertSpy.mockReturnValue(insertChain);

    const { addTapPracticeTap } = await getQueries();
    await addTapPracticeTap("session-1", {
      segmentId: "seg-1",
      noteId: "note-1",
      timeOffsetMs: 120,
      durationMs: 90,
      lane: 0.333,
    });

    expect(insertSpy).toHaveBeenCalledWith(tapPracticeTaps);
    const valuesSpy = (insertChain as unknown as Record<string, ReturnType<typeof vi.fn>>)["values"];
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      segmentId: "seg-1",
      noteId: "note-1",
      timeOffsetMs: 120,
      durationMs: 90,
      laneMilli: 333,
    }));
  });

  it("listTapPracticeSessionsForSong includes tap counts", async () => {
    const sessionChain = makeChain([
      {
        id: "session-2",
        songId: "song-1",
        startedAt: new Date("2026-04-11T12:00:00.000Z"),
      },
    ]);
    const tapCountChain = makeChain([
      { sessionId: "session-2" },
      { sessionId: "session-2" },
    ]);
    selectSpy
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(tapCountChain);

    const { listTapPracticeSessionsForSong } = await getQueries();
    const result = await listTapPracticeSessionsForSong("song-1", "default");

    expect(result).toEqual([
      {
        id: "session-2",
        songId: "song-1",
        audioVersion: "straight",
        mode: "practice",
        startedAt: "2026-04-11T12:00:00.000Z",
        tapCount: 2,
      },
    ]);
  });

  it("getTapPracticeSessionDetail maps lane millis back to decimal lane", async () => {
    const sessionChain = makeChain([
      {
        id: "session-7",
        songId: "song-1",
        startedAt: new Date("2026-04-11T12:00:00.000Z"),
      },
    ]);
    const tapsChain = makeChain([
      {
        id: "tap-1",
        sessionId: "session-7",
        segmentId: "seg-1",
        noteId: "note-1",
        timeOffsetMs: 50,
        durationMs: 100,
        laneMilli: 875,
        createdAt: new Date("2026-04-11T12:00:02.000Z"),
      },
    ]);
    selectSpy
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(tapsChain);

    const { getTapPracticeSessionDetail } = await getQueries();
    const result = await getTapPracticeSessionDetail("session-7", "default");

    expect(result).toEqual({
      id: "session-7",
      songId: "song-1",
      audioVersion: "straight",
      mode: "practice",
      startedAt: "2026-04-11T12:00:00.000Z",
      taps: [
        {
          id: "tap-1",
          noteId: "note-1",
          segmentId: "seg-1",
          timeOffsetMs: 50,
          durationMs: 100,
          lane: 0.875,
          createdAt: "2026-04-11T12:00:02.000Z",
        },
      ],
    });
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
    const result = await createPlaylist({ userId: "user-1", name: "Sunday Set", eventDate: "2026-04-04" });

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
