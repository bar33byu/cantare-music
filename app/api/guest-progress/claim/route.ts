import { NextRequest, NextResponse } from "next/server";
import { claimGuestProgressForUser } from "../../../../db/queries";
import { resolveRequestUser } from "../../_user";

const claimHeaders = {
  "Cache-Control": "private, no-store",
};

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveRequestUser(request);
    if (!user || !user.email) {
      return NextResponse.json({ error: "Sign in before importing guest progress" }, { status: 401, headers: claimHeaders });
    }

    const body = await request.json().catch(() => ({})) as { songIds?: unknown; guestUserId?: unknown };
    if (!Array.isArray(body.songIds) || body.songIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "songIds must be a string array" }, { status: 400, headers: claimHeaders });
    }

    const result = await claimGuestProgressForUser(user.id, body.songIds, typeof body.guestUserId === "string" ? body.guestUserId : undefined);
    return NextResponse.json({ result }, { headers: claimHeaders });
  } catch (error) {
    console.error("Error claiming guest progress:", error);
    return NextResponse.json(formatError(error), { status: 500, headers: claimHeaders });
  }
}
