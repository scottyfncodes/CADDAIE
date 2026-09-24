import { describe, expect, it } from 'vitest';
import { aimText, displayMath, windText } from '../../src/core/format';
import { recommend } from '../../src/core/recommend';
import type { Recommendation } from '../../src/core/types';
import {
  IMPERIAL,
  METRIC,
  fahrenheitTo,
  feetTo,
  mphTo,
  roundPreservingSum,
  toFahrenheit,
  toFeet,
  toMph,
  toYards,
  yardsTo,
} from '../../src/core/units';
import { ctx, shot } from './helpers';

describe('unit conversion', () => {
  it('round-trips every unit', () => {
    expect(toYards(yardsTo(150, 'm'), 'm')).toBeCloseTo(150);
    expect(toMph(mphTo(12, 'kmh'), 'kmh')).toBeCloseTo(12);
    expect(toFahrenheit(fahrenheitTo(50, 'C'), 'C')).toBeCloseTo(50);
    expect(toFeet(feetTo(30, 'm'), 'm')).toBeCloseTo(30);
  });

  it('known values', () => {
    expect(yardsTo(100, 'm')).toBeCloseTo(91.44);
    expect(fahrenheitTo(32, 'C')).toBeCloseTo(0);
    expect(mphTo(10, 'kmh')).toBeCloseTo(16.09, 2);
    expect(yardsTo(100, 'yd')).toBe(100);
  });
});

describe('roundPreservingSum', () => {
  it('keeps the rounded parts summing to the rounded whole', () => {
    const parts = [2.4, 2.4, 2.4];
    const r = roundPreservingSum(parts);
    expect(r.reduce((a, b) => a + b, 0)).toBe(Math.round(7.2));
  });

  it('handles negatives and mixed signs', () => {
    const parts = [8.6, -3.3, 1.45];
    expect(roundPreservingSum(parts).reduce((a, b) => a + b, 0)).toBe(Math.round(6.75));
    expect(roundPreservingSum([-2.5, -2.5]).reduce((a, b) => a + b, 0)).toBe(-5);
  });

  it('empty list', () => {
    expect(roundPreservingSum([])).toEqual([]);
  });
});

describe('displayMath: on-screen arithmetic always adds up', () => {
  const cases = [
    shot({ distance: 150, wind: { speedMph: 13, fromDeg: 30 }, elevationFt: 17, temperatureF: 48, lie: 'rough' }),
    shot({ distance: 97, wind: { speedMph: 7, fromDeg: 200 }, elevationFt: -11, stance: 'uphill' }),
    shot({ distance: 212, altitudeFt: 6100, temperatureF: 91 }),
  ];
  for (const units of [IMPERIAL, METRIC]) {
    it.each(cases.map((c, i) => [i, c]))(`case %i in ${units.distance}`, (_i, s) => {
      const rec = recommend(s, ctx()) as Recommendation;
      const m = displayMath(rec, units);
      expect(m.distance + m.rows.reduce((t, r) => t + r.shown, 0)).toBe(m.total);
      // And stays within 1 unit of the engine's precise number.
      expect(Math.abs(m.total - yardsTo(rec.playsLike, units.distance))).toBeLessThanOrEqual(1);
    });
  }
});

describe('text helpers', () => {
  it('aim text', () => {
    expect(aimText({ yards: 0, reasons: [] }, IMPERIAL)).toBe('Aim at the target');
    expect(aimText({ yards: 6, reasons: [] }, IMPERIAL)).toBe('Aim 6 yds right');
    expect(aimText({ yards: -6, reasons: [] }, METRIC)).toBe('Aim 5 m left');
  });

  it('wind text', () => {
    expect(windText(0, 0, IMPERIAL)).toBe('Calm');
    expect(windText(10, 0, IMPERIAL)).toBe('10 mph into');
    expect(windText(10, 135, METRIC)).toBe('16 km/h helping, off the right');
  });
});
