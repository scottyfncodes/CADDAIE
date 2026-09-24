import { describe, expect, it } from 'vitest';
import {
  RULES,
  altitudeYards,
  describeWind,
  elevationYards,
  normDeg,
  stanceAimYards,
  temperatureYards,
  windComponents,
  windDriftYards,
  windYards,
} from '../../src/core/adjustments';

describe('wind', () => {
  it('splits a headwind into a pure head component', () => {
    const { head, cross } = windComponents({ speedMph: 10, fromDeg: 0 });
    expect(head).toBeCloseTo(10);
    expect(cross).toBe(0);
  });

  it('treats 90° as a pure crosswind from the right', () => {
    const { head, cross } = windComponents({ speedMph: 10, fromDeg: 90 });
    expect(head).toBe(0);
    expect(cross).toBeCloseTo(10);
  });

  it('headwind adds 1% per mph', () => {
    expect(windYards(150, { speedMph: 10, fromDeg: 0 })).toBeCloseTo(15);
  });

  it('tailwind takes off 0.5% per mph (tailwinds help less than headwinds hurt)', () => {
    expect(windYards(150, { speedMph: 10, fromDeg: 180 })).toBeCloseTo(-7.5);
    expect(Math.abs(windYards(150, { speedMph: 10, fromDeg: 180 }))).toBeLessThan(windYards(150, { speedMph: 10, fromDeg: 0 }));
  });

  it('caps the tailwind benefit', () => {
    const capped = windYards(200, { speedMph: 45, fromDeg: 180 });
    expect(capped).toBeCloseTo((-200 * RULES.tailwindMaxPct) / 100);
  });

  it('pure crosswind does not change distance', () => {
    expect(windYards(150, { speedMph: 20, fromDeg: 270 })).toBe(0);
  });

  it('quartering wind uses only the head component', () => {
    expect(windYards(100, { speedMph: 10, fromDeg: 45 })).toBeCloseTo(100 * (10 * Math.SQRT1_2) * 0.01);
  });

  it('wind from the right drifts the ball left, scaled by distance', () => {
    expect(windDriftYards(150, { speedMph: 10, fromDeg: 90 })).toBeCloseTo(-7.5);
    expect(windDriftYards(300, { speedMph: 10, fromDeg: 90 })).toBeCloseTo(-15);
    expect(windDriftYards(150, { speedMph: 10, fromDeg: 270 })).toBeCloseTo(7.5);
  });

  it('clamps absurd wind speeds and ignores negative ones', () => {
    expect(windComponents({ speedMph: 500, fromDeg: 0 }).head).toBe(RULES.maxWindMph);
    expect(windComponents({ speedMph: -10, fromDeg: 0 }).head).toBe(0);
  });

  it('normalises any angle', () => {
    expect(normDeg(-90)).toBe(270);
    expect(normDeg(720)).toBe(0);
    expect(windYards(150, { speedMph: 10, fromDeg: 360 })).toBeCloseTo(15);
  });

  it('describes wind in golfer language', () => {
    expect(describeWind({ speedMph: 0, fromDeg: 0 })).toBe('Calm');
    expect(describeWind({ speedMph: 12, fromDeg: 0 })).toBe('12 mph into');
    expect(describeWind({ speedMph: 8, fromDeg: 180 })).toBe('8 mph helping');
    expect(describeWind({ speedMph: 8, fromDeg: 270 })).toBe('8 mph off the left');
  });
});

describe('elevation', () => {
  it('uphill plays 1 yard per 3 feet', () => {
    expect(elevationYards(30)).toBeCloseTo(10);
  });
  it('downhill gives back a bit less than uphill costs', () => {
    expect(elevationYards(-30)).toBeCloseTo(-8);
  });
  it('flat is zero', () => {
    expect(elevationYards(0)).toBe(0);
  });
});

describe('temperature and altitude', () => {
  it('cold air plays longer, warm air shorter, relative to baseline', () => {
    expect(temperatureYards(150, 50, 70)).toBeCloseTo(3);
    expect(temperatureYards(150, 90, 70)).toBeCloseTo(-3);
    expect(temperatureYards(150, null, 70)).toBe(0);
  });

  it('altitude above home plays shorter (~2% per 1000 ft)', () => {
    expect(altitudeYards(150, 5000, 0)).toBeCloseTo(-15);
    expect(altitudeYards(150, 0, 5000)).toBeCloseTo(15);
    expect(altitudeYards(150, 5280, 5280)).toBeCloseTo(0);
    expect(altitudeYards(150, null, 0)).toBe(0);
  });
});

describe('sidehill aim', () => {
  it('ball above feet: right-hander aims right, left-hander aims left', () => {
    expect(stanceAimYards(150, 'ball-above', 'right')).toBeGreaterThan(0);
    expect(stanceAimYards(150, 'ball-above', 'left')).toBeLessThan(0);
  });
  it('ball below feet mirrors it', () => {
    expect(stanceAimYards(150, 'ball-below', 'right')).toBeLessThan(0);
  });
  it('stays within sensible bounds', () => {
    expect(stanceAimYards(20, 'ball-above', 'right')).toBe(2);
    expect(stanceAimYards(400, 'ball-above', 'right')).toBe(8);
    expect(stanceAimYards(150, 'uphill', 'right')).toBe(0);
  });
});
