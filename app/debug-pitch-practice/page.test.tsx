import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DebugPitchPracticePage from "./page";

describe("DebugPitchPracticePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });

  it("enumerates inputs without requesting microphone permission", async () => {
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: "audioinput", deviceId: "mic-1", label: "Test microphone", groupId: "group", toJSON: () => ({}) },
    ]);
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices, getUserMedia, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/midi")
        ? { wholeSongAnswerKey: { songId: "0e513a82-8fd5-4dd2-9b54-c046a46ceaed", midiSourceId: "midi", alignmentId: "alignment", generatedAt: new Date().toISOString(), notes: [{ index: 0, sourceCleanedMidiNoteIndex: 0, midiPitch: 64, pitchName: "E4", movementFromPrevious: "start", tappedStartTimeSeconds: 0, midiDurationSeconds: 1, effectiveDurationSeconds: 1 }] } }
        : { id: "0e513a82-8fd5-4dd2-9b54-c046a46ceaed", title: "Diagnostic Song", artist: "Singer", audioUrl: "https://example.com/part.mp3", segments: [{ id: "segment", songId: "song", order: 0, label: "Opening", lyricText: "", startMs: 0, endMs: 5000 }], createdAt: new Date().toISOString() },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DebugPitchPracticePage />);

    expect(screen.getByRole("heading", { name: "Microphone Pitch Test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start microphone" })).toBeInTheDocument();
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalled());
    expect(await screen.findByRole("option", { name: "Test microphone" })).toBeInTheDocument();
    expect(await screen.findByText("Diagnostic Song")).toBeInTheDocument();
    expect(screen.getByText("Expected: E4 (64)")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/songs/0e513a82-8fd5-4dd2-9b54-c046a46ceaed", { cache: "no-store" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
