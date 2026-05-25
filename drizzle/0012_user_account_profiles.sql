ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_visibility" text DEFAULT 'private';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

WITH normalized AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9_-]+', '-', 'g')),
        ''
      ),
      'user'
    ) AS base_username
  FROM "users"
),
deduped AS (
  SELECT
    "id",
    CASE
      WHEN row_number() OVER (PARTITION BY base_username ORDER BY "id") = 1 THEN base_username
      ELSE base_username || '-' || row_number() OVER (PARTITION BY base_username ORDER BY "id")
    END AS username
  FROM normalized
)
UPDATE "users"
SET "username" = deduped.username
FROM deduped
WHERE "users"."id" = deduped."id"
  AND ("users"."username" IS NULL OR "users"."username" = '');

UPDATE "users" SET "email" = '' WHERE "email" IS NULL;
UPDATE "users" SET "profile_visibility" = 'private' WHERE "profile_visibility" IS NULL;
UPDATE "users" SET "updated_at" = COALESCE("updated_at", now());

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "profile_visibility" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique"
  ON "users" ("username")
  WHERE "username" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique"
  ON "users" ("email")
  WHERE "email" IS NOT NULL AND "email" <> '';
