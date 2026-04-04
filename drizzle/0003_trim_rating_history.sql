WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY segment_id
      ORDER BY rated_at DESC, id DESC
    ) AS row_num
  FROM practice_ratings
),
to_delete AS (
  SELECT id
  FROM ranked
  WHERE row_num > 1
)
DELETE FROM practice_ratings
WHERE id IN (SELECT id FROM to_delete);