"use client";

import { type FormEvent, useRef, useState } from "react";

interface MagicCodeSignInFormProps {
  idPrefix: string;
  returnTo?: string;
  className?: string;
  footer?: string;
}

const REQUEST_MESSAGE = "If that email can sign in to Cantare, a six-digit code and login link are on the way.";

export function MagicCodeSignInForm({
  idPrefix,
  returnTo = "/",
  className = "",
  footer,
}: MagicCodeSignInFormProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState<"send" | "verify" | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }

    setLoadingAction("send");
    setMessage("");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), returnTo }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      setMessage(payload.message ?? REQUEST_MESSAGE);
      codeInputRef.current?.focus();
    } catch {
      setMessage(REQUEST_MESSAGE);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !/^\d{6}$/.test(code)) {
      return;
    }

    setLoadingAction("verify");
    setMessage("");
    try {
      const response = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code, returnTo }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; redirectTo?: string };
      if (!response.ok || !payload.redirectTo) {
        setMessage(payload.error ?? "That code is invalid or expired. Request a new code and try again.");
        return;
      }
      window.location.assign(payload.redirectTo);
    } catch {
      setMessage("Cantare could not sign you in. Check your connection and try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className={`grid gap-3 ${className}`.trim()}>
      <p className="text-xs text-gray-600">
        Enter your email to receive a six-digit code and a one-click sign-in link. No password required.
      </p>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSendCode}>
        <label htmlFor={`${idPrefix}-email`} className="text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          className="min-w-0 rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 sm:col-start-1 sm:row-start-2"
        />
        <button
          type="submit"
          disabled={loadingAction !== null || !email.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-start-2 sm:row-start-2"
        >
          {loadingAction === "send" ? "Sending..." : "Email sign-in code"}
        </button>
      </form>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleVerifyCode}>
        <label htmlFor={`${idPrefix}-code`} className="text-sm font-medium text-gray-700">
          Six-digit code
        </label>
        <input
          ref={codeInputRef}
          id={`${idPrefix}-code`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          aria-describedby={`${idPrefix}-code-help`}
          className="min-w-0 rounded border border-gray-300 px-3 py-2 font-mono text-lg tracking-[0.3em] text-gray-800 sm:col-start-1 sm:row-start-2"
        />
        <button
          type="submit"
          disabled={loadingAction !== null || !email.trim() || code.length !== 6}
          className="rounded border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 sm:col-start-2 sm:row-start-2"
        >
          {loadingAction === "verify" ? "Signing in..." : "Sign in with code"}
        </button>
      </form>
      <p id={`${idPrefix}-code-help`} className="text-xs text-gray-500">
        {footer ?? "You can type the code on any device, or click the link in the email."}
      </p>
      {message ? (
        <p className="text-xs text-gray-600" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
