import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '../types';
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
      segments: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      position: 0,
    },
    {
      id: 'song-2',
      title: 'Beta',
      artist: 'B',
      audioUrl: 'https://example.com/beta.mp3',
      segments: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      position: 1,
    },
  ],
};

describe('PlaylistPracticeView', () => {
  it('shows playlist name, knowledge score, and song cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 67 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} onSelectSong={() => undefined} />);

    expect(screen.getByText('Morning Warmup')).toBeInTheDocument();
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
    expect(onSelectSong).toHaveBeenCalledWith('song-1');
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
});
