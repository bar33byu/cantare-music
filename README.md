# Cantare

Cantare 2.4 is a practice application for singers to learn and master songs through deliberate, segment-based repetition, two-version audio playback, MIDI-guided melodic contour training, playlist practice modes, and lightweight tap-practice feedback.

> **Credits:** Cantare is a clone built to replicate the core functionality of [Musicators.com](https://www.musicators.com). All credit for the original concept and feature design goes to the Musicators team.

## What It Does

Cantare lets you upload songs, divide them into labeled segments, add lyrics, and practice those segments with focused repetition. After each playback you rate your recall from 1-5. The app tracks those ratings and shows a knowledge score so you can see which songs and segments are solid and which still need attention.

**Current features:**

- **Song library** - upload songs, edit titles, browse your catalog, and filter for missing song assets such as audio, sections, or MIDI contour data.
- **Two-version audio** - store separate Part and Blend recordings, see which versions are present, choose a preferred version, and switch gracefully when a song only has one file.
- **Visual segment editor** - create, move, resize, overlap, and label sections on a timeline; manual new sections insert at the current playhead.
- **Bulk lyric import** - paste lyrics into a larger bulk editor, split sections by blank lines by default, keep custom delimiters available, and start the workflow at 300% zoom.
- **MIDI-guided contour setup** - upload MIDI files, filter short notes, align by start offset with a scrubber/preview, or fall back to full tap-by-note realignment.
- **Segment-aware MIDI contour** - MIDI notes are stored at the song level and projected into any segment window they overlap, so contours follow later boundary edits and overlapping sections.
- **Practice view** - practice one segment at a time with lyric visibility controls, segment navigation, ratings, knowledge tracking, and compact mobile-friendly controls.
- **Tap practice** - tap along only when a MIDI contour is available, compare attempts against the MIDI-derived up/down/same key, and persist recent attempts.
- **Contour heat map** - color the card contour from recent tap misses so trouble spots become visible immediately and improve as more attempts are saved.
- **Playlist practice** - group songs into rehearsal playlists with aggregate stats, asset summaries, Focus, Auto Drill, Listen, and standard Songs modes.
- **Auto Drill** - automatically loop segments based on ratings, allow forward/back navigation with the card arrows, and keep the auto-drill header compact.
- **Listen mode** - play playlist songs sequentially without the practice-card workflow.
- **Offline-tolerant ratings and tap persistence** - buffer early taps and queue rating updates where possible so practice interactions are not easily lost.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) + React 19 |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL via Neon serverless + Drizzle ORM |
| Audio storage | S3-compatible object storage (presigned upload/download URLs) |
| Testing | Vitest + Testing Library |

## Getting Started

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
R2_PUBLIC_URL=         # Required: public base URL for audio CDN delivery
```

Notes:

- `R2_PUBLIC_URL` is required. Audio is served directly from R2's CDN to the browser.
- If `R2_ENDPOINT` is blank and `R2_ACCOUNT_ID` is set, the app derives the standard Cloudflare R2 endpoint automatically.
- Part and Blend audio versions are both stored as R2 objects and exposed to the browser as direct public R2 URLs.

Run database migrations before first use:

```bash
npm run db:migrate
```

## Running Tests

```bash
npm test
```

## Workflow Notes

- Segment ordering is inferred from timeline placement and normalized by `startMs`, then `endMs`, then `id`.
- Segment editor playback uses the configured public R2 URL directly; there is no server-side audio proxy fallback.
- Replacing audio from the editor can target either the Part or Blend version while preserving existing segment timings and lyrics.
- MIDI contour data is song-level; segment-level contours are derived from the current segment boundaries.
- Tap practice depends on a MIDI contour. Songs without MIDI contour data do not show the Tap button.
- Tap heat-map data is refreshed after successful tap persistence so practice feedback stays current.
