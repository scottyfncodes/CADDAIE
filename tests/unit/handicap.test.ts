import { describe, expect, it } from 'vitest';
import {
  adjustedGross,
  applyCaps,
  courseHandicap,
  differentialsUsed,
  explainEstimate,
  handicapReport,
  indexFromDifferentials,
  scoreDifferential,
} from '../../src/core/handicap';
import { hole, manual, played, tee } from './rounds';

describe('WHS arithmetic', () => {
  it('score differential', () => {
    expect(scoreDifferential(85, 72, 113)).toBe(13);
    expect(scoreDifferential(90, 71.5, 130)).toBe(16.1);
  });

  it('course handicap', () => {
    expect(courseHandicap(15.2, 130, 71.5, 72)).toBe(17);
    expect(courseHandicap(0, 113, 72, 72)).toBe(0);
  });

  it('how many differentials count', () => {
    expect(differentialsUsed(2)).toBeNull();
    expect(differentialsUsed(3)).toEqual({ use: 1, adjust: -2 });
    expect(differentialsUsed(6)).toEqual({ use: 2, adjust: -1 });
    expect(differentialsUsed(12)).toEqual({ use: 4, adjust: 0 });
    expect(differentialsUsed(20)).toEqual({ use: 8, adjust: 0 });
    expect(differentialsUsed(35)).toEqual({ use: 8, adjust: 0 });
  });

  it('index from differentials', () => {
    expect(indexFromDifferentials([12, 10, 14])!.index).toBe(8);
    expect(indexFromDifferentials([12, 10])).toBeNull();
    // 20 scores: average of the best 8.
    const twenty = Array.from({ length: 20 }, (_, i) => 10 + i); // 10..29
    expect(indexFromDifferentials(twenty)!.index).toBe(13.5);
    // Only the most recent 20 count.
    expect(indexFromDifferentials([...twenty, 0, 0, 0])!.index).toBe(13.5);
    expect(indexFromDifferentials([80, 90, 99])!.index).toBe(54);
  });

  it('soft and hard caps', () => {
    expect(applyCaps(12, null)).toBe(12);
    expect(applyCaps(12, 10)).toBe(12);
    expect(applyCaps(14, 10)).toBe(13.5); // 3 + half of 1
    expect(applyCaps(20, 10)).toBe(15); // hard cap +5
  });
});

describe('adjusted gross score', () => {
  it('caps at par + 5 before there is an index', () => {
    const r = played(0, {}, (i) => (i === 0 ? { strokes: 12 } : {}));
    expect(adjustedGross(r, null).ags).toBe(72 + 5);
  });

  it('caps at net double bogey using stroke index', () => {
    const si = Array.from({ length: 18 }, (_, i) => i + 1);
    const r = played(0, { tee: tee({ strokeIndex: si }) }, (i) => (i === 0 || i === 17 ? { strokes: 10 } : {}));
    // Course handicap 1: hole 1 (SI 1) gets a stroke → cap par+3 = 7. Hole 18 (SI 18) caps at par+2 = 7 (par 5).
    const { ags, approxStrokeIndex } = adjustedGross(r, 1);
    expect(approxStrokeIndex).toBe(false);
    expect(ags).toBe(72 - 4 - 5 + 7 + 7);
  });

  it('flags approximation when stroke index is missing', () => {
    const r = played(0, {}, (i) => (i === 0 ? { strokes: 10 } : {}));
    expect(adjustedGross(r, 9).approxStrokeIndex).toBe(true);
  });
});

describe('handicap report', () => {
  it('explains exactly what is missing', () => {
    const rep = handicapReport([manual(90), manual(92, { tee: tee({ rating: null, slope: null }) })]);
    expect(rep.estimate).toBeNull();
    expect(rep.needed).toBe(2);
    expect(rep.excluded).toHaveLength(1);
    expect(rep.excluded[0].reason).toBe('no-rating');
    expect(explainEstimate(rep)).toMatch(/needs 3 scores/);
  });

  it('builds an estimate from manual and CADDAIE rounds, with a trend', () => {
    const rounds = [manual(90), manual(88), played(14), manual(95)];
    const rep = handicapReport(rounds);
    // Differentials: 18, 16, 14, 23 → 4 scores: best (14) − 1.0
    expect(rep.estimate).toBe(13);
    expect(rep.rows).toHaveLength(4);
    expect(rep.rows.filter((r) => r.used)).toHaveLength(1);
    expect(rep.rows.find((r) => r.used)!.differential).toBe(14);
    expect(rep.trend.map((p) => p.index)).toEqual([12, 13]);
    expect(explainEstimate(rep)).toMatch(/best differential from your last 4 scores, minus 1.0/);
  });

  it('ignores unfinished CADDAIE rounds and says so', () => {
    const r = played(10);
    r.holes[17] = { ...hole(4), strokes: null };
    const rep = handicapReport([r]);
    expect(rep.rows).toHaveLength(0);
    expect(rep.excluded[0].reason).toBe('incomplete');
  });

  it('pairs 9-hole rounds until there is an index', () => {
    const nine = (score: number) => manual(score, { holeCount: 9 });
    const rep = handicapReport([nine(45), nine(47)]);
    expect(rep.rows).toHaveLength(1);
    expect(rep.rows[0].method).toBe('nine-paired');
    // (45 − 36) + (47 − 36) = 20 at slope 113
    expect(rep.rows[0].differential).toBe(20);
    const single = handicapReport([nine(45)]);
    expect(single.excluded[0].reason).toBe('unpaired-nine');
  });

  it('uses the expected-score method for 9-hole rounds once an index exists', () => {
    const rep = handicapReport([manual(85), manual(85), manual(85), manual(42, { holeCount: 9 })]);
    const nine = rep.rows.find((r) => r.holes === 9)!;
    expect(nine.method).toBe('nine-expected');
    // index after three 13.0 differentials = 11.0; 9-hole diff 6 + (0.52×11 + 1.2) = 12.9
    expect(nine.differential).toBe(12.9);
  });
});
