CREATE TABLE IF NOT EXISTS "midi_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
  "original_filename" text NOT NULL,
  "storage_key" text NOT NULL,
  "uploaded_at" timestamp NOT NULL DEFAULT now(),
  "content_type" text,
  "file_size" integer NOT NULL DEFAULT 0,
  "parse_status" text NOT NULL DEFAULT 'parsed',
  "cleanup_settings" jsonb NOT NULL DEFAULT '{"shortNoteThresholdMs":0,"simultaneousThresholdMs":30}'::jsonb,
  "raw_notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cleaned_notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "raw_note_count" integer NOT NULL DEFAULT 0,
  "cleaned_note_count" integer NOT NULL DEFAULT 0,
  "ignored_short_note_count" integer NOT NULL DEFAULT 0,
  "parse_error" text
);

CREATE INDEX IF NOT EXISTS "idx_midi_sources_song_uploaded_at"
  ON "midi_sources" ("song_id", "uploaded_at");

CREATE TABLE IF NOT EXISTS "midi_alignments" (
  "id" text PRIMARY KEY NOT NULL,
  "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
  "midi_source_id" text NOT NULL REFERENCES "midi_sources"("id") ON DELETE cascade,
  "tapped_start_times_seconds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "retained_midi_note_count" integer NOT NULL DEFAULT 0,
  "is_complete" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'partial',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_midi_alignments_song_updated_at"
  ON "midi_alignments" ("song_id", "updated_at");

CREATE INDEX IF NOT EXISTS "idx_midi_alignments_source_updated_at"
  ON "midi_alignments" ("midi_source_id", "updated_at");
