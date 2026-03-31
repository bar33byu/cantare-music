CREATE TABLE "playlist_songs" (
	"playlist_id" text NOT NULL,
	"song_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "playlist_songs_playlist_id_song_id_pk" PRIMARY KEY("playlist_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"event_date" text,
	"is_retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;