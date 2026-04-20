import { describe, expect, it } from "vitest";
import { buildMasteryTimelineChunks, getMasteryColor } from "./masteryColors";

describe("getMasteryColor", () => {
  it("maps 0 to white and 100 to full green", () => {
    expect(getMasteryColor(0)).toBe("rgb(255, 255, 255)");
    expect(getMasteryColor(100)).toBe("rgb(22, 163, 74)");
  });
});

describe("buildMasteryTimelineChunks", () => {
  it("uses darker/fuller color when segments overlap", () => {
    const segments = [
      { id: "a", songId: "song", order: 0, label: "A", lyricText: "", startMs: 0, endMs: 4000 },
      { id: "b", songId: "song", order: 1, label: "B", lyricText: "", startMs: 2000, endMs: 6000 },
    ];

    const chunks = buildMasteryTimelineChunks(segments, { a: 20, b: 80 }, 6000);

    expect(chunks).toEqual([
      { startMs: 0, endMs: 2000, percent: 20 },
      { startMs: 2000, endMs: 4000, percent: 80 },
      { startMs: 4000, endMs: 6000, percent: 80 },
    ]);
  });
});
