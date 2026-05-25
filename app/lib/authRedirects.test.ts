import { describe, expect, it } from "vitest";
import { getSafeAuthReturnPath } from "./authRedirects";

describe("getSafeAuthReturnPath", () => {
  it("keeps same-origin shared playlist paths", () => {
    expect(getSafeAuthReturnPath("/share/playlists/share-token", "http://localhost")).toBe("/share/playlists/share-token");
  });

  it("rejects protocol-relative and external URLs", () => {
    expect(getSafeAuthReturnPath("//example.net/share/playlists/share-token", "http://localhost")).toBe("/");
    expect(getSafeAuthReturnPath("https://example.net/share/playlists/share-token", "http://localhost")).toBe("/");
  });
});
