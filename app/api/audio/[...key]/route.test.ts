import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/audio/[...key]', () => {
  it('does not proxy audio through the app server', async () => {
    const response = await GET();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Audio proxy is disabled. Use the public R2 URL returned by the song APIs.',
    });
  });
});
