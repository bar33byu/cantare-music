import { NextResponse } from "next/server";
import { getSharedPlaylistByToken } from "../../../../../../../../db/queries";
import { buildMidiStatus } from "../../../../../../../lib/midiStatus";

const sharedHeaders = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; songId: string }> }
) {
  try {
    const { token, songId } = await params;
    const playlist = await getSharedPlaylistByToken(token);
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: sharedHeaders });
  }
}
