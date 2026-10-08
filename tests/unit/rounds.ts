/** Round builders shared by the round, stats and handicap tests. */
import { defaultTee, emptyHole, type HoleScore, type Round, type TeeInfo } from '../../src/core/round';

let n = 0;
export const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]; // par 72

export function tee(over: Partial<TeeInfo> = {}): TeeInfo {
  return { ...defaultTee(18), par: [...PARS], rating: 72, slope: 113, ...over };
}

export function hole(strokes: number, over: Partial<HoleScore> = {}): HoleScore {
  return { ...emptyHole(), strokes, putts: 2, ...over };
}

/** An 18-hole HitWhat round where each hole scores `par + over[i]`. */
export function played(overPar: number[] | number, extra: Partial<Round> = {}, holeOver: (i: number) => Partial<HoleScore> = () => ({})): Round {
  const t = extra.tee ?? tee();
  const offs = Array.isArray(overPar) ? overPar : Array(18).fill(0).map((_, i) => (i < Math.abs(overPar) ? Math.sign(overPar) : 0));
  return {
    id: `r${++n}`,
    source: 'app',
    status: 'complete',
    date: Date.UTC(2026, 0, 1) + n * 864e5,
    courseId: 'c1',
    courseName: 'Test Links',
    tee: t,
    holeCount: 18,
    startHole: 0,
    holes: t.par.map((p, i) => hole(p + (offs[i] ?? 0), holeOver(i))),
    manualScore: null,
    current: 17,
    ...extra,
  };
}

export function manual(score: number, extra: Partial<Round> = {}): Round {
  return {
    id: `m${++n}`,
    source: 'manual',
    status: 'complete',
    date: Date.UTC(2026, 0, 1) + n * 864e5,
    courseId: null,
    courseName: 'Muni',
    tee: tee(),
    holeCount: 18,
    startHole: 0,
    holes: [],
    manualScore: score,
    current: 0,
    ...extra,
  };
}
