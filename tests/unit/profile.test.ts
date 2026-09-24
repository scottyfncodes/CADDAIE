import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  SITUATION_KEY,
  defaultProfile,
  defaultSituation,
  loadProfile,
  loadSituation,
  sanitizeProfile,
  sanitizeSituation,
  saveProfile,
  saveSituation,
  type KeyValueStore,
} from '../../src/state/profile';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class BrokenStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem() {
    throw new Error('QuotaExceededError');
  }
  removeItem() {}
}

describe('profile persistence', () => {
  it('defaults are usable immediately', () => {
    const p = defaultProfile();
    expect(p.clubs.filter((c) => c.inBag).length).toBeGreaterThanOrEqual(10);
    expect(p.units.distance).toBe('yd');
  });

  it('round-trips through storage', () => {
    const store = new MemoryStore();
    const p = defaultProfile();
    p.clubs[6].carry = 158;
    p.units = { distance: 'm', wind: 'kmh', temperature: 'C', height: 'm' };
    p.handedness = 'left';
    p.tendency = 'short';
    expect(saveProfile(p, store)).toBe(true);
    expect(loadProfile(store)).toEqual(p);
  });

  it('returns defaults for missing, corrupt or hostile data', () => {
    const store = new MemoryStore();
    expect(loadProfile(store)).toEqual(defaultProfile());
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadProfile(store)).toEqual(defaultProfile());
    store.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(loadProfile(store)).toEqual(defaultProfile());
  });

  it('repairs individual bad fields without losing the good ones', () => {
    const p = sanitizeProfile({
      clubs: [
        { id: '7i', name: '7 Iron', short: '7i', type: 'iron', carry: 155, inBag: true },
        { id: '7i', name: 'dupe', carry: 1 },
        { id: 'x', name: 'Bad', type: 'spoon', carry: 'far' },
        'garbage',
      ],
      units: { distance: 'furlongs' },
      handedness: 'both',
      baseline: { altitudeFt: 99999 },
    });
    expect(p.clubs).toHaveLength(2);
    expect(p.clubs[0].carry).toBe(155);
    expect(p.clubs[1]).toMatchObject({ type: 'iron', carry: 0 });
    expect(p.units.distance).toBe('yd');
    expect(p.handedness).toBe('right');
    expect(p.baseline.altitudeFt).toBe(0);
  });

  it('survives a storage that throws (private mode / quota)', () => {
    const store = new BrokenStore();
    expect(loadProfile(store)).toEqual(defaultProfile());
    expect(saveProfile(defaultProfile(), store)).toBe(false);
    expect(saveSituation(defaultSituation(), store)).toBe(false);
  });

  it('survives no storage at all', () => {
    expect(loadProfile(null)).toEqual(defaultProfile());
    expect(saveProfile(defaultProfile(), null)).toBe(false);
  });
});

describe('situation persistence', () => {
  it('round-trips the last shot', () => {
    const store = new MemoryStore();
    const s = { ...defaultSituation(), distance: 162, trouble: ['short' as const], lie: 'rough' as const };
    saveSituation(s, store);
    expect(loadSituation(store)).toEqual(s);
    expect(store.data.has(SITUATION_KEY)).toBe(true);
  });

  it('drops out-of-range and unknown values', () => {
    const s = sanitizeSituation({
      distance: 99999,
      wind: { speedMph: -4, fromDeg: 'north' },
      lie: 'lava',
      trouble: ['short', 'short', 'sideways'],
      temperatureF: 'hot',
    });
    expect(s.distance).toBeNull();
    expect(s.wind).toEqual({ speedMph: 0, fromDeg: 0 });
    expect(s.lie).toBe('fairway');
    expect(s.trouble).toEqual(['short']);
    expect(s.temperatureF).toBeNull();
  });
});
