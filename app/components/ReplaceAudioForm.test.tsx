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

    fireEvent.click(screen.getByTestId("replace-audio-submit-prominent"));

    expect(await screen.findByTestId("replace-audio-error-prominent")).toHaveTextContent(
      "Select an MP3 file for Prominent first."
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("shows populated and missing status for each audio version", () => {
    render(<ReplaceAudioForm songId="song-1" audioUrl="https://cdn.example.com/prominent.mp3" />);

    expect(screen.getByTestId("replace-audio-status-prominent")).toHaveTextContent("Uploaded");
    expect(screen.getByTestId("replace-audio-status-blend")).toHaveTextContent("Missing");
    expect(screen.getByTestId("replace-audio-submit-prominent")).toHaveTextContent("Replace Prominent");
    expect(screen.getByTestId("replace-audio-submit-blend")).toHaveTextContent("Upload Blend");
  });

  it("uploads file and patches song audio key", async () => {
    uploadMock.mockResolvedValue("audio/new.mp3");
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const onReplaced = vi.fn();
    render(<ReplaceAudioForm songId="song-1" audioUrl="https://cdn.example.com/prominent.mp3" onReplaced={onReplaced} />);

    const file = new File(["x"], "new.mp3", { type: "audio/mpeg" });
    const input = screen.getByTestId("replace-audio-input-prominent") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByTestId("replace-audio-submit-prominent"));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith("song-1", file, "prominent");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/songs/song-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioKey: "audio/new.mp3" }),
    });

    expect(await screen.findByTestId("replace-audio-success-prominent")).toHaveTextContent(
      "Prominent audio replaced successfully."
    );
    expect(onReplaced).toHaveBeenCalledTimes(1);
  });

  it("patches the alternate audio key when blend is selected", async () => {
    uploadMock.mockResolvedValue("audio/blend/new.mp3");
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<ReplaceAudioForm songId="song-1" />);

    const file = new File(["x"], "blend.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByTestId("replace-audio-input-blend"), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId("replace-audio-submit-blend"));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith("song-1", file, "blend");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/songs/song-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alternateAudioKey: "audio/blend/new.mp3" }),
    });
  });

  it("patches song audio for the selected user", async () => {
    uploadMock.mockResolvedValue("audio/new.mp3");
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<ReplaceAudioForm songId="song-1" userId="test-user" />);

    const file = new File(["x"], "new.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByTestId("replace-audio-input-prominent"), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId("replace-audio-submit-prominent"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/songs/song-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-ID": "test-user" },
        body: JSON.stringify({ audioKey: "audio/new.mp3" }),
      });
    });
  });

  it("shows API error message when patch fails", async () => {
    uploadMock.mockResolvedValue("audio/new.mp3");
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Update failed" }),
    });

    render(<ReplaceAudioForm songId="song-1" />);

    const file = new File(["x"], "new.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByTestId("replace-audio-input-prominent"), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId("replace-audio-submit-prominent"));

    expect(await screen.findByTestId("replace-audio-error-prominent")).toHaveTextContent("Update failed");
  });
});
