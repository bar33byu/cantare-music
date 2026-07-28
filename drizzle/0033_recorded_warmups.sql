ALTER TABLE "vocal_exercises" ADD COLUMN "audio_key" text;
--> statement-breakpoint
ALTER TABLE "vocal_exercises" ADD COLUMN "lyric_hint" text DEFAULT '' NOT NULL;
