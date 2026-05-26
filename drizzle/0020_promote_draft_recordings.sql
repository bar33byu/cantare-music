ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "audio_trim_start_ms" integer;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "audio_trim_end_ms" integer;

ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
