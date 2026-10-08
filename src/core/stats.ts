/**
 * Player-performance stats and the few insights worth surfacing.
 * Every claim is computed from stored rounds. Comparisons with "golfers at
 * your level" use the approximate benchmark table below, and are labelled so.
 */
import { holeGir, roundPar, roundPars, roundTotals, toParText, type Round, type RoundTotals } from './round';

export interface PlayerStats {
  rounds: number;
  /** Rounds that have hole-by-hole data (the ones that feed per-hole stats). */
  detailedRounds: number;
  /** Average score per 18 holes. */
  scoringAvg: number | null;
  /** Average strokes over par per 18 holes. */
  toParAvg: number | null;
  fairwayPct: number | null;
  girPct: number | null;
  girPerRound: number | null;
  puttsPerRound: number | null;
  puttsPerGir: number | null;
  threePuttsPerRound: number | null;
  penaltiesPerRound: number | null;
  doublesPerRound: number | null;
  /** Average score relative to par on each par type. */
  parAvg: Record<3 | 4 | 5, number | null>;
  front9: number | null;
  back9: number | null;
  missLeftPct: number | null;
  missRightPct: number | null;
}

const per18 = (sum: number, holes: number) => (holes > 0 ? (sum / holes) * 18 : null);

function puttsOnGir(r: Round): { putts: number; greens: number } {
  const t = { putts: 0, greens: 0 };
  const pars = roundPars(r);
  r.holes.forEach((h, i) => {
    if (h.strokes === null || h.putts === null) return;
    if (holeGir(h, pars[i] ?? 4)) {
      t.putts += h.putts;
      t.greens++;
    }
  });
  return t;
}

export function playerStats(rounds: Round[]): PlayerStats {
  const done = rounds.filter((r) => r.status === 'complete');
  const scored = done
    .map((r) => {
      if (r.source === 'manual') return r.manualScore === null ? null : { score: r.manualScore, par: roundPar(r), holes: r.holeCount };
      const t = roundTotals(r);
      return t.holesPlayed ? { score: t.strokes, par: t.par, holes: t.holesPlayed } : null;
    })
    .filter((x): x is { score: number; par: number; holes: number } => x !== null);
  const detailed = done.filter((r) => r.source === 'caddaie').map((r) => ({ r, t: roundTotals(r) })).filter((x) => x.t.holesPlayed > 0);

  const sum = (f: (t: RoundTotals) => number) => detailed.reduce((s, x) => s + f(x.t), 0);
  const holes = sum((t) => t.holesPlayed);
  const puttHoles = sum((t) => t.puttsHoles);
  const girHoles = sum((t) => t.girHoles);
  const fwHoles = sum((t) => t.fairwayHoles);
  const gir = sum((t) => t.gir);
  const pog = detailed.map((x) => puttsOnGir(x.r)).reduce((s, x) => ({ putts: s.putts + x.putts, greens: s.greens + x.greens }), { putts: 0, greens: 0 });
  const misses = sum((t) => t.missLeft + t.missRight);
  const parType = (k: 3 | 4 | 5) => {
    const n = sum((t) => t.byPar[k].holes);
    return n ? sum((t) => t.byPar[k].strokes - t.byPar[k].par) / n : null;
  };
  const nine = (k: 'front' | 'back') => {
    const n = sum((t) => t[k].holes);
    return n ? (sum((t) => t[k].toPar) / n) * 9 : null;
  };
  const totalScore = scored.reduce((s, x) => s + x.score, 0);
  const totalHoles = scored.reduce((s, x) => s + x.holes, 0);

  return {
    rounds: scored.length,
    detailedRounds: detailed.length,
    scoringAvg: totalHoles ? (totalScore / totalHoles) * 18 : null,
    toParAvg: totalHoles ? (scored.reduce((s, x) => s + x.score - x.par, 0) / totalHoles) * 18 : null,
    fairwayPct: fwHoles ? (sum((t) => t.fairways) / fwHoles) * 100 : null,
    girPct: girHoles ? (gir / girHoles) * 100 : null,
    girPerRound: per18(gir, girHoles),
    puttsPerRound: puttHoles ? per18(sum((t) => t.putts ?? 0), puttHoles) : null,
    puttsPerGir: pog.greens ? pog.putts / pog.greens : null,
    threePuttsPerRound: puttHoles ? per18(sum((t) => t.threePutts), puttHoles) : null,
    penaltiesPerRound: per18(sum((t) => t.penalties), holes),
    doublesPerRound: per18(sum((t) => t.doublesOrWorse), holes),
    parAvg: { 3: parType(3), 4: parType(4), 5: parType(5) },
    front9: nine('front'),
    back9: nine('back'),
    missLeftPct: misses ? (sum((t) => t.missLeft) / fwHoles) * 100 : null,
    missRightPct: misses ? (sum((t) => t.missRight) / fwHoles) * 100 : null,
  };
}

