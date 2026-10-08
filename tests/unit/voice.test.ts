import { describe, expect, it } from 'vitest';
import { DEFAULT_CLUBS } from '../../src/core/clubs';
import { recommend } from '../../src/core/recommend';
import type { Recommendation } from '../../src/core/types';
import { IMPERIAL } from '../../src/core/units';
import { localTake } from '../../src/core/voice';
import { ctx, shot } from './helpers';

const rec = (over = {}) => recommend(shot({ distance: 157, wind: { speedMph: 8, fromDeg: 90 }, ...over }), ctx()) as Recommendation;

describe('caddie voice', () => {
  it('leads with the swing and club and gives the number', () => {
    expect(localTake(rec(), IMPERIAL)).toMatch(/^Smooth 6 Iron\. Plays \d+ yds/);
  });

  it('names the biggest factor', () => {
    const r = recommend(shot({ distance: 150, wind: { speedMph: 15, fromDeg: 0 } }), ctx()) as Recommendation;
    expect(localTake(r, IMPERIAL)).toMatch(/wind is knocking it down/);
  });

  it('out of range says what it leaves', () => {
    const r = recommend(shot({ distance: 280 }), ctx()) as Recommendation;
    expect(localTake(r, IMPERIAL)).toMatch(/leaves about 70 yds/);
  });

  it('only ever names the recommended club and the engine’s plays-like number', () => {
    for (const d of [60, 95, 131, 150, 168, 190, 240]) {
      for (const wind of [0, 12]) {
        const r = recommend(shot({ distance: d, wind: { speedMph: wind, fromDeg: 30 }, trouble: ['left'] }), ctx()) as Recommendation;
        const t = localTake(r, IMPERIAL);
        expect(t).toContain(r.club.name);
        for (const c of DEFAULT_CLUBS) if (c.name !== r.club.name) expect(t).not.toContain(c.name);
        if (r.leaves === undefined) expect(t).toContain(`Plays ${Math.round(r.playsLike)}`);
      }
    }
  });
});
