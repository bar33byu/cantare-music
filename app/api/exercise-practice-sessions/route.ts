import { NextRequest, NextResponse } from "next/server";
import { createVocalExercisePracticeSession } from "../../../db/queries";
import { resolveAuthenticatedRequestContext } from "../_user";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveAuthenticatedRequestContext(request);
    const userId = context?.effectiveUser?.id ?? context?.actor?.id;
    if (!userId) return jsonError("Sign in to record warmup practice.", 401);
    const body = await request.json().catch(() => ({})) as {
      id?: unknown;
      exerciseId?: unknown;
      startedAt?: unknown;
      tempoPercent?: unknown;
      repetitionCount?: unknown;
      audioVersion?: unknown;
      practiceMode?: unknown;
      routineId?: unknown;
    };
    if (typeof body.exerciseId !== "string" || body.exerciseId.trim().length === 0) {
      return jsonError("exerciseId is required", 400);
    }
    if (body.audioVersion !== "part" && body.audioVersion !== "blend") {
      return jsonError("audioVersion must be part or blend", 400);
    }
    if (body.practiceMode !== "single" && body.practiceMode !== "set") {
      return jsonError("practiceMode must be single or set", 400);
    }

    const startedAt = typeof body.startedAt === "string" ? new Date(body.startedAt) : new Date();
    const session = await createVocalExercisePracticeSession({
      id: typeof body.id === "string" && body.id.trim() ? body.id : undefined,
      userId,
      exerciseId: body.exerciseId,
      startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
      tempoPercent: typeof body.tempoPercent === "number" ? body.tempoPercent : undefined,
      repetitionCount: typeof body.repetitionCount === "number" ? body.repetitionCount : undefined,
      audioVersion: body.audioVersion,
      practiceMode: body.practiceMode,
      routineId: typeof body.routineId === "string" && body.routineId.trim() ? body.routineId.trim() : null,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Error creating exercise practice session:", error);
    return jsonError("Internal server error", 500);
  }
}
