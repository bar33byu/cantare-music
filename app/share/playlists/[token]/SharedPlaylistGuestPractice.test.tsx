import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Playlist } from "../../../types";
import { SharedPlaylistGuestPractice } from "./SharedPlaylistGuestPractice";

const practiceViewMock = vi.fn();
const playlistPracticeViewMock = vi.fn();

vi.mock("../../../components/PracticeView", () => ({
  default: (props: unknown) => {
    practiceViewMock(props);
    return <div data-testid="practice-view" />;
  },
}));

vi.mock("../../../components/PlaylistPracticeView", () => ({
  PlaylistPracticeView: (props: unknown) => {
    playlistPracticeViewMock(props);
    return <div data-testid="playlist-practice-view" />;
  },
}));

const playlist = {
  id: "playlist-1",
  name: "Shared Set",
  isRetired: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  owner: {
    id: "owner-user",
    displayName: "Owner",
    username: "owner",
  },
  songs: [{
    id: "song-1",
    title: "Song One",
    audioUrl: "https://audio.example/song.mp3",
    hasMidiContour: true,
    segments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    position: 0,
  }],
} satisfies Playlist;

describe("SharedPlaylistGuestPractice", () => {
  it("uses the shared owner for read-only MIDI data in direct song practice", () => {
    practiceViewMock.mockClear();
    render(<SharedPlaylistGuestPractice playlist={playlist} shareToken="share-token" />);

    fireEvent.click(screen.getByRole("button", { name: "1Song One" }));

    expect(practiceViewMock).toHaveBeenCalledWith(expect.objectContaining({
      sharedPlaylistToken: "share-token",
      persistProgress: false,
    }));
  });

  it("keeps the owner on the playlist used for whole-playlist practice", () => {
    playlistPracticeViewMock.mockClear();
    render(<SharedPlaylistGuestPractice playlist={playlist} shareToken="share-token" />);

    fireEvent.click(screen.getByRole("button", { name: "Practice whole playlist" }));

    expect(playlistPracticeViewMock).toHaveBeenCalledWith(expect.objectContaining({
      playlist: expect.objectContaining({
        owner: expect.objectContaining({ id: "owner-user" }),
      }),
      sharedPlaylistToken: "share-token",
      persistProgress: false,
    }));
  });
});
