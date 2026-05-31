import type { ReactNode } from "react";

interface GuestWelcomePanelProps {
  action?: ReactNode;
  className?: string;
  footer?: ReactNode;
  title?: string;
}

export function GuestWelcomePanel({
  action,
  className = "",
  footer,
  title = "Welcome to Cantare",
}: GuestWelcomePanelProps) {
  return (
    <section className={`rounded border border-indigo-100 bg-white p-6 text-gray-700 shadow-sm ${className}`.trim()}>
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Guest access</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-950">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
        <p>
          Welcome to Cantare (from the Italian for &quot;to sing&quot;), a hobby app for memorizing choir music.
        </p>
        <p>
          There is no guarantee of support or longevity for this app. The administrator has access to all files
          uploaded, but they are only shared with others at your direction.
        </p>
        <p>
          Provide an email in the sign-in process and a magic link will be mailed to you. This app doesn&apos;t use
          passwords.
        </p>
      </div>
      {action ? <div className="mt-5">{action}</div> : null}
      {footer ? <div className="mt-4 text-sm text-gray-600">{footer}</div> : null}
    </section>
  );
}
