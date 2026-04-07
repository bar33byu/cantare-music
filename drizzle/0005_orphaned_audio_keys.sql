CREATE TABLE IF NOT EXISTS "orphaned_audio_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"audio_key" text NOT NULL,
	"failed_at" timestamp DEFAULT now()
);