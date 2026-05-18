ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "segment_id" text REFERENCES "segments"("id") ON DELETE cascade;
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "audio_version" text NOT NULL DEFAULT 'straight';
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'practice';
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp;
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "auto_score_percent" integer;
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "self_rating" integer;
ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "score_details" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "tap_practice_taps" ADD COLUMN IF NOT EXISTS "direction" text;

CREATE INDEX IF NOT EXISTS "idx_tap_practice_sessions_user_song_segment_mode"
  ON "tap_practice_sessions" ("user_id", "song_id", "segment_id", "mode");
