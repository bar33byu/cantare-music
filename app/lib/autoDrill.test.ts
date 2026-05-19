import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_AUTO_REPEATS,
  getAutoDrillTargetPasses,
  getNextAutoDrillStateAfterRating,
  shouldRepeatAutoDrillSegment,
} from "./autoDrill";

describe("autoDrill", () => {
  it("maps rating to hands-free target pass counts", () => {
    expect(getAutoDrillTargetPasses(5)).toBe(1);
    expect(getAutoDrillTargetPasses(4)).toBe(2);
    expect(getAutoDrillTargetPasses(3)).toBe(3);
    expect(getAutoDrillTargetPasses(2)).toBe(4);
    expect(getAutoDrillTargetPasses(1)).toBe(5);
    expect(getAutoDrillTargetPasses()).toBe(5);
  });

  it("repeats low ratings while under the repeat cap", () => {
    expect(shouldRepeatAutoDrillSegment(1, 0)).toBe(true);
    expect(shouldRepeatAutoDrillSegment(2, DEFAULT_MAX_AUTO_REPEATS - 1)).toBe(true);
  });

  it("advances when ratings are high or the repeat cap has been reached", () => {
    expect(shouldRepeatAutoDrillSegment(3, 0)).toBe(false);
    expect(shouldRepeatAutoDrillSegment(2, DEFAULT_MAX_AUTO_REPEATS)).toBe(false);
  });

  it("returns repeating for low ratings before the cap", () => {
    expect(getNextAutoDrillStateAfterRating({
      rating: 2,
      repeatCount: 0,
      currentIndex: 0,
      queueLength: 3,
    })).toBe("repeating");
  });

  it("returns announcing for an accepted rating before the final segment", () => {
    expect(getNextAutoDrillStateAfterRating({
      rating: 4,
      repeatCount: 0,
      currentIndex: 0,
      queueLength: 3,
    })).toBe("announcing");
  });

  it("returns complete after the final segment", () => {
    expect(getNextAutoDrillStateAfterRating({
      rating: 5,
      repeatCount: 0,
      currentIndex: 2,
      queueLength: 3,
    })).toBe("complete");
  });
});
