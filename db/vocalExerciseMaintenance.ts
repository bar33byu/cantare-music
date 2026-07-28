import { eq, inArray, isNull } from "drizzle-orm";
import { db } from "./index";
import {
  vocalExerciseCollectionItems,
  vocalExerciseCollections,
  vocalExercisePracticeSessions,
  vocalExercises,
} from "./schema";

export interface LegacyVocalExerciseCleanupReport {
  exercises: Array<{ id: string; title: string }>;
  practiceSessionCount: number;
  collectionMembershipCount: number;
  emptyCollectionCount: number;
}

export async function inspectLegacyVocalExercises(): Promise<LegacyVocalExerciseCleanupReport> {
  const database = db();
  const exercises = await database
    .select({ id: vocalExercises.id, title: vocalExercises.title })
    .from(vocalExercises)
    .where(isNull(vocalExercises.audioKey));
  if (exercises.length === 0) {
    return { exercises: [], practiceSessionCount: 0, collectionMembershipCount: 0, emptyCollectionCount: 0 };
  }

  const ids = exercises.map((exercise) => exercise.id);
  const [sessions, memberships, collections, allMemberships] = await Promise.all([
    database.select({ id: vocalExercisePracticeSessions.id }).from(vocalExercisePracticeSessions).where(inArray(vocalExercisePracticeSessions.exerciseId, ids)),
    database.select({ exerciseId: vocalExerciseCollectionItems.exerciseId }).from(vocalExerciseCollectionItems).where(inArray(vocalExerciseCollectionItems.exerciseId, ids)),
    database.select({ slug: vocalExerciseCollections.slug }).from(vocalExerciseCollections),
    database.select({ collectionSlug: vocalExerciseCollectionItems.collectionSlug, exerciseId: vocalExerciseCollectionItems.exerciseId }).from(vocalExerciseCollectionItems),
  ]);
  const legacyIds = new Set(ids);
  const survivingMembershipSlugs = new Set(allMemberships
    .filter((membership) => !legacyIds.has(membership.exerciseId))
    .map((membership) => membership.collectionSlug));

  return {
    exercises,
    practiceSessionCount: sessions.length,
    collectionMembershipCount: memberships.length,
    emptyCollectionCount: collections.filter((collection) => !survivingMembershipSlugs.has(collection.slug)).length,
  };
}

export async function removeLegacyVocalExercises(): Promise<LegacyVocalExerciseCleanupReport> {
  const report = await inspectLegacyVocalExercises();
  if (report.exercises.length === 0) return report;
  const database = db();
  const ids = report.exercises.map((exercise) => exercise.id);

  await database.delete(vocalExercisePracticeSessions).where(inArray(vocalExercisePracticeSessions.exerciseId, ids));
  await database.delete(vocalExerciseCollectionItems).where(inArray(vocalExerciseCollectionItems.exerciseId, ids));
  await database.delete(vocalExercises).where(inArray(vocalExercises.id, ids));

  const [collections, memberships] = await Promise.all([
    database.select({ slug: vocalExerciseCollections.slug }).from(vocalExerciseCollections),
    database.select({ collectionSlug: vocalExerciseCollectionItems.collectionSlug }).from(vocalExerciseCollectionItems),
  ]);
  const usedSlugs = new Set(memberships.map((membership) => membership.collectionSlug));
  for (const collection of collections) {
    if (!usedSlugs.has(collection.slug)) {
      await database.delete(vocalExerciseCollections).where(eq(vocalExerciseCollections.slug, collection.slug));
    }
  }
  return report;
}
