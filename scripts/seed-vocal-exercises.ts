import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { upsertSeedVocalExercises } from "../db/queries";
import { parseVocalExerciseSeedBundle } from "../app/lib/vocalExerciseSeed";
import { alignContextToMetronome } from "../app/lib/vocalExercise";

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("Usage: seed-vocal-exercises <path-to-seed.json>");
  const absolutePath = resolve(sourcePath);
  const source = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
  const { exercises, collection } = parseVocalExerciseSeedBundle(source);
  const saved = await upsertSeedVocalExercises(exercises.map(alignContextToMetronome), collection);
  process.stdout.write(`Seeded ${saved.length} vocal exercises: ${saved.map((exercise) => exercise.slug).join(", ")}\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
