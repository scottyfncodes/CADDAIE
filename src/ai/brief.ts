/** Turn a deterministic Recommendation into the locked brief the AI is allowed to explain. */
import { aimText, displayMath, fmtDistance, fmtHeight, fmtTemp, lieText, stanceText, swingText, windText } from '../core/format';
import type { Club, Recommendation } from '../core/types';
import { distanceLabel, type Units } from '../core/units';
import { BRIEF_LIMITS, CONTRACT_VERSION, type CaddieBrief } from './contract';

const TROUBLE_TEXT = { short: 'trouble short', long: 'trouble long', left: 'trouble left', right: 'trouble right' } as const;

export function buildBrief(rec: Recommendation, bag: Club[], units: Units, golferNote = ''): CaddieBrief {
  const math = displayMath(rec, units);
  const { input } = rec;
  const conditions: string[] = [];
  if (input.temperatureF !== null) conditions.push(`${fmtTemp(input.temperatureF, units)} air`);
  if (input.altitudeFt !== null) conditions.push(`${fmtHeight(input.altitudeFt, units)} altitude`);
  return {
    v: CONTRACT_VERSION,
    unit: distanceLabel(units.distance),
    situation: {
      distance: math.distance,
      wind: windText(input.wind.speedMph, input.wind.fromDeg, units),
      elevation: input.elevationFt === 0 ? 'level' : `${fmtHeight(Math.abs(input.elevationFt), units)} ${input.elevationFt > 0 ? 'uphill' : 'downhill'}`,
      lie: lieText(input.lie),
      stance: stanceText(input.stance),
      trouble: input.trouble.map((t) => TROUBLE_TEXT[t]),
      conditions,
    },
    decision: {
      club: rec.club.name,
      swing: swingText(rec),
      playsLike: math.total,
      aim: aimText(rec.aim, units),
      confidence: rec.confidence,
      adjustments: math.rows.map((r) => ({ label: r.label.slice(0, BRIEF_LIMITS.text), amount: r.shown })),
      alternatives: rec.alternatives.map((a) => ({ club: a.club.name, note: a.note.slice(0, BRIEF_LIMITS.text) })),
      notes: rec.notes.slice(0, BRIEF_LIMITS.listItems).map((n) => n.slice(0, 160)),
      leaves: rec.leaves !== undefined ? fmtDistance(rec.leaves, units) : null,
    },
    bag: bag.filter((c) => c.inBag).slice(0, BRIEF_LIMITS.bag).map((c) => c.name.slice(0, BRIEF_LIMITS.text)),
    golferNote: golferNote.trim().slice(0, BRIEF_LIMITS.note),
  };
}

/** Stable cache key so identical situations never trigger a second AI call. */
export function briefKey(b: CaddieBrief): string {
  return JSON.stringify([b.situation, b.decision.club, b.decision.swing, b.decision.playsLike, b.decision.aim, b.golferNote]);
}
