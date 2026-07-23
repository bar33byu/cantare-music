import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MagicCodeSignInForm } from "./MagicCodeSignInForm";

describe("MagicCodeSignInForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests an email containing both a code and one-click link", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Code sent." }),
    });
    render(<MagicCodeSignInForm idPrefix="test-sign-in" returnTo="/shared" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "singer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email sign-in code" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "singer@example.com", returnTo: "/shared" }),
    }));
    expect(await screen.findByText("Code sent.")).toBeInTheDocument();
    expect(screen.getByLabelText("Six-digit code")).toHaveFocus();
  });

  it("allows only six numeric digits and submits them with the email", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invalid code." }),
    });
    render(<MagicCodeSignInForm idPrefix="test-sign-in" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "singer@example.com" } });
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "12a34567" } });
    expect(screen.getByLabelText("Six-digit code")).toHaveValue("123456");
    fireEvent.click(screen.getByRole("button", { name: "Sign in with code" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/auth/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "singer@example.com", code: "123456", returnTo: "/" }),
    }));
    expect(await screen.findByText("Invalid code.")).toBeInTheDocument();
  });
});
