/**
 * "Plays like" adjustments. Each function is a small, documented rule of thumb
 * so the numbers are explainable to a golfer and pinned down by tests.
 * All return signed yards: positive means the shot plays LONGER.
 */
import type { Adjustment, DistanceTendency, Handedness, Lie, Stance, Wind } from './types';

export const RULES = {
  /** Into the wind: +1% of distance per mph of headwind component. */
  headwindPctPerMph: 1.0,
  /** Downwind: −0.5% per mph of tailwind component (tailwinds help less than headwinds hurt). */
  tailwindPctPerMph: 0.5,
  /** Tailwind benefit is capped — the ball stops spinning, it doesn't fly forever. */
  tailwindMaxPct: 10,
  /** Lateral drift: yards per mph of crosswind for a 150-yard shot, scaled linearly with distance. */
  crossDriftYdsPerMphPer150: 0.75,
  /** Uphill: +1 yd per yd (3 ft) of rise. */
  uphillYdsPerFt: 1 / 3,
  /** Downhill: −0.8 yd per yd of drop (ball comes in steeper, some of the benefit is lost). */
  downhillYdsPerFt: 0.8 / 3,
  /** Temperature: ±1% per 10°F relative to baseline. Colder air = shorter ball = plays longer. */
  tempPctPerF: 0.1,
  /** Altitude: thinner air, ~2% more carry per 1,000 ft above the golfer's baseline. */
  altitudePctPer1000Ft: 2,
  /** Extra distance needed to carry from each lie (fraction of plays-like). */
  liePct: {
    tee: 0,
    fairway: 0,
    'first-cut': 0,
    rough: 0.05,
    'deep-rough': 0.12,
    bunker: 0.05,
    hardpan: 0,
  } satisfies Record<Lie, number>,
  stancePct: {
    flat: 0,
    'ball-above': 0,
    'ball-below': 0.03,
    uphill: 0.05,
    downhill: -0.05,
  } satisfies Record<Stance, number>,
  tendencyPct: { short: 0.03, neutral: 0, long: -0.03 } satisfies Record<DistanceTendency, number>,
  /** Sanity limits on inputs. */
  maxWindMph: 50,
} as const;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Normalise any angle to [0, 360). */
export const normDeg = (deg: number) => ((deg % 360) + 360) % 360;

/** Split wind into along-the-line (positive = headwind) and cross (positive = from the right) components. */
export function windComponents(wind: Wind): { head: number; cross: number } {
  const speed = Math.min(Math.max(wind.speedMph, 0), RULES.maxWindMph);
  const d = rad(normDeg(wind.fromDeg));
  // Tiny floating-point residue (e.g. cos(90°)) shouldn't show up as "0.0000001 mph into".
  const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  return { head: clean(speed * Math.cos(d)), cross: clean(speed * Math.sin(d)) };
}

export function windYards(distance: number, wind: Wind): number {
  const { head } = windComponents(wind);
  if (head > 0) return (distance * head * RULES.headwindPctPerMph) / 100;
  if (head < 0) {
    const pct = Math.min(-head * RULES.tailwindPctPerMph, RULES.tailwindMaxPct);
    return (-distance * pct) / 100;
  }
  return 0;
}

/**
 * Where the crosswind will push the ball, in yards. Positive = ball moves right.
 * Wind from the right (cross > 0) pushes the ball left, hence the sign flip.
 */
export function windDriftYards(distance: number, wind: Wind): number {
  const { cross } = windComponents(wind);
  const drift = -cross * RULES.crossDriftYdsPerMphPer150 * (distance / 150);
  return Math.abs(drift) < 1e-9 ? 0 : drift;
}

export function elevationYards(elevationFt: number): number {
  if (elevationFt > 0) return elevationFt * RULES.uphillYdsPerFt;
  if (elevationFt < 0) return elevationFt * RULES.downhillYdsPerFt;
  return 0;
}

export function temperatureYards(distance: number, tempF: number | null, baselineF: number): number {
  if (tempF === null) return 0;
  return (distance * (baselineF - tempF) * RULES.tempPctPerF) / 100;
}

export function altitudeYards(distance: number, altitudeFt: number | null, baselineFt: number): number {
  if (altitudeFt === null) return 0;
  return (-distance * ((altitudeFt - baselineFt) / 1000) * RULES.altitudePctPer1000Ft) / 100;
}

export const lieYards = (playsLike: number, lie: Lie) => playsLike * RULES.liePct[lie];
export const stanceYards = (playsLike: number, stance: Stance) => playsLike * RULES.stancePct[stance];
export const tendencyYards = (playsLike: number, t: DistanceTendency) => playsLike * RULES.tendencyPct[t];

/**
 * Sidehill lies curve the ball. For a right-hander, ball-above-feet goes left
 * (so aim right) and ball-below goes right (aim left). Mirror for lefties.
 * Returns signed aim yards (positive = aim right).
 */
export function stanceAimYards(distance: number, stance: Stance, hand: Handedness): number {
  const base = Math.min(8, Math.max(2, distance * 0.03));
  const rightHanded = hand === 'right' ? 1 : -1;
  if (stance === 'ball-above') return base * rightHanded;
  if (stance === 'ball-below') return -base * rightHanded;
  return 0;
}

const LIE_LABEL: Record<Lie, string> = {
  tee: 'Tee',
  fairway: 'Fairway',
  'first-cut': 'First cut',
  rough: 'Rough',
  'deep-rough': 'Deep rough',
  bunker: 'Fairway bunker',
  hardpan: 'Hardpan',
};

const STANCE_LABEL: Record<Stance, string> = {
  flat: 'Flat',
  'ball-above': 'Ball above feet',
  'ball-below': 'Ball below feet',
  uphill: 'Uphill lie',
  downhill: 'Downhill lie',
};

export const lieLabel = (l: Lie) => LIE_LABEL[l];
export const stanceLabel = (s: Stance) => STANCE_LABEL[s];

/** Human description of the wind relative to the target line, e.g. "12 mph into, off the right". */
export function describeWind(wind: Wind): string {
  const speed = Math.round(Math.min(Math.max(wind.speedMph, 0), RULES.maxWindMph));
  if (speed === 0) return 'Calm';
  const d = normDeg(wind.fromDeg);
  const names = [
    'into',
    'into, off the right',
    'off the right',
    'helping, off the right',
    'helping',
    'helping, off the left',
    'off the left',
    'into, off the left',
  ];
  return `${speed} mph ${names[Math.round(d / 45) % 8]}`;
}

export type { Adjustment };
