import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseBrowser } from "./ExerciseBrowser";

const exercise = {
  id: "exercise-1",
  title: "Shared Triad",
  sourceMidiFile: "triad.mid",
  exerciseStartBeat: 1,
  tempoBpm: 90,
  timeSignature: { numerator: 4, denominator: 4 },
  durationBeats: 3,
  events: [
    { id: "context", startBeat: 0, durationBeats: 1, midi: 55, velocity: 80, region: "context" },
    { id: "sing", startBeat: 1, durationBeats: 1, midi: 60, velocity: 90, region: "exercise" },
  ],
  createdAt: "2026-06-21T00:00:00.000Z",
};

const secondExercise = {
  ...exercise,
  id: "exercise-2",
  title: "Five Note Scale",
};

describe("ExerciseBrowser permissions", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lets guests use shared exercises with a read-only default range", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exercises: [exercise] }),
    }));

    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);

    expect(await screen.findByRole("button", { name: /Shared Triad/ })).toBeInTheDocument();
    expect(screen.getByText(/Sign in to set and save/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Add shared MIDI exercise")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Shared Triad/ }));
    expect(await screen.findByTestId("exercise-detail-page")).toBeInTheDocument();
    expect(screen.getByLabelText(/Tempo:/)).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Exercises/ }));
    expect(await screen.findByTestId("exercise-browser")).toBeInTheDocument();
  });

  it("loads and saves range controls for a signed-in user", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/exercises") return { ok: true, json: async () => ({ exercises: [exercise] }) };
      if (url === "/api/users/me/vocal-range" && init?.method === "PATCH") {
        return { ok: true, json: async () => ({ range: JSON.parse(String(init.body)) }) };
      }
      return { ok: true, json: async () => ({ range: { low: 45, high: 64 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExerciseBrowser userId="user-1" isSignedIn isAdmin={false} />);
    expect(await screen.findByRole("button", { name: /Shared Triad/ })).toBeInTheDocument();
    const selects = await screen.findAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "46" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/me/vocal-range",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ low: 46, high: 64 }) })
    ));
    expect(screen.queryByText("Add shared MIDI exercise")).not.toBeInTheDocument();
  });

  it("moves from one full-page exercise to the next", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exercises: [exercise, secondExercise] }),
    }));

    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Shared Triad/ }));
    expect(screen.getByRole("heading", { name: "Shared Triad" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next exercise/ }));
    expect(screen.getByRole("heading", { name: "Five Note Scale" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next exercise/ })).toBeDisabled();
  });

  it("groups collection exercises under their collection title", async () => {
    const collectionExercises = [exercise, secondExercise].map((item, index) => ({
      ...item,
      collectionSlug: "baritone-passaggio-warmups",
      collectionTitle: "Baritone Passaggio Warmups",
      routinePosition: index,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exercises: collectionExercises }),
    }));

    render(<ExerciseBrowser userId="guest-1" isSignedIn={false} isAdmin={false} />);
    expect(await screen.findByRole("heading", { name: "Baritone Passaggio Warmups" })).toBeInTheDocument();
    const cards = screen.getByLabelText("Exercise catalog").querySelectorAll("button");
    expect(Array.from(cards).map((card) => card.textContent)).toEqual([
      expect.stringContaining("Shared Triad"),
      expect.stringContaining("Five Note Scale"),
    ]);
  });

  it("keeps the admin add form collapsed until requested", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/exercises") return { ok: true, json: async () => ({ exercises: [exercise] }) };
      return { ok: true, json: async () => ({ range: { low: 45, high: 64 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExerciseBrowser userId="admin-1" isSignedIn isAdmin />);
    expect(await screen.findByRole("button", { name: /Shared Triad/ })).toBeInTheDocument();
    expect(screen.queryByText("Add shared MIDI exercise")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add exercise" }));
    expect(screen.getByText("Add shared MIDI exercise")).toBeInTheDocument();
  });
});
