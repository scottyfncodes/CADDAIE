/** Display formatting in the golfer's preferred units. Pure functions. */
import { lieLabel, stanceLabel, windComponents } from './adjustments';
import { SWING_LABEL, partialSwingLabel } from './recommend';
import type { Aim, Recommendation } from './types';
import {
  distanceLabel,
  fahrenheitTo,
  feetTo,
  heightLabel,
  mphTo,
  roundPreservingSum,
  tempLabel,
  windLabel,
  yardsTo,
  type Units,
} from './units';

export const fmtDistance = (yd: number, u: Units) => Math.round(yardsTo(yd, u.distance));
export const fmtDistanceWithUnit = (yd: number, u: Units) => `${fmtDistance(yd, u)} ${distanceLabel(u.distance)}`;
export const fmtWind = (mph: number, u: Units) => `${Math.round(mphTo(mph, u.wind))} ${windLabel(u.wind)}`;
export const fmtHeight = (ft: number, u: Units) => `${Math.round(feetTo(ft, u.height))} ${heightLabel(u.height)}`;
export const fmtTemp = (f: number, u: Units) => `${Math.round(fahrenheitTo(f, u.temperature))}${tempLabel(u.temperature)}`;

export function swingText(rec: Pick<Recommendation, 'swing' | 'swingPct'>): string {
  if (rec.swing === 'partial' && rec.swingPct !== undefined) return partialSwingLabel(rec.swingPct);
  return SWING_LABEL[rec.swing];
}

export function aimText(aim: Aim, u: Units): string {
  if (aim.yards === 0) return 'Aim at the target';
  const n = Math.max(1, fmtDistance(Math.abs(aim.yards), u));
  return `Aim ${n} ${distanceLabel(u.distance)} ${aim.yards > 0 ? 'right' : 'left'}`;
}

export function windText(speedMph: number, fromDeg: number, u: Units): string {
  const { head, cross } = windComponents({ speedMph, fromDeg });
  if (Math.round(speedMph) === 0) return 'Calm';
  const parts: string[] = [];
  if (Math.abs(head) >= 1) parts.push(head > 0 ? 'into' : 'helping');
  if (Math.abs(cross) >= 1) parts.push(cross > 0 ? 'off the right' : 'off the left');
  return `${fmtWind(speedMph, u)} ${parts.join(', ')}`.trim();
}

/**
 * Adjustments converted to display units with rounding that keeps the
 * on-screen arithmetic exact: distance + Σ(shown adjustments) = shown total.
 */
export function displayMath(rec: Recommendation, u: Units) {
  const distance = fmtDistance(rec.distance, u);
  const raw = rec.adjustments.map((a) => yardsTo(a.yards, u.distance));
  const rounded = roundPreservingSum(raw);
  const rows = rec.adjustments
    .map((a, i) => ({ ...a, shown: rounded[i] }))
    .filter((a) => a.shown !== 0);
  const total = distance + rows.reduce((s, a) => s + a.shown, 0);
  return { distance, rows, total };
}

export const lieText = lieLabel;
export const stanceText = stanceLabel;
