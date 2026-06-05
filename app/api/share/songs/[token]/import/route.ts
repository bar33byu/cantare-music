import { NextRequest, NextResponse } from "next/server";
import { getSharedSongByToken, importSharedSong } from "../../../../../../db/queries";
import { resolveRequestContext } from "../../../../_user";

const sharedHeaders = {
  "Cache-Control": "private, no-store",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const context = await resolveRequestContext(request);
    const user = context.effectiveUser;
    if (!context.actor || !user || !(context.actor.email ?? "").trim()) {
      return NextResponse.json({ error: "Sign in to import this song." }, { status: 401, headers: sharedHeaders });
    }

    const { token } = await params;
    const song = await getSharedSongByToken(token);
    if (!song) {
      return NextResponse.json({ error: "Shared song not found." }, { status: 404, headers: sharedHeaders });
    }
    if (song.owner.id === user.id) {
      return NextResponse.json({ error: "This is already your song." }, { status: 409, headers: sharedHeaders });
    }

    const body = await request.json().catch(() => ({})) as { force?: unknown };
    const result = await importSharedSong(token, user.id, { force: body.force === true });
    return NextResponse.json(result, { headers: sharedHeaders });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === "SHARED_SONG_NOT_FOUND") {
      return NextResponse.json({ error: "Shared song not found." }, { status: 404, headers: sharedHeaders });
    }
    console.error("Error importing shared song:", error);
    return NextResponse.json({ error: "Unable to import this song right now." }, { status: 500, headers: sharedHeaders });
  }
}
