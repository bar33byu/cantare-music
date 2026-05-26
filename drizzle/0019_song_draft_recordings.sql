CREATE TABLE IF NOT EXISTS "draft_recordings" (
  "id" text PRIMARY KEY NOT NULL,
  "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
  "title" text,
  "audio_key" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "trim_start_ms" integer,
  "trim_end_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "trim_start_ms" integer;
ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "trim_end_ms" integer;

CREATE INDEX IF NOT EXISTS "idx_draft_recordings_song_status_created_at"
  ON "draft_recordings" ("song_id", "status", "created_at");
