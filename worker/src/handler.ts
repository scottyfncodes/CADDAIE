/**
 * CADDAIE API — request handling, independent of the model vendor so it can
 * be unit-tested with a fake model. Responsibilities:
 *   - CORS locked to the CADDAIE origins
 *   - strict validation + size limits on the incoming brief
 *   - best-effort per-IP rate limiting
 *   - calling the model with a timeout
 *   - re-validating the model's answer against the locked decision
 *   - returning small, stable error codes (never upstream error text)
 */
import { checkTake, isValidBrief, BRIEF_LIMITS, type CaddieBrief } from '../../src/ai/contract';

export interface Env {
  ANTHROPIC_API_KEY?: string;
  /** Comma-separated list of allowed browser origins, e.g. "https://scottyfncodes.github.io". */
  ALLOWED_ORIGINS?: string;
  CADDAIE_MODEL?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export type ModelOutcome =
  | { kind: 'ok'; json: unknown }
  | { kind: 'refusal' }
  | { kind: 'error'; retryable: boolean };

export type ModelCall = (brief: CaddieBrief, env: Env, signal: AbortSignal) => Promise<ModelOutcome>;

export interface HandlerOptions {
  timeoutMs?: number;
  now?: () => number;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  if (!origin) return null;
  if (!allowedOrigins(env).includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function createHandler(callModel: ModelCall, opts: HandlerOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const now = opts.now ?? Date.now;
  // Per-isolate, best-effort. For hard limits add a Cloudflare rate-limiting rule (see docs/DEPLOYMENT.md).
  const hits = new Map<string, { windowStart: number; count: number }>();

  function limited(ip: string, env: Env): boolean {
    const max = Number(env.RATE_LIMIT_PER_MINUTE ?? '20') || 20;
    const t = now();
    const entry = hits.get(ip);
    if (!entry || t - entry.windowStart >= 60_000) {
      hits.set(ip, { windowStart: t, count: 1 });
      if (hits.size > 5000) hits.clear();
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  }

  return async function handle(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, env);
    const reply = (status: number, body: unknown) =>
      new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...(cors ?? {}) } });

    if (url.pathname === '/health' && req.method === 'GET') {
      return reply(200, { ok: true, service: 'caddaie-api', ai: Boolean(env.ANTHROPIC_API_KEY) });
    }

    if (url.pathname !== '/v1/take') return reply(404, { error: 'not_found' });

    // Browsers must come from a CADDAIE origin. Requests without an Origin are refused too:
    // this endpoint exists for the app, not as an open LLM relay.
    if (!cors) return new Response(JSON.stringify({ error: 'origin_not_allowed' }), { status: 403, headers: JSON_HEADERS });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    if (limited(ip, env)) return reply(429, { error: 'rate_limited' });

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > BRIEF_LIMITS.maxBytes) return reply(413, { error: 'too_large' });
    const text = await req.text();
    if (text.length > BRIEF_LIMITS.maxBytes) return reply(413, { error: 'too_large' });

    let brief: unknown;
    try {
      brief = JSON.parse(text);
    } catch {
      return reply(400, { error: 'bad_json' });
    }
    if (!isValidBrief(brief)) return reply(400, { error: 'bad_brief' });

    if (!env.ANTHROPIC_API_KEY) return reply(503, { error: 'ai_unconfigured' });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let outcome: ModelOutcome;
    try {
      outcome = await callModel(brief, env, ctrl.signal);
    } catch {
      outcome = ctrl.signal.aborted ? { kind: 'error', retryable: true } : { kind: 'error', retryable: false };
    } finally {
      clearTimeout(timer);
    }
    if (ctrl.signal.aborted && outcome.kind !== 'ok') return reply(504, { error: 'ai_timeout' });
    if (outcome.kind === 'refusal') return reply(502, { error: 'ai_declined' });
    if (outcome.kind === 'error') return reply(502, { error: 'ai_error' });

    const checked = checkTake(outcome.json, brief);
    if (!checked.ok) return reply(502, { error: `ai_${checked.reason}` });
    return reply(200, checked.take);
  };
}
