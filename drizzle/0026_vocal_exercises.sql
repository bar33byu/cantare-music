CREATE TABLE IF NOT EXISTS "vocal_exercises" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "source_midi_file" text NOT NULL,
  "exercise_start_beat_milli" integer NOT NULL DEFAULT 0,
  "tempo_bpm_milli" integer NOT NULL DEFAULT 120000,
  "time_signature_numerator" integer NOT NULL DEFAULT 4,
  "time_signature_denominator" integer NOT NULL DEFAULT 4,
  "duration_beats_milli" integer NOT NULL,
  "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vocal_exercises_title" ON "vocal_exercises" ("title");

CREATE TABLE IF NOT EXISTS "user_vocal_ranges" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "low_midi" integer NOT NULL,
  "high_midi" integer NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
