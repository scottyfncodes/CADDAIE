/** Unit conversion. The engine is imperial internally; these convert at the UI edge. */

export type DistanceUnit = 'yd' | 'm';
export type WindUnit = 'mph' | 'kmh';
export type TempUnit = 'F' | 'C';
export type HeightUnit = 'ft' | 'm';

export interface Units {
  distance: DistanceUnit;
  wind: WindUnit;
  temperature: TempUnit;
  height: HeightUnit;
}

export const IMPERIAL: Units = { distance: 'yd', wind: 'mph', temperature: 'F', height: 'ft' };
export const METRIC: Units = { distance: 'm', wind: 'kmh', temperature: 'C', height: 'm' };

const M_PER_YD = 0.9144;
const KMH_PER_MPH = 1.609344;
const M_PER_FT = 0.3048;

export const yardsTo = (yd: number, u: DistanceUnit) => (u === 'm' ? yd * M_PER_YD : yd);
export const toYards = (v: number, u: DistanceUnit) => (u === 'm' ? v / M_PER_YD : v);

export const mphTo = (mph: number, u: WindUnit) => (u === 'kmh' ? mph * KMH_PER_MPH : mph);
export const toMph = (v: number, u: WindUnit) => (u === 'kmh' ? v / KMH_PER_MPH : v);

export const fahrenheitTo = (f: number, u: TempUnit) => (u === 'C' ? ((f - 32) * 5) / 9 : f);
export const toFahrenheit = (v: number, u: TempUnit) => (u === 'C' ? (v * 9) / 5 + 32 : v);

export const feetTo = (ft: number, u: HeightUnit) => (u === 'm' ? ft * M_PER_FT : ft);
export const toFeet = (v: number, u: HeightUnit) => (u === 'm' ? v / M_PER_FT : v);

export const distanceLabel = (u: DistanceUnit) => (u === 'm' ? 'm' : 'yds');
export const windLabel = (u: WindUnit) => (u === 'kmh' ? 'km/h' : 'mph');
export const heightLabel = (u: HeightUnit) => (u === 'm' ? 'm' : 'ft');
export const tempLabel = (u: TempUnit) => (u === 'C' ? '°C' : '°F');

/**
 * Round a list of signed components so that their rounded sum equals the
 * rounded total (largest-remainder). Keeps "150 +8 +3 = 161" arithmetic
 * honest on screen even after unit conversion.
 */
export function roundPreservingSum(values: number[]): number[] {
  const target = Math.round(values.reduce((a, b) => a + b, 0));
  const floored = values.map((v) => Math.floor(v));
  let remainder = target - floored.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}
