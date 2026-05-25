ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "published_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_playlists_public_published_at"
  ON "playlists" ("is_public", "published_at");
