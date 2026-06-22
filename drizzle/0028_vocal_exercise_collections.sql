ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "difficulty" text;
ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "pattern" text;
ALTER TABLE "vocal_exercises" ADD COLUMN IF NOT EXISTS "coaching_notes" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "vocal_exercise_collections" (
  "slug" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "intended_singer" text,
  "primary_goals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rest_between_iterations_measures" integer NOT NULL DEFAULT 0,
  "transpose_mode" text NOT NULL DEFAULT 'semitone_all_notes',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "vocal_exercise_collection_items" (
  "collection_slug" text NOT NULL REFERENCES "vocal_exercise_collections"("slug") ON DELETE CASCADE,
  "exercise_id" text NOT NULL REFERENCES "vocal_exercises"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  CONSTRAINT "vocal_exercise_collection_items_collection_slug_exercise_id_pk" PRIMARY KEY("collection_slug", "exercise_id")
);

CREATE INDEX IF NOT EXISTS "idx_vocal_exercise_collection_position"
  ON "vocal_exercise_collection_items" ("collection_slug", "position");
