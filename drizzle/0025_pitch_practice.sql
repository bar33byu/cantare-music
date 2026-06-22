ALTER TABLE "tap_practice_sessions"
  ADD COLUMN IF NOT EXISTS "input_method" text NOT NULL DEFAULT 'tap';
