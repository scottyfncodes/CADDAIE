/**
 * Small spherical-geometry helpers for on-course distances. Pure functions.
 * Good to a fraction of a yard over golf distances, which is far below GPS error.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const R_M = 6371008.8;
const M_PER_YD = 0.9144;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const distanceYards = (a: LatLon, b: LatLon) => distanceMeters(a, b) / M_PER_YD;
export const metersToYards = (m: number) => m / M_PER_YD;

/** Initial compass bearing from a to b, degrees clockwise from true north, [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed smallest difference b − a in degrees, in (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Local flat projection (metres east/north of an origin). Accurate over a golf hole. */
export function toLocal(origin: LatLon, p: LatLon): { x: number; y: number } {
  return {
    x: rad(p.lon - origin.lon) * R_M * Math.cos(rad(origin.lat)),
    y: rad(p.lat - origin.lat) * R_M,
  };
}

export function fromLocal(origin: LatLon, x: number, y: number): LatLon {
  return { lat: origin.lat + deg(y / R_M), lon: origin.lon + deg(x / (R_M * Math.cos(rad(origin.lat)))) };
}

/** Area-weighted centroid of a simple polygon (falls back to the vertex average for degenerate shapes). */
export function polygonCentroid(poly: LatLon[]): LatLon {
  if (poly.length === 0) throw new Error('empty polygon');
  const o = poly[0];
  const pts = poly.map((p) => toLocal(o, p));
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const avg = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });
    return fromLocal(o, avg.x, avg.y);
  }
  return fromLocal(o, cx / (3 * a), cy / (3 * a));
}

export interface GreenDistances {
  front: number;
  center: number;
  back: number;
}

/**
 * Front, centre and back of a green along the player's line to its centre, in yards.
 * Front/back are where that line crosses the green outline. If the player is
 * standing on the green, front is 0.
 */
export function greenDistances(player: LatLon, outline: LatLon[], center = polygonCentroid(outline)): GreenDistances {
  const c = distanceYards(player, center);
  if (outline.length < 3) return { front: c, center: c, back: c };
  const pts = outline.map((p) => toLocal(player, p));
  const target = toLocal(player, center);
  const len = Math.hypot(target.x, target.y) || 1;
  const dx = target.x / len;
  const dy = target.y / len;
  const hits: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (p.x * ey - p.y * ex) / den; // distance along the ray
    const s = (p.x * dy - p.y * dx) / den; // position along the edge
    if (t >= 0 && s >= 0 && s <= 1) hits.push(t);
  }
  if (hits.length === 0) return { front: c, center: c, back: c };
  const inside = pointInPolygon({ x: 0, y: 0 }, pts);
  const front = inside ? 0 : metersToYards(Math.min(...hits));
  const back = metersToYards(Math.max(...hits));
  return { front, center: c, back: Math.max(back, c) };
}

function pointInPolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
