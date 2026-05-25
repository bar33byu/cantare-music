ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "source_song_id" text;
ALTER TABLE "segments" ADD COLUMN IF NOT EXISTS "source_segment_id" text;
ALTER TABLE "practice_ratings" ADD COLUMN IF NOT EXISTS "user_id" text;

UPDATE "songs"
SET "source_song_id" = "id"
WHERE "source_song_id" IS NULL;

UPDATE "segments"
SET "source_segment_id" = "id"
WHERE "source_segment_id" IS NULL;

UPDATE "practice_ratings" AS rating
SET "user_id" = song."user_id"
FROM "segments" AS segment
JOIN "songs" AS song ON song."id" = segment."song_id"
WHERE rating."segment_id" = segment."id"
  AND rating."user_id" IS NULL;

UPDATE "practice_ratings"
SET "user_id" = 'default'
WHERE "user_id" IS NULL;

WITH imported_song_sources AS (
  SELECT
    imported_song."id" AS imported_song_id,
    COALESCE(source_song."source_song_id", source_song."id") AS source_song_id
  FROM "playlists" AS imported_playlist
  JOIN "playlist_songs" AS imported_playlist_song
    ON imported_playlist_song."playlist_id" = imported_playlist."id"
  JOIN "playlist_songs" AS source_playlist_song
    ON source_playlist_song."playlist_id" = imported_playlist."source_playlist_id"
   AND source_playlist_song."position" = imported_playlist_song."position"
  JOIN "songs" AS imported_song
    ON imported_song."id" = imported_playlist_song."song_id"
  JOIN "songs" AS source_song
    ON source_song."id" = source_playlist_song."song_id"
  WHERE imported_playlist."source_playlist_id" IS NOT NULL
)
UPDATE "songs" AS song
SET "source_song_id" = imported_song_sources."source_song_id"
FROM imported_song_sources
WHERE song."id" = imported_song_sources."imported_song_id";

WITH imported_segment_sources AS (
  SELECT
    imported_segment."id" AS imported_segment_id,
    COALESCE(source_segment."source_segment_id", source_segment."id") AS source_segment_id
  FROM "songs" AS imported_song
  JOIN "segments" AS imported_segment
    ON imported_segment."song_id" = imported_song."id"
  JOIN "segments" AS source_segment
    ON source_segment."song_id" = imported_song."source_song_id"
   AND source_segment."order" = imported_segment."order"
  WHERE imported_song."source_song_id" IS NOT NULL
    AND imported_song."source_song_id" <> imported_song."id"
)
UPDATE "segments" AS segment
SET "source_segment_id" = imported_segment_sources."source_segment_id"
FROM imported_segment_sources
WHERE segment."id" = imported_segment_sources."imported_segment_id";

ALTER TABLE "practice_ratings" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "practice_ratings" ALTER COLUMN "user_id" SET DEFAULT 'default';

CREATE INDEX IF NOT EXISTS "idx_songs_source_song_id" ON "songs" ("source_song_id");
CREATE INDEX IF NOT EXISTS "idx_segments_source_segment_id" ON "segments" ("source_segment_id");
CREATE INDEX IF NOT EXISTS "idx_practice_ratings_user_segment_rated_at"
  ON "practice_ratings" ("user_id", "segment_id", "rated_at");
