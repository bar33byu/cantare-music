# Cantare Feature Roadmap

## Version 2.x (Post-Stable Tap Practice)

### 2.1: Two-Version Audio Support
- [ ] Extend song schema to include `alternateAudioUrl` field
- [ ] Update song upload form to allow second audio file
- [ ] Add audio version toggle in PracticeView (prominent/blend)
- [ ] Ensure proxy audio URLs work for both versions
- [ ] Test playback switching without interruption

### 2.2: Segment-Focused Playlist Practice
- [ ] Add "Focus Queue" mode to PlaylistPracticeView
- [ ] Implement segment selection logic (weakest first across playlist)
- [ ] Add auto-advance after segment rating
- [ ] Update playlist knowledge score to include segment-level data
- [ ] Add segment-level sorting options (due date, mastery)

### 2.3: Spaced Repetition Scheduling
- [ ] Add `lastReviewedAt` and `reviewIntervalDays` to segment schema
- [ ] Implement review interval calculation based on ratings (e.g., 1 day for low, 7 for high)
- [ ] Surface "due segments" in playlist practice queue
- [ ] Add "Review Due" filter to playlist sorting
- [ ] Integrate with existing rating system for automatic updates

### 2.4: Enhanced Tap Practice
- [ ] Allow tap practice on blend/straight audio versions
- [ ] Add self-scoring mode for tap attempts without answer keys
- [ ] Show tap accuracy comparison between versions
- [ ] Improve tap persistence for hands-free sessions
- [ ] Add tap heat map for blend version practice

### 2.5: Hands-Free Auto-Practice Modes
- [ ] Add "Auto Drill" mode to playlist practice
- [ ] Implement voice prompts for segment transitions
- [ ] Reduce UI controls in auto mode (single play/pause)
- [ ] Add auto-repeat for low-rated segments
- [ ] Ensure accessibility with screen readers

## Version 3.0: Multi-User Support
- [ ] User invitations and playlist sharing
- [ ] Collaborative challenges and games
- [ ] Shared practice sessions
- [ ] User profiles and leaderboards
- [ ] Cross-user playlist imports