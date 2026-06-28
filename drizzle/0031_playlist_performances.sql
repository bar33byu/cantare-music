ALTER TABLE "playlists"
  ADD COLUMN IF NOT EXISTS "performance_status" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'playlists_performance_status_check'
  ) THEN
    ALTER TABLE "playlists"
      ADD CONSTRAINT "playlists_performance_status_check"
      CHECK (
        "performance_status" IS NULL
        OR "performance_status" IN ('Performed', 'Absent', 'Sick', 'Canceled')
      );
  END IF;
END $$;
--> statement-breakpoint
WITH matches AS (
  SELECT
    "id",
    regexp_match("name", '\m(19\d{2}|20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\M') AS parts
  FROM "playlists"
  WHERE "event_date" IS NULL
)
UPDATE "playlists" AS p
SET "event_date" = to_char(to_date(matches.parts[1] || '-' || matches.parts[2] || '-' || matches.parts[3], 'YYYY-MM-DD'), 'YYYY-MM-DD')
FROM matches
WHERE p."id" = matches."id"
  AND matches.parts IS NOT NULL;
--> statement-breakpoint
WITH matches AS (
  SELECT
    "id",
    regexp_match("name", '\m(\d{1,2})[-/.](\d{1,2})[-/.](19\d{2}|20\d{2})\M') AS parts
  FROM "playlists"
  WHERE "event_date" IS NULL
)
UPDATE "playlists" AS p
SET "event_date" = to_char(to_date(matches.parts[3] || '-' || matches.parts[1] || '-' || matches.parts[2], 'YYYY-MM-DD'), 'YYYY-MM-DD')
FROM matches
WHERE p."id" = matches."id"
  AND matches.parts IS NOT NULL;
--> statement-breakpoint
WITH matches AS (
  SELECT
    "id",
    regexp_match("name", '\m(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(19\d{2}|20\d{2})\M', 'i') AS parts
  FROM "playlists"
  WHERE "event_date" IS NULL
)
UPDATE "playlists" AS p
SET "event_date" = to_char(make_date(
  matches.parts[3]::integer,
  CASE lower(matches.parts[1])
    WHEN 'jan' THEN 1 WHEN 'january' THEN 1
    WHEN 'feb' THEN 2 WHEN 'february' THEN 2
    WHEN 'mar' THEN 3 WHEN 'march' THEN 3
    WHEN 'apr' THEN 4 WHEN 'april' THEN 4
    WHEN 'may' THEN 5
    WHEN 'jun' THEN 6 WHEN 'june' THEN 6
    WHEN 'jul' THEN 7 WHEN 'july' THEN 7
    WHEN 'aug' THEN 8 WHEN 'august' THEN 8
    WHEN 'sep' THEN 9 WHEN 'sept' THEN 9 WHEN 'september' THEN 9
    WHEN 'oct' THEN 10 WHEN 'october' THEN 10
    WHEN 'nov' THEN 11 WHEN 'november' THEN 11
    WHEN 'dec' THEN 12 WHEN 'december' THEN 12
  END,
  matches.parts[2]::integer
), 'YYYY-MM-DD')
FROM matches
WHERE p."id" = matches."id"
  AND matches.parts IS NOT NULL;
--> statement-breakpoint
WITH matches AS (
  SELECT
    "id",
    regexp_match("name", '\m(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[,]?\s+(19\d{2}|20\d{2})\M', 'i') AS parts
  FROM "playlists"
  WHERE "event_date" IS NULL
)
UPDATE "playlists" AS p
SET "event_date" = to_char(make_date(
  matches.parts[3]::integer,
  CASE lower(matches.parts[2])
    WHEN 'jan' THEN 1 WHEN 'january' THEN 1
    WHEN 'feb' THEN 2 WHEN 'february' THEN 2
    WHEN 'mar' THEN 3 WHEN 'march' THEN 3
    WHEN 'apr' THEN 4 WHEN 'april' THEN 4
    WHEN 'may' THEN 5
    WHEN 'jun' THEN 6 WHEN 'june' THEN 6
    WHEN 'jul' THEN 7 WHEN 'july' THEN 7
    WHEN 'aug' THEN 8 WHEN 'august' THEN 8
    WHEN 'sep' THEN 9 WHEN 'sept' THEN 9 WHEN 'september' THEN 9
    WHEN 'oct' THEN 10 WHEN 'october' THEN 10
    WHEN 'nov' THEN 11 WHEN 'november' THEN 11
    WHEN 'dec' THEN 12 WHEN 'december' THEN 12
  END,
  matches.parts[1]::integer
), 'YYYY-MM-DD')
FROM matches
WHERE p."id" = matches."id"
  AND matches.parts IS NOT NULL;
