import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist } from '../types';
import * as audioPlayerHook from '../hooks/useAudioPlayer';
import { PlaylistPracticeView } from './PlaylistPracticeView';

const playlist: Playlist = {
  id: 'playlist-1',
  name: 'Morning Warmup',
  isRetired: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  songs: [
    {
      id: 'song-1',
      title: 'Alpha',
      artist: 'A',
      audioUrl: 'https://example.com/alpha.mp3',
      segments: [
        {
          id: 'seg-1',
          songId: 'song-1',
          order: 0,
          label: 'Section 1',
          lyricText: 'Alpha line',
          startMs: 0,
          endMs: 1000,
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      position: 0,
    },
    {
      id: 'song-2',
      title: 'Beta',
      artist: 'B',
      audioUrl: 'https://example.com/beta.mp3',
      segments: [
        {
          id: 'seg-2',
          songId: 'song-2',
          order: 0,
          label: 'Section 1',
          lyricText: 'Beta line',
          startMs: 0,
          endMs: 1000,
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      position: 1,
    },
  ],
};

describe('PlaylistPracticeView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows playlist name, knowledge score, and song cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Morning Warmup' })).toBeInTheDocument();
    expect(await screen.findByTestId('playlist-practice-score')).toHaveTextContent('Playlist Knowledge: 67%');
    expect(screen.getByTestId('playlist-practice-song-song-1')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('playlist-practice-song-song-2')).toHaveTextContent('Beta');
  });

  it('calls onSelectSong when a song card is clicked', async () => {
    const onSelectSong = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={onSelectSong} />);

    await waitFor(() => expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('playlist-practice-song-song-1'));
    expect(onSelectSong).toHaveBeenCalledWith(expect.objectContaining({ id: 'song-1', title: 'Alpha' }));
  });

  it('calls onExit when back button is clicked', async () => {
    const onExit = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0.6 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={onExit} onSelectSong={() => undefined} />);

    fireEvent.click(await screen.findByTestId('playlist-practice-exit'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows empty state with manage button when playlist has no songs', async () => {
    const onManage = vi.fn();
    const emptyPlaylist: Playlist = { ...playlist, songs: [] };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={emptyPlaylist} onExit={() => undefined} onSelectSong={() => undefined} onManage={onManage} />);

    expect(screen.getByTestId('playlist-practice-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('playlist-practice-manage'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('shows readiness tags for songs missing audio and/or segments', async () => {
    const mixedPlaylist: Playlist = {
      ...playlist,
      songs: [
        playlist.songs[0],
        { ...playlist.songs[1], audioUrl: '' },
        {
          ...playlist.songs[1],
          id: 'song-3',
          title: 'Gamma',
          audioUrl: 'https://example.com/gamma.mp3',
          segments: [],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={mixedPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('playlist-practice-song-song-2')).toBeInTheDocument();
    expect(screen.getByTestId('playlist-practice-song-song-3')).toBeInTheDocument();

    expect(screen.getByTestId('playlist-practice-song-song-2-readiness-audio')).toHaveAttribute('aria-label', 'Audio file missing');
    expect(screen.getByTestId('playlist-practice-song-song-2-readiness-segments')).toHaveAttribute('aria-label', 'Sections present');
    expect(screen.getByTestId('playlist-practice-song-song-3-readiness-audio')).toHaveAttribute('aria-label', 'Audio file present');
    expect(screen.getByTestId('playlist-practice-song-song-3-readiness-segments')).toHaveAttribute('aria-label', 'Sections missing');
  });

  it('shows both readiness tags when both audio and segments are missing', async () => {
    const notReadyPlaylist: Playlist = {
      ...playlist,
      songs: [
        { ...playlist.songs[0], audioUrl: '', segments: [] },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={notReadyPlaylist} onExit={() => undefined} onSelectSong={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('playlist-practice-song-song-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-audio')).toHaveAttribute('aria-label', 'Audio file missing');
    expect(screen.getByTestId('playlist-practice-song-song-1-readiness-segments')).toHaveAttribute('aria-label', 'Sections missing');
  });

  it('does not auto-restart playback on unrelated rerenders in listen mode', async () => {
    const play = vi.fn();
    const pause = vi.fn();
    const seek = vi.fn();

    vi.spyOn(audioPlayerHook, 'useAudioPlayer').mockImplementation(() => ({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 12000,
      playbackRate: 1,
      playbackError: null,
      debugInfo: {
        src: playlist.songs[0].audioUrl,
        currentSrc: playlist.songs[0].audioUrl,
        readyState: 4,
        networkState: 1,
        preload: 'metadata',
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: 'init',
        lastEventAt: new Date().toISOString(),
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play,
      pause,
      seek,
      setPlaybackEndMs: vi.fn(),
      setPlaybackRate: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) }) as unknown as typeof fetch;

    const { rerender } = render(
      <PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />
    );

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });

    rerender(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    expect(play).toHaveBeenCalledTimes(1);
  });
});
