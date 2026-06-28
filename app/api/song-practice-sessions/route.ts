import { NextRequest, NextResponse } from "next/server";
import { createSongPracticeSession } from "../../../db/queries";
import { normalizeUserId } from "../../lib/userContext";
import { resolveEffectiveRequestUserId } from "../_user";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const body = await request.json().catch(() => ({})) as {
      id?: unknown;
      songId?: unknown;
      segmentId?: unknown;
      source?: unknown;
      startedAt?: unknown;
    };
    if (typeof body.songId !== "string" || body.songId.trim().length === 0) {
      return jsonError("songId is required", 400);
    }

    const startedAt = typeof body.startedAt === "string" ? new Date(body.startedAt) : new Date();
    const session = await createSongPracticeSession({
      id: typeof body.id === "string" && body.id.trim() ? body.id : undefined,
      userId: normalizeUserId(userId),
      songId: body.songId,
      segmentId: typeof body.segmentId === "string" && body.segmentId.trim() ? body.segmentId : null,
      source: typeof body.source === "string" && body.source.trim() ? body.source : "song",
      startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Error creating song practice session:", error);
    return jsonError("Internal server error", 500);
  }
}