/**
 * Approximate per-18 averages for amateur golfers by typical score, rounded
 * from widely published amateur stat summaries. Used only for relative
 * "good / watch" labels, and always shown as approximate.
 */
export const BENCHMARKS = [
  { score: 72, fairwayPct: 62, girPct: 65, putts: 30, threePutts: 0.7, penalties: 0.4 },
  { score: 80, fairwayPct: 52, girPct: 42, putts: 31.8, threePutts: 1.4, penalties: 1.0 },
  { score: 90, fairwayPct: 43, girPct: 24, putts: 33.5, threePutts: 2.4, penalties: 1.9 },
  { score: 100, fairwayPct: 35, girPct: 11, putts: 35, threePutts: 3.6, penalties: 3.0 },
  { score: 110, fairwayPct: 28, girPct: 5, putts: 36.5, threePutts: 4.8, penalties: 4.2 },
] as const;

export interface Benchmark {
  fairwayPct: number;
  girPct: number;
  putts: number;
  threePutts: number;
  penalties: number;
}

export function benchmarkFor(score: number): Benchmark {
  const s = Math.min(110, Math.max(72, score));
  const i = Math.max(0, BENCHMARKS.findIndex((b) => b.score >= s) - 1);
  const a = BENCHMARKS[i];
  const b = BENCHMARKS[Math.min(i + 1, BENCHMARKS.length - 1)];
  const f = a.score === b.score ? 0 : (s - a.score) / (b.score - a.score);
  const lerp = (k: keyof Benchmark) => a[k] + (b[k] - a[k]) * f;
  return { fairwayPct: lerp('fairwayPct'), girPct: lerp('girPct'), putts: lerp('putts'), threePutts: lerp('threePutts'), penalties: lerp('penalties') };
}

export type Area = 'driving' | 'approach' | 'putting' | 'penalties';
export type Verdict = 'good' | 'ok' | 'watch';
export type Trend = 'improving' | 'slipping' | 'steady';

export const AREA_LABEL: Record<Area, string> = { driving: 'Driving', approach: 'Approach', putting: 'Putting', penalties: 'Penalty shots' };

export interface AreaInsight {
  area: Area;
  verdict: Verdict;
  trend: Trend | null;
  /** The number behind the verdict, ready to display. */
  value: string;
  /** How far from the benchmark, in "benchmark units" (positive = worse than typical). */
  gap: number;
}

export interface Insights {
  areas: AreaInsight[];
  strongest: AreaInsight | null;
  opportunity: { area: Area; text: string } | null;
}

/** Signed relative gap vs benchmark: > 0 means worse than typical. */
function areaGap(area: Area, s: PlayerStats, b: Benchmark): number | null {
  switch (area) {
    case 'driving':
      return s.fairwayPct === null ? null : (b.fairwayPct - s.fairwayPct) / b.fairwayPct;
    case 'approach':
      return s.girPct === null ? null : (b.girPct - s.girPct) / Math.max(b.girPct, 8);
    case 'putting':
      return s.puttsPerRound === null ? null : (s.puttsPerRound - b.putts) / 2;
    case 'penalties':
      return s.penaltiesPerRound === null ? null : (s.penaltiesPerRound - b.penalties) / Math.max(b.penalties, 1);
  }
}

