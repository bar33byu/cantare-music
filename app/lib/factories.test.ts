import { describe, it, expect } from "vitest";
import { makeSegment, makeSong, makeSession, makeRating } from "./factories";

describe("factories", () => {
  it("makeSegment returns all required fields", () => {
    const seg = makeSegment();
    expect(seg.id).toBeTruthy();
    expect(seg.songId).toBe("seed-1");
    expect(seg.order).toBe(0);
    expect(seg.label).toBe("Section 1");
    expect(seg.lyricText).toBe("Sample lyric text here.");
    expect(seg.startMs).toBe(0);
    expect(seg.endMs).toBe(8000);
  });

  it("makeSong with title override applies correctly", () => {
    const song = makeSong({ title: "My Custom Song" });
    expect(song.title).toBe("My Custom Song");
    expect(song.artist).toBe("Unknown");
  });

  it("makeSession defaults to isLocked: false", () => {
    const session = makeSession();
    expect(session.isLocked).toBe(false);
    expect(session.currentSegmentIndex).toBe(0);
    expect(session.ratings).toEqual([]);
  });

  it("two makeSong calls return different ids", () => {
    const a = makeSong();
    const b = makeSong();
    expect(a.id).not.toBe(b.id);
  });

  it("makeRating returns rating: 3 by default", () => {
    const r = makeRating();
    expect(r.rating).toBe(3);
    expect(r.segmentId).toBe("seg-1");
  });
});