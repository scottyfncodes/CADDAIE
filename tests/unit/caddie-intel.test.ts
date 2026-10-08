import { describe, expect, it } from 'vitest';
import { DEFAULT_CLUBS } from '../../src/core/clubs';
import { clubStats, effectiveClubs, learnedClubIds, trimmed, type ShotRecord } from '../../src/core/shots';
import { holePlan, pinText, safeMiss, targetAdvice } from '../../src/core/strategy';

const bag = DEFAULT_CLUBS.map((c) => ({ ...c }));
let id = 0;
const shot = (clubId: string, distance: number | null, over: Partial<ShotRecord> = {}): ShotRecord => ({
  id: `s${++id}`,
  at: id,
  clubId,
  distance,
  source: 'gps',
  full: true,
  roundId: null,
  hole: null,
  from: null,
  ...over,
});

describe('club distances from tracked shots', () => {
  it('drops outliers', () => {
    expect(trimmed([150, 152, 148, 90])).toEqual([150, 152, 148]);
    expect(trimmed([150, 90])).toEqual([150, 90]);
  });

  it('averages full swings only and grades reliability', () => {
    const shots = [
      ...[155, 158, 160, 157, 156, 159, 158, 157].map((d) => shot('7i', d)),
      shot('7i', 120, { full: false }),
      shot('7i', null),
      shot('6i', 170),
    ];
    const s = clubStats(shots);
    expect(s.get('7i')!.count).toBe(8);
    expect(s.get('7i')!.average).toBeCloseTo(157.5, 1);
    expect(s.get('7i')!.reliability).toBe('high');
    expect(s.get('6i')!.reliability).toBe('low');
  });

  it('feeds the caddie only once there are enough shots, and never for driver', () => {
    const shots = [...[158, 158, 158, 158, 158].map((d) => shot('7i', d)), ...[260, 260, 260, 260, 260].map((d) => shot('dr', d)), ...[150, 150].map((d) => shot('8i', d))];
    const s = clubStats(shots);
    const eff = effectiveClubs(bag, s, true);
    expect(eff.find((c) => c.id === '7i')!.carry).toBe(158);
    expect(eff.find((c) => c.id === 'dr')!.carry).toBe(230);
    expect(eff.find((c) => c.id === '8i')!.carry).toBe(141);
    expect([...learnedClubIds(bag, s, true)]).toEqual(['7i']);
    expect(effectiveClubs(bag, s, false).find((c) => c.id === '7i')!.carry).toBe(152);
  });
});

describe('target strategy', () => {
  it('a tucked pin for a mid handicap: favor the middle', () => {
    const a = targetAdvice({ pin: { depth: 'back', side: 'left' }, trouble: [], handicap: 15, clubCarry: 162 });
    expect(a.aim).toBe('Favor the middle.');
    expect(a.why).toContain('back-left');
    expect(a.safeMiss).toBe('Safest miss: short and right.');
  });

  it('trouble on the pin side moves everyone away from it', () => {
    const a = targetAdvice({ pin: { depth: 'middle', side: 'right' }, trouble: ['right'], handicap: 2, clubCarry: 120 });
    expect(a.aim).toBe('Favor the left side of the green.');
  });

  it('a good player with a wedge can attack', () => {
    const a = targetAdvice({ pin: { depth: 'front', side: 'left' }, trouble: [], handicap: 4, clubCarry: 110 });
    expect(a.aim).toMatch(/Go at it/);
  });

  it('safe miss reads the trouble', () => {
    expect(safeMiss(['short', 'left'], null)).toBe('Safest miss: long and right.');
    expect(safeMiss(['short', 'long', 'left', 'right'], null)).toMatch(/No safe miss/);
    expect(safeMiss([], null)).toBeNull();
    expect(pinText({ depth: 'front', side: 'center' })).toBe('Front');
    expect(pinText({ depth: 'middle', side: 'left' })).toBe('Left');
  });
});

describe('hole plan', () => {
  it('par 3: the club for the number', () => {
    const p = holePlan({ par: 3, yards: 150, clubs: bag, driveTotal: null, misses: { left: 0, right: 0, hit: 0 }, history: [] });
    expect(p.teeClub?.name).toBe('7 Iron');
  });

  it('short par 4: lay back to a full wedge', () => {
    const p = holePlan({ par: 4, yards: 300, clubs: bag, driveTotal: null, misses: { left: 0, right: 0, hit: 0 }, history: [] });
    expect(p.teeClub?.type).not.toBe('driver');
    expect(p.lines[0]).toMatch(/full Pitching Wedge/);
  });

  it('long par 4 with a known drive length and a miss pattern', () => {
    const p = holePlan({ par: 4, yards: 400, clubs: bag, driveTotal: 250, misses: { left: 2, right: 8, hit: 10 }, history: [5, 6, 5] });
    expect(p.teeClub?.name).toBe('Driver');
    expect(p.leaves).toBe(150);
    expect(p.lines.join(' ')).toMatch(/7 Iron in/);
    expect(p.lines.join(' ')).toMatch(/8 of your last 10 missed fairways went right/);
    expect(p.lines.join(' ')).toMatch(/average 5.3 here over 3 rounds/);
  });

  it('par 5 three-shotter', () => {
    const p = holePlan({ par: 5, yards: 540, clubs: bag, driveTotal: 240, misses: { left: 0, right: 0, hit: 0 }, history: [] });
    expect(p.lines[0]).toMatch(/Three-shot hole/);
  });

  it('no yardage, no invented plan', () => {
    const p = holePlan({ par: 4, yards: null, clubs: bag, driveTotal: null, misses: { left: 0, right: 0, hit: 0 }, history: [] });
    expect(p.teeClub).toBeNull();
    expect(p.lines[0]).toMatch(/Add this hole/);
  });
});
