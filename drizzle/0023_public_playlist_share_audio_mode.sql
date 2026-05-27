ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "public_share_audio_mode" text DEFAULT 'both' NOT NULL;

UPDATE "playlists"
SET "public_share_audio_mode" = "share_audio_mode"
WHERE "is_public" = true;
