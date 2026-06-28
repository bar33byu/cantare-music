import { NextRequest, NextResponse } from "next/server";
import { finishVocalExercisePracticeSession } from "../../../../db/queries";
import { normalizeUserId } from "../../../lib/userContext";
import { resolveEffectiveRequestUserId } from "../../_user";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const userId = await resolveEffectiveRequestUserId(request);
    const body = await request.json().catch(() => ({})) as {
      completedAt?: unknown;
      durationSeconds?: unknown;
    };
    const completedAt = typeof body.completedAt === "string" ? new Date(body.completedAt) : new Date();
    const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return jsonError("durationSeconds must be a non-negative number", 400);
    }

    const session = await finishVocalExercisePracticeSession({
      id,
      userId: normalizeUserId(userId),
      completedAt: Number.isNaN(completedAt.getTime()) ? new Date() : completedAt,
      durationSeconds,
    });

    if (!session) {
      return jsonError("Session not found", 404);
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error finishing exercise practice session:", error);
    return jsonError("Internal server error", 500);
  }
}
