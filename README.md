# Cantare v1.1.0

A practice application for singers to learn and master songs through deliberate, segment-based repetition.

> **Credits:** Cantare is a clone built to replicate the core functionality of [Musicators.com](https://www.musicators.com). All credit for the original concept and feature design goes to the Musicators team.

## What it does

Cantare lets you upload songs, divide them into labeled segments (verses, choruses, bridges, etc.), and practice those segments one at a time. After each playback you rate your recall from 1–5. The app tracks your ratings over time and surfaces a **knowledge score** so you can see at a glance how well you know each song and which segments still need work.

**Core features:**

- **Song library** — upload audio files, add titles and artist info, and browse your collection
- **Segment editor** — a visual timeline interface for slicing a song into segments, setting start/end times by dragging, and attaching lyrics to each segment
- **Practice view** — plays each segment in sequence (with a configurable pre-roll), shows or hides lyrics, and lets you rate your memory after each repetition
- **Knowledge bar** — color-coded mastery visualization across all segments of a song
- **Playlists** — group songs together for a rehearsal or event, with aggregate knowledge scores across the whole playlist
- **Multi-user support** — multiple user profiles share the same instance, each with fully isolated songs, playlists, and ratings

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

```
DATABASE_URL=          # Neon (or other) PostgreSQL connection string
R2_ACCOUNT_ID=         # S3-compatible storage account
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=         # Public base URL for audio delivery
```

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
