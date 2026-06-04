import { describe, expect, it } from "vitest";
import { withUserIdHeader } from "./userContext";

describe("withUserIdHeader", () => {
  it("returns the original init when no user id is available", () => {
    const init = { method: "POST", headers: { "Content-Type": "application/json" } };

    expect(withUserIdHeader(init, undefined)).toBe(init);
  });

  it("adds the user id header to plain object headers", () => {
    const init = withUserIdHeader(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      "test-user"
    );

    expect(init).toEqual({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": "test-user",
      },
    });
  });

  it("replaces an existing user id header case-insensitively", () => {
    const init = withUserIdHeader({ headers: { "x-user-id": "old-user" } }, "new-user");

    expect(init?.headers).toEqual({ "X-User-ID": "new-user" });
  });

  it("preserves Headers instances", () => {
    const init = withUserIdHeader({ headers: new Headers({ Accept: "application/json" }) }, "test-user");

    expect(init?.headers).toBeInstanceOf(Headers);
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
    expect(new Headers(init?.headers).get("X-User-ID")).toBe("test-user");
  });
});
