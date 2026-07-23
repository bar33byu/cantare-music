# Cantare Feature Roadmap

## Current Status

Cantare is now in the Version 3 line. Version 2 established the single-user practice foundation: segment practice, Part and Blend audio, playlists, Listen/Focus/Auto Drill modes, and MIDI-guided tap practice. Version 3 adds account-aware libraries, sharing, imports, and faster rehearsal-capture workflows.

The near-term priority is stabilization: keep the current workflows reliable on desktop and mobile, improve fit-and-finish, and avoid expanding into larger collaboration features until sharing and draft recordings feel solid.

## Version 2.0: Stable Tap Practice Foundation

- [x] Segment-based practice with 1-5 memory ratings
- [x] Knowledge score visualization across song segments
- [x] Segment editor active-user request context
- [x] Contour answer-key autosave with manual save fallback
- [x] Section-level and song-level contour tap clearing
- [x] Tap-practice persistence with buffered early taps
- [x] Card contour heat map refreshed from saved tap attempts
- [x] Tap-practice history reset when contour answer keys change
- [x] MIDI pitch practice with local microphone analysis and shared contour scoring

## Version 2.1: Two-Version Audio Support

- [x] Extend song schema to include `alternateAudioUrl`
- [x] Add upload and replacement flows for both audio versions
- [x] Rename practice-facing audio choices to Part and Blend
- [x] Add audio version toggle in song practice
- [x] Persist preferred audio version and use it across Songs, Focus, Auto Drill, and Listen modes when available
- [x] Fall back gracefully when a song only has one audio version
- [x] Show separate Part and Blend asset status in song and playlist cards

## Version 2.2: Playlist and Focus Practice

- [x] Add playlist creation and editing
- [x] Show playlist-level knowledge and asset summaries
- [x] Add Focus mode to drill individual playlist segments
- [x] Rank focus queue items weakest/unrated first across the playlist
- [x] Preserve song title, segment label, and local song position while drilling
- [x] Start queued segments with configurable pre-roll
- [x] Add segment-level sorting options
- [x] Simplify playlist detail headers and navigation

## Version 2.3: Hands-Free Auto-Practice Modes

- [x] Add Auto Drill mode to playlist practice
- [x] Keep hands-free segment transitions silent
- [x] Reduce header and toolbar chrome in auto mode
- [x] Auto-repeat segments based on rating
- [x] Use existing card arrows to move backward and forward in auto-drill
- [x] Reset loop counts when moving to a new card manually
- [x] Add Listen mode for sequential playlist playback
- [x] Keep Listen mode playback position when switching between Part and Blend audio

## Version 2.4: MIDI-Guided Tap Practice and Editing Polish

- [x] Replace legacy manual answer-key entry with MIDI-derived contour data
- [x] Upload MIDI files and derive contour taps from cleaned note onsets
- [x] Default MIDI short-note filtering to 0 ms
- [x] Store MIDI contour at the song level and project it into current segment boundaries
- [x] Support overlapping segments by including MIDI notes that overlap each segment window
- [x] Add fast MIDI alignment by first-note audio start offset
- [x] Add MIDI offset scrubber, preview, and nudge controls before applying alignment
- [x] Preserve full tap-by-note MIDI realignment for difficult imports
- [x] Hide Tap practice unless a MIDI contour is available
- [x] Persist recent tap attempts and use them to color contour heat-map trouble spots
- [x] Increase tap-practice attempt history cap beyond the initial three-attempt target
- [x] Make tap-practice exit clearer with an explicit Exit Tap state
- [x] Insert manual segment-editor sections at the current playhead
- [x] Improve bulk lyric import with blank-line default splitting, taller text area, and 300% default zoom
- [x] Add missing-asset library filters and clearer asset language such as MIDI contour
- [x] Move build/version details into settings on main-branch builds while keeping branch pills for active development builds

## Version 3.0: Accounts, Sharing, and Rehearsal Capture

- [x] Multi-user account model and profile management
- [x] Passwordless sign-in by six-digit email code or one-click link
- [x] Admin impersonation for support and troubleshooting
- [x] User-scoped songs, playlists, ratings, tap attempts, drafts, and settings
- [x] Playlist direct URL sharing
- [x] Public Shared tab for signed-in users
- [x] Cross-user playlist imports with source lineage
- [x] Independent Part, Blend, or Part and Blend audio settings for URL shares and Shared-tab publishing
- [x] Retiring a playlist removes it from sharing
- [x] Song-scoped Draft recording model
- [x] Audio-only in-app recording from a song page
- [x] Audio-only in-app recording from the library for fast unassigned capture
- [x] Unassigned draft review flow for associating a recording with a song
- [x] Draft Review screen with playback and Trim as the primary action
- [x] Non-destructive trim metadata with inline autosave feedback
- [x] Promote to song version using current trim metadata
- [x] Automatically archive promoted drafts per song
- [x] Per-song Archived Drafts collapsed below active draft recordings
- [x] Discard draft recordings without permanently deleting the source object immediately
- [x] Mobile-friendly recording status with visible input level

## Version 3.2: Practice and Setup Stabilization

- [x] Highlight the active MIDI contour note during playback
- [x] Recalculate segment MIDI contours automatically after section moves, resizes, creates, deletes, restores, and bulk imports
- [x] Refresh song practice data after section timing changes so playback highlighting uses the latest boundaries
- [x] Report how many current sections contain derived MIDI notes in MIDI setup
- [x] Distinguish synced MIDI start offsets from unapplied offset changes
- [x] Replace sticky MIDI success messages with temporary notices while preserving visible errors

## Deferred From Version 2

### Spaced Repetition Scheduling

This was previously listed as Version 2.5, but it remains deferred while Version 3 sharing and rehearsal capture stabilize.

- [ ] Add `lastReviewedAt` and `reviewIntervalDays` to segment schema
- [ ] Calculate review intervals from ratings
- [ ] Surface due segments in playlist practice
- [ ] Add Review Due sorting and filtering

## Future Version 3 Work

- [ ] Change from two audio files to using a shared blend file and then as many part-specific files as wanted, up to 8 parts to song. Make a user preference about which part file to use. Move all the existing "part" files to the "B1" part as a ont-time migration. There should be S1, S2, A1, A2, T1, T2, B1, B2 parts available. Users's will set a general preference for the part they want. We need a plan for falling back to the other part if the sopranos aren't divided, for example. 
- [ ] When a user is editing the lyric cards, they can "mute" a card because it represents words they don't sing. The card will display, but will not be rateable and will be slightly grayed out or marked as inactive during practice sessions. These segments would be skipped during hands free practice. 
- [ ] Collaborative challenges and games
- [ ] Expanded profiles and leaderboards
- [ ] Better media lifecycle tooling for old draft and orphaned audio objects
- [ ] More explicit browser/device guidance for mobile recording limitations
