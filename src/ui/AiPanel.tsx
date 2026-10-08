/**
 * Optional AI explanation, shown only when an explanation service has been
 * deliberately configured. CADDAIE is complete without it. The deterministic answer is already on screen; this
 * only ever adds words. One request per unique situation, cached, with a hard
 * timeout, and a plain-language message for every failure.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { briefKey, buildBrief } from '../ai/brief';
import { AI_FAILURE_TEXT, askCaddie, type AiResult } from '../ai/client';
import type { Club, Recommendation } from '../core/types';
import type { Units } from '../core/units';

type State = { phase: 'idle' } | { phase: 'loading'; key: string } | { phase: 'done'; key: string; result: AiResult };

interface Props {
  rec: Recommendation;
  bag: Club[];
  units: Units;
  endpoint: string;
  note: string;
  onNote: (s: string) => void;
}

export function AiPanel({ rec, bag, units, endpoint, note, onNote }: Props) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const cache = useRef(new Map<string, AiResult>());
  const inflight = useRef<AbortController | null>(null);
  const brief = buildBrief(rec, bag, units, note);
  const key = briefKey(brief);

  // A new situation invalidates whatever was on screen; abort any stale request.
  useEffect(() => {
    const cached = cache.current.get(key);
    setState(cached ? { phase: 'done', key, result: cached } : { phase: 'idle' });
    return () => inflight.current?.abort();
  }, [key]);

  const ask = async () => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setState({ phase: 'loading', key });
    const result = await askCaddie(brief, { endpoint, signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    // Only cache real answers and deterministic rejections; transient failures can be retried.
    if (result.ok || result.reason === 'contradiction' || result.reason === 'malformed') cache.current.set(key, result);
    setState({ phase: 'done', key, result });
  };

  const current = state.phase !== 'idle' && state.key === key ? state : null;
  const loading = current?.phase === 'loading';
  const result = current?.phase === 'done' ? current.result : null;

  return (
    <section class="card ai" aria-labelledby="ai-title" aria-busy={loading}>
      <h2 id="ai-title" class="card-title">
        Explanation
      </h2>
      <label class="note-label" for="golfer-note">
        Anything the numbers can't see? <span class="muted">(optional)</span>
      </label>
      <textarea
        id="golfer-note"
        class="note"
        rows={2}
        maxLength={280}
        placeholder="Tree overhanging left, pin tucked back, green is firm…"
        value={note}
        onInput={(e) => onNote((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <button type="button" class="btn ai-btn" onClick={ask} disabled={loading} data-testid="ask-ai">
        {loading ? (
          <>
            <span class="spinner" aria-hidden="true" /> Thinking…
          </>
        ) : result ? (
          'Ask again'
        ) : (
          'Explain this shot'
        )}
      </button>
      <div aria-live="polite" data-testid="ai-output">
        {result?.ok && (
          <>
            <blockquote class="ai-take">{result.take.take}</blockquote>
            {result.take.concern && (
              <p class="ai-concern" role="note">
                <strong>Heads-up:</strong> {result.take.concern}
              </p>
            )}
            <p class="fine">Explanation only — the club and numbers come from CADDAIE's calculator.</p>
          </>
        )}
        {result && !result.ok && <p class="ai-fail">{AI_FAILURE_TEXT[result.reason]}</p>}
      </div>
    </section>
  );
}
