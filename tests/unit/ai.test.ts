import { describe, expect, it, vi } from 'vitest';
import { briefKey, buildBrief } from '../../src/ai/brief';
import { askCaddie, normalizeEndpoint } from '../../src/ai/client';
import { checkTake, clubsMentioned, isValidBrief, normalizeClub, type CaddieBrief } from '../../src/ai/contract';
import { localTake } from '../../src/ai/localVoice';
import { DEFAULT_CLUBS } from '../../src/core/clubs';
import { recommend } from '../../src/core/recommend';
import type { Recommendation } from '../../src/core/types';
import { IMPERIAL, METRIC } from '../../src/core/units';
import { ctx, shot } from './helpers';

const rec = (over = {}) => recommend(shot({ distance: 157, wind: { speedMph: 8, fromDeg: 90 }, ...over }), ctx()) as Recommendation;
const brief = (note = ''): CaddieBrief => buildBrief(rec(), DEFAULT_CLUBS.slice(), IMPERIAL, note);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('brief', () => {
  it('carries the locked decision in display units', () => {
    const b = brief();
    expect(b.decision.club).toBe('6 Iron');
    expect(b.decision.swing).toBe('Smooth swing');
    expect(b.situation.distance).toBe(157);
    expect(b.decision.aim).toMatch(/Aim \d+ yds right/);
    expect(isValidBrief(b)).toBe(true);
  });

  it('metric brief uses meters', () => {
    const b = buildBrief(rec(), DEFAULT_CLUBS.slice(), METRIC);
    expect(b.unit).toBe('m');
    expect(b.situation.distance).toBe(144);
  });

  it('trims the golfer note to the limit', () => {
    expect(brief('x'.repeat(1000)).golferNote).toHaveLength(280);
  });

  it('cache key changes with the situation and the note, not otherwise', () => {
    expect(briefKey(brief())).toBe(briefKey(brief()));
    expect(briefKey(brief('tree left'))).not.toBe(briefKey(brief()));
  });
});

describe('isValidBrief (untrusted input on the proxy)', () => {
  it.each([
    ['null', null],
    ['wrong version', { ...brief(), v: 2 }],
    ['string distance', { ...brief(), situation: { ...brief().situation, distance: '150' } }],
    ['huge note', { ...brief(), golferNote: 'x'.repeat(5000) }],
    ['bad confidence', { ...brief(), decision: { ...brief().decision, confidence: 'certain' } }],
    ['too many notes', { ...brief(), decision: { ...brief().decision, notes: Array(50).fill('n') } }],
  ])('rejects %s', (_label, value) => {
    expect(isValidBrief(value)).toBe(false);
  });
});

