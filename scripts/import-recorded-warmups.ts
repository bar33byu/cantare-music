import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { upsertSeedVocalExercises, type PersistedVocalExercise } from "../db/queries";
import { BUCKET, r2Client } from "../lib/r2";

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

  if (files.length === 0) throw new Error(`No MP3 files found in ${sourceDirectory}`);
  console.log(`Importing ${files.length} recorded warmups from ${sourceDirectory}`);

  const exercises: PersistedVocalExercise[] = [];
  for (const [index, filename] of files.entries()) {
    const bytes = await readFile(path.join(sourceDirectory, filename));
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const audioKey = `audio/warmups/recorded-2026/${String(index + 1).padStart(2, "0")}-${hash}.mp3`;
    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: audioKey,
      Body: bytes,
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { originalFilename: encodeURIComponent(filename) },
    }));
    console.log(`Uploaded ${filename} -> ${audioKey}`);
    exercises.push({
      id: `recorded-warmup-${String(index + 1).padStart(2, "0")}`,
      slug: `recorded-warmup-${String(index + 1).padStart(2, "0")}`,
      title: `Warmup ${index + 1}`,
      category: "Recorded",
      description: `Imported from ${filename}`,
      lyricHint: "",
      collectionSlug: COLLECTION_SLUG,
      collectionTitle: "Recorded Warmups",
      routinePosition: index,
      audioKey,
      sourceMidiFile: filename,
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

  console.log("Recorded warmups are ready. Legacy MIDI records were retained for practice-history integrity and are hidden by the recorded warmup player.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
