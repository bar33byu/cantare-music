import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, desc } from "drizzle-orm";
import { songs, segments } from "./schema";

// ── chainable mock builder ─────────────────────────────────────────────────────
// Creates a fluent mock object where every method returns itself and
// the object itself is a Promise resolving to `resolveValue`.
function makeChain(resolveValue: unknown = []) {
  const chain: Record<string, unknown> & PromiseLike<unknown> = {
    then: (res: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(res),
    catch: (rej: (e: unknown) => unknown) => Promise.resolve(resolveValue).catch(rej),
    finally: (fn: () => void) => Promise.resolve(resolveValue).finally(fn),
  };
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
  db: {
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    delete: deleteSpy,
  },
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
      [{ ...newSegs[0], songId: "song-1" }]
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