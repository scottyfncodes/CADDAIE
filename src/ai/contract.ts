/**
 * The contract between CADDAIE and its AI layer. Shared verbatim by the
 * browser client and the Cloudflare Worker so both sides enforce the same rules.
 *
 * The AI receives a *locked* decision computed by the deterministic engine and
 * is only allowed to explain it in caddie language. `checkTake` rejects any
 * response that names a club or yardage the engine didn't produce, so an LLM
 * can never silently override the math.
 */

export const CONTRACT_VERSION = 1;

export interface CaddieBrief {
  v: typeof CONTRACT_VERSION;
  /** Unit label the numbers below are expressed in, e.g. "yds" or "m". */
  unit: string;
  situation: {
    distance: number;
    wind: string;
    elevation: string;
    lie: string;
    stance: string;
    trouble: string[];
    conditions: string[];
  };
  decision: {
    club: string;
    swing: string;
    playsLike: number;
    aim: string;
    confidence: 'high' | 'medium' | 'low';
    adjustments: { label: string; amount: number }[];
    alternatives: { club: string; note: string }[];
    notes: string[];
    leaves: number | null;
  };
  /** Every club in the golfer's bag, used to detect contradictions. */
  bag: string[];
  /** Optional free text from the golfer ("tree overhanging left, pin tucked"). */
  golferNote: string;
}

export interface CaddieTake {
  /** One or two sentences in caddie voice. */
  take: string;
  /** Optional flagged disagreement or caution — displayed as such, never applied. */
  concern: string | null;
}

export const TAKE_LIMITS = { take: 320, concern: 200 } as const;

export const BRIEF_LIMITS = {
  text: 80,
  note: 280,
  listItems: 8,
  bag: 20,
  maxBytes: 6000,
} as const;

/** JSON schema used for structured output from the model. */
export const TAKE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    take: { type: 'string', description: 'One or two short sentences, in caddie voice, explaining the locked decision.' },
    concern: {
      type: ['string', 'null'],
      description: 'A short caution only if something important in the golfer note is not covered; otherwise null.',
    },
  },
  required: ['take', 'concern'],
  additionalProperties: false,
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 10000;
const isStrList = (v: unknown, maxItems: number, maxLen: number): v is string[] =>
  Array.isArray(v) && v.length <= maxItems && v.every((s) => isStr(s, maxLen));

/** Strict structural validation of an incoming brief (used by the Worker on untrusted input). */
export function isValidBrief(v: unknown): v is CaddieBrief {
  if (!isObj(v) || v.v !== CONTRACT_VERSION || !isStr(v.unit, 8)) return false;
  const s = v.situation;
  const d = v.decision;
  const T = BRIEF_LIMITS.text;
  const N = BRIEF_LIMITS.listItems;
  if (!isObj(s) || !isObj(d)) return false;
  if (!isNum(s.distance) || !isStr(s.wind, T) || !isStr(s.elevation, T) || !isStr(s.lie, T) || !isStr(s.stance, T))
    return false;
  if (!isStrList(s.trouble, N, T) || !isStrList(s.conditions, N, T)) return false;
  if (!isStr(d.club, T) || !isStr(d.swing, T) || !isNum(d.playsLike) || !isStr(d.aim, T)) return false;
  if (d.confidence !== 'high' && d.confidence !== 'medium' && d.confidence !== 'low') return false;
  if (!Array.isArray(d.adjustments) || d.adjustments.length > N) return false;
  if (!d.adjustments.every((a) => isObj(a) && isStr(a.label, T) && isNum(a.amount))) return false;
  if (!Array.isArray(d.alternatives) || d.alternatives.length > N) return false;
  if (!d.alternatives.every((a) => isObj(a) && isStr(a.club, T) && isStr(a.note, T))) return false;
  if (!isStrList(d.notes, N, 160)) return false;
  if (!(d.leaves === null || isNum(d.leaves))) return false;
  if (!isStrList(v.bag, BRIEF_LIMITS.bag, T)) return false;
  if (!isStr(v.golferNote, BRIEF_LIMITS.note)) return false;
  return true;
}

export type TakeCheck = { ok: true; take: CaddieTake } | { ok: false; reason: 'malformed' | 'contradiction' };

const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/** Normalise club names so "7-iron", "seven iron", "7 Iron" and "7i" all compare equal. */
export function normalizeClub(name: string): string {
  let s = name.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => NUMBER_WORDS[w]);
  s = s.replace(/\b(\d)\s*(i|iron)\b/g, '$1 iron');
  s = s.replace(/\b(\d)\s*(w|wood)\b/g, '$1 wood');
  s = s.replace(/\b(\d)\s*(h|hybrid)\b/g, '$1 hybrid');
  s = s.replace(/\bpw\b/g, 'pitching wedge').replace(/\bgw\b|\baw\b|\bgap wedge\b/g, 'gap wedge');
  s = s.replace(/\bsw\b/g, 'sand wedge').replace(/\blw\b/g, 'lob wedge');
  return s;
}

const CLUB_PATTERN =
  /\b(?:(?:\d|one|two|three|four|five|six|seven|eight|nine)[\s-]?(?:iron|wood|hybrid|i|w|h)|driver|(?:pitching|gap|sand|lob|approach)\s+wedge|pw|gw|sw|lw)\b/gi;

/** Clubs the text refers to, normalised. */
export function clubsMentioned(text: string): string[] {
  return (text.match(CLUB_PATTERN) ?? []).map(normalizeClub);
}

const YARDAGE_PATTERN = /\b(\d{1,3})\s*(?:yds?|yards?|m\b|meters?|metres?)/gi;

/**
 * Validate a model response against the locked decision.
 * - wrong shape / empty / too long → malformed
 * - mentions a club other than the pick or its listed alternatives → contradiction
 * - quotes a yardage that isn't one the engine produced (±2) → contradiction
 */
export function checkTake(raw: unknown, brief: CaddieBrief): TakeCheck {
  if (!isObj(raw)) return { ok: false, reason: 'malformed' };
  const take = typeof raw.take === 'string' ? raw.take.trim() : '';
  const concernRaw = raw.concern;
  if (!take || take.length > TAKE_LIMITS.take) return { ok: false, reason: 'malformed' };
  if (!(concernRaw === null || concernRaw === undefined || typeof concernRaw === 'string')) {
    return { ok: false, reason: 'malformed' };
  }
  const concern = typeof concernRaw === 'string' && concernRaw.trim() ? concernRaw.trim().slice(0, TAKE_LIMITS.concern) : null;

  const allowedClubs = new Set([brief.decision.club, ...brief.decision.alternatives.map((a) => a.club)].map(normalizeClub));
  // Only the main take is held to the locked clubs; a concern is displayed as a flagged opinion.
  if (clubsMentioned(take).some((c) => !allowedClubs.has(c))) return { ok: false, reason: 'contradiction' };

  const allowedNumbers = [
    brief.situation.distance,
    brief.decision.playsLike,
    ...(brief.decision.leaves !== null ? [brief.decision.leaves] : []),
    ...brief.decision.adjustments.map((a) => Math.abs(a.amount)),
    ...numbersIn(brief.decision.aim),
    ...brief.decision.alternatives.flatMap((a) => numbersIn(a.note)),
    ...brief.decision.notes.flatMap(numbersIn),
  ];
  for (const m of take.matchAll(YARDAGE_PATTERN)) {
    const n = Number(m[1]);
    if (!allowedNumbers.some((a) => Math.abs(a - n) <= 2)) return { ok: false, reason: 'contradiction' };
  }
  return { ok: true, take: { take, concern } };
}

const numbersIn = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
