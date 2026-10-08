import { describe, expect, it } from 'vitest';
import { angleDiff, bearingDeg, distanceYards, fromLocal, greenDistances, polygonCentroid } from '../../src/core/geo';
import { calibrateVfov, flagDistance, gpsPlusMinus, gpsQuality, targetsInView } from '../../src/core/rangefinder';

const O = { lat: 40, lon: -105 };
/** A point `north` / `east` yards from the origin. */
const at = (north: number, east: number) => fromLocal(O, east * 0.9144, north * 0.9144);

describe('geo', () => {
  it('measures distance and bearing', () => {
    expect(distanceYards(O, at(150, 0))).toBeCloseTo(150, 1);
    expect(bearingDeg(O, at(150, 0))).toBeCloseTo(0, 1);
    expect(bearingDeg(O, at(0, 150))).toBeCloseTo(90, 1);
    expect(bearingDeg(O, at(-100, -100))).toBeCloseTo(225, 1);
  });

  it('signed angle difference wraps', () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(angleDiff(0, 180)).toBe(180);
  });

  it('front, centre and back of a green along the line of play', () => {
    // A 30-yard-deep, 20-yard-wide green centred 150 yards north.
    const green = [at(135, -10), at(135, 10), at(165, 10), at(165, -10)];
    expect(distanceYards(polygonCentroid(green), at(150, 0))).toBeLessThan(0.5);
    const d = greenDistances(O, green);
    expect(d.front).toBeCloseTo(135, 0);
    expect(d.center).toBeCloseTo(150, 0);
    expect(d.back).toBeCloseTo(165, 0);
  });

  it('standing on the green: front is zero', () => {
    const green = [at(-10, -10), at(-10, 10), at(10, 10), at(10, -10)];
    const d = greenDistances(at(-5, 0), green);
    expect(d.front).toBe(0);
    expect(d.back).toBeGreaterThan(d.center);
  });
});

describe('rangefinder', () => {
  it('flag sizing gives a distance with an honest error range', () => {
    // 1920 px tall frame, 63° vertical FOV: focal ≈ 1567 px. A 7 ft flag at 150 yd spans ≈ 24 px.
    const r = flagDistance(24.4, 1920, 63)!;
    expect(r.yards).toBeGreaterThan(145);
    expect(r.yards).toBeLessThan(155);
    expect(r.plusMinus).toBeGreaterThan(10); // ±2 px of 24 is ~8%, plus flag height uncertainty
    expect(flagDistance(0, 1920, 63)).toBeNull();
    expect(flagDistance(10, 1920, 200)).toBeNull();
  });

  it('a closer flag looks bigger and is more precise', () => {
    const near = flagDistance(60, 1920, 63)!;
    const far = flagDistance(20, 1920, 63)!;
    expect(near.yards).toBeLessThan(far.yards);
    expect(near.plusMinus / near.yards).toBeLessThan(far.plusMinus / far.yards);
  });

  it('calibration round-trips', () => {
    const vfov = calibrateVfov(30, 1920, 120)!;
    expect(flagDistance(30, 1920, vfov)!.yards).toBeCloseTo(120, 5);
    expect(calibrateVfov(30, 1920, 0)).toBeNull();
  });

  it('picks the target the phone is pointing at', () => {
    const greens = [
      { id: 'a', label: 'A', center: at(150, 0), hole: 1 },
      { id: 'b', label: 'B', center: at(0, 200), hole: 2 },
      { id: 'c', label: 'C', center: at(900, 0), hole: 3 },
    ];
    expect(targetsInView(O, 2, greens)[0].target.id).toBe('a');
    expect(targetsInView(O, 88, greens)[0].target.id).toBe('b');
    expect(targetsInView(O, 180, greens)).toHaveLength(0);
    // Without a compass: nearest first, and too-far targets are dropped.
    expect(targetsInView(O, null, greens).map((t) => t.target.id)).toEqual(['a', 'b']);
  });

  it('GPS accuracy wording', () => {
    expect(gpsQuality(5)).toBe('good');
    expect(gpsQuality(15)).toBe('fair');
    expect(gpsQuality(40)).toBe('poor');
    expect(gpsPlusMinus(9.144)).toBe(10);
  });
});
