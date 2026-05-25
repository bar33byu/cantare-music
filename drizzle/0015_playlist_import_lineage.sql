ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "source_playlist_id" text;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "source_owner_id" text;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "source_share_token" text;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_playlists_user_source_playlist"
  ON "playlists" ("user_id", "source_playlist_id");
