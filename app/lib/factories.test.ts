import { describe, it, expect } from "vitest";
import { makeSession } from "./factories";

describe("factories", () => {
  it("makeSession defaults to isLocked: false", () => {
    const session = makeSession();
    expect(session.isLocked).toBe(false);
    expect(session.currentSegmentIndex).toBe(0);
    expect(session.ratings).toEqual([]);
  });

});
