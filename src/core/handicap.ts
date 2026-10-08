/**
 * A CADDAIE handicap ESTIMATE, following the published World Handicap System
 * arithmetic as closely as on-device data allows. It is never an official
 * Handicap Index: there is no authorised scoring-record integration, no
 * Playing Conditions Calculation and no peer review.
 */
import { holeStrokeIndex, roundPar, roundPars, roundTotals, type Round } from './round';

export const MAX_INDEX = 54;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Score differential = (113 / slope) × (adjusted gross − course rating). PCC is assumed 0. */
export function scoreDifferential(ags: number, rating: number, slope: number): number {
  return round1((113 / slope) * (ags - rating));
}

/** Course handicap = index × slope/113 + (rating − par), rounded. */
export function courseHandicap(index: number, slope: number, rating: number, par: number): number {
  return Math.round(index * (slope / 113) + (rating - par));
}

/** How many of the most recent differentials count, and the adjustment, by record size (WHS table). */
export function differentialsUsed(count: number): { use: number; adjust: number } | null {
  if (count < 3) return null;
  if (count === 3) return { use: 1, adjust: -2 };
  if (count === 4) return { use: 1, adjust: -1 };
  if (count === 5) return { use: 1, adjust: 0 };
  if (count === 6) return { use: 2, adjust: -1 };
  if (count <= 8) return { use: 2, adjust: 0 };
  if (count <= 11) return { use: 3, adjust: 0 };
  if (count <= 14) return { use: 4, adjust: 0 };
  if (count <= 16) return { use: 5, adjust: 0 };
  if (count <= 18) return { use: 6, adjust: 0 };
  if (count === 19) return { use: 7, adjust: 0 };
  return { use: 8, adjust: 0 };
}

/** Index from differentials, most recent first. Only the latest 20 are considered. */
export function indexFromDifferentials(recentFirst: number[]): { index: number; usedPositions: number[] } | null {
  const pool = recentFirst.slice(0, 20);
  const rule = differentialsUsed(pool.length);
  if (!rule) return null;
  const order = pool.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, rule.use);
  const avg = order.reduce((s, x) => s + x.d, 0) / rule.use;
  return { index: Math.min(MAX_INDEX, round1(avg + rule.adjust)), usedPositions: order.map((x) => x.i) };
}

/** Soft cap above low index + 3.0 (50% of the excess) and hard cap at + 5.0. */
export function applyCaps(index: number, lowIndex: number | null): number {
  if (lowIndex === null) return index;
  let out = index;
  if (out - lowIndex > 3) out = lowIndex + 3 + (out - lowIndex - 3) / 2;
  return round1(Math.min(out, lowIndex + 5));
}

/**
 * Adjusted gross score for a hole-by-hole round. Each hole is capped at net
 * double bogey (par + 2 + strokes received), or par + 5 with no index yet.
 */
export function adjustedGross(r: Round, roundCourseHandicap: number | null): { ags: number; approxStrokeIndex: boolean } {
  const pars = roundPars(r);
  let total = 0;
  let approx = false;
  r.holes.forEach((h, i) => {
    const par = pars[i] ?? 4;
    const strokes = h.strokes ?? 0;
    if (roundCourseHandicap === null) {
      total += Math.min(strokes, par + 5);
      return;
    }
    const ch = Math.max(0, roundCourseHandicap);
    const n = r.holeCount;
    const base = Math.floor(ch / n);
    const extra = ch % n;
    const si = holeStrokeIndex(r, i);
    let received = base;
    if (extra > 0) {
      if (si !== null) {
        // On a 9-hole round, map the 1–18 index to a 1–9 ranking.
        const rank = n === 9 ? Math.ceil(si / 2) : si;
        if (rank <= extra) received++;
      } else {
        approx = true;
        received += extra / n >= 0.5 ? 1 : 0;
      }
    }
    total += Math.min(strokes, par + 2 + received);
  });
  return { ags: total, approxStrokeIndex: approx };
}

export type Exclusion = 'incomplete' | 'no-rating' | 'unpaired-nine';

export interface DifferentialRow {
  roundIds: string[];
  date: number;
  courseName: string;
  /** Adjusted gross score (18-hole equivalent rows from two nines show both scores summed). */
  ags: number;
  gross: number;
  differential: number;
  holes: 9 | 18;
  method: '18' | 'nine-expected' | 'nine-paired';
  approx: boolean;
  used: boolean;
}

export interface TrendPoint {
  date: number;
  index: number;
}

export interface HandicapReport {
  estimate: number | null;
  /** Differentials, most recent first. `used` marks the ones in the current estimate. */
  rows: DifferentialRow[];
  excluded: { roundId: string; courseName: string; date: number; reason: Exclusion }[];
  trend: TrendPoint[];
  /** Number of 18-hole differentials still needed before an estimate exists. */
  needed: number;
  lowIndex: number | null;
}

const NINE_EXPECTED = (index: number) => 0.52 * index + 1.2;

/**
 * Build the whole handicap picture from saved rounds. Rounds are processed in
 * date order so each round's net-double-bogey cap uses the estimate that
 * existed before it, the way a scoring record would.
 */
