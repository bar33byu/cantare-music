ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "share_token" text;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "shared_at" timestamp;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "share_audio_mode" text DEFAULT 'both' NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "songs_share_token_unique"
  ON "songs" ("share_token")
  WHERE "share_token" IS NOT NULL;
