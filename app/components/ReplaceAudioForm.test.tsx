import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReplaceAudioForm } from "./ReplaceAudioForm";

const uploadMock = vi.fn();

vi.mock("../hooks/useUploadAudio", () => ({
  useUploadAudio: () => ({
    upload: uploadMock,
    uploading: false,
    progress: 0,
    error: null,
  }),
}));

describe("ReplaceAudioForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("shows validation error when submit is clicked with no file", async () => {
    render(<ReplaceAudioForm songId="song-1" />);

    fireEvent.click(screen.getByTestId("replace-audio-submit"));

    expect(await screen.findByTestId("replace-audio-error")).toHaveTextContent(
      "Select an MP3 file first."
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads file and patches song audio key", async () => {
    uploadMock.mockResolvedValue("audio/new.mp3");
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const onReplaced = vi.fn();
    render(<ReplaceAudioForm songId="song-1" onReplaced={onReplaced} />);

    const file = new File(["x"], "new.mp3", { type: "audio/mpeg" });
    const input = screen.getByTestId("replace-audio-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByTestId("replace-audio-submit"));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith("song-1", file);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/songs/song-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioKey: "audio/new.mp3" }),
    });

    expect(await screen.findByTestId("replace-audio-success")).toHaveTextContent(
      "Audio replaced successfully."
    );
    expect(onReplaced).toHaveBeenCalledTimes(1);
  });

  it("shows API error message when patch fails", async () => {
    uploadMock.mockResolvedValue("audio/new.mp3");
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Update failed" }),
    });

    render(<ReplaceAudioForm songId="song-1" />);

    const file = new File(["x"], "new.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByTestId("replace-audio-input"), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId("replace-audio-submit"));

    expect(await screen.findByTestId("replace-audio-error")).toHaveTextContent("Update failed");
  });
});
