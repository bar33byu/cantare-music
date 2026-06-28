import { NextRequest, NextResponse } from "next/server";
import { createVocalExercisePracticeSession } from "../../../db/queries";
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
      exerciseId?: unknown;
      startedAt?: unknown;
      tempoPercent?: unknown;
      repetitionCount?: unknown;
    };
    if (typeof body.exerciseId !== "string" || body.exerciseId.trim().length === 0) {
      return jsonError("exerciseId is required", 400);
    }

    const startedAt = typeof body.startedAt === "string" ? new Date(body.startedAt) : new Date();
    const session = await createVocalExercisePracticeSession({
      id: typeof body.id === "string" && body.id.trim() ? body.id : undefined,
      userId: normalizeUserId(userId),
      exerciseId: body.exerciseId,
      startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
      tempoPercent: typeof body.tempoPercent === "number" ? body.tempoPercent : undefined,
      repetitionCount: typeof body.repetitionCount === "number" ? body.repetitionCount : undefined,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Error creating exercise practice session:", error);
    return jsonError("Internal server error", 500);
  }
}
