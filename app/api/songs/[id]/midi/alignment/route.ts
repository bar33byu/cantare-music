import { NextRequest, NextResponse } from "next/server";
import {
  getLatestMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSongById,
  upsertMidiAlignment,
} from "../../../../../../db/queries";
import { resolveRequestUserId } from "../../../../_user";
import {
  alignMidiByFirstAudioStart,
  appendAlignmentTap,
  createMidiAlignment,
  resumeAlignmentFromNote,
  undoLastAlignmentTap,
} from "../../../../../lib/midiGuidedTapPractice";

type AlignmentActionBody =
  | { action?: "start" }
  | { action: "offset"; firstAudioStartSeconds?: unknown }
  | { action: "tap"; timeSeconds?: unknown }
  | { action: "undo" }
  | { action: "resumeFrom"; noteIndex?: unknown }
  | { action: "restart" };

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const source = await getLatestMidiSourceForSong(id, userId);
    if (!source) {
      return NextResponse.json({ error: "No MIDI source found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({})) as AlignmentActionBody;
    const existing = await getLatestMidiAlignmentForSource(source.id, userId);
    const base = existing ?? createMidiAlignment({
      id: crypto.randomUUID(),
      songId: id,
      midiSourceId: source.id,
      retainedMidiNoteCount: source.cleanedNoteCount,
    });

    let next = base;
    if (body.action === "offset") {
      const firstAudioStartSeconds = getNumber(body.firstAudioStartSeconds);
      if (firstAudioStartSeconds === null) {
        return NextResponse.json({ error: "firstAudioStartSeconds is required" }, { status: 400 });
      }
      next = alignMidiByFirstAudioStart(base, source.cleanedNotes, firstAudioStartSeconds);
    } else if (body.action === "tap") {
      const timeSeconds = getNumber(body.timeSeconds);
      if (timeSeconds === null) {
        return NextResponse.json({ error: "timeSeconds is required" }, { status: 400 });
      }
      next = appendAlignmentTap(base, timeSeconds);
    } else if (body.action === "undo") {
      next = undoLastAlignmentTap(base);
    } else if (body.action === "resumeFrom") {
      const noteIndex = getNumber(body.noteIndex);
      if (noteIndex === null) {
        return NextResponse.json({ error: "noteIndex is required" }, { status: 400 });
      }
      next = resumeAlignmentFromNote(base, noteIndex);
    } else if (body.action === "restart") {
      next = createMidiAlignment({
        id: crypto.randomUUID(),
        songId: id,
        midiSourceId: source.id,
        retainedMidiNoteCount: source.cleanedNoteCount,
      });
    }

    const saved = await upsertMidiAlignment({
      id: next.id,
      songId: id,
      midiSourceId: source.id,
      tappedStartTimesSeconds: next.tappedStartTimesSeconds,
      retainedMidiNoteCount: source.cleanedNoteCount,
      notes: next.notes ?? null,
    }, userId);

    return NextResponse.json({ alignment: saved });
  } catch (error) {
    console.error("Error updating MIDI alignment:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
