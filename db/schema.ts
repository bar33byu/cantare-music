import {
  pgTable,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm";

export const songs = pgTable("songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist"),
  audioKey: text("audio_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const segments = pgTable("segments", {
  id: text("id").primaryKey(),
  songId: text("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  order: integer("order").notNull(),
  startMs: integer("start_ms").notNull().default(0),
  endMs: integer("end_ms").notNull().default(0),
  lyricText: text("lyric_text").default(""),
});

export const practiceRatings = pgTable("practice_ratings", {
  id: text("id").primaryKey(),
  segmentId: text("segment_id")
    .notNull()
    .references(() => segments.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  ratedAt: timestamp("rated_at").notNull(),
});

export type SongRow = InferSelectModel<typeof songs>;
export type SegmentRow = InferSelectModel<typeof segments>;
export type PracticeRatingRow = InferSelectModel<typeof practiceRatings>;