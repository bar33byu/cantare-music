import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchAudioFile } from "./audioPrefetch";

describe("prefetchAudioFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("stores an uncached cross-origin audio file in the shared audio cache", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const open = vi.fn().mockResolvedValue(cache);
    Object.defineProperty(window, "caches", { configurable: true, value: { open } });
    const fetchMock = vi.fn().mockResolvedValue(new Response("audio", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(prefetchAudioFile("https://cdn.example.com/next.mp3")).resolves.toBe("downloaded");

    expect(open).toHaveBeenCalledWith("cantare-audio-v3");
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.url).toBe("https://cdn.example.com/next.mp3");
    expect(request.mode).toBe("no-cors");
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("does not download an audio file that is already cached", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(new Response("cached")),
      put: vi.fn(),
    };
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(cache) },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(prefetchAudioFile("https://cdn.example.com/next.mp3")).resolves.toBe("cached");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
