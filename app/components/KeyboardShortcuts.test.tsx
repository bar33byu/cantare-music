import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

describe("KeyboardShortcuts", () => {
  beforeEach(() => localStorage.clear());
  it("keeps the complete shortcut reference collapsed in settings", () => {
    render(<KeyboardShortcuts />);
    const details = screen.getByText("Keyboard shortcuts").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Tap practice keyboard controls")).toBeInTheDocument();
    expect(screen.getByText("Toggle the contour preview")).toBeInTheDocument();
  });
  it("persists disabled shortcuts across remounts", () => {
    const view = render(<KeyboardShortcuts />);
    fireEvent.click(screen.getByLabelText("Enable practice shortcuts"));
    view.unmount();
    render(<KeyboardShortcuts />);
    expect(screen.getByLabelText("Enable practice shortcuts")).not.toBeChecked();
  });
  it("explains Tap mode keyboard overrides", () => {
    render(<KeyboardShortcuts />);
    expect(screen.getByText(/J\/K\/L, U\/O, R, and semicolon are pitch taps/)).toBeInTheDocument();
  });
});
