ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "last_source_sync_checked_at" timestamp;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "last_source_synced_at" timestamp;
