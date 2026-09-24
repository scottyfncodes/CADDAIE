import { describe, expect, it, vi } from 'vitest';
import { buildBrief } from '../../src/ai/brief';
import { DEFAULT_CLUBS } from '../../src/core/clubs';
import { recommend } from '../../src/core/recommend';
import type { Recommendation } from '../../src/core/types';
import { IMPERIAL } from '../../src/core/units';
import { createHandler, type Env, type ModelCall } from '../../worker/src/handler';
import { ctx, shot } from './helpers';

const ORIGIN = 'https://scottyfncodes.github.io';
const env: Env = { ANTHROPIC_API_KEY: 'sk-test-not-real', ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:5173/` };
const brief = buildBrief(recommend(shot({ distance: 150 }), ctx()) as Recommendation, DEFAULT_CLUBS.slice(), IMPERIAL);

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://caddaie-api.test/v1/take', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const goodModel: ModelCall = async () => ({ kind: 'ok', json: { take: '7 iron, full swing. Trust it.', concern: null } });

describe('CADDAIE API worker', () => {
  it('health check reports whether AI is configured, without leaking the key', async () => {
    const h = createHandler(goodModel);
    const res = await h(new Request('https://x/health'), env);
    const body = await res.json();
    expect(body).toEqual({ ok: true, service: 'caddaie-api', ai: true });
    expect(JSON.stringify(body)).not.toContain('sk-test');
  });

  it('returns a validated take for a good request', async () => {
    const h = createHandler(goodModel);
    const res = await h(post(brief), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ take: '7 iron, full swing. Trust it.', concern: null });
  });

  it('answers CORS preflight for allowed origins only', async () => {
    const h = createHandler(goodModel);
    const ok = await h(new Request('https://x/v1/take', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }), env);
    expect(ok.status).toBe(204);
    const bad = await h(new Request('https://x/v1/take', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses requests with no or foreign origin (not an open LLM relay)', async () => {
    const model = vi.fn(goodModel);
    const h = createHandler(model);
    expect((await h(post(brief, { origin: 'https://evil.example' }), env)).status).toBe(403);
    const noOrigin = new Request('https://x/v1/take', { method: 'POST', body: JSON.stringify(brief) });
    expect((await h(noOrigin, env)).status).toBe(403);
    expect(model).not.toHaveBeenCalled();
  });

  it('validates input before spending money', async () => {
    const model = vi.fn(goodModel);
    const h = createHandler(model);
    expect(await (await h(post('{nope'), env)).json()).toEqual({ error: 'bad_json' });
    expect((await h(post({ ...brief, v: 99 }), env)).status).toBe(400);
    expect((await h(post({ ...brief, golferNote: 'x'.repeat(7000) }), env)).status).toBe(413);
    expect(model).not.toHaveBeenCalled();
  });

  it('reports a missing API key as unconfigured', async () => {
    const h = createHandler(goodModel);
    const res = await h(post(brief), { ...env, ANTHROPIC_API_KEY: undefined });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_unconfigured' });
  });

  it('rejects a model answer that contradicts the locked decision', async () => {
    const h = createHandler(async () => ({ kind: 'ok', json: { take: 'Hit a 5 iron, it plays 170 yards.', concern: null } }));
    const res = await h(post(brief), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'ai_contradiction' });
  });

  it('rejects malformed model output', async () => {
    const h = createHandler(async () => ({ kind: 'ok', json: null }));
    expect(await (await h(post(brief), env)).json()).toEqual({ error: 'ai_malformed' });
  });

  it('maps refusals, errors and exceptions to stable codes with no upstream text', async () => {
    const refusal = createHandler(async () => ({ kind: 'refusal' }));
    expect(await (await refusal(post(brief), env)).json()).toEqual({ error: 'ai_declined' });
    const err = createHandler(async () => ({ kind: 'error', retryable: true }));
    expect(await (await err(post(brief), env)).json()).toEqual({ error: 'ai_error' });
    const thrown = createHandler(async () => {
      throw new Error('upstream said: invalid x-api-key sk-live-123');
    });
    const res = await thrown(post(brief), env);
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain('sk-live');
  });

  it('times out a slow model', async () => {
    const slow: ModelCall = (_b, _e, signal) =>
      new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const h = createHandler(slow, { timeoutMs: 10 });
    const res = await h(post(brief), env);
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: 'ai_timeout' });
  });

  it('rate limits per IP', async () => {
    let t = 0;
    const h = createHandler(goodModel, { now: () => t });
    const e = { ...env, RATE_LIMIT_PER_MINUTE: '2' };
    const ip = { 'cf-connecting-ip': '1.2.3.4' };
    expect((await h(post(brief, ip), e)).status).toBe(200);
    expect((await h(post(brief, ip), e)).status).toBe(200);
    expect((await h(post(brief, ip), e)).status).toBe(429);
    expect((await h(post(brief, { 'cf-connecting-ip': '5.6.7.8' }), e)).status).toBe(200);
    t = 61_000;
    expect((await h(post(brief, ip), e)).status).toBe(200);
  });

  it('404s unknown paths and 405s wrong methods', async () => {
    const h = createHandler(goodModel);
    expect((await h(new Request('https://x/api/fantasy'), env)).status).toBe(404);
    expect((await h(new Request('https://x/v1/take', { headers: { origin: ORIGIN } }), env)).status).toBe(405);
  });
});
