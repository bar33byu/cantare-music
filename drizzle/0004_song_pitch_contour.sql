ALTER TABLE "segments"
ADD COLUMN "pitch_contour_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;