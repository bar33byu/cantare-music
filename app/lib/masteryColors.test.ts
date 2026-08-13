import { describe, expect, it } from "vitest";
import { buildMasteryTimelineChunks, getMasteryColor, getMasteryGradientColor } from "./masteryColors";

describe("getMasteryColor", () => {
  it("maps each rating level to a distinct hue", () => {
    expect(getMasteryColor(0)).toBe("rgb(255, 255, 255)");
    expect(getMasteryColor(20)).toBe("rgb(244, 63, 94)");
    expect(getMasteryColor(40)).toBe("rgb(249, 115, 22)");
    expect(getMasteryColor(60)).toBe("rgb(234, 179, 8)");
    expect(getMasteryColor(80)).toBe("rgb(59, 130, 246)");
    expect(getMasteryColor(100)).toBe("rgb(22, 163, 74)");
  });

  it("clamps values outside the rating range", () => {
    expect(getMasteryColor(-20)).toBe("rgb(255, 255, 255)");
    expect(getMasteryColor(120)).toBe("rgb(22, 163, 74)");
  });
});

describe("getMasteryGradientColor", () => {
  it("interpolates along the original white-to-green playlist gradient", () => {
    expect(getMasteryGradientColor(0)).toBe("rgb(255, 255, 255)");
    expect(getMasteryGradientColor(50)).toBe("rgb(139, 209, 165)");
    expect(getMasteryGradientColor(100)).toBe("rgb(22, 163, 74)");
  });

  it("clamps values outside the mastery range", () => {
    expect(getMasteryGradientColor(-20)).toBe("rgb(255, 255, 255)");
    expect(getMasteryGradientColor(120)).toBe("rgb(22, 163, 74)");
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
