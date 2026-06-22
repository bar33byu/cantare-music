ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "syllable" text;
ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "description" text;

CREATE UNIQUE INDEX IF NOT EXISTS "vocal_exercises_slug_unique"
  ON "vocal_exercises" ("slug")
  WHERE "slug" IS NOT NULL;
