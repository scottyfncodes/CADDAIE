import { describe, expect, it } from 'vitest';
import { DEFAULT_CLUBS, eligibleClubs, findGapIssues } from '../../src/core/clubs';
import { computeAdjustments, recommend, selectClub } from '../../src/core/recommend';
import type { CaddieResult, Recommendation } from '../../src/core/types';
import { ctx, shot } from './helpers';

function ok(r: CaddieResult): Recommendation {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`);
  return r;
}

describe('validation and missing input', () => {
  it('asks only for the distance when it is missing', () => {
    const r = recommend(shot({ distance: null }), ctx());
    expect(r).toEqual({ status: 'needs-input', field: 'distance', prompt: 'How far to the target?' });
  });

  it.each([0, -10, 701, Number.NaN, Number.POSITIVE_INFINITY])('rejects distance %s', (d) => {
    const r = recommend(shot({ distance: d }), ctx());
    expect(r.status).toBe('invalid');
    if (r.status === 'invalid') expect(r.field).toBe('distance');
  });

  it('rejects impossible wind, elevation, temperature and altitude', () => {
    expect(recommend(shot({ wind: { speedMph: 80, fromDeg: 0 } }), ctx()).status).toBe('invalid');
    expect(recommend(shot({ wind: { speedMph: Number.NaN, fromDeg: 0 } }), ctx()).status).toBe('invalid');
    expect(recommend(shot({ elevationFt: 1000 }), ctx()).status).toBe('invalid');
    expect(recommend(shot({ temperatureF: 300 }), ctx()).status).toBe('invalid');
    expect(recommend(shot({ altitudeFt: 40000 }), ctx()).status).toBe('invalid');
  });

  it('asks for clubs when the bag is empty or has no usable carries', () => {
    const empty = ctx({ clubs: DEFAULT_CLUBS.map((c) => ({ ...c, inBag: false })) });
    expect(recommend(shot(), empty)).toMatchObject({ status: 'needs-input', field: 'clubs' });
    const zeroed = ctx({ clubs: DEFAULT_CLUBS.map((c) => ({ ...c, carry: 0 })) });
    expect(recommend(shot(), zeroed)).toMatchObject({ status: 'needs-input', field: 'clubs' });
  });
});

describe('club selection — normal distances', () => {
  it('exact stock number: full swing with that club, high confidence', () => {
    const r = ok(recommend(shot({ distance: 152 }), ctx()));
    expect(r.club.id).toBe('7i');
    expect(r.swing).toBe('full');
    expect(r.confidence).toBe('high');
    expect(r.adjustments).toEqual([]);
    expect(r.playsLike).toBe(152);
  });

  it('within 3 yards short of a carry takes that club full', () => {
    expect(ok(recommend(shot({ distance: 150 }), ctx())).club.id).toBe('7i');
  });

  it('just past a carry (≤2 yds) hits the shorter club full', () => {
    const r = ok(recommend(shot({ distance: 154 }), ctx()));
    expect(r.club.id).toBe('7i');
    expect(r.swing).toBe('full');
  });

  it('between clubs: more club, smooth swing', () => {
    const r = ok(recommend(shot({ distance: 157 }), ctx()));
    expect(r.club.id).toBe('6i');
    expect(r.swing).toBe('smooth');
    expect(r.alternatives.map((a) => a.club.id)).toContain('7i');
  });

  it('between clubs with a bigger take-off: choke down', () => {
    const r = ok(recommend(shot({ distance: 175 }), ctx()));
    expect(r.club.id).toBe('4h');
    expect(r.swing).toBe('choke-down');
  });

  it('driver is only offered off the tee', () => {
    expect(ok(recommend(shot({ distance: 228 }), ctx())).club.id).not.toBe('dr');
    expect(ok(recommend(shot({ distance: 228, lie: 'tee' }), ctx())).club.id).toBe('dr');
  });
});

describe('club selection — unusual distances', () => {
  it('beyond the longest club: longest club and what it leaves', () => {
    const r = ok(recommend(shot({ distance: 260 }), ctx()));
    expect(r.club.id).toBe('3w');
    expect(r.leaves).toBeCloseTo(50);
    expect(r.confidence).toBe('low');
    expect(r.alternatives).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/leaves about 50/);
  });

  it('a par-5 tee shot still gives an answer, not an error', () => {
    const r = ok(recommend(shot({ distance: 540, lie: 'tee' }), ctx()));
    expect(r.club.id).toBe('dr');
    expect(Math.round(r.leaves!)).toBe(310);
  });

  it('inside the shortest wedge: partial swing with a percentage', () => {
    const r = ok(recommend(shot({ distance: 45 }), ctx()));
    expect(r.club.id).toBe('lw');
    expect(r.swing).toBe('partial');
    expect(r.swingPct).toBeCloseTo(0.6);
  });

  it('a tiny pitch clamps the swing percentage', () => {
    const r = ok(recommend(shot({ distance: 5 }), ctx()));
    expect(r.swingPct).toBe(0.2);
  });

  it('a one-club bag always returns that club', () => {
    const one = ctx({ clubs: [{ id: '7i', name: '7 Iron', short: '7i', type: 'iron', carry: 150, inBag: true }] });
    expect(ok(recommend(shot({ distance: 150 }), one)).club.id).toBe('7i');
    expect(ok(recommend(shot({ distance: 100 }), one)).swing).toBe('partial');
    expect(ok(recommend(shot({ distance: 200 }), one)).leaves).toBeCloseTo(50);
  });
});

describe('club gaps', () => {
  it('a big hole in the bag picks the closer club and says so', () => {
    // 3W 210 → 7i 150 with nothing between. 190 is 20 short of 3W and 40 past 7i.
    const clubs = [
      { id: '3w', name: '3 Wood', short: '3W', type: 'wood' as const, carry: 210, inBag: true },
      { id: '7i', name: '7 Iron', short: '7i', type: 'iron' as const, carry: 150, inBag: true },
    ];
    const r = ok(recommend(shot({ distance: 190 }), ctx({ clubs })));
    expect(r.club.id).toBe('3w');
    expect(r.swing).toBe('choke-down');
    const r2 = ok(recommend(shot({ distance: 165 }), ctx({ clubs })));
    expect(r2.club.id).toBe('7i');
    expect(r2.swing).toBe('hard');
  });

  it('flags overlapping or oversized gaps for Settings', () => {
    const issues = findGapIssues([
      { id: 'a', name: 'A', short: 'A', type: 'iron', carry: 150, inBag: true },
      { id: 'b', name: 'B', short: 'B', type: 'iron', carry: 148, inBag: true },
      { id: 'c', name: 'C', short: 'C', type: 'iron', carry: 110, inBag: true },
    ]);
    expect(issues.map((i) => i.gap)).toEqual([2, 38]);
  });

  it('ignores clubs not in the bag or without a carry', () => {
    const clubs = DEFAULT_CLUBS.map((c) => (c.id === '7i' ? { ...c, inBag: false } : c.id === '8i' ? { ...c, carry: 0 } : c));
    const ids = eligibleClubs(clubs, 'fairway').map((c) => c.id);
    expect(ids).not.toContain('7i');
    expect(ids).not.toContain('8i');
  });
});

describe('conditions change the number', () => {
  it('10 mph headwind at 150 plays 165', () => {
    const r = ok(recommend(shot({ distance: 150, wind: { speedMph: 10, fromDeg: 0 } }), ctx()));
    expect(r.playsLike).toBeCloseTo(165);
    expect(r.adjustments).toEqual([expect.objectContaining({ kind: 'wind', yards: 15 })]);
  });

  it('into the wind: clubs up and knocks it down rather than forcing a club that just gets there', () => {
    // plays 171; 5i carries 172. Breezy → take 4H and knock it down.
    const r = ok(recommend(shot({ distance: 155, wind: { speedMph: 10, fromDeg: 0 } }), ctx()));
    expect(r.club.id).toBe('4h');
    expect(r.swing).toBe('knockdown');
  });

  it('downwind plays shorter', () => {
    const r = ok(recommend(shot({ distance: 150, wind: { speedMph: 10, fromDeg: 180 } }), ctx()));
    expect(r.playsLike).toBeCloseTo(142.5);
    expect(r.club.id).toBe('8i');
  });

  it('uphill and downhill', () => {
    expect(ok(recommend(shot({ distance: 142, elevationFt: 30 }), ctx())).club.id).toBe('7i');
    expect(ok(recommend(shot({ distance: 160, elevationFt: -30 }), ctx())).club.id).toBe('7i');
  });

  it('altitude: Denver-ish golfers at sea level need more club', () => {
    const denver = ctx({ baseline: { altitudeFt: 5280, temperatureF: 70 } });
    const r = ok(recommend(shot({ distance: 150, altitudeFt: 0 }), denver));
    expect(r.playsLike).toBeGreaterThan(165);
  });

  it('adjustments are applied in order and sum to plays-like', () => {
    const s = shot({ distance: 150, wind: { speedMph: 10, fromDeg: 0 }, elevationFt: 15, temperatureF: 50, lie: 'rough', stance: 'uphill' });
    const r = ok(recommend(s, ctx({ tendency: 'short' })));
    expect(r.adjustments.map((a) => a.kind)).toEqual(['wind', 'elevation', 'temperature', 'lie', 'stance', 'tendency']);
    expect(r.playsLike).toBeCloseTo(150 + r.adjustments.reduce((t, a) => t + a.yards, 0));
  });

  it('crosswind produces an aim offset into the wind', () => {
    const r = ok(recommend(shot({ distance: 150, wind: { speedMph: 12, fromDeg: 90 } }), ctx()));
    expect(r.aim.yards).toBe(9); // wind from the right pushes left → aim right
    expect(r.aim.reasons[0]).toMatch(/moves it 9 left/);
  });

  it('light crosswind rounds to aiming at the target', () => {
    const r = ok(recommend(shot({ distance: 100, wind: { speedMph: 2, fromDeg: 90 } }), ctx()));
    expect(r.aim.yards).toBe(0);
  });

  it('computes no adjustments for a calm, level, fairway shot', () => {
    expect(computeAdjustments(shot(), ctx())).toEqual([]);
  });
});

describe('lies and stances', () => {
  it('deep rough rules out woods and long irons', () => {
    const r = ok(recommend(shot({ distance: 200, lie: 'deep-rough' }), ctx()));
    expect(['wood', 'driver']).not.toContain(r.club.type);
    expect(r.confidence).toBe('low');
    expect(r.notes.join(' ')).toMatch(/getting it out/);
  });

  it('bunker adds distance and rules out woods', () => {
    const r = ok(recommend(shot({ distance: 190, lie: 'bunker' }), ctx()));
    expect(r.club.type).not.toBe('wood');
    expect(r.adjustments.find((a) => a.kind === 'lie')?.yards).toBeCloseTo(9.5);
  });

  it('first cut warns about flyers without changing the number', () => {
    const r = ok(recommend(shot({ distance: 150, lie: 'first-cut' }), ctx()));
    expect(r.playsLike).toBe(150);
    expect(r.notes.join(' ')).toMatch(/Flyer/);
  });

  it('downhill lie plays shorter, uphill lie longer', () => {
    expect(ok(recommend(shot({ stance: 'downhill' }), ctx())).playsLike).toBeCloseTo(142.5);
    expect(ok(recommend(shot({ stance: 'uphill' }), ctx())).playsLike).toBeCloseTo(157.5);
  });

  it('ball above feet aims right for a right-hander, left for a lefty', () => {
    expect(ok(recommend(shot({ stance: 'ball-above' }), ctx())).aim.yards).toBeGreaterThan(0);
    expect(ok(recommend(shot({ stance: 'ball-above' }), ctx({ handedness: 'left' }))).aim.yards).toBeLessThan(0);
  });
});

describe('strategy', () => {
  it('trouble long: stays with the shorter club when it is close', () => {
    const r = ok(recommend(shot({ distance: 156, trouble: ['long'] }), ctx()));
    expect(r.club.id).toBe('7i');
    expect(r.notes.join(' ')).toMatch(/Long is dead/);
  });

  it('trouble short: takes enough club even when it is a stretch', () => {
    const r = ok(recommend(shot({ distance: 154, trouble: ['short'] }), ctx()));
    expect(r.club.id).toBe('6i');
  });

  it('trouble left shades the aim right, and vice versa', () => {
    expect(ok(recommend(shot({ trouble: ['left'] }), ctx())).aim.yards).toBeGreaterThan(0);
    expect(ok(recommend(shot({ trouble: ['right'] }), ctx())).aim.yards).toBeLessThan(0);
    expect(ok(recommend(shot({ trouble: ['left', 'right'] }), ctx())).aim.yards).toBe(0);
  });

  it('tendency to come up short adds a few yards', () => {
    const r = ok(recommend(shot(), ctx({ tendency: 'short' })));
    expect(r.playsLike).toBeCloseTo(154.5);
  });
});

describe('selectClub edge cases', () => {
  it('handles a playsLike just above the longest carry without error', () => {
    const clubs = eligibleClubs(DEFAULT_CLUBS, 'fairway');
    const p = selectClub(212, clubs, shot());
    expect(p.club.id).toBe('3w');
    expect(p.leaves).toBeUndefined();
  });

  it('is deterministic', () => {
    const a = recommend(shot({ distance: 163, wind: { speedMph: 7, fromDeg: 135 } }), ctx());
    const b = recommend(shot({ distance: 163, wind: { speedMph: 7, fromDeg: 135 } }), ctx());
    expect(a).toEqual(b);
  });
});
