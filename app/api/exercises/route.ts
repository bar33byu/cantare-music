import { NextRequest, NextResponse } from "next/server";
import { createVocalExercise, getVocalExercises } from "../../../db/queries";
import { AUTH_SESSION_COOKIE_NAME } from "../../lib/authTokens";
import { parseVocalExerciseMidi } from "../../lib/vocalExercise";
import { getRequestCookie, resolveRequestContext } from "../_user";

const MAX_MIDI_FILE_SIZE = 2_000_000;

function errorResponse(error: unknown) {
  console.error("Exercise API error:", error);
  const message = process.env.NODE_ENV === "development" && error instanceof Error
    ? error.message
    : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

async function requireAdmin(request: NextRequest) {
  if (!getRequestCookie(request, AUTH_SESSION_COOKIE_NAME)) return null;
  const context = await resolveRequestContext(request);
  return context.actor?.isAdmin ? context.actor : null;
}

export async function GET() {
  try {
    return NextResponse.json({ exercises: await getVocalExercises() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "MIDI file is required" }, { status: 400 });
    if (!/\.(mid|midi)$/i.test(file.name)) return NextResponse.json({ error: "Only .mid and .midi files are supported" }, { status: 400 });
    if (file.size > MAX_MIDI_FILE_SIZE) return NextResponse.json({ error: "MIDI file is too large" }, { status: 400 });

    const requestedStart = Number(formData.get("exerciseStartBeat") ?? 0);
    const exercise = parseVocalExerciseMidi(await file.arrayBuffer(), {
      id: crypto.randomUUID(),
      title: String(formData.get("title") ?? ""),
      sourceMidiFile: file.name,
      exerciseStartBeat: Number.isFinite(requestedStart) ? requestedStart : 0,
    });
    return NextResponse.json({ exercise: await createVocalExercise(exercise, admin.id) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
