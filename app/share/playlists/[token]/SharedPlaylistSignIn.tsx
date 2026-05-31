"use client";

import { type FormEvent, useState } from "react";

interface SharedPlaylistSignInProps {
  returnTo: string;
}

export function SharedPlaylistSignIn({ returnTo }: SharedPlaylistSignInProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), returnTo }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      setMessage(payload.message ?? "If that email can sign in to Cantare, a login link is on the way.");
    } catch {
      setMessage("If that email can sign in to Cantare, a login link is on the way.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 sm:min-w-80">
      <label htmlFor="shared-playlist-sign-in-email" className="text-sm font-semibold text-gray-900">
        Sign in to import
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="shared-playlist-sign-in-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          className="min-w-0 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send link
        </button>
      </div>
      {message ? (
        <p className="text-xs text-gray-600" role="status">
          {message}
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Your login link will bring you back here to import this playlist.
        </p>
      )}
    </form>
  );
}
