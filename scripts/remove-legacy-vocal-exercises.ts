import { inspectLegacyVocalExercises, removeLegacyVocalExercises } from "../db/vocalExerciseMaintenance";

async function main() {
  const execute = process.argv.includes("--execute");
  const report = execute ? await removeLegacyVocalExercises() : await inspectLegacyVocalExercises();
  console.log(`${execute ? "Removed" : "Found"} ${report.exercises.length} legacy MIDI exercise(s).`);
  console.log(`Associated practice sessions: ${report.practiceSessionCount}`);
  console.log(`Collection memberships: ${report.collectionMembershipCount}`);
  console.log(`Empty legacy collections: ${report.emptyCollectionCount}`);
  for (const exercise of report.exercises) console.log(`- ${exercise.id}: ${exercise.title}`);
  if (!execute && report.exercises.length > 0) console.log("Run again with --execute to permanently delete these records.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
