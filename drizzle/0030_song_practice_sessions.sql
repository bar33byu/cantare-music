CREATE TABLE IF NOT EXISTS "song_practice_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL DEFAULT 'default',
  "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE CASCADE,
  "segment_id" text REFERENCES "segments"("id") ON DELETE SET NULL,
  "source" text NOT NULL DEFAULT 'song',
  "started_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "duration_seconds" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_song_practice_sessions_user_started_at"
  ON "song_practice_sessions" ("user_id", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_song_practice_sessions_user_song_started_at"
  ON "song_practice_sessions" ("user_id", "song_id", "started_at");
