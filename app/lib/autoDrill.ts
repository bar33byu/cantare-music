import type { MemoryRating } from "../types";

export type PracticeMode = "manual" | "auto-drill";

export type AutoDrillState =
  | "idle"
  | "announcing"
  | "counting-down"
  | "playing"
  | "awaiting-rating"
  | "repeating"
  | "complete";

export const DEFAULT_MAX_AUTO_REPEATS = 2;
export const AUTO_DRILL_DEFAULT_TARGET_PASSES = 3;

export function getAutoDrillTargetPasses(rating?: MemoryRating): number {
  if (rating === 5) {
    return 1;
  }
  if (rating === 4) {
    return 2;
  }
  return AUTO_DRILL_DEFAULT_TARGET_PASSES;
}

export function shouldRepeatAutoDrillSegment(
  rating: MemoryRating,
  repeatCount: number,
  maxRepeats = DEFAULT_MAX_AUTO_REPEATS
): boolean {
  const targetRepeats = Math.min(getAutoDrillTargetPasses(rating) - 1, maxRepeats);
  return repeatCount < targetRepeats;
}

export function getNextAutoDrillStateAfterRating(options: {
  rating: MemoryRating;
  repeatCount: number;
  currentIndex: number;
  queueLength: number;
  maxRepeats?: number;
}): AutoDrillState {
  if (
    shouldRepeatAutoDrillSegment(
      options.rating,
      options.repeatCount,
      options.maxRepeats ?? DEFAULT_MAX_AUTO_REPEATS
    )
  ) {
    return "repeating";
  }

  return options.currentIndex >= options.queueLength - 1 ? "complete" : "announcing";
}
