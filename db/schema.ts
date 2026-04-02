import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm";

export const songs = pgTable("songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist"),
  audioKey: text("audio_key"),
  createdAt: timestamp("created_at").defaultNow(),
  lastPracticedAt: timestamp("last_practiced_at"),
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

export const playlists = pgTable("playlists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  eventDate: text("event_date"),
  isRetired: boolean("is_retired").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.playlistId, table.songId] }),
  })
);

export type SongRow = InferSelectModel<typeof songs>;
export type SegmentRow = InferSelectModel<typeof segments>;
export type PracticeRatingRow = InferSelectModel<typeof practiceRatings>;
export type PlaylistRow = InferSelectModel<typeof playlists>;
export type PlaylistSongRow = InferSelectModel<typeof playlistSongs>;