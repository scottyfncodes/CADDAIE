/**
 * Rangefinder math. Two honest ways to get a number from a phone:
 *
 * 1. Position: GPS fix + a known target position (mapped green or a saved pin).
 *    Accuracy is limited by the GPS fix, which the UI shows.
 * 2. Flag sizing: the classic optical-rangefinder trick. A flagstick is a known
 *    height, so its apparent size in the camera gives a distance. Accuracy is
 *    limited by how precisely the golfer marks the flag (a few pixels at 150 yds)
 *    and by flagstick height, so the result always carries an error range.
 */
import { angleDiff, bearingDeg, distanceYards, type LatLon } from './geo';

/** Most flagsticks are 7 ft; some courses use 8 ft. */
export const DEFAULT_FLAG_FT = 7;
/**
 * Fallback vertical field of view for the iPhone main (1×) camera held upright,
 * used until the golfer calibrates. Real values vary by model and video mode.
 */
export const DEFAULT_VFOV_DEG = 63;

const rad = (d: number) => (d * Math.PI) / 180;

export interface FlagReading {
  yards: number;
  /** ± yards from a one-pixel marking error at each end plus a ±4% flagstick height uncertainty. */
  plusMinus: number;
}

/**
 * Distance to a flagstick that spans `spanPx` of a frame `frameHeightPx` tall,
 * for a camera with vertical field of view `vfovDeg`.
 */
export function flagDistance(spanPx: number, frameHeightPx: number, vfovDeg: number, flagFt = DEFAULT_FLAG_FT): FlagReading | null {
  if (!(spanPx > 0) || !(frameHeightPx > 0) || !(vfovDeg > 5 && vfovDeg < 150)) return null;
  // Focal length in pixels from the field of view (pinhole camera).
  const f = frameHeightPx / 2 / Math.tan(rad(vfovDeg) / 2);
  const yards = (flagFt / 3) * (f / spanPx);
  const pixelErr = 2 / spanPx;
  const plusMinus = yards * Math.sqrt(pixelErr ** 2 + 0.04 ** 2);
  return { yards, plusMinus };
}

/** Field of view implied by marking a flag at a known distance. Used to calibrate a phone. */
export function calibrateVfov(spanPx: number, frameHeightPx: number, knownYards: number, flagFt = DEFAULT_FLAG_FT): number | null {
  if (!(spanPx > 0) || !(frameHeightPx > 0) || !(knownYards > 5)) return null;
  // distance = flagYds × focalPx / span  →  focalPx = distance × span / flagYds
  const focal = (knownYards * spanPx) / (flagFt / 3);
  const vfov = (2 * Math.atan(frameHeightPx / 2 / focal) * 180) / Math.PI;
  return vfov > 5 && vfov < 150 ? vfov : null;
}

export interface MappedTarget {
  id: string;
  label: string;
  center: LatLon;
  /** Hole number when known from map data. */
  hole: number | null;
}

export interface TargetInView<T extends MappedTarget = MappedTarget> {
  target: T;
  yards: number;
  bearing: number;
  /** Signed degrees from where the phone points to the target (+ = target is right). */
  offset: number;
}

/**
 * Which mapped target the phone is pointing at. Prefers the nearest target
 * within the cone; ignores anything beyond `maxYards`.
 */
export function targetsInView<T extends MappedTarget>(
  player: LatLon,
  heading: number | null,
  targets: T[],
  opts: { cone?: number; maxYards?: number } = {},
): TargetInView<T>[] {
  const cone = opts.cone ?? 18;
  const max = opts.maxYards ?? 650;
  const all = targets
    .map((target) => {
      const bearing = bearingDeg(player, target.center);
      return { target, yards: distanceYards(player, target.center), bearing, offset: heading === null ? 0 : angleDiff(heading, bearing) };
    })
    .filter((t) => t.yards <= max);
  const inCone = heading === null ? all : all.filter((t) => Math.abs(t.offset) <= cone);
  return inCone.sort((a, b) => (heading === null ? a.yards - b.yards : Math.abs(a.offset) * 4 + a.yards / 40 - (Math.abs(b.offset) * 4 + b.yards / 40)));
}

/** Rounded GPS uncertainty in yards from a reported accuracy radius in metres. */
export const gpsPlusMinus = (accuracyM: number) => Math.max(1, Math.round(accuracyM / 0.9144));

/** Is a GPS fix good enough to quote a yardage to a green? */
export function gpsQuality(accuracyM: number): 'good' | 'fair' | 'poor' {
  if (accuracyM <= 8) return 'good';
  if (accuracyM <= 20) return 'fair';
  return 'poor';
}
