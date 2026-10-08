/**
 * Device sensors: GPS position, compass heading and terrain elevation.
 * All optional, all with plain-language failure states.
 */
import { useEffect, useState } from 'preact/hooks';
import type { LatLon } from '../core/geo';

export interface Fix extends LatLon {
  /** Horizontal accuracy radius in metres, as reported by the device. */
  accuracy: number;
  at: number;
}

export type GpsState =
  | { status: 'off' }
  | { status: 'waiting' }
  | { status: 'ok'; fix: Fix }
  | { status: 'error'; reason: 'unsupported' | 'denied' | 'unavailable' };

export const GPS_ERROR_TEXT = {
  unsupported: 'This browser can’t share location.',
  denied: 'Location is off for CADDAIE. Turn it on in Settings › Privacy › Location Services › Safari Websites.',
  unavailable: 'No GPS fix yet. Step into the open and give it a moment.',
} as const;

/** Live GPS while `on` is true. High accuracy is requested; the device decides what it can do. */
export function useGps(on: boolean): GpsState {
  const [state, setState] = useState<GpsState>({ status: on ? 'waiting' : 'off' });
  useEffect(() => {
    if (!on) {
      setState({ status: 'off' });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'error', reason: 'unsupported' });
      return;
    }
    setState((s) => (s.status === 'ok' ? s : { status: 'waiting' }));
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ status: 'ok', fix: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp } }),
      (e) => setState((s) => (s.status === 'ok' && e.code !== 1 ? s : { status: 'error', reason: e.code === 1 ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);
  return state;
}

/** One-off position for actions like "mark my ball". Always a fresh fix: a cached one would measure 0 yards. */
export function currentFix(timeoutMs = 15000, maximumAge = 0): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp }),
      (e) => reject(new Error(e.code === 1 ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, maximumAge, timeout: timeoutMs },
    );
  });
}

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
type PermissionCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type CompassState = { status: 'off' | 'needs-permission' | 'unsupported' | 'denied' } | { status: 'ok'; heading: number | null; accuracy: number | null };

/** iOS needs a tap to allow motion & orientation access. Call from a click handler. */
export async function requestCompassPermission(): Promise<boolean> {
  const ctor = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as unknown as PermissionCtor | undefined;
  if (!ctor) return false;
  if (typeof ctor.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export const compassNeedsPermission = () =>
  typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as unknown as PermissionCtor).requestPermission === 'function';

/**
 * Compass heading (degrees from true/magnetic north, as the device reports it)
 * of the BACK of the phone held upright, i.e. where the camera points.
 */
export function useCompass(on: boolean, granted: boolean): CompassState {
  const [state, setState] = useState<CompassState>({ status: 'off' });
  useEffect(() => {
    if (!on) return setState({ status: 'off' });
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return setState({ status: 'unsupported' });
    if (compassNeedsPermission() && !granted) return setState({ status: 'needs-permission' });
    setState({ status: 'ok', heading: null, accuracy: null });
    let smooth: number | null = null;
    const handler = (ev: Event) => {
      const e = ev as IOSOrientationEvent;
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) h = e.webkitCompassHeading;
      else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
      if (h === null) return;
      // Low-pass filter on the circle so the number doesn't jitter.
      if (smooth === null) smooth = h;
      else {
        const d = ((h - smooth + 540) % 360) - 180;
        smooth = (smooth + d * 0.25 + 360) % 360;
      }
      setState({ status: 'ok', heading: smooth, accuracy: typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : null });
    };
    const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evt, handler);
    return () => window.removeEventListener(evt, handler);
  }, [on, granted]);
  return state;
}

/**
 * Terrain elevation (metres) for a list of points from Open-Meteo's free
 * elevation service (a ~90 m digital elevation model). Good for "the green sits
 * about 10 ft above you", not for exact slope.
 */
export async function terrainElevations(points: LatLon[], fetchImpl: typeof fetch = fetch): Promise<number[] | null> {
  if (!points.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(5)).join(','),
    longitude: points.map((p) => p.lon.toFixed(5)).join(','),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetchImpl(`https://api.open-meteo.com/v1/elevation?${q}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: unknown };
    const e = json.elevation;
    return Array.isArray(e) && e.length === points.length && e.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (e as number[]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
