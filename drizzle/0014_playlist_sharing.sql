ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "share_token" text;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "shared_at" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "playlists_share_token_unique"
  ON "playlists" ("share_token")
  WHERE "share_token" IS NOT NULL;
