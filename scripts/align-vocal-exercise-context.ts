import { getVocalExercises, updateVocalExercise } from "../db/queries";
import { alignContextToMetronome } from "../app/lib/vocalExercise";

async function main() {
  const exercises = await getVocalExercises();
  const aligned = exercises.map(alignContextToMetronome);
  const saved = await Promise.all(aligned.map(updateVocalExercise));
  process.stdout.write(`Aligned context for ${saved.filter(Boolean).length} vocal exercises.\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
