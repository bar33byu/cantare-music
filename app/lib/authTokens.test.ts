import { afterEach, describe, expect, it } from "vitest";
import { createSixDigitCode, getAppBaseUrl, hashMagicLinkCode } from "./authTokens";

const originalEnv = {
  CANTARE_APP_URL: process.env.CANTARE_APP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

describe("getAppBaseUrl", () => {
  afterEach(() => {
    if (originalEnv.CANTARE_APP_URL === undefined) {
      delete process.env.CANTARE_APP_URL;
    } else {
      process.env.CANTARE_APP_URL = originalEnv.CANTARE_APP_URL;
    }

    if (originalEnv.NEXT_PUBLIC_APP_URL === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL;
    }
  });

  it("prefers the request origin for localhost requests", () => {
    process.env.CANTARE_APP_URL = "http://localhost:3000";

    const request = new Request("http://localhost:3001/api/auth/magic-link");

    expect(getAppBaseUrl(request)).toBe("http://localhost:3001");
  });

  it("prefers the request origin for Vercel preview requests", () => {
    process.env.CANTARE_APP_URL = "https://cantare-music.vercel.app";

    const request = new Request("https://cantare-music-git-develop-bradley-ross-projects.vercel.app/api/auth/magic-link");

    expect(getAppBaseUrl(request)).toBe("https://cantare-music-git-develop-bradley-ross-projects.vercel.app");
  });

  it("uses forwarded headers when deriving a non-localhost request origin", () => {
    delete process.env.CANTARE_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    const request = new Request("http://internal:3000/api/auth/magic-link", {
      headers: {
        "x-forwarded-host": "cantare.lavalane.org",
        "x-forwarded-proto": "https",
      },
    });

    expect(getAppBaseUrl(request)).toBe("https://cantare.lavalane.org");
  });

  it("uses the configured public URL when there is no request", () => {
    process.env.CANTARE_APP_URL = "https://cantare.lavalane.org";

    expect(getAppBaseUrl()).toBe("https://cantare.lavalane.org");
  });
});

describe("six-digit login codes", () => {
  it("creates exactly six numeric digits, including possible leading zeroes", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(createSixDigitCode()).toMatch(/^\d{6}$/);
    }
  });

  it("binds code hashes to a normalized email address", () => {
    expect(hashMagicLinkCode(" Singer@Example.com ", "042137", "test-secret"))
      .toBe(hashMagicLinkCode("singer@example.com", "042137", "test-secret"));
    expect(hashMagicLinkCode("other@example.com", "042137", "test-secret"))
      .not.toBe(hashMagicLinkCode("singer@example.com", "042137", "test-secret"));
  });
});
