import { describe, expect, it } from "vitest";
import { getWarmupCaptureTailSeconds } from "./useWarmupPitchTrace";

describe("warmup pitch trace timing", () => {
  it("keeps the repetition open for device latency and one detector frame", () => {
    expect(getWarmupCaptureTailSeconds(0)).toBeCloseTo(0.08);
    expect(getWarmupCaptureTailSeconds(180)).toBeCloseTo(0.26);
    expect(getWarmupCaptureTailSeconds(400)).toBeCloseTo(0.48);
  });

  it("guards invalid latency values", () => {
    expect(getWarmupCaptureTailSeconds(-100)).toBeCloseTo(0.08);
    expect(getWarmupCaptureTailSeconds(Number.NaN)).toBeCloseTo(0.08);
  });
});
