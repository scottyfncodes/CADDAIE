import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveConditions, parseWeather, relativeWindDeg, weatherUrl } from '../../src/services/conditions';

const sample = {
  elevation: 1609,
  current: { temperature_2m: 61.2, wind_speed_10m: 11.4, wind_direction_10m: 315, wind_gusts_10m: 19 },
};

describe('weather parsing', () => {
  it('parses Open-Meteo current conditions', () => {
    const c = parseWeather(sample, 1000)!;
    expect(c.windMph).toBe(11.4);
    expect(c.windFromDeg).toBe(315);
    expect(c.gustMph).toBe(19);
    expect(c.temperatureF).toBe(61.2);
    expect(c.altitudeFt).toBeCloseTo(5279, 0);
    expect(c.fetchedAt).toBe(1000);
  });

  it.each([
    ['null', null],
    ['no current', { elevation: 10 }],
    ['strings', { current: { temperature_2m: '60', wind_speed_10m: 5, wind_direction_10m: 0 } }],
    ['absurd wind', { current: { temperature_2m: 60, wind_speed_10m: 900, wind_direction_10m: 0 } }],
  ])('rejects %s', (_l, v) => {
    expect(parseWeather(v)).toBeNull();
  });

  it('tolerates missing gusts and elevation', () => {
    const c = parseWeather({ current: { temperature_2m: 60, wind_speed_10m: 5, wind_direction_10m: -45 } })!;
    expect(c.gustMph).toBeNull();
    expect(c.altitudeFt).toBeNull();
    expect(c.windFromDeg).toBe(315);
  });

  it('builds a keyless request URL', () => {
    const u = new URL(weatherUrl(39.7392, -104.9903));
    expect(u.hostname).toBe('api.open-meteo.com');
    expect(u.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(u.search).not.toMatch(/key/i);
  });
});

describe('relative wind', () => {
  it('wind from the north while hitting north is a headwind', () => {
    expect(relativeWindDeg(0, 0)).toBe(0);
  });
  it('wind from the west while hitting north is from the left', () => {
    expect(relativeWindDeg(270, 0)).toBe(270);
  });
  it('wind from the north while hitting south is helping', () => {
    expect(relativeWindDeg(0, 180)).toBe(180);
  });
  it('wind from NW while hitting east is into, off the left', () => {
    expect(relativeWindDeg(315, 90)).toBe(225);
  });
});

describe('fetchLiveConditions failures', () => {
  afterEach(() => vi.unstubAllGlobals());

  const withGeo = (impl: (ok: PositionCallback, err: PositionErrorCallback) => void, onLine = true) =>
    vi.stubGlobal('navigator', { onLine, geolocation: { getCurrentPosition: impl } });

  const position = { coords: { latitude: 40, longitude: -105 } } as GeolocationPosition;

  it('no geolocation support', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(await fetchLiveConditions()).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('offline', async () => {
    withGeo(() => {}, false);
    expect(await fetchLiveConditions()).toEqual({ ok: false, reason: 'offline' });
  });

  it('permission denied', async () => {
    withGeo((_ok, err) => err({ code: 1 } as GeolocationPositionError));
    expect(await fetchLiveConditions()).toEqual({ ok: false, reason: 'denied' });
  });

  it('weather service down', async () => {
    withGeo((ok) => ok(position));
    const r = await fetchLiveConditions({ fetchImpl: async () => new Response('down', { status: 500 }) });
    expect(r).toEqual({ ok: false, reason: 'weather-unavailable' });
  });

  it('garbage weather payload', async () => {
    withGeo((ok) => ok(position));
    const r = await fetchLiveConditions({ fetchImpl: async () => new Response('{"hello":1}') });
    expect(r).toEqual({ ok: false, reason: 'weather-unavailable' });
  });

  it('success', async () => {
    withGeo((ok) => ok(position));
    const r = await fetchLiveConditions({ fetchImpl: async () => new Response(JSON.stringify(sample)) });
    expect(r.ok).toBe(true);
  });
});
