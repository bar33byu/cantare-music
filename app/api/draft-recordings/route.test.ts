import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/queries', () => ({
  createDraftRecording: vi.fn(),
  getUnassignedDraftRecordings: vi.fn(),
}));

vi.mock('../../../lib/r2', () => ({
  getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}));

import { GET, POST } from './route';
import { createDraftRecording, getUnassignedDraftRecordings } from '../../../db/queries';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/draft-recordings', () => {
  it('returns unassigned draft recordings for the user', async () => {
    vi.mocked(getUnassignedDraftRecordings).mockResolvedValue([
      {
        id: 'draft-1',
        songId: null,
        title: null,
        audioKey: 'audio/unassigned/guest-user-1/draft.webm',
        status: 'draft',
        trimStartMs: null,
        trimEndMs: null,
        createdAt: '2026-05-26T14:30:00.000Z',
        archivedAt: null,
      },
    ]);

    const request = new Request('http://localhost/api/draft-recordings', {
      headers: { 'X-User-ID': 'guest-user-1' },
    });

    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getUnassignedDraftRecordings).toHaveBeenCalledWith('guest-user-1');
    expect(data.draftRecordings[0]).toEqual(expect.objectContaining({
      id: 'draft-1',
      songId: null,
      audioUrl: 'https://cdn.example.com/audio/unassigned/guest-user-1/draft.webm',
    }));
  });
});

describe('POST /api/draft-recordings', () => {
  it('creates an unassigned draft recording', async () => {
    vi.mocked(createDraftRecording).mockResolvedValue({
      id: 'draft-1',
      songId: null,
      title: null,
      audioKey: 'audio/unassigned/guest-user-1/draft.webm',
      status: 'draft',
      trimStartMs: null,
      trimEndMs: null,
      createdAt: '2026-05-26T14:30:00.000Z',
      archivedAt: null,
    });

    const request = new Request('http://localhost/api/draft-recordings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': 'guest-user-1',
      },
      body: JSON.stringify({ audioKey: 'audio/unassigned/guest-user-1/draft.webm' }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(createDraftRecording).toHaveBeenCalledWith({
      songId: null,
      audioKey: 'audio/unassigned/guest-user-1/draft.webm',
      title: null,
    }, 'guest-user-1');
  });
});
