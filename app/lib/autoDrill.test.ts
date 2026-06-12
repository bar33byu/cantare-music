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
    expect(getAutoDrillTargetPasses(2)).toBe(3);
    expect(getAutoDrillTargetPasses(1)).toBe(3);
    expect(getAutoDrillTargetPasses()).toBe(3);
  });

  it("repeats ratings until their target pass count is reached", () => {
    expect(shouldRepeatAutoDrillSegment(1, 0)).toBe(true);
    expect(shouldRepeatAutoDrillSegment(3, DEFAULT_MAX_AUTO_REPEATS - 1)).toBe(true);
    expect(shouldRepeatAutoDrillSegment(4, 0)).toBe(true);
  });

  it("advances when the rating target or repeat cap has been reached", () => {
    expect(shouldRepeatAutoDrillSegment(5, 0)).toBe(false);
    expect(shouldRepeatAutoDrillSegment(4, 1)).toBe(false);
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

  it("returns repeating for a rating of 4 before its second pass", () => {
    expect(getNextAutoDrillStateAfterRating({
      rating: 4,
      repeatCount: 0,
      currentIndex: 0,
      queueLength: 3,
    })).toBe("repeating");
  });

  it("returns announcing after a rating of 4 completes its second pass", () => {
    expect(getNextAutoDrillStateAfterRating({
      rating: 4,
      repeatCount: 1,
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
