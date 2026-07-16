interface SendLoginEmailData {
  to: string;
  code: string;
  loginUrl: string;
}

export async function sendMagicLinkEmail({ to, code, loginUrl }: SendLoginEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are required to send magic-link emails");
  }

  const htmlLoginUrl = loginUrl.replaceAll("&", "&amp;");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Sign in to Cantare",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <h1 style="font-size:22px;margin:0 0 12px">Sign in to Cantare</h1>
          <p>Enter this code on the device where you want to sign in:</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>
          <p>Or use this link to sign in automatically:</p>
          <p><a href="${htmlLoginUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Sign in to Cantare</a></p>
          <p style="font-size:13px;color:#4b5563">The code and link expire in 15 minutes and can be used once.</p>
        </div>
      `,
      text: `Sign in to Cantare\n\nYour code is: ${code}\n\nEnter it on the device where you want to sign in, or use this link:\n${loginUrl}\n\nThe code and link expire in 15 minutes and can be used once.`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend email request failed with ${response.status}: ${detail}`);
  }
}
