/**
 * Course map data from OpenStreetMap via the free, keyless Overpass API.
 * Coverage depends on volunteers: many courses have greens and holes mapped,
 * many don't. Results are cached on the device so the course works offline
 * after the first look. Map data © OpenStreetMap contributors (ODbL).
 */
import { distanceMeters, polygonCentroid, type LatLon } from '../core/geo';
import type { MappedTarget } from '../core/rangefinder';
import type { KeyValueStore } from '../state/profile';

export const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const OSM_ATTRIBUTION = 'Map data © OpenStreetMap contributors';

export interface MappedGreen extends MappedTarget {
  outline: LatLon[];
}

export interface MappedHole {
  ref: number;
  par: number | null;
  strokeIndex: number | null;
  /** Tee-to-green centre line. */
  line: LatLon[];
}

export interface CourseMap {
  fetchedAt: number;
  center: LatLon;
  greens: MappedGreen[];
  holes: MappedHole[];
}

export interface NearbyCourse {
  osmId: string;
  name: string;
  center: LatLon;
  distanceM: number;
}

export type OsmFailure = 'offline' | 'unavailable' | 'timeout';
export const OSM_FAILURE_TEXT: Record<OsmFailure, string> = {
  offline: 'You’re offline. Course maps load when you have signal, then stay on this phone.',
  unavailable: 'The map service didn’t respond. Try again in a moment.',
  timeout: 'The map service took too long. Try again in a moment.',
};

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toInt = (s: string | undefined, min: number, max: number) => {
  const n = s === undefined ? NaN : parseInt(s, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export const coursesQuery = (p: LatLon, radiusM = 3000) =>
  `[out:json][timeout:20];(way["leisure"="golf_course"](around:${radiusM},${p.lat.toFixed(5)},${p.lon.toFixed(5)});relation["leisure"="golf_course"](around:${radiusM},${p.lat.toFixed(5)},${p.lon.toFixed(5)}););out tags center;`;

export const featuresQuery = (p: LatLon, radiusM = 1600) =>
  `[out:json][timeout:25];(way["golf"="green"](around:${radiusM},${p.lat.toFixed(5)},${p.lon.toFixed(5)});way["golf"="hole"](around:${radiusM},${p.lat.toFixed(5)},${p.lon.toFixed(5)}););out geom tags;`;

export function parseCourses(json: unknown, from: LatLon): NearbyCourse[] {
  const els = (json as { elements?: OsmElement[] })?.elements;
  if (!Array.isArray(els)) return [];
  return els
    .filter((e) => e.center && finite(e.center.lat) && finite(e.center.lon))
    .map((e) => ({
      osmId: `${e.type}/${e.id}`,
      name: (e.tags?.name ?? 'Unnamed golf course').slice(0, 60),
      center: { lat: e.center!.lat, lon: e.center!.lon },
      distanceM: distanceMeters(from, e.center!),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 8);
}

/** Parse greens and holes, and work out which green belongs to which hole. */
export function parseFeatures(json: unknown, center: LatLon, now = Date.now()): CourseMap {
  const els = (json as { elements?: OsmElement[] })?.elements ?? [];
  const holes: MappedHole[] = [];
  const greens: MappedGreen[] = [];
  for (const e of Array.isArray(els) ? els : []) {
    const geom = (e.geometry ?? []).filter((g) => finite(g.lat) && finite(g.lon));
    if (e.type !== 'way' || geom.length < 2) continue;
    if (e.tags?.golf === 'hole') {
      const ref = toInt(e.tags.ref, 1, 36);
      if (ref !== null) holes.push({ ref, par: toInt(e.tags.par, 3, 6), strokeIndex: toInt(e.tags.handicap, 1, 18), line: geom });
    } else if (e.tags?.golf === 'green' && geom.length >= 3) {
      greens.push({ id: `way/${e.id}`, label: 'Green', center: polygonCentroid(geom), hole: null, outline: geom });
    }
  }
  // A hole's line ends on its green: tag each green with the nearest hole end within 60 m.
  for (const h of holes) {
    const end = h.line[h.line.length - 1];
    let best: MappedGreen | null = null;
    let bestD = 60;
    for (const g of greens) {
      const d = distanceMeters(end, g.center);
      if (d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best && best.hole === null) {
      best.hole = h.ref;
      best.label = `Green ${h.ref}`;
    }
  }
  return { fetchedAt: now, center, greens, holes: holes.sort((a, b) => a.ref - b.ref) };
}

async function overpass(query: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ ok: true; json: unknown } | { ok: false; reason: OsmFailure }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  let last: OsmFailure = 'unavailable';
  for (const url of OVERPASS_URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (res.ok) return { ok: true, json: await res.json() };
      last = 'unavailable';
    } catch {
      last = ctrl.signal.aborted ? 'timeout' : typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable';
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: last };
}

export async function findNearbyCourses(p: LatLon, opts: { fetchImpl?: typeof fetch } = {}): Promise<{ ok: true; courses: NearbyCourse[] } | { ok: false; reason: OsmFailure }> {
  const r = await overpass(coursesQuery(p), opts.fetchImpl ?? fetch, 15000);
  return r.ok ? { ok: true, courses: parseCourses(r.json, p) } : r;
}

const MAP_KEY = 'caddaie.maps';
const MAP_TTL = 30 * 864e5;

function readMaps(store: KeyValueStore | null): Record<string, CourseMap> {
  try {
    const raw = store?.getItem(MAP_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}

/** Cache key: the nearest ~500 m grid cell. */
export const mapCell = (p: LatLon) => `${(Math.round(p.lat * 200) / 200).toFixed(3)},${(Math.round(p.lon * 200) / 200).toFixed(3)}`;

export function cachedMap(p: LatLon, store: KeyValueStore | null, now = Date.now()): CourseMap | null {
  const maps = readMaps(store);
  let best: CourseMap | null = null;
  for (const m of Object.values(maps)) {
    if (!m?.center || now - m.fetchedAt > MAP_TTL || !Array.isArray(m.greens)) continue;
    if (distanceMeters(p, m.center) <= 1100 && (!best || m.fetchedAt > best.fetchedAt)) best = m;
  }
  return best;
}

export async function loadCourseMap(
  p: LatLon,
  store: KeyValueStore | null,
  opts: { fetchImpl?: typeof fetch; force?: boolean } = {},
): Promise<{ ok: true; map: CourseMap; cached: boolean } | { ok: false; reason: OsmFailure }> {
  const hit = opts.force ? null : cachedMap(p, store);
  if (hit) return { ok: true, map: hit, cached: true };
  const r = await overpass(featuresQuery(p), opts.fetchImpl ?? fetch, 20000);
  if (!r.ok) {
    const stale = readMaps(store);
    const any = Object.values(stale).find((m) => m?.center && distanceMeters(p, m.center) <= 1100);
    return any ? { ok: true, map: any, cached: true } : r;
  }
  const map = parseFeatures(r.json, p);
  try {
    const maps = readMaps(store);
    maps[mapCell(p)] = map;
    // Keep the cache small: the 12 most recent areas.
    const keep = Object.entries(maps).sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, 12);
    store?.setItem(MAP_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* A full cache only costs a refetch next time. */
  }
  return { ok: true, map, cached: false };
}
