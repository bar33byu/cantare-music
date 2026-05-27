ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "share_audio_mode" text DEFAULT 'both' NOT NULL;
