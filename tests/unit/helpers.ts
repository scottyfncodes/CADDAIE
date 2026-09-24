import { DEFAULT_CLUBS } from '../../src/core/clubs';
import type { PlayerContext, ShotInput } from '../../src/core/types';

export const ctx = (over: Partial<PlayerContext> = {}): PlayerContext => ({
  clubs: DEFAULT_CLUBS.map((c) => ({ ...c })),
  handedness: 'right',
  tendency: 'neutral',
  baseline: { altitudeFt: 0, temperatureF: 70 },
  ...over,
});

export const shot = (over: Partial<ShotInput> = {}): ShotInput => ({
  distance: 150,
  wind: { speedMph: 0, fromDeg: 0 },
  elevationFt: 0,
  lie: 'fairway',
  stance: 'flat',
  trouble: [],
  temperatureF: null,
  altitudeFt: null,
  ...over,
});
