/**
 * Rounds, holes and courses. Pure data + pure helpers; persistence lives in
 * `src/state`. A round is either played in CADDAIE (hole by hole) or entered
 * after the fact as a total score (for handicap history).
 */

export type FairwayResult = 'hit' | 'left' | 'right' | 'short';

export interface HoleScore {
  strokes: number | null;
  putts: number | null;
  /** Tee-shot result on par 4s and 5s. Null = not recorded. */
  fairway: FairwayResult | null;
  /** Explicit green-in-regulation override. Null = derive from strokes and putts. */
  gir: boolean | null;
  penalties: number;
  /** Club id used off the tee. */
  teeClub: string | null;
  note: string;
}

export interface TeeInfo {
  name: string;
  /** 18-hole course rating and slope from the scorecard. Null when unknown. */
  rating: number | null;
  slope: number | null;
  par: number[];
  yardage: (number | null)[];
  /** Stroke index (handicap hole ranking) 1–18. Null entries when unknown. */
  strokeIndex: (number | null)[];
}

export interface Course {
  id: string;
  name: string;
  tees: TeeInfo[];
  /** Optional OpenStreetMap course id, for map data. */
  osmId: string | null;
  location: { lat: number; lon: number } | null;
  /** Green/pin positions the golfer saved on the course, by hole number. */
  targets: Record<number, { lat: number; lon: number }>;
}

export type RoundSource = 'caddaie' | 'manual';

export interface Round {
  id: string;
  source: RoundSource;
  status: 'active' | 'complete';
  /** Epoch ms when the round started (or the date played, for manual rounds). */
  date: number;
  courseId: string | null;
  courseName: string;
  /** Snapshot of the tee played, so later edits to the course don't rewrite history. */
  tee: TeeInfo;
  holeCount: 9 | 18;
  /** Which nine, for 9-hole rounds: 0 = front (holes 1–9), 9 = back (10–18). */
  startHole: 0 | 9;
  holes: HoleScore[];
  /** Total score for manual rounds (no hole data). */
  manualScore: number | null;
  /** Index into `holes` the golfer is on. */
  current: number;
}

export const emptyHole = (): HoleScore => ({ strokes: null, putts: null, fairway: null, gir: null, penalties: 0, teeClub: null, note: '' });

export const defaultTee = (holes: 9 | 18 = 18): TeeInfo => ({
  name: 'Regular',
  rating: null,
  slope: null,
  par: Array(holes).fill(4),
  yardage: Array(holes).fill(null),
  strokeIndex: Array(holes).fill(null),
});

/** Par for each hole of a round (handles 9-hole rounds on an 18-hole card). */
export function roundPars(r: Pick<Round, 'tee' | 'holeCount' | 'startHole'>): number[] {
  const par = r.tee.par;
  if (r.holeCount === 18 || par.length <= 9) return par.slice(0, r.holeCount);
  return par.slice(r.startHole, r.startHole + 9);
}

export const holeNumber = (r: Pick<Round, 'startHole'>, idx: number) => r.startHole + idx + 1;

export function holeYardage(r: Pick<Round, 'tee' | 'holeCount' | 'startHole'>, idx: number): number | null {
  const y = r.tee.yardage[r.tee.par.length <= 9 ? idx : r.startHole + idx];
  return typeof y === 'number' && y > 0 ? y : null;
}

export function holeStrokeIndex(r: Pick<Round, 'tee' | 'holeCount' | 'startHole'>, idx: number): number | null {
  const s = r.tee.strokeIndex[r.tee.par.length <= 9 ? idx : r.startHole + idx];
  return typeof s === 'number' && s >= 1 && s <= 18 ? s : null;
}

/** Green in regulation: on in par − 2 strokes. Uses the explicit value when recorded. */
export function holeGir(h: HoleScore, par: number): boolean | null {
  if (h.gir !== null) return h.gir;
  if (h.strokes === null || h.putts === null) return null;
  return h.strokes - h.putts <= par - 2;
}

export const isPlayed = (h: HoleScore) => h.strokes !== null && h.strokes > 0;

export interface RoundTotals {
  holesPlayed: number;
  strokes: number;
  par: number;
  toPar: number;
  putts: number | null;
  puttsHoles: number;
  gir: number;
  girHoles: number;
  fairways: number;
  fairwayHoles: number;
  missLeft: number;
  missRight: number;
  penalties: number;
  threePutts: number;
  doublesOrWorse: number;
  /** Per-par-type totals: strokes and par over holes played. */
  byPar: Record<3 | 4 | 5, { holes: number; strokes: number; par: number }>;
  front: { holes: number; toPar: number };
  back: { holes: number; toPar: number };
}

