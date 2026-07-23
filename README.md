# Cantare

Cantare 3.0 is a practice application for singers to learn and master songs through deliberate, segment-based repetition, two-version audio playback, MIDI-guided melodic contour training, playlist practice modes, draft rehearsal recordings, and playlist sharing.

> **Credits:** Cantare is a clone built to replicate the core functionality of Musicators Digital Memorization (https://musicators.com/memory). All credit for the original concept and feature design goes to the Musicators team.

## What It Does

Cantare lets you upload songs, divide them into labeled segments, add lyrics, and practice those segments with focused repetition. After each playback you rate your recall from 1-5. The app tracks those ratings and shows a knowledge score so you can see which songs and segments are solid and which still need attention.

**Current features:**

- **Song library** - upload songs, edit titles, browse your catalog, and filter for missing song assets such as audio, sections, or MIDI contour data.
- **Real deletion controls** - delete songs from the library with storage cleanup, and schedule full account deletion with a 30-day warning window before permanent purge.
- **Two-version audio** - store separate Part and Blend recordings, see which versions are present, choose a preferred version, and switch gracefully when a song only has one file.
- **Draft recordings** - capture audio-only rehearsal takes from the library or a song page, review them later, trim non-destructively, promote a draft to the song's audio version, archive promoted drafts, or discard drafts without deleting source files immediately.
- **Visual segment editor** - create, move, resize, overlap, and label sections on a timeline; manual new sections insert at the current playhead.
- **Bulk lyric import** - paste lyrics into a larger bulk editor, split sections by blank lines by default, keep custom delimiters available, and start the workflow at 300% zoom.
- **MIDI-guided contour setup** - upload MIDI files, filter short notes, align by start offset with a scrubber/preview, and see whether the offset is synced or has unapplied changes.
- **Segment-aware MIDI contour** - MIDI notes are stored at the song level and projected into any segment window they overlap. Contours recalculate after section timing changes, including moves, resizes, creates, deletes, restores, and bulk imports.
- **Visible MIDI sync status** - the setup panel reports whether the derived contour is ready and how many current sections contain MIDI notes, while temporary success notices clear automatically.
- **Practice view** - practice one segment at a time with lyric visibility controls, segment navigation, ratings, knowledge tracking, and compact mobile-friendly controls.
- **Tap practice** - tap along only when a MIDI contour is available, compare attempts against the MIDI-derived up/down/same key, and persist recent attempts.
- **Pitch practice** - sing along through the microphone when aligned MIDI is available, receive exact-octave pitch feedback, and feed attempted-note results into the same contour history as Tap practice without recording audio.
- **Contour heat map** - color the card contour from recent tap misses so trouble spots become visible immediately and improve as more attempts are saved.
- **Playlist practice** - group songs into rehearsal playlists with aggregate stats, asset summaries, Focus, Auto Drill, Listen, and standard Songs modes.
- **Auto Drill** - automatically loop segments based on ratings, allow forward/back navigation with the card arrows, and keep the auto-drill header compact.
- **Listen mode** - play playlist songs sequentially without the practice-card workflow, including smooth Part/Blend switching during playback.
- **Playlist sharing** - publish playlists to the Shared tab or create direct share links, with independent Part, Blend, or Part and Blend audio settings for each sharing mechanism.
- **Playlist imports** - copy shared playlists into a singer's own library while preserving source lineage and applying the selected shared audio scope.
- **Passwordless accounts and impersonation support** - sign in with a six-digit email code or one-click link, isolate user libraries, and allow admins to troubleshoot as another user.
- **Offline-tolerant ratings and tap persistence** - buffer early taps and queue rating updates where possible so practice interactions are not easily lost.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) + React 19 |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL via Neon serverless + Drizzle ORM |
| Audio storage | S3-compatible object storage (presigned upload/download URLs) |
| Auth | Passwordless six-digit email codes and one-click links with hashed tokens |
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
CANTARE_AUTH_SECRET=   # Long random secret used to hash magic-link and session tokens
CANTARE_APP_URL=       # Public app URL used in magic-link emails
RESEND_API_KEY=        # Resend API key for passwordless email login
RESEND_FROM_EMAIL=     # Verified Resend sender, e.g. Cantare <login@example.com>
CANTARE_ADMIN_EMAILS=  # Comma- or newline-separated admin email allowlist
CANTARE_ACCOUNT_DELETION_CRON_SECRET=  # Optional bearer token for the scheduled account-deletion purge endpoint
```

Notes:

- `R2_PUBLIC_URL` is required. Audio is served directly from R2's CDN to the browser.
- If `R2_ENDPOINT` is blank and `R2_ACCOUNT_ID` is set, the app derives the standard Cloudflare R2 endpoint automatically.
- Part and Blend audio versions are both stored as R2 objects and exposed to the browser as direct public R2 URLs.
- Draft recordings are stored as audio objects and remain editable through metadata until promoted.
- Email login codes and one-click links expire after 15 minutes and share the same one-time credential. Codes are bound to the recipient email, and repeated incorrect attempts are temporarily throttled. Sessions persist for 90 days or until sign-out.
- Scheduled account deletions are marked immediately, remain cancelable for 30 days, and can be purged by calling `POST /api/admin/account-deletions/purge` with an admin session or `Authorization: Bearer $CANTARE_ACCOUNT_DELETION_CRON_SECRET`.

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
- Draft recording trims are metadata-only until promotion; source draft audio is not rewritten by the trim UI.
- Playlist URL sharing and public Shared-tab publishing have separate audio-mode settings.
- MIDI contour data is song-level; segment-level contours are derived from the current section boundaries and refreshed automatically after timing changes.
- MIDI setup distinguishes a synced start offset from an unapplied draft and reports how many sections currently contain derived MIDI notes.
- Tap practice depends on a MIDI contour. Songs without MIDI contour data do not show the Tap button.
- Tap heat-map data is refreshed after successful tap persistence so practice feedback stays current.
