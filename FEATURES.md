# Cantare Feature Roadmap

## Version 2.0: Stable Tap Practice and Multi-User Release
- [x] Multi-user song, playlist, rating, segment, contour, and tap-practice isolation
- [x] Segment editor active-user request context
- [x] Contour answer-key autosave with manual save fallback
- [x] Section-level and song-level contour tap clearing
- [x] Tap-practice persistence with buffered early taps
- [x] Card contour heat map refreshed from saved tap attempts
- [x] Tap-practice history reset when contour answer keys change

## Version 2.x (Post-Stable Tap Practice)

### 2.1: Two-Version Audio Support
- [x] Extend song schema to include `alternateAudioUrl` field
- [x] Update song upload form to allow second audio file
- [x] Add audio version toggle in PracticeView (prominent/blend)
- [x] Ensure direct R2 audio URLs work for both versions
- [x] Test playback switching without interruption
- [x] Show separate Prominent and Blend upload/replace sections with populated/missing status

### 2.2: Context-Aware Segment Focus Queue
- [x] Add "Focus Queue" mode to PlaylistPracticeView for drilling individual playlist segments
- [x] Rank queue items weakest/unrated first across the playlist, while keeping song title, segment label, and local song position visible
- [x] Start each queued segment with configurable pre-roll so similar repeats (e.g. multiple choruses) retain musical context
- [x] Add auto-advance after segment rating, preserving enough transition context before the next segment starts
- [x] Add segment-level sorting options (oldest reviewed, mastery, song order)

### 2.3: Hands-Free Auto-Practice Modes
- [x] Add "Auto Drill" mode to playlist practice
- [x] Implement voice prompts for segment transitions
- [x] Reduce UI controls in auto mode (single play/pause)
- [x] Add auto-repeat for low-rated segments
- [x] Ensure accessibility with screen readers

### 2.4: Enhanced Tap Practice
- [ ] Allow tap practice on blend/straight audio versions
- [ ] Add self-scoring mode for tap attempts without answer keys
- [ ] Show tap accuracy comparison between versions
- [ ] Improve tap persistence for hands-free sessions
- [ ] Add tap heat map for blend version practice

### 2.5: Spaced Repetition Scheduling
- [ ] Add `lastReviewedAt` and `reviewIntervalDays` to segment schema
- [ ] Implement review interval calculation based on ratings (e.g., 1 day for low, 7 for high)
- [ ] Surface "due segments" in playlist practice queue
- [ ] Add "Review Due" filter to playlist sorting
- [ ] Integrate with existing rating system for automatic updates

## Version 3.0: Collaboration and Sharing
- [ ] User invitations and playlist sharing
- [ ] Collaborative challenges and games
- [ ] Shared practice sessions
- [ ] Expanded user profiles and leaderboards
- [ ] Cross-user playlist imports