function areaValue(area: Area, s: PlayerStats): string {
  switch (area) {
    case 'driving':
      return `${Math.round(s.fairwayPct ?? 0)}% fairways`;
    case 'approach':
      return `${Math.round(s.girPct ?? 0)}% greens`;
    case 'putting':
      return `${(s.puttsPerRound ?? 0).toFixed(1)} putts`;
    case 'penalties':
      return `${(s.penaltiesPerRound ?? 0).toFixed(1)} per round`;
  }
}

const verdictOf = (gap: number): Verdict => (gap <= -0.08 ? 'good' : gap >= 0.12 ? 'watch' : 'ok');

/** Detailed rounds, newest first. */
const detailedNewestFirst = (rounds: Round[]) =>
  rounds.filter((r) => r.status === 'complete' && r.source === 'caddaie').sort((a, b) => b.date - a.date);

export function insights(rounds: Round[]): Insights {
  const s = playerStats(rounds);
  if (s.scoringAvg === null || s.detailedRounds === 0) return { areas: [], strongest: null, opportunity: null };
  const b = benchmarkFor(s.scoringAvg);
  const recent = detailedNewestFirst(rounds);
  const canTrend = recent.length >= 4;
  const half = Math.floor(recent.length / 2);
  const newer = canTrend ? playerStats(recent.slice(0, Math.min(5, half))) : null;
  const older = canTrend ? playerStats(recent.slice(half, half + 5)) : null;

  const areas: AreaInsight[] = [];
  for (const area of ['putting', 'approach', 'driving', 'penalties'] as Area[]) {
    const gap = areaGap(area, s, b);
    if (gap === null) continue;
    let trend: Trend | null = null;
    if (newer && older) {
      const gn = areaGap(area, newer, b);
      const go = areaGap(area, older, b);
      if (gn !== null && go !== null) trend = gn < go - 0.1 ? 'improving' : gn > go + 0.1 ? 'slipping' : 'steady';
    }
    areas.push({ area, verdict: verdictOf(gap), trend, value: areaValue(area, s), gap });
  }
  const sorted = [...areas].sort((x, y) => x.gap - y.gap);
  const strongest = sorted[0] && sorted[0].verdict !== 'watch' ? sorted[0] : null;
  return { areas, strongest, opportunity: opportunity(s, b) };
}

/** The single biggest, factually stated place the golfer is losing strokes. */
export function opportunity(s: PlayerStats, b: Benchmark): { area: Area; text: string } | null {
  const options: { area: Area; weight: number; text: string }[] = [];
  if (s.penaltiesPerRound !== null && s.penaltiesPerRound >= 0.5) {
    options.push({
      area: 'penalties',
      weight: s.penaltiesPerRound - b.penalties * 0.5,
      text: `You are giving away ${s.penaltiesPerRound.toFixed(1)} strokes per round through penalties.`,
    });
  }
  if (s.threePuttsPerRound !== null && s.threePuttsPerRound >= 0.5) {
    options.push({
      area: 'putting',
      weight: s.threePuttsPerRound - b.threePutts * 0.5,
      text: `Three-putts cost you about ${s.threePuttsPerRound.toFixed(1)} strokes per round. Work on lag putting.`,
    });
  }
  if (s.girPerRound !== null && s.girPct !== null && s.girPct < b.girPct) {
    const typical = (b.girPct / 100) * 18;
    options.push({
      area: 'approach',
      weight: (typical - s.girPerRound) * 0.6,
      text: `You hit ${s.girPerRound.toFixed(1)} greens per round; golfers at your scoring level average about ${typical.toFixed(1)}.`,
    });
  }
  if (s.fairwayPct !== null && s.fairwayPct < b.fairwayPct - 5) {
    const side = (s.missRightPct ?? 0) > (s.missLeftPct ?? 0) * 1.5 ? ' Most misses go right.' : (s.missLeftPct ?? 0) > (s.missRightPct ?? 0) * 1.5 ? ' Most misses go left.' : '';
    options.push({
      area: 'driving',
      weight: ((b.fairwayPct - s.fairwayPct) / 100) * 14 * 0.25,
      text: `You find ${Math.round(s.fairwayPct)}% of fairways (typical at your level: about ${Math.round(b.fairwayPct)}%).${side}`,
    });
  }
  const best = options.sort((x, y) => y.weight - x.weight)[0];
  return best && best.weight > 0 ? { area: best.area, text: best.text } : null;
}

