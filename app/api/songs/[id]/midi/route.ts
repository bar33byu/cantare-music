import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import {
  createMidiSource,
  getLatestMidiSourceForSong,
  getSongById,
  updateMidiSourceCleanup,
} from "../../../../../db/queries";
import { BUCKET, generateMidiUploadKey, r2Client } from "../../../../../lib/r2";
import { resolveEffectiveRequestUserId } from "../../../_user";
import { buildMidiStatus } from "../../../../lib/midiStatus";
import {
  cleanMidiNotes,
  parseMidiFile,
  type MidiCleanupSettings,
} from "../../../../lib/midiGuidedTapPractice";

const MAX_MIDI_FILE_SIZE = 2_000_000;
const DEFAULT_CLEANUP_SETTINGS: MidiCleanupSettings = {
  shortNoteThresholdMs: 0,
  simultaneousThresholdMs: 30,
};
const ALLOWED_EXTENSIONS = [".mid", ".midi"];

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

function isMidiFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function clampThreshold(value: unknown): number {
  return Math.max(0, Math.min(300, typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 100));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    return NextResponse.json(await buildMidiStatus(id, userId));
  } catch (error) {
    console.error("Error loading MIDI status:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "MIDI file is required" }, { status: 400 });
    }

    if (!isMidiFilename(file.name)) {
      return NextResponse.json({ error: "Only .mid and .midi files are supported" }, { status: 400 });
    }

    if (file.size > MAX_MIDI_FILE_SIZE) {
      return NextResponse.json({ error: "MIDI file is too large" }, { status: 400 });
    }

    const shortNoteThresholdMs = clampThreshold(Number(formData.get("shortNoteThresholdMs") ?? DEFAULT_CLEANUP_SETTINGS.shortNoteThresholdMs));
    const cleanupSettings = { ...DEFAULT_CLEANUP_SETTINGS, shortNoteThresholdMs };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseMidiFile(bytes);
    const cleaned = cleanMidiNotes(parsed.rawNotes, cleanupSettings);
    const storageKey = generateMidiUploadKey(id, file.name.replace(/[^\w.\- ]+/g, "_"));

    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: bytes,
      ContentType: file.type || "audio/midi",
    }));

    await createMidiSource({
      id: crypto.randomUUID(),
      songId: id,
      originalFilename: file.name,
      storageKey,
      contentType: file.type || "audio/midi",
      fileSize: file.size,
      parseStatus: "parsed",
      cleanupSettings,
      rawNotes: parsed.rawNotes,
      cleanedNotes: cleaned.cleanedNotes,
      rawNoteCount: cleaned.rawNoteCount,
      cleanedNoteCount: cleaned.cleanedNoteCount,
      ignoredShortNoteCount: cleaned.ignoredShortNoteCount,
      parseError: null,
    });

    return NextResponse.json(await buildMidiStatus(id, userId), { status: 201 });
  } catch (error) {
    console.error("Error uploading MIDI:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const source = await getLatestMidiSourceForSong(id, userId);
    if (!source) {
      return NextResponse.json({ error: "No MIDI source found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null) as { shortNoteThresholdMs?: unknown } | null;
    const cleanupSettings = {
      ...source.cleanupSettings,
      shortNoteThresholdMs: clampThreshold(body?.shortNoteThresholdMs),
      simultaneousThresholdMs: source.cleanupSettings.simultaneousThresholdMs ?? DEFAULT_CLEANUP_SETTINGS.simultaneousThresholdMs,
    };
    const cleaned = cleanMidiNotes(source.rawNotes, cleanupSettings);
    await updateMidiSourceCleanup(source.id, userId, {
      cleanupSettings,
      cleanedNotes: cleaned.cleanedNotes,
      cleanedNoteCount: cleaned.cleanedNoteCount,
      ignoredShortNoteCount: cleaned.ignoredShortNoteCount,
    });

    return NextResponse.json(await buildMidiStatus(id, userId));
  } catch (error) {
    console.error("Error updating MIDI cleanup settings:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
