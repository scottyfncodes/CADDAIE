/**
 * Browser client for the CADDAIE AI proxy. Never holds credentials — the
 * proxy owns the API key. Every failure maps to a small, golfer-friendly
 * reason so the UI can fall back to the local caddie voice.
 */
import { checkTake, type CaddieBrief, type CaddieTake } from './contract';

export type AiFailure = 'unconfigured' | 'offline' | 'timeout' | 'unavailable' | 'rate-limited' | 'malformed' | 'contradiction';

export type AiResult = { ok: true; take: CaddieTake } | { ok: false; reason: AiFailure };

export interface AskOptions {
  endpoint: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  online?: boolean;
}

export const AI_FAILURE_TEXT: Record<AiFailure, string> = {
  unconfigured: "The AI caddie isn't set up for this app. The numbers above are complete on their own.",
  offline: "You're offline. The numbers above don't need a connection.",
  timeout: 'The AI caddie took too long. The numbers above stand — try again in a moment.',
  unavailable: 'The AI caddie is unavailable right now. The numbers above stand.',
  'rate-limited': 'The AI caddie is busy. Give it a minute — the numbers above stand.',
  malformed: "The AI caddie's answer didn't make sense, so it was ignored.",
  contradiction: "The AI caddie disagreed with the math, so its answer was ignored. Trust the numbers.",
};

/** Normalise a user/build-provided endpoint. Only http(s) URLs are accepted. */
export function normalizeEndpoint(raw: string | undefined | null): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function askCaddie(brief: CaddieBrief, opts: AskOptions): Promise<AiResult> {
  const endpoint = normalizeEndpoint(opts.endpoint);
  if (!endpoint) return { ok: false, reason: 'unconfigured' };
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) return { ok: false, reason: 'offline' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? 12000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetchImpl(`${endpoint}/v1/take`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(brief),
      signal: ctrl.signal,
    });
    if (res.status === 429) return { ok: false, reason: 'rate-limited' };
    if (res.status === 503) {
      const body = await res.json().catch(() => null);
      return { ok: false, reason: body && body.error === 'ai_unconfigured' ? 'unconfigured' : 'unavailable' };
    }
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    // Re-check on the client too: never trust a response just because the proxy sent it.
    const checked = checkTake(json, brief);
    return checked.ok ? { ok: true, take: checked.take } : { ok: false, reason: checked.reason };
  } catch {
    if (timedOut) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
