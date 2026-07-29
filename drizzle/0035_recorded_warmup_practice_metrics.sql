ALTER TABLE "vocal_exercise_practice_sessions" ADD COLUMN "audio_version" text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "vocal_exercise_practice_sessions" ADD COLUMN "practice_mode" text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "vocal_exercise_practice_sessions" ADD COLUMN "routine_id" text;
--> statement-breakpoint
ALTER TABLE "vocal_exercise_practice_sessions" ADD COLUMN "completion_status" text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "vocal_exercise_practice_sessions" ADD COLUMN "routine_completed" boolean NOT NULL DEFAULT false;
