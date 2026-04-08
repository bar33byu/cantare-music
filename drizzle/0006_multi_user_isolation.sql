CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

INSERT INTO "users" ("id", "name")
VALUES ('default', 'Default User')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "user_id" text;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "user_id" text;
ALTER TABLE "orphaned_audio_keys" ADD COLUMN IF NOT EXISTS "user_id" text;

UPDATE "songs" SET "user_id" = 'default' WHERE "user_id" IS NULL;
UPDATE "playlists" SET "user_id" = 'default' WHERE "user_id" IS NULL;
UPDATE "orphaned_audio_keys" SET "user_id" = 'default' WHERE "user_id" IS NULL;

ALTER TABLE "songs" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "playlists" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "orphaned_audio_keys" ALTER COLUMN "user_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_songs_user_id" ON "songs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_songs_user_created_at" ON "songs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_playlists_user_id" ON "playlists" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_playlists_user_created_at" ON "playlists" ("user_id", "created_at");
