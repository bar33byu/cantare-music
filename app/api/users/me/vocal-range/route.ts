import { NextRequest, NextResponse } from "next/server";
import { getUserVocalRange, saveUserVocalRange } from "../../../../../db/queries";
import { AUTH_SESSION_COOKIE_NAME } from "../../../../lib/authTokens";
import { getRequestCookie, resolveRequestContext } from "../../../_user";

async function authenticatedUser(request: NextRequest) {
  if (!getRequestCookie(request, AUTH_SESSION_COOKIE_NAME)) return null;
  const context = await resolveRequestContext(request);
  return context.effectiveUser;
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.json({ range: await getUserVocalRange(user.id) });
  } catch (error) {
    console.error("Error loading vocal range:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const low = Number(body.low);
    const high = Number(body.high);
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 24 || high > 84 || low > high) {
      return NextResponse.json({ error: "Range must use MIDI notes 24 through 84, from low to high" }, { status: 400 });
    }
    return NextResponse.json({ range: await saveUserVocalRange(user.id, { low, high }) });
  } catch (error) {
    console.error("Error saving vocal range:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
