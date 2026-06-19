import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DebugPitchPracticePage from "./page";

describe("DebugPitchPracticePage", () => {
  afterEach(() => {
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

    render(<DebugPitchPracticePage />);

    expect(screen.getByRole("heading", { name: "Microphone Pitch Test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start microphone" })).toBeInTheDocument();
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalled());
    expect(await screen.findByRole("option", { name: "Test microphone" })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
