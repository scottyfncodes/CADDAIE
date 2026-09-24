/** The answer. Everything else on screen exists to feed this card. */
import { localTake } from '../ai/localVoice';
import { aimText, displayMath, fmtDistance, swingText } from '../core/format';
import type { CaddieResult, Recommendation as Rec } from '../core/types';
import { distanceLabel, type Units } from '../core/units';

const CONFIDENCE_TEXT = { high: 'Confident', medium: 'Good call', low: 'Tough one' } as const;

export function RecommendationCard({ result, units, onFocusField }: { result: CaddieResult; units: Units; onFocusField: (f: string) => void }) {
  if (result.status !== 'ok') {
    const isInvalid = result.status === 'invalid';
    const text = isInvalid ? result.message : result.prompt;
    return (
      <section class={`hero hero-empty${isInvalid ? ' hero-invalid' : ''}`} aria-live="polite" data-testid="recommendation" aria-label="Caddie recommendation">
        <p class="hero-kicker">{isInvalid ? 'Check that number' : 'Ready when you are'}</p>
        <p class="hero-ask" role={isInvalid ? 'alert' : undefined}>
          {text}
        </p>
        {result.field === 'clubs' ? (
          <button type="button" class="btn" onClick={() => onFocusField('settings')}>
            Open Settings
          </button>
        ) : (
          <button type="button" class="btn ghost" onClick={() => onFocusField(result.field)}>
            {result.field === 'distance' ? 'Enter distance' : 'Fix it'}
          </button>
        )}
      </section>
    );
  }
  return <Answer rec={result} units={units} />;
}

function Answer({ rec, units }: { rec: Rec; units: Units }) {
  const unit = distanceLabel(units.distance);
  const { total } = displayMath(rec, units);
  const aim = aimText(rec.aim, units);
  return (
    <section class="hero" aria-live="polite" data-testid="recommendation" aria-label="Caddie recommendation">
      <div class="hero-top">
        <p class="hero-kicker">
          CADD<span class="ai-ink">AI</span>E says
        </p>
        <span class={`pill conf-${rec.confidence}`}>{CONFIDENCE_TEXT[rec.confidence]}</span>
      </div>
      <h2 class="hero-club" data-testid="club">
        {rec.club.name}
      </h2>
      <p class="hero-swing" data-testid="swing">
        {swingText(rec)}
        {rec.swing === 'partial' && rec.swingPct !== undefined && ` · ~${Math.round(rec.swingPct * 100)}%`}
      </p>
      <dl class="hero-stats">
        <div>
          <dt>Plays like</dt>
          <dd data-testid="plays-like">
            {total}
            <small> {unit}</small>
          </dd>
        </div>
        <div>
          <dt>Aim</dt>
          <dd class="aim" data-testid="aim">
            {rec.aim.yards === 0 ? (
              'Center'
            ) : (
              <>
                {fmtDistance(Math.abs(rec.aim.yards), units)}
                <small> {unit}</small> {rec.aim.yards > 0 ? 'R' : 'L'}
              </>
            )}
          </dd>
        </div>
        {rec.leaves !== undefined && (
          <div>
            <dt>Leaves</dt>
            <dd>
              {fmtDistance(rec.leaves, units)}
              <small> {unit}</small>
            </dd>
          </div>
        )}
      </dl>
      <p class="hero-take" data-testid="local-take">
        {localTake(rec, units)}
      </p>
      {rec.aim.yards !== 0 && rec.aim.reasons.length > 0 && (
        <p class="hero-aim-why">
          {aim} — {rec.aim.reasons.join(', ')}.
        </p>
      )}
      {rec.alternatives.length > 0 && (
        <ul class="alts" aria-label="Other options">
          {rec.alternatives.map((a) => (
            <li key={a.club.id}>
              <strong>{a.club.name}</strong> <span>{a.note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The arithmetic, shown so the golfer can trust (or overrule) the number. */
export function WhyPanel({ rec, units }: { rec: Rec; units: Units }) {
  const unit = distanceLabel(units.distance);
  const { distance, rows, total } = displayMath(rec, units);
  return (
    <section class="card why" aria-labelledby="why-title">
      <h2 id="why-title" class="card-title">
        Why
      </h2>
      <table class="math" data-testid="math">
        <tbody>
          <tr>
            <th scope="row">To target</th>
            <td>
              {distance} {unit}
            </td>
          </tr>
          {rows.map((r) => (
            <tr key={r.kind}>
              <th scope="row">{r.label}</th>
              <td class={r.shown > 0 ? 'plus' : 'minus'}>
                {r.shown > 0 ? '+' : '−'}
                {Math.abs(r.shown)}
              </td>
            </tr>
          ))}
          <tr class="total">
            <th scope="row">Plays like</th>
            <td>
              {total} {unit}
            </td>
          </tr>
          <tr class="carry">
            <th scope="row">{rec.club.name} carries</th>
            <td>
              {fmtDistance(rec.club.carry, units)} {unit}
            </td>
          </tr>
        </tbody>
      </table>
      {rec.notes.length > 0 && (
        <ul class="notes">
          {rec.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
