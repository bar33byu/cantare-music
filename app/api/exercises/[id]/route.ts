import { NextRequest, NextResponse } from "next/server";
import { deleteVocalExercise, getVocalExercises, updateVocalExercise } from "../../../../db/queries";
import { AUTH_SESSION_COOKIE_NAME } from "../../../lib/authTokens";
import { setExerciseStartBeat } from "../../../lib/vocalExercise";
import { getRequestCookie, resolveRequestContext } from "../../_user";

async function isAuthenticatedAdmin(request: NextRequest): Promise<boolean> {
  if (!getRequestCookie(request, AUTH_SESSION_COOKIE_NAME)) return false;
  const context = await resolveRequestContext(request);
  return Boolean(context.actor?.isAdmin);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticatedAdmin(request))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const exercise = (await getVocalExercises()).find((candidate) => candidate.id === id);
    if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    const body = await request.json().catch(() => ({})) as {
      exerciseStartBeat?: unknown;
      title?: unknown;
      lyricHint?: unknown;
    };
    let nextExercise = exercise;
    if (body.exerciseStartBeat !== undefined) {
      const startBeat = Number(body.exerciseStartBeat);
      if (!Number.isFinite(startBeat)) return NextResponse.json({ error: "exerciseStartBeat must be a number" }, { status: 400 });
      nextExercise = setExerciseStartBeat(nextExercise, startBeat);
    }
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) {
        return NextResponse.json({ error: "title must be between 1 and 120 characters" }, { status: 400 });
      }
      nextExercise = { ...nextExercise, title: body.title.trim() };
    }
    if (body.lyricHint !== undefined) {
      if (typeof body.lyricHint !== "string" || body.lyricHint.length > 2_000) {
        return NextResponse.json({ error: "lyricHint must be at most 2000 characters" }, { status: 400 });
      }
      nextExercise = { ...nextExercise, lyricHint: body.lyricHint.trim() };
    }
    if (body.exerciseStartBeat === undefined && body.title === undefined && body.lyricHint === undefined) {
      return NextResponse.json({ error: "No supported changes were provided" }, { status: 400 });
    }
    const updated = await updateVocalExercise(nextExercise);
    return NextResponse.json({ exercise: updated });
  } catch (error) {
    console.error("Error updating exercise:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticatedAdmin(request))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!(await deleteVocalExercise(id))) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting exercise:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
