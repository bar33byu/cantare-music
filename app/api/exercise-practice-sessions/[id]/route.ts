import { NextRequest, NextResponse } from "next/server";
import { finishVocalExercisePracticeSession } from "../../../../db/queries";
import { resolveAuthenticatedRequestContext } from "../../_user";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const authContext = await resolveAuthenticatedRequestContext(request);
    const userId = authContext?.effectiveUser?.id ?? authContext?.actor?.id;
    if (!userId) return jsonError("Sign in to record warmup practice.", 401);
    const body = await request.json().catch(() => ({})) as {
      completedAt?: unknown;
      durationSeconds?: unknown;
      audioVersion?: unknown;
      completionStatus?: unknown;
      routineCompleted?: unknown;
    };
    const completedAt = typeof body.completedAt === "string" ? new Date(body.completedAt) : new Date();
    const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return jsonError("durationSeconds must be a non-negative number", 400);
    }
    if (body.audioVersion !== "part" && body.audioVersion !== "blend" && body.audioVersion !== "mixed") {
      return jsonError("audioVersion must be part, blend, or mixed", 400);
    }
    if (
      body.completionStatus !== "completed"
      && body.completionStatus !== "skipped"
      && body.completionStatus !== "stopped"
      && body.completionStatus !== "restarted"
    ) {
      return jsonError("Invalid completionStatus", 400);
    }

    const session = await finishVocalExercisePracticeSession({
      id,
      userId,
      completedAt: Number.isNaN(completedAt.getTime()) ? new Date() : completedAt,
      durationSeconds,
      audioVersion: body.audioVersion,
      completionStatus: body.completionStatus,
      routineCompleted: body.routineCompleted === true,
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
