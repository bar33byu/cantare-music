ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "user_id" text DEFAULT 'default' NOT NULL;

ALTER TABLE "draft_recordings" ALTER COLUMN "song_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_draft_recordings_user_status_created_at"
  ON "draft_recordings" ("user_id", "status", "created_at");
