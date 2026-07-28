import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseBrowser } from "./ExerciseBrowser";

const exercises = [
  {
    id: "recorded-warmup-01",
    title: "Warmup 1",
    lyricHint: "Mah, may, me, moh, moo",
    audioKey: "audio/warmups/01.mp3",
    audioUrl: "https://audio.example.com/audio/warmups/01.mp3",
    alternateAudioKey: "audio/warmups/01-blend.mp3",
    alternateAudioUrl: "https://audio.example.com/audio/warmups/01-blend.mp3",
    sourceMidiFile: "02 Track 2.mp3",
    exerciseStartBeat: 0,
    tempoBpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    durationBeats: 0,
    events: [],
    routinePosition: 0,
    createdAt: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "recorded-warmup-02",
    title: "Warmup 2",
    lyricHint: "",
    audioKey: "audio/warmups/02.mp3",
    audioUrl: "https://audio.example.com/audio/warmups/02.mp3",
    alternateAudioKey: "audio/warmups/02-blend.mp3",
    alternateAudioUrl: "https://audio.example.com/audio/warmups/02-blend.mp3",
    sourceMidiFile: "04 Track 4.mp3",
    exerciseStartBeat: 0,
    tempoBpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    durationBeats: 0,
    events: [],
    routinePosition: 1,
    createdAt: "2026-07-27T00:00:00.000Z",
  },
];

describe("recorded warmup browser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  function mockExerciseList() {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/exercises") return { ok: true, json: async () => ({ exercises }) };
      return { ok: true, clone() { return this; }, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("shows one lyric-hint card per recording and selects every warmup by default", async () => {
    mockExerciseList();
    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);

    expect(await screen.findByRole("heading", { name: "Warmup 1" })).toBeInTheDocument();
    expect(screen.getByText("Mah, may, me, moh, moo")).toBeInTheDocument();
    expect(screen.getByText("No lyric hints yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play set (2)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Include Warmup 1 in set")).toBeChecked();
    expect(screen.queryByText("Edit title & hints")).not.toBeInTheDocument();
  });

  it("saves a custom set on the device", async () => {
    mockExerciseList();
    const { unmount } = render(<ExerciseBrowser userId="user-1" isSignedIn isAdmin={false} />);
    const firstToggle = await screen.findByLabelText("Include Warmup 1 in set");
    fireEvent.click(firstToggle);
    expect(screen.getByRole("button", { name: "Play set (1)" })).toBeInTheDocument();
    unmount();

    render(<ExerciseBrowser userId="user-1" isSignedIn isAdmin={false} />);
    expect(await screen.findByLabelText("Include Warmup 1 in set")).not.toBeChecked();
    expect(screen.getByLabelText("Include Warmup 2 in set")).toBeChecked();
  });

  it("lets an administrator edit the shared title and lyric hints", async () => {
    const fetchMock = mockExerciseList();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/exercises") return { ok: true, json: async () => ({ exercises }) };
      if (url === "/api/exercises/recorded-warmup-01" && init?.method === "PATCH") {
        const changes = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ exercise: { ...exercises[0], ...changes } }) };
      }
      return { ok: true, clone() { return this; }, json: async () => ({}) };
    });

    render(<ExerciseBrowser userId="admin-1" isSignedIn isAdmin />);
    const editButtons = await screen.findAllByRole("button", { name: "Edit title & hints" });
    fireEvent.click(editButtons[0]);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lip trill ladder" } });
    fireEvent.change(screen.getByPlaceholderText(/Add the syllables/), { target: { value: "Easy lips; breathe low." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises/recorded-warmup-01",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Lip trill ladder", lyricHint: "Easy lips; breathe low." }) })
    ));
    expect(await screen.findByRole("heading", { name: "Lip trill ladder" })).toBeInTheDocument();
  });

  it("starts the selected set with the first enabled recording", async () => {
    mockExerciseList();
    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Play set (2)" }));
    expect(await screen.findByText("Now playing")).toBeInTheDocument();
    expect(screen.getByText("Exercise 1 of 2")).toBeInTheDocument();
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  });

  it("keeps playing when a browser rejects seeking before metadata is ready", async () => {
    mockExerciseList();
    const { container } = render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    await screen.findByRole("button", { name: "Play set (2)" });
    const audio = container.querySelectorAll("audio")[1];
    expect(audio).not.toBeNull();
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => 0,
      set: () => { throw new DOMException("Metadata is not loaded", "InvalidStateError"); },
    });

    fireEvent.click(screen.getByRole("button", { name: "Play set (2)" }));

    expect(await screen.findByText("Now playing")).toBeInTheDocument();
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(screen.queryByText("This page couldn’t load")).not.toBeInTheDocument();
  });

  it("restarts the active recording when Play is pressed again", async () => {
    mockExerciseList();
    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    const playButtons = await screen.findAllByRole("button", { name: "Play" });
    fireEvent.click(playButtons[0]);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("switches between Blend and Part while preserving the playback position", async () => {
    mockExerciseList();
    const { container } = render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Play set (2)" }));
    const [partAudio, blendAudio] = Array.from(container.querySelectorAll("audio"));
    await waitFor(() => expect(blendAudio.getAttribute("src")).toBe(exercises[0].alternateAudioUrl));
    expect(screen.getByRole("button", { name: "Blend" })).toHaveAttribute("aria-pressed", "true");
    blendAudio.currentTime = 12;
    fireEvent.play(blendAudio);

    fireEvent.click(screen.getByRole("button", { name: "Part" }));

    expect(partAudio.getAttribute("src")).toBe(exercises[0].audioUrl);
    expect(screen.getByRole("button", { name: "Part" })).toHaveAttribute("aria-pressed", "true");
    expect(partAudio.currentTime).toBe(12);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("keeps lyric hints visible and skips forward and backward through the set", async () => {
    mockExerciseList();
    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Play set (2)" }));
    const player = screen.getByLabelText("Warmup player");
    expect(within(player).getByText("Mah, may, me, moh, moo")).toBeInTheDocument();

    fireEvent.click(within(player).getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(within(player).getByText("Warmup 2")).toBeInTheDocument());
    expect(within(player).getByText("No lyric hints yet.")).toBeInTheDocument();

    fireEvent.click(within(player).getByRole("button", { name: /Previous/ }));
    await waitFor(() => expect(within(player).getByText("Warmup 1")).toBeInTheDocument());
  });
});
