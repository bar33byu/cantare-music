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

export const AUTO_DRILL_REPEAT_THRESHOLD: MemoryRating = 2;
export const DEFAULT_MAX_AUTO_REPEATS = 2;
export const AUTO_DRILL_DEFAULT_TARGET_PASSES = 5;

export function getAutoDrillTargetPasses(rating?: MemoryRating): number {
  if (rating === 5) {
    return 1;
  }
  if (rating === 4) {
    return 2;
  }
  if (rating === 3) {
    return 3;
  }
  if (rating === 2) {
    return 4;
  }
  return AUTO_DRILL_DEFAULT_TARGET_PASSES;
}

export function shouldRepeatAutoDrillSegment(
  rating: MemoryRating,
  repeatCount: number,
  maxRepeats = DEFAULT_MAX_AUTO_REPEATS
): boolean {
  return rating <= AUTO_DRILL_REPEAT_THRESHOLD && repeatCount < maxRepeats;
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
