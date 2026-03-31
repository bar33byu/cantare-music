import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '../types';
import { PlaylistPracticeView } from './PlaylistPracticeView';

vi.mock('./PracticeView', () => ({
  default: ({ onSessionChange }: { onSessionChange?: (session: any) => void }) => (
    <div data-testid="mock-practice-view">
      <button
        data-testid="emit-session"
        onClick={() =>
          onSessionChange?.({
            currentSongId: 'song-1',
            currentSegmentId: null,
            currentTime: 0,
            ratings: [
              {
                segmentId: 'seg-1',
                rating: 4,
                ratedAt: '2025-01-01T00:00:00.000Z',
              },
            ],
          })
        }
      >
        Emit Session
      </button>
    </div>
  ),
}));

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
  it('shows breadcrumb and playlist knowledge score', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0.67 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} />);

    expect(await screen.findByTestId('playlist-practice-score')).toHaveTextContent('Playlist Knowledge: 67%');
    expect(screen.getByTestId('playlist-practice-breadcrumb')).toHaveTextContent('Morning Warmup > 1 Alpha');
  });

  it('persists ratings before moving to next song', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ score: 0.5 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ score: 0.6 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ score: 0.7 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={() => undefined} />);

    fireEvent.click(await screen.findByTestId('emit-session'));
    fireEvent.click(screen.getByTestId('playlist-next-song'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/songs/song-1/ratings', expect.objectContaining({ method: 'POST' }));
    });

    expect(screen.getByTestId('playlist-practice-breadcrumb')).toHaveTextContent('Morning Warmup > 2 Beta');
  });

  it('calls onExit when exit is clicked', async () => {
    const onExit = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 0.6 }) }) as unknown as typeof fetch;

    render(<PlaylistPracticeView playlist={playlist} onExit={onExit} />);

    fireEvent.click(await screen.findByTestId('playlist-practice-exit'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
