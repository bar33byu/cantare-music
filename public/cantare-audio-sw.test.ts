import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type FetchEventLike = {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
};

function loadFetchHandler() {
  const listeners = new Map<string, (event: FetchEventLike) => void>();
  const workerSource = readFileSync(resolve(process.cwd(), "public/cantare-audio-sw.js"), "utf8");
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
  };

  runInNewContext(workerSource, {
    URL,
    Request,
    Response,
    fetch: vi.fn().mockResolvedValue(new Response("audio")),
    indexedDB: {},
    caches: {
      open: vi.fn().mockResolvedValue(cache),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    },
    self: {
      location: { origin: "https://cantare.example" },
      addEventListener: (type: string, handler: (event: FetchEventLike) => void) => {
        listeners.set(type, handler);
      },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]) },
      registration: {},
    },
  });

  const handler = listeners.get("fetch");
  if (!handler) throw new Error("Service worker did not register a fetch handler");
  return handler;
}

describe("audio service worker", () => {
  it("leaves audio range requests to native browser networking", () => {
    const handleFetch = loadFetchHandler();
    const respondWith = vi.fn();

    handleFetch({
      request: new Request("https://cdn.example.com/song.mp3", {
        headers: { Range: "bytes=0-" },
      }),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("continues caching non-range audio downloads", () => {
    const handleFetch = loadFetchHandler();
    const respondWith = vi.fn();

    handleFetch({
      request: new Request("https://cdn.example.com/song.mp3"),
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledTimes(1);
  });
});
