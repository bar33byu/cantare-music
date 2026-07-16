ALTER TABLE "playlists"
  DROP CONSTRAINT IF EXISTS "playlists_performance_status_check";
--> statement-breakpoint
ALTER TABLE "playlists"
  ADD CONSTRAINT "playlists_performance_status_check"
  CHECK (
    "performance_status" IS NULL
    OR "performance_status" IN ('Performed', 'Recorded', 'Absent', 'Sick', 'Canceled')
  );
