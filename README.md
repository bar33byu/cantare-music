# Cantare

A practice application for singers to learn and master songs through deliberate, segment-based repetition.

> **Credits:** Cantare is a clone built to replicate the core functionality of [Musicators.com](https://www.musicators.com). All credit for the original concept and feature design goes to the Musicators team.

## What it does

Cantare lets you upload songs, divide them into labeled segments (verses, choruses, bridges, etc.), and practice those segments one at a time. After each playback you rate your recall from 1-5. The app tracks your ratings over time and surfaces a **knowledge score** so you can see at a glance how well you know each song and which segments still need work.

**Core features:**

- **Song library** - upload audio files, add titles and artist info, and browse your collection
- **Segment editor** - a visual timeline interface for slicing a song into segments, setting start/end times by dragging, attaching lyrics, and recording contour answer keys
- **Practice view** - plays each segment in sequence with configurable pre-roll, shows or hides lyrics, and lets you rate your memory after each repetition
- **Tap practice** - tap melodic contour attempts during practice and compare them against saved answer keys
- **Contour review heat map** - the card contour can color recent trouble spots so repeated misses stand out visually
- **Tap debug tools** - inspect persisted tap sessions and review contour-matching diagnostics
- **Knowledge bar** - color-coded mastery visualization across all segments of a song
- **Playlists** - group songs together for a rehearsal or event, with aggregate knowledge scores across the whole playlist
- **Listen mode** - play entire playlists sequentially without the practice interface
- **Multi-user support** - multiple user profiles share the same instance, each with fully isolated songs, playlists, and ratings

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) + React 19 |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL via Neon serverless + Drizzle ORM |
| Audio storage | S3-compatible object storage (presigned upload/download URLs) |
| Testing | Vitest + Testing Library |

## Getting started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

You'll need the following environment variables set:

```env
DATABASE_URL=          # Neon (or other) PostgreSQL connection string
R2_ACCOUNT_ID=         # Cloudflare R2 account id; used to derive the endpoint when R2_ENDPOINT is blank
R2_ENDPOINT=           # Optional explicit S3-compatible endpoint override
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=        # Preferred bucket variable name
R2_BUCKET=             # Legacy fallback bucket variable name
R2_PUBLIC_URL=         # Optional public base URL for audio delivery
```

Notes:

- If `R2_PUBLIC_URL` is omitted, browser playback falls back to the same-origin audio proxy route.
- If `R2_ENDPOINT` is blank and `R2_ACCOUNT_ID` is set, the app derives the standard Cloudflare R2 endpoint automatically.

Run database migrations before first use:

```bash
npm run db:migrate
```

## Running tests

```bash
npm test
```

## Segment editor notes

- Segment ordering is inferred from timeline placement. The backend normalizes order by `startMs`, then `endMs`, then `id` for deterministic ties.
- The segment form no longer accepts manual sequence input. Users edit label, timeline boundaries, and lyrics only.
- New segment defaults use timeline-aware placement:
  - Base start is 500 ms after the latest visible segment end
  - Base duration is 20 seconds
  - While playback is active in the editor, start is anchored to `max(currentPlaybackMs, latestEnd + 500ms)`
- Updating `startMs` or `endMs` re-normalizes ordering server-side to keep timeline position and sequence consistent.
- If playback falls back from a public audio URL to the proxied source, pending play requests resume automatically once the fallback source is ready.

## Tap practice notes

- Tap practice creates a per-song tap session and persists taps in the background while you practice.
- If you tap immediately after enabling tap practice, early taps are buffered until the session exists instead of being dropped.
- Starting playback in tap practice adds a two-second visual count-in so you have time to move from the play button to the tap bar.
- Replaying from the beginning or seeking back to the active segment start resets the current tap run so old dots do not pollute a new attempt.
- Contour scoring is time-anchored to the whole segment first and then checked for `up` / `down` / `same`, which keeps later taps aligned to the part of the music you actually attempted.
- The card contour can color each note by recent miss rate, using saved tap sessions as a lightweight practice heat map.
