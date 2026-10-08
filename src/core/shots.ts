/**
 * The golfer's measured shots, and what they say about each club.
 * GPS-measured shots are start-to-finish distance (carry plus roll), so they
 * are only blended into carry for clubs that don't roll much.
 */
import type { Club } from './types';

export type ShotSource = 'gps' | 'manual' | 'rangefinder';

export interface ShotRecord {
  id: string;
  /** Epoch ms. */
  at: number;
  clubId: string;
  /** Yards the ball travelled, when known. */
  distance: number | null;
  source: ShotSource;
  /** A stock full swing. Partial swings, punch-outs and mishits are kept but don't count toward averages. */
  full: boolean;
  roundId: string | null;
  hole: number | null;
  /** GPS fix where the shot was hit, kept so the next mark can measure it. */
  from: { lat: number; lon: number; accuracy: number } | null;
}

export type Reliability = 'high' | 'medium' | 'low';

export interface ClubDistanceStat {
  clubId: string;
  count: number;
  average: number;
  /** Average of the most recent 10 full swings. */
  recent: number;
  spread: number;
  reliability: Reliability;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Drops obvious outliers (a topped shot logged as full, a GPS jump): anything
 * more than 25% away from the median, once there are enough shots to judge.
 */
export function trimmed(distances: number[]): number[] {
  if (distances.length < 4) return distances;
  const sorted = [...distances].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return distances.filter((d) => Math.abs(d - median) <= median * 0.25);
}

export function clubStats(shots: ShotRecord[]): Map<string, ClubDistanceStat> {
  const byClub = new Map<string, ShotRecord[]>();
  for (const s of shots) {
    if (!s.full || s.distance === null || !(s.distance > 0)) continue;
    const list = byClub.get(s.clubId) ?? [];
    list.push(s);
    byClub.set(s.clubId, list);
  }
  const out = new Map<string, ClubDistanceStat>();
  for (const [clubId, list] of byClub) {
    const ordered = [...list].sort((a, b) => b.at - a.at);
    const ds = trimmed(ordered.map((s) => s.distance as number));
    if (!ds.length) continue;
    const avg = mean(ds);
    const spread = sd(ds);
    const reliability: Reliability = ds.length >= 8 && spread <= avg * 0.08 ? 'high' : ds.length >= 4 ? 'medium' : 'low';
    out.set(clubId, { clubId, count: ds.length, average: avg, recent: mean(ds.slice(0, 10)), spread, reliability });
  }
  return out;
}

/** Clubs where measured (carry + roll) is close enough to carry to learn from. */
export const learnableClub = (c: Club) => c.type === 'iron' || c.type === 'wedge' || c.type === 'hybrid';

export const MIN_SHOTS_TO_LEARN = 5;

/**
 * The carry the caddie should use: the golfer's own recent average once there
 * are enough full shots with that club, otherwise the carry they entered.
 */
export function effectiveClubs(clubs: Club[], stats: Map<string, ClubDistanceStat>, learn: boolean): Club[] {
  if (!learn) return clubs;
  return clubs.map((c) => {
    const s = stats.get(c.id);
    if (!s || !learnableClub(c) || s.count < MIN_SHOTS_TO_LEARN) return c;
    return { ...c, carry: Math.round(s.recent) };
  });
}

/** Which clubs' numbers came from the golfer's own shots. */
export function learnedClubIds(clubs: Club[], stats: Map<string, ClubDistanceStat>, learn: boolean): Set<string> {
  const ids = new Set<string>();
  if (!learn) return ids;
  for (const c of clubs) {
    const s = stats.get(c.id);
    if (s && learnableClub(c) && s.count >= MIN_SHOTS_TO_LEARN) ids.add(c.id);
  }
  return ids;
}
