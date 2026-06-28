import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { upsertSeedVocalExercises } from "../db/queries";
import { parseVocalExerciseSeedBundle } from "../app/lib/vocalExerciseSeed";
import { alignContextToMetronome } from "../app/lib/vocalExercise";

const DEFAULT_SEED_PATHS = [
  "app/data/baritone-passaggio-warmups.seed.json",
  "app/data/legacy-vocal-exercises.seed.json",
];

async function main() {
  const sourcePaths = process.argv.slice(2);
  const paths = sourcePaths.length > 0 ? sourcePaths : DEFAULT_SEED_PATHS;
  for (const sourcePath of paths) {
    const absolutePath = resolve(sourcePath);
    const source = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
    const { exercises, collection } = parseVocalExerciseSeedBundle(source);
    const saved = await upsertSeedVocalExercises(exercises.map(alignContextToMetronome), collection);
    process.stdout.write(`Seeded ${saved.length} vocal exercises from ${sourcePath}: ${saved.map((exercise) => exercise.slug).join(", ")}\n`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
