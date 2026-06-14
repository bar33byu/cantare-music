import { describe, expect, it } from 'vitest';
import { compareNaturalText } from './naturalSort';

describe('compareNaturalText', () => {
  it('sorts leading numbers numerically', () => {
    const titles = ['1000 Voices', '20 Questions', '100 Songs', '3 Little Birds'];

    expect(titles.sort(compareNaturalText)).toEqual([
      '3 Little Birds',
      '20 Questions',
      '100 Songs',
      '1000 Voices',
    ]);
  });
});
