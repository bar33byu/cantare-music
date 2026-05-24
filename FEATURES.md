# Cantare Feature Roadmap

## Version 2 Status

Version 2 is now in stabilization. The remaining work in this major version should be bug fixes, fit-and-finish, documentation, and small workflow improvements around the current single-user practice experience.

We are not planning a new Version 2.5 feature build right now. Once the current Version 2 feature set feels stable, we will close the books on v2 and start Version 3 with the larger multi-user and collaboration work.

## Version 2.0: Stable Tap Practice Foundation

- [x] Segment-based practice with 1-5 memory ratings
- [x] Knowledge score visualization across song segments
- [x] Segment editor active-user request context
- [x] Contour answer-key autosave with manual save fallback
- [x] Section-level and song-level contour tap clearing
- [x] Tap-practice persistence with buffered early taps
- [x] Card contour heat map refreshed from saved tap attempts
- [x] Tap-practice history reset when contour answer keys change

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
- [x] Implement voice prompts for segment transitions
- [x] Reduce header and toolbar chrome in auto mode
- [x] Auto-repeat segments based on rating
- [x] Use existing card arrows to move backward and forward in auto-drill
- [x] Reset loop counts when moving to a new card manually
- [x] Add Listen mode for sequential playlist playback

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

## Deferred From Version 2

### Spaced Repetition Scheduling

This was previously listed as Version 2.5, but we are not implementing it in the current v2 line.

- [ ] Add `lastReviewedAt` and `reviewIntervalDays` to segment schema
- [ ] Calculate review intervals from ratings
- [ ] Surface due segments in playlist practice
- [ ] Add Review Due sorting and filtering

## Version 3.0: Multi-User, Collaboration, and Sharing

- [ ] Multi-user account model and profile management
- [ ] User invitations
- [ ] Playlist sharing
- [ ] Cross-user playlist imports
- [ ] Shared practice sessions
- [ ] Collaborative challenges and games
- [ ] Expanded profiles and leaderboards
