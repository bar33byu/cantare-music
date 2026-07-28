import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getVocalExercises, upsertSeedVocalExercises, type PersistedVocalExercise } from "../db/queries";
import { BUCKET, r2Client } from "../lib/r2";
import { removeLegacyVocalExercises } from "../db/vocalExerciseMaintenance";

const DEFAULT_SOURCE_DIRECTORY = "C:\\Users\\bar33\\Music\\Unknown artist\\Unknown album (7-27-2026 6-48-48 PM)";
const COLLECTION_SLUG = "recorded-warmups-2026";

function trackNumber(filename: string): number {
  const match = filename.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function main() {
  const uploadOnly = process.argv.includes("--upload-only");
  const sourceArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  const sourceDirectory = path.resolve(sourceArgument ?? DEFAULT_SOURCE_DIRECTORY);
  const files = (await readdir(sourceDirectory))
    .filter((filename) => filename.toLowerCase().endsWith(".mp3"))
    .sort((left, right) => trackNumber(left) - trackNumber(right) || left.localeCompare(right));

  if (files.length === 0 || files.length % 2 !== 0) throw new Error(`Expected an even number of MP3 files in ${sourceDirectory}`);
  const pairs = Array.from({ length: files.length / 2 }, (_, index) => {
    const part = files[index * 2];
    const blend = files[index * 2 + 1];
    const partTrack = trackNumber(part);
    const blendTrack = trackNumber(blend);
    if (partTrack % 2 !== 1 || blendTrack !== partTrack + 1) throw new Error(`Expected odd/even Part and Blend pair, received ${part} and ${blend}`);
    return { part, blend };
  });
  console.log(`Importing ${pairs.length} Part/Blend warmup pairs from ${sourceDirectory}`);

  const existingById = uploadOnly
    ? new Map<string, PersistedVocalExercise>()
    : new Map((await getVocalExercises()).map((exercise) => [exercise.id, exercise]));

  const exercises: PersistedVocalExercise[] = [];
  for (const [index, pair] of pairs.entries()) {
    const upload = async (filename: string, version: "part" | "blend") => {
      const bytes = await readFile(path.join(sourceDirectory, filename));
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
      const prefix = String(index + 1).padStart(2, "0");
      const audioKey = version === "part"
        ? `audio/warmups/recorded-2026/${prefix}-part-${hash}.mp3`
        : `audio/warmups/recorded-2026/${prefix}-${hash}.mp3`;
      await r2Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: audioKey,
        Body: bytes,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { originalFilename: encodeURIComponent(filename), version },
      }));
      console.log(`Uploaded ${version} ${filename} -> ${audioKey}`);
      return audioKey;
    };
    const [audioKey, alternateAudioKey] = await Promise.all([upload(pair.part, "part"), upload(pair.blend, "blend")]);
    const id = `recorded-warmup-${String(index + 1).padStart(2, "0")}`;
    const existing = existingById.get(id);
    exercises.push({
      id,
      slug: `recorded-warmup-${String(index + 1).padStart(2, "0")}`,
      title: existing?.title ?? `Warmup ${index + 1}`,
      category: "Recorded",
      description: `Part: ${pair.part}; Blend: ${pair.blend}`,
      lyricHint: existing?.lyricHint ?? "",
      collectionSlug: COLLECTION_SLUG,
      collectionTitle: "Recorded Warmups",
      routinePosition: index,
      audioKey,
      alternateAudioKey,
      sourceMidiFile: `${pair.part} / ${pair.blend}`,
      exerciseStartBeat: 0,
      tempoBpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      durationBeats: 0,
      events: [],
      createdAt: new Date().toISOString(),
    });
  }

  if (uploadOnly) {
    console.log("Upload-only mode complete; the exercise catalog was not changed.");
    return;
  }

  await upsertSeedVocalExercises(exercises, {
    slug: COLLECTION_SLUG,
    title: "Recorded Warmups",
    description: "Recorded sing-along warmups",
    intendedSinger: "All voices",
    primaryGoals: ["Warm up", "Sing along"],
    restBetweenIterationsMeasures: 0,
    transposeMode: "recorded_audio",
  });

  const removed = await removeLegacyVocalExercises();
  console.log(`Recorded warmups are ready. Removed ${removed.exercises.length} legacy MIDI exercise(s) and ${removed.practiceSessionCount} associated practice session(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