describe('checkTake: the AI can never override the math', () => {
  it('accepts a take that restates the locked decision', () => {
    const b = brief();
    const r = checkTake({ take: `Smooth 6 iron — it plays ${b.decision.playsLike} yards with that breeze.`, concern: null }, b);
    expect(r.ok).toBe(true);
  });

  it('accepts mention of a listed alternative', () => {
    const r = checkTake({ take: 'Smooth 6-iron; the 7 iron only if you flush it.', concern: null }, brief());
    expect(r.ok).toBe(true);
  });

  it('rejects a different club', () => {
    expect(checkTake({ take: 'Hit a 5 iron, you need more.', concern: null }, brief())).toEqual({ ok: false, reason: 'contradiction' });
    expect(checkTake({ take: 'Grab the pitching wedge.', concern: null }, brief())).toEqual({ ok: false, reason: 'contradiction' });
    expect(checkTake({ take: 'Take driver.', concern: null }, brief())).toEqual({ ok: false, reason: 'contradiction' });
  });

  it('rejects a yardage the engine never produced', () => {
    expect(checkTake({ take: 'Smooth 6 iron, it plays 175 yards.', concern: null }, brief())).toEqual({ ok: false, reason: 'contradiction' });
  });

  it('rejects malformed shapes', () => {
    const b = brief();
    for (const bad of [null, 'text', { take: '' }, { take: 42 }, { take: 'x'.repeat(400) }, { take: 'ok', concern: 5 }]) {
      expect(checkTake(bad, b)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('keeps a flagged concern separate from the take', () => {
    const r = checkTake({ take: 'Smooth 6 iron.', concern: 'Firm green — the 7 iron would release too much.' }, brief());
    expect(r).toEqual({ ok: true, take: { take: 'Smooth 6 iron.', concern: 'Firm green — the 7 iron would release too much.' } });
  });

  it('normalises club spellings', () => {
    expect(normalizeClub('Seven-Iron')).toBe('7 iron');
    expect(normalizeClub('7i')).toBe('7 iron');
    expect(normalizeClub('PW')).toBe('pitching wedge');
    expect(clubsMentioned('hit the 3-wood or a 4 hybrid, not the SW')).toEqual(['3 wood', '4 hybrid', 'sand wedge']);
  });
});

describe('askCaddie client', () => {
  const endpoint = 'https://api.example.com';

  it('is unconfigured without an endpoint and never calls fetch', async () => {
    const f = vi.fn();
    expect(await askCaddie(brief(), { endpoint: '', fetchImpl: f })).toEqual({ ok: false, reason: 'unconfigured' });
    expect(await askCaddie(brief(), { endpoint: 'javascript:alert(1)', fetchImpl: f })).toEqual({ ok: false, reason: 'unconfigured' });
    expect(f).not.toHaveBeenCalled();
  });

  it('short-circuits when offline', async () => {
    const f = vi.fn();
    expect(await askCaddie(brief(), { endpoint, fetchImpl: f, online: false })).toEqual({ ok: false, reason: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });

  it('posts the brief and returns a validated take', async () => {
    const b = brief();
    const f = vi.fn(async () => jsonResponse({ take: 'Smooth 6 iron, trust it.', concern: null }));
    const r = await askCaddie(b, { endpoint: `${endpoint}/`, fetchImpl: f as unknown as typeof fetch, online: true });
    expect(r).toEqual({ ok: true, take: { take: 'Smooth 6 iron, trust it.', concern: null } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/take');
    expect(JSON.parse(init.body as string)).toEqual(b);
    expect(JSON.stringify(init.headers)).not.toMatch(/key|auth/i);
  });

  it('re-validates proxy responses on the client', async () => {
    const f = async () => jsonResponse({ take: 'Hit a 4 iron.', concern: null });
    expect(await askCaddie(brief(), { endpoint, fetchImpl: f, online: true })).toEqual({ ok: false, reason: 'contradiction' });
  });

  it('maps HTTP failures to friendly reasons', async () => {
    const cases: [Response, string][] = [
      [jsonResponse({ error: 'rate_limited' }, 429), 'rate-limited'],
      [jsonResponse({ error: 'ai_unconfigured' }, 503), 'unconfigured'],
      [jsonResponse({ error: 'x' }, 503), 'unavailable'],
      [jsonResponse({ error: 'ai_error' }, 502), 'unavailable'],
      [new Response('<html>oops</html>', { status: 200 }), 'malformed'],
    ];
    for (const [res, reason] of cases) {
      expect(await askCaddie(brief(), { endpoint, fetchImpl: async () => res, online: true })).toEqual({ ok: false, reason });
    }
  });

  it('network errors become "unavailable"', async () => {
    const f = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await askCaddie(brief(), { endpoint, fetchImpl: f, online: true })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('times out instead of spinning forever', async () => {
    const hang = (_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const r = await askCaddie(brief(), { endpoint, fetchImpl: hang as typeof fetch, online: true, timeoutMs: 20 });
    expect(r).toEqual({ ok: false, reason: 'timeout' });
  });

  it('normalises endpoints', () => {
    expect(normalizeEndpoint(' https://x.workers.dev/ ')).toBe('https://x.workers.dev');
    expect(normalizeEndpoint('ftp://x')).toBeNull();
    expect(normalizeEndpoint('not a url')).toBeNull();
    expect(normalizeEndpoint(undefined)).toBeNull();
  });
});

describe('local caddie voice (offline fallback)', () => {
  it('leads with the swing and club and gives the number', () => {
    const t = localTake(rec(), IMPERIAL);
    expect(t).toMatch(/^Smooth 6 Iron\. Plays \d+ yds/);
  });

  it('names the biggest factor', () => {
    const r = recommend(shot({ distance: 150, wind: { speedMph: 15, fromDeg: 0 } }), ctx()) as Recommendation;
    expect(localTake(r, IMPERIAL)).toMatch(/wind is knocking it down/);
  });

  it('out of range says what it leaves', () => {
    const r = recommend(shot({ distance: 280 }), ctx()) as Recommendation;
    expect(localTake(r, IMPERIAL)).toMatch(/leaves about 70 yds/);
  });

  it('never contradicts its own locked brief', () => {
    for (const d of [60, 95, 131, 150, 168, 190, 240]) {
      for (const wind of [0, 12]) {
        const r = recommend(shot({ distance: d, wind: { speedMph: wind, fromDeg: 30 }, trouble: ['left'] }), ctx()) as Recommendation;
        const b = buildBrief(r, DEFAULT_CLUBS.slice(), IMPERIAL);
        expect(checkTake({ take: localTake(r, IMPERIAL), concern: null }, b).ok).toBe(true);
      }
    }
  });
});
