import { NextRequest, NextResponse } from "next/server";
import { getPublicPlaylistById } from "../../../../../../../../db/queries";
import { buildMidiStatus } from "../../../../../../../lib/midiStatus";
import { formatError } from "../../../../../../_errors";
import { resolveRequestContext } from "../../../../../../_user";

const sharedHeaders = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  try {
    const context = await resolveRequestContext(request);
    if (!context.actor || !(context.actor.email ?? "").trim()) {
      return NextResponse.json({ error: "Sign in to open shared playlists." }, { status: 401, headers: sharedHeaders });
    }

    const { id, songId } = await params;
    const playlist = await getPublicPlaylistById(id, context.effectiveUser?.id);
    if (!playlist) {
      return NextResponse.json({ error: "Shared playlist not found." }, { status: 404, headers: sharedHeaders });
    }

    if (!playlist.songs.some((song) => song.id === songId)) {
      return NextResponse.json({ error: "Song not found in shared playlist." }, { status: 404, headers: sharedHeaders });
    }

    const status = await buildMidiStatus(songId, playlist.owner.id);
    return NextResponse.json({
      segmentAnswerKeys: status.segmentAnswerKeys,
      summary: status.summary,
    }, { headers: sharedHeaders });
  } catch (error) {
    console.error("Error loading shared MIDI status:", error);
    return NextResponse.json(formatError(error), { status: 500, headers: sharedHeaders });
  }
}