export function handicapReport(rounds: Round[]): HandicapReport {
  const done = rounds.filter((r) => r.status === 'complete').sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  const excluded: HandicapReport['excluded'] = [];
  const rows: DifferentialRow[] = [];
  const trend: TrendPoint[] = [];
  let pendingNine: { r: Round; ags: number; gross: number; diff9: number; approx: boolean } | null = null;
  let current: number | null = null;

  const recompute = (date: number): number | null => {
    const res = indexFromDifferentials([...rows].reverse().map((x) => x.differential));
    if (!res) return null;
    const lows = trend.filter((p) => p.date >= date - 365 * 864e5).map((p) => p.index);
    const low = rows.length >= 20 && lows.length ? Math.min(...lows) : null;
    const index = applyCaps(res.index, low);
    trend.push({ date, index });
    return index;
  };

  for (const r of done) {
    const par = roundPar(r);
    const rating = r.tee.rating;
    const slope = r.tee.slope;
    if (rating === null || slope === null || !(slope >= 55 && slope <= 155) || !(rating > 0)) {
      excluded.push({ roundId: r.id, courseName: r.courseName, date: r.date, reason: 'no-rating' });
      continue;
    }
    // A 9-hole round on an 18-hole tee plays against half the rating.
    const cr = r.holeCount === 9 ? rating / 2 : rating;
    let ags: number;
    let gross: number;
    let approx = r.holeCount === 9;
    if (r.source === 'manual') {
      if (r.manualScore === null) {
        excluded.push({ roundId: r.id, courseName: r.courseName, date: r.date, reason: 'incomplete' });
        continue;
      }
      ags = gross = r.manualScore;
    } else {
      const t = roundTotals(r);
      if (t.holesPlayed < r.holeCount) {
        excluded.push({ roundId: r.id, courseName: r.courseName, date: r.date, reason: 'incomplete' });
        continue;
      }
      const ch = current === null ? null : Math.round(courseHandicap(current, slope, rating, par * (r.holeCount === 9 ? 2 : 1)) / (r.holeCount === 9 ? 2 : 1));
      const adj = adjustedGross(r, ch);
      ags = adj.ags;
      gross = t.strokes;
      approx = approx || adj.approxStrokeIndex;
    }

    if (r.holeCount === 18) {
      rows.push({
        roundIds: [r.id],
        date: r.date,
        courseName: r.courseName,
        ags,
        gross,
        differential: scoreDifferential(ags, cr, slope),
        holes: 18,
        method: '18',
        approx,
        used: false,
      });
      current = recompute(r.date) ?? current;
      continue;
    }

    const diff9 = (113 / slope) * (ags - cr);
    if (current !== null) {
      rows.push({
        roundIds: [r.id],
        date: r.date,
        courseName: r.courseName,
        ags,
        gross,
        differential: round1(diff9 + NINE_EXPECTED(current)),
        holes: 9,
        method: 'nine-expected',
        approx: true,
        used: false,
      });
      current = recompute(r.date) ?? current;
    } else if (pendingNine) {
      const p: { r: Round; ags: number; gross: number; diff9: number; approx: boolean } = pendingNine;
      rows.push({
        roundIds: [p.r.id, r.id],
        date: r.date,
        courseName: p.r.courseName === r.courseName ? r.courseName : `${p.r.courseName} + ${r.courseName}`,
        ags: p.ags + ags,
        gross: p.gross + gross,
        differential: round1(p.diff9 + diff9),
        holes: 9,
        method: 'nine-paired',
        approx: true,
        used: false,
      });
      pendingNine = null;
      current = recompute(r.date) ?? current;
    } else {
      pendingNine = { r, ags, gross, diff9, approx };
    }
  }
  if (pendingNine) excluded.push({ roundId: pendingNine.r.id, courseName: pendingNine.r.courseName, date: pendingNine.r.date, reason: 'unpaired-nine' });

  const recent = [...rows].reverse();
  const res = indexFromDifferentials(recent.map((x) => x.differential));
  if (res) res.usedPositions.forEach((i) => (recent[i].used = true));
  return {
    estimate: current,
    rows: recent,
    excluded: excluded.reverse(),
    trend,
    needed: Math.max(0, 3 - rows.length),
    lowIndex: trend.length ? Math.min(...trend.map((p) => p.index)) : null,
  };
}

/** Plain-English sentence for how the estimate was built. */
export function explainEstimate(rep: HandicapReport): string {
  const n = Math.min(rep.rows.length, 20);
  const rule = differentialsUsed(n);
  if (!rule || rep.estimate === null) {
    return `CADDAIE needs 3 scores with a course rating and slope to start an estimate. You have ${rep.rows.length}.`;
  }
  const best = rule.use === 1 ? 'your best differential' : `the average of your best ${rule.use}`;
  const adj = rule.adjust ? `, minus ${Math.abs(rule.adjust).toFixed(1)} while your record is short` : '';
  return `Based on ${best} from your last ${n} score${n === 1 ? '' : 's'}${adj}.`;
}
