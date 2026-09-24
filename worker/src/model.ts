/** Anthropic adapter: turns a locked CaddieBrief into a short caddie explanation. */
import Anthropic from '@anthropic-ai/sdk';
import { TAKE_JSON_SCHEMA, type CaddieBrief } from '../../src/ai/contract';
import type { Env, ModelCall } from './handler';

export const DEFAULT_MODEL = 'claude-opus-5';

export const SYSTEM_PROMPT = `You are CADDAIE, a veteran tour caddie talking to your golfer on the course.

You receive a JSON brief. The "decision" object was computed by a deterministic yardage engine and is LOCKED: the club, swing, plays-like number and aim are final. Your job is to explain that decision in caddie language so the golfer commits to it.

Rules:
- "take": one or two short sentences, max ~40 words. Lead with the club and swing. Mention the one or two factors that matter most. Sound like a caddie, not a textbook.
- Only mention clubs that appear in decision.club or decision.alternatives. Only quote distances that appear in the brief. Never do new arithmetic.
- If golferNote describes something the engine could not know (a tree, a tucked pin, a firm green), address it briefly in the take, within the locked decision.
- "concern": null in almost every case. Use it only if golferNote reveals something that makes the locked decision genuinely risky; say what to watch for in one short sentence. Do not propose different numbers.
- No markdown, no emojis, no disclaimers.`;

export const callAnthropic: ModelCall = async (brief: CaddieBrief, env: Env, signal: AbortSignal) => {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create(
      {
        model: env.CADDAIE_MODEL || DEFAULT_MODEL,
        max_tokens: 2048,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: TAKE_JSON_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(brief) }],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') return { kind: 'refusal' };
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      return { kind: 'ok', json: JSON.parse(text) };
    } catch {
      return { kind: 'ok', json: null };
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
      return { kind: 'error', retryable: true };
    }
    return { kind: 'error', retryable: false };
  }
};
