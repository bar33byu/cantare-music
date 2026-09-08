import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

describe("KeyboardShortcuts", () => {
  beforeEach(() => localStorage.clear());
  it("shows automatic hints only after keyboard navigation and hides them on touch", () => {
    render(<KeyboardShortcuts context="practice" />);
    expect(screen.queryByText("K: play/pause")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByText("K: play/pause")).toBeInTheDocument();
    const touch = new Event("pointerdown");
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    fireEvent(window, touch);
    expect(screen.queryByText("K: play/pause")).not.toBeInTheDocument();
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });
  it("persists Never and disabled shortcuts across remounts", () => {
    const view = render(<KeyboardShortcuts context="practice" />);
    fireEvent.change(screen.getByLabelText("Shortcut hints on this device"), { target: { value: "never" } });
    fireEvent.click(screen.getByLabelText("Enable practice shortcuts"));
    view.unmount();
    render(<KeyboardShortcuts context="practice" />);
    expect(screen.getByLabelText("Enable practice shortcuts")).not.toBeChecked();
    expect(screen.getByLabelText("Shortcut hints on this device")).toHaveValue("never");
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.queryByText("K: play/pause")).not.toBeInTheDocument();
  });
  it("explains tap overrides instead of offering conflicting transport hints", () => {
    render(<KeyboardShortcuts context="tap" />);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByText("9 / 0: sections")).toBeInTheDocument();
    expect(screen.queryByText("K: play/pause")).not.toBeInTheDocument();
    expect(screen.getByText(/J\/K\/L, U\/O, and R are taps/)).toBeInTheDocument();
  });
});