export interface RoundSummary {
  score: number;
  toPar: number;
  holes: number;
  /** Strokes vs the golfer's previous scoring average (per same number of holes); negative = better. */
  vsAverage: number | null;
  putts: number | null;
  gir: string | null;
  fairways: string | null;
  penalties: number;
  strongest: string | null;
  opportunity: string | null;
  takeaway: string;
}

export function summarizeRound(r: Round, history: Round[]): RoundSummary {
  const t = roundTotals(r);
  const prev = playerStats(history.filter((x) => x.id !== r.id && x.date < r.date));
  const vsAverage = prev.scoringAvg !== null && t.holesPlayed ? t.strokes - (prev.scoringAvg * t.holesPlayed) / 18 : null;
  const scoreFor18 = t.holesPlayed ? (t.strokes / t.holesPlayed) * 18 : 90;
  const b = benchmarkFor(scoreFor18);
  const scale = t.holesPlayed / 18 || 1;
  const s = playerStats([r]);

  const areas: { name: string; gap: number | null }[] = [
    { name: 'Putting', gap: t.puttsHoles ? ((t.putts ?? 0) / scale - b.putts) / 2 : null },
    { name: 'Approach play', gap: t.girHoles ? (b.girPct - (t.gir / t.girHoles) * 100) / Math.max(b.girPct, 8) : null },
    { name: 'Driving', gap: t.fairwayHoles ? (b.fairwayPct - (t.fairways / t.fairwayHoles) * 100) / b.fairwayPct : null },
    { name: 'Staying out of trouble', gap: (t.penalties / scale - b.penalties) / Math.max(b.penalties, 1) },
  ];
  const ranked = areas.filter((a): a is { name: string; gap: number } => a.gap !== null).sort((x, y) => x.gap - y.gap);
  const strongest = ranked[0] && ranked[0].gap < 0.12 ? ranked[0].name : null;
  const opp = opportunity(s, b);

  let takeaway: string;
  if (t.penalties >= 3) takeaway = `${t.penalties} penalty strokes. Choosing safer targets off the tee is the quickest fix.`;
  else if (t.threePutts >= 3) takeaway = `${t.threePutts} three-putts. A few minutes of lag putting before the next round will pay off.`;
  else if (t.doublesOrWorse >= 4) takeaway = `${t.doublesOrWorse} holes at double bogey or worse. Turning those into bogeys is the fastest way to lower scores.`;
  else if (vsAverage !== null && vsAverage <= -2) takeaway = `${Math.round(-vsAverage)} better than your average. Note what worked today.`;
  else if (strongest) takeaway = `${strongest} carried the round. Build on it.`;
  else takeaway = `${toParText(t.toPar)} for the round. Every round adds to what CADDAIE knows about your game.`;

  return {
    score: t.strokes,
    toPar: t.toPar,
    holes: t.holesPlayed,
    vsAverage: vsAverage === null ? null : Math.round(vsAverage * 10) / 10,
    putts: t.puttsHoles ? t.putts : null,
    gir: t.girHoles ? `${t.gir}/${t.girHoles}` : null,
    fairways: t.fairwayHoles ? `${t.fairways}/${t.fairwayHoles}` : null,
    penalties: t.penalties,
    strongest,
    opportunity: opp?.text ?? null,
    takeaway,
  };
}
