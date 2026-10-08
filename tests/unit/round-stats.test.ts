import { describe, expect, it } from 'vitest';
import { holeFeedback, holeGir, nextUnplayed, roundPars, roundScore, roundTotals, scoreName, toParText, emptyHole } from '../../src/core/round';
import { benchmarkFor, insights, playerStats, summarizeRound } from '../../src/core/stats';
import { hole, manual, played, tee } from './rounds';

describe('round totals', () => {
  it('derives GIR from strokes and putts, unless overridden', () => {
    expect(holeGir(hole(4, { putts: 2 }), 4)).toBe(true);
    expect(holeGir(hole(5, { putts: 2 }), 4)).toBe(false);
    expect(holeGir(hole(5, { putts: 2, gir: true }), 4)).toBe(true);
    expect(holeGir({ ...emptyHole(), strokes: 4 }, 4)).toBeNull();
  });

  it('totals a round', () => {
    const r = played(0, {}, (i) => ({
      putts: i === 0 ? 3 : 2,
      fairway: i === 1 ? 'left' : i === 4 ? 'right' : 'hit',
      penalties: i === 5 ? 1 : 0,
    }));
    r.holes[0].strokes = 5;
    const t = roundTotals(r);
    expect(t.strokes).toBe(73);
    expect(t.toPar).toBe(1);
    expect(t.putts).toBe(37);
    expect(t.threePutts).toBe(1);
    expect(t.fairwayHoles).toBe(14); // par 3s excluded
    expect(t.fairways).toBe(12);
    expect(t.missLeft).toBe(1);
    expect(t.missRight).toBe(1);
    expect(t.penalties).toBe(1);
    expect(t.gir).toBe(18);
    expect(t.byPar[3].holes).toBe(4);
    expect(t.front.toPar).toBe(1);
    expect(roundScore(r)).toBe(73);
  });

  it('9-hole rounds on the back nine use the back-nine pars', () => {
    const r = played(0, { holeCount: 9, startHole: 9 });
    expect(roundPars(r)).toEqual([4, 4, 3, 5, 4, 4, 3, 4, 5]);
  });

  it('names scores', () => {
    expect(scoreName(3, 4)).toBe('Birdie');
    expect(scoreName(1, 3)).toBe('Hole in one');
    expect(scoreName(7, 4)).toBe('Triple bogey');
    expect(toParText(0)).toBe('E');
    expect(toParText(-2)).toBe('-2');
    expect(toParText(5)).toBe('+5');
  });

  it('finds the next hole to play', () => {
    const r = played(0);
    expect(nextUnplayed(r)).toBeNull();
    r.holes[3] = emptyHole();
    expect(nextUnplayed(r)).toBe(3);
  });
});

describe('hole feedback', () => {
  it('notices a repeated miss and tells you what to do', () => {
    const r = played(0, {}, (i) => ({ fairway: i < 2 ? 'right' : 'hit' }));
    const fb = holeFeedback(r, 1)!;
    expect(fb.headline).toBe('Par');
    expect(fb.detail).toContain('E through 2');
    expect(fb.detail).toContain('Second tee shot missed right today. Aim down the left side.');
  });

  it('penalties and three-putts lead the feedback', () => {
    const r = played(0);
    r.holes[0] = hole(6, { penalties: 1, putts: 3 });
    const fb = holeFeedback(r, 0)!;
    expect(fb.headline).toBe('Double bogey');
    expect(fb.tone).toBe('bad');
    expect(fb.detail).toMatch(/penalty cost a stroke/);
  });

  it('praises a scramble', () => {
    const r = played(0);
    r.holes[0] = hole(4, { putts: 1 });
    expect(holeFeedback(r, 0)!.detail).toContain('Nice scramble');
  });
});

describe('player stats and insights', () => {
  it('averages per 18 holes and includes manual totals in scoring', () => {
    const s = playerStats([played(18), manual(100)]);
    expect(s.rounds).toBe(2);
    expect(s.detailedRounds).toBe(1);
    expect(s.scoringAvg).toBe(95);
    expect(s.puttsPerRound).toBe(36);
  });

  it('benchmarks interpolate and clamp', () => {
    expect(benchmarkFor(85).girPct).toBeCloseTo(33, 0);
    expect(benchmarkFor(60).girPct).toBe(65);
    expect(benchmarkFor(130).girPct).toBe(5);
  });

  it('surfaces penalties as the biggest opportunity, stated factually', () => {
    const rounds = [0, 1, 2].map(() => played(16, {}, (i) => ({ penalties: i < 3 ? 1 : 0 })));
    const ins = insights(rounds);
    expect(ins.opportunity?.area).toBe('penalties');
    expect(ins.opportunity?.text).toBe('You are giving away 3.0 strokes per round through penalties.');
    expect(ins.areas.find((a) => a.area === 'penalties')?.verdict).toBe('watch');
  });

  it('no data, no claims', () => {
    expect(insights([])).toEqual({ areas: [], strongest: null, opportunity: null });
    expect(insights([manual(90)]).areas).toEqual([]);
  });

  it('detects a trend with enough rounds', () => {
    const old = [0, 1, 2].map(() => played(18, { date: 1 }, () => ({ putts: 3 })));
    const recent = [0, 1, 2].map(() => played(18, { date: 2 }, () => ({ putts: 2 })));
    const putting = insights([...old, ...recent]).areas.find((a) => a.area === 'putting')!;
    expect(putting.trend).toBe('improving');
  });

  it('round summary', () => {
    const history = [manual(95, { date: 1 }), manual(97, { date: 2 })];
    const r = played(18, { date: 3, tee: tee() }, (i) => ({ fairway: i % 2 ? 'hit' : 'left', putts: i === 0 ? 3 : 2 }));
    r.holes[0].strokes! += 0;
    const s = summarizeRound(r, history);
    expect(s.score).toBe(90);
    expect(s.vsAverage).toBe(-6);
    expect(s.putts).toBe(37);
    expect(s.fairways).toBe('7/14');
    expect(s.takeaway).toMatch(/6 better than your average/);
  });
});
