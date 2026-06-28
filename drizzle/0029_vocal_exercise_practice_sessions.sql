CREATE TABLE IF NOT EXISTS "vocal_exercise_practice_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL DEFAULT 'default',
  "exercise_id" text NOT NULL REFERENCES "vocal_exercises"("id") ON DELETE CASCADE,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "duration_seconds" integer NOT NULL DEFAULT 0,
  "tempo_percent" integer NOT NULL DEFAULT 100,
  "repetition_count" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vocal_exercise_practice_user_started_at"
  ON "vocal_exercise_practice_sessions" ("user_id", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vocal_exercise_practice_user_exercise_started_at"
  ON "vocal_exercise_practice_sessions" ("user_id", "exercise_id", "started_at");
