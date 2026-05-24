import { describe, expect, it } from "vitest";
import { getAdminEmailAllowlist, isEmailAdmin } from "./_user";

describe("admin email allowlist", () => {
  it("reads admin emails from environment configuration", () => {
    const env = { CANTARE_ADMIN_EMAILS: "lead@example.com, admin@example.com\nOWNER@example.com" } as unknown as NodeJS.ProcessEnv;

    expect(Array.from(getAdminEmailAllowlist(env))).toEqual([
      "lead@example.com",
      "admin@example.com",
      "owner@example.com",
    ]);
    expect(isEmailAdmin("Admin@Example.com", env)).toBe(true);
    expect(isEmailAdmin("singer@example.com", env)).toBe(false);
  });
});