export function roundTotals(r: Round): RoundTotals {
  const pars = roundPars(r);
  const t: RoundTotals = {
    holesPlayed: 0,
    strokes: 0,
    par: 0,
    toPar: 0,
    putts: null,
    puttsHoles: 0,
    gir: 0,
    girHoles: 0,
    fairways: 0,
    fairwayHoles: 0,
    missLeft: 0,
    missRight: 0,
    penalties: 0,
    threePutts: 0,
    doublesOrWorse: 0,
    byPar: { 3: { holes: 0, strokes: 0, par: 0 }, 4: { holes: 0, strokes: 0, par: 0 }, 5: { holes: 0, strokes: 0, par: 0 } },
    front: { holes: 0, toPar: 0 },
    back: { holes: 0, toPar: 0 },
  };
  r.holes.forEach((h, i) => {
    if (!isPlayed(h)) return;
    const par = pars[i] ?? 4;
    const strokes = h.strokes as number;
    t.holesPlayed++;
    t.strokes += strokes;
    t.par += par;
    if (strokes - par >= 2) t.doublesOrWorse++;
    if (h.putts !== null) {
      t.putts = (t.putts ?? 0) + h.putts;
      t.puttsHoles++;
      if (h.putts >= 3) t.threePutts++;
    }
    const gir = holeGir(h, par);
    if (gir !== null) {
      t.girHoles++;
      if (gir) t.gir++;
    }
    if (par >= 4 && h.fairway !== null) {
      t.fairwayHoles++;
      if (h.fairway === 'hit') t.fairways++;
      if (h.fairway === 'left') t.missLeft++;
      if (h.fairway === 'right') t.missRight++;
    }
    t.penalties += h.penalties;
    const key = (par <= 3 ? 3 : par >= 5 ? 5 : 4) as 3 | 4 | 5;
    t.byPar[key].holes++;
    t.byPar[key].strokes += strokes;
    t.byPar[key].par += par;
    const nine = holeNumber(r, i) <= 9 ? t.front : t.back;
    nine.holes++;
    nine.toPar += strokes - par;
  });
  t.toPar = t.strokes - t.par;
  return t;
}

/** Total score of a finished round, whichever way it was entered. */
export function roundScore(r: Round): number | null {
  if (r.source === 'manual') return r.manualScore;
  const t = roundTotals(r);
  return t.holesPlayed === r.holeCount ? t.strokes : null;
}

export function roundPar(r: Round): number {
  return roundPars(r).reduce((a, b) => a + b, 0);
}

export const toParText = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

export function scoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1) return 'Hole in one';
  if (d <= -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double bogey';
  if (d === 3) return 'Triple bogey';
  return `+${d}`;
}

export interface HoleFeedback {
  headline: string;
  detail: string;
  tone: 'good' | 'neutral' | 'bad';
}

/**
 * One line of useful feedback after a hole is saved. Draws only on what was
 * recorded this round, so it never claims more than the card shows.
 */
export function holeFeedback(r: Round, idx: number): HoleFeedback | null {
  const h = r.holes[idx];
  if (!h || !isPlayed(h)) return null;
  const pars = roundPars(r);
  const par = pars[idx] ?? 4;
  const strokes = h.strokes as number;
  const diff = strokes - par;
  const headline = scoreName(strokes, par);
  const tone = diff < 0 ? 'good' : diff === 0 ? 'neutral' : 'bad';

  const sofar = { ...r, holes: r.holes.map((x, i) => (i <= idx ? x : emptyHole())) };
  const t = roundTotals(sofar);
  const through = `${toParText(t.toPar)} through ${t.holesPlayed}`;

  const gir = holeGir(h, par);
  const lines: string[] = [];
  if (h.penalties > 0) {
    lines.push(
      t.penalties > h.penalties
        ? `Penalty strokes today: ${t.penalties}. Pick the safe target on the next tee.`
        : `The penalty cost ${h.penalties === 1 ? 'a stroke' : `${h.penalties} strokes`}. Reset and pick a safe target.`,
    );
  }
  if (h.putts !== null && h.putts >= 3) {
    lines.push(t.threePutts > 1 ? `${t.threePutts} three-putts today. Lag the first one to tap-in range.` : 'Three-putt. Focus on pace on the first putt.');
  }
  if (par >= 4 && (h.fairway === 'left' || h.fairway === 'right')) {
    const side = h.fairway;
    const count = side === 'left' ? t.missLeft : t.missRight;
    if (count >= 2) lines.push(`${ordinal(count)} tee shot missed ${side} today. Aim down the ${side === 'left' ? 'right' : 'left'} side.`);
  }
  if (gir === false && diff <= 0) lines.push('Nice scramble. You missed the green and still made the score.');
  if (gir === true && h.putts === 2 && diff === 0) lines.push('Green in regulation, two putts. Textbook.');
  if (gir === true && h.putts !== null && h.putts <= 1 && diff < 0) lines.push('You hit the green and holed the putt.');
  if (diff >= 2 && h.penalties === 0 && (h.putts ?? 0) < 3) lines.push('One bad hole. Take your medicine early next time and bogey is fine.');

  return { headline, detail: [through, ...lines.slice(0, 1)].join(' · '), tone };
}

const ordinal = (n: number) => (n === 2 ? 'Second' : n === 3 ? 'Third' : n === 4 ? 'Fourth' : `${n}th`);

/** First hole in the round with no score yet, or null if every hole is scored. */
export function nextUnplayed(r: Round): number | null {
  const i = r.holes.findIndex((h) => !isPlayed(h));
  return i === -1 ? null : i;
}
