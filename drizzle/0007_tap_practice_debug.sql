CREATE TABLE IF NOT EXISTS "tap_practice_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL DEFAULT 'default',
  "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
  "started_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tap_practice_taps" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "tap_practice_sessions"("id") ON DELETE cascade,
  "segment_id" text NOT NULL REFERENCES "segments"("id") ON DELETE cascade,
  "note_id" text NOT NULL,
  "time_offset_ms" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "lane_milli" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_tap_practice_sessions_user_started_at"
  ON "tap_practice_sessions" ("user_id", "started_at");

CREATE INDEX IF NOT EXISTS "idx_tap_practice_sessions_user_song_started_at"
  ON "tap_practice_sessions" ("user_id", "song_id", "started_at");

CREATE INDEX IF NOT EXISTS "idx_tap_practice_taps_session_created_at"
  ON "tap_practice_taps" ("session_id", "created_at");
