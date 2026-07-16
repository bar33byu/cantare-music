import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMagicLinkEmail } from "./resend";

const originalApiKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM_EMAIL;

describe("sendMagicLinkEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Cantare <login@example.com>";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
  });

  it("includes the code and automatic login link in HTML and plain text", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const loginUrl = "https://cantare.example/auth/verify?token=042137&email=singer%40example.com";

    await sendMagicLinkEmail({ to: "singer@example.com", code: "042137", loginUrl });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.html).toContain("042137");
    expect(body.html).toContain("token=042137&amp;email=singer%40example.com");
    expect(body.text).toContain("Your code is: 042137");
    expect(body.text).toContain(loginUrl);
  });
});
