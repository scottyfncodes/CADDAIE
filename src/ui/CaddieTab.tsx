/**
 * CADDIE: one clear recommendation for the shot in front of you, built from
 * the deterministic engine, the golfer's own club data, the pin and the trouble.
 */
import { useMemo, useState } from 'preact/hooks';
import { fmtDistance } from '../core/format';
import { LIMITS, recommend } from '../core/recommend';
import { holeNumber, holeYardage, roundPars, type Round } from '../core/round';
import { holePlan, targetAdvice } from '../core/strategy';
import type { Lie, PlayerContext, Stance } from '../core/types';
import {
  distanceLabel,
  fahrenheitTo,
  feetTo,
  heightLabel,
  mphTo,
  tempLabel,
  toFahrenheit,
  toFeet,
  toMph,
  toYards,
  windLabel,
  yardsTo,
} from '../core/units';
import {
  CONDITIONS_FAILURE_TEXT,
  fetchLiveConditions,
  relativeWindDeg,
  type ConditionsFailure,
  type LiveConditions,
} from '../services/conditions';
import { defaultSituation } from '../state/profile';
import { playingIndex, useApp } from './context';
import { Field, NumberField, Segmented, Stepper } from './controls';
import { Icon } from './kit';
import { PinPicker } from './PinPicker';
import { RecommendationCard, WhyPanel } from './Recommendation';
import { ShotTracker } from './ShotTracker';
import { TroublePicker } from './TroublePicker';
import { AimingPicker, WindPicker, compassName } from './WindPicker';

const LIES: { value: Lie; label: string }[] = [
  { value: 'tee', label: 'Tee' },
  { value: 'fairway', label: 'Fairway' },
  { value: 'first-cut', label: 'First cut' },
  { value: 'rough', label: 'Rough' },
  { value: 'deep-rough', label: 'Deep rough' },
  { value: 'bunker', label: 'Bunker' },
  { value: 'hardpan', label: 'Hardpan' },
];

const STANCES: { value: Stance; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'uphill', label: 'Uphill lie' },
  { value: 'downhill', label: 'Downhill lie' },
  { value: 'ball-above', label: 'Ball above feet' },
  { value: 'ball-below', label: 'Ball below feet' },
];

type Live =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ok'; data: LiveConditions; aimingDeg: number | null }
  | { phase: 'error'; reason: ConditionsFailure };

export function CaddieTab() {
  const app = useApp();
  const { profile, units: u, shot, setShot, clubs, pin, setPin, range, setRange, active, clubStats, learned } = app;
  const [live, setLive] = useState<Live>({ phase: 'idle' });

  const ctx: PlayerContext = useMemo(
    () => ({ clubs, handedness: profile.handedness, tendency: profile.tendency, baseline: profile.baseline }),
    [clubs, profile.handedness, profile.tendency, profile.baseline],
  );
  const result = useMemo(() => recommend(shot, ctx), [shot, ctx]);
  const update = (patch: Partial<typeof shot>) => setShot((s) => ({ ...s, ...patch }));
  const hcp = playingIndex(app);
  const advice = result.status === 'ok' ? targetAdvice({ pin, trouble: shot.trouble, handicap: hcp, clubCarry: result.club.carry }) : null;

  const focusField = (f: string) => {
    if (f === 'settings' || f === 'clubs') return app.openSettings();
    const el = document.getElementById(f === 'distance' ? 'distance' : `${f}-section`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLInputElement) el.focus();
  };

  const newShot = () => {
    setShot((s) => ({ ...defaultSituation(), wind: s.wind, temperatureF: s.temperatureF, altitudeFt: s.altitudeFt }));
    setPin(null);
    setRange(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => document.getElementById('distance')?.focus());
  };

  const getLive = async () => {
    setLive({ phase: 'loading' });
    const r = await fetchLiveConditions();
    if (!r.ok) return setLive({ phase: 'error', reason: r.reason });
    const prevAim = live.phase === 'ok' ? live.aimingDeg : null;
    setLive({ phase: 'ok', data: r.conditions, aimingDeg: prevAim });
    update({
      temperatureF: Math.round(r.conditions.temperatureF),
      altitudeFt: r.conditions.altitudeFt !== null ? Math.round(r.conditions.altitudeFt) : shot.altitudeFt,
      wind: {
        speedMph: Math.min(50, Math.round(r.conditions.windMph)),
        fromDeg: prevAim !== null ? relativeWindDeg(r.conditions.windFromDeg, prevAim) : shot.wind.fromDeg,
      },
    });
  };

  const setAiming = (deg: number) => {
    if (live.phase !== 'ok') return;
    setLive({ ...live, aimingDeg: deg });
    update({ wind: { speedMph: shot.wind.speedMph, fromDeg: relativeWindDeg(live.data.windFromDeg, deg) } });
  };

  const setDistance = (yd: number | null) => {
    update({ distance: yd });
  };

  const distDisplay = shot.distance === null ? null : yardsTo(shot.distance, u.distance);
  const windDisplay = Math.round(mphTo(shot.wind.speedMph, u.wind));
  const elevDisplay = Math.round(feetTo(shot.elevationFt, u.height));
  const distInvalid = result.status === 'invalid' && result.field === 'distance';
  const stat = result.status === 'ok' ? clubStats.get(result.club.id) ?? null : null;

  return (
    <div class="stack">
      {active && <HolePlanCard round={active} />}

      <section class="card distance-card" aria-labelledby="distance-label">
        <div class="field-head">
          <label id="distance-label" class="field-label" for="distance">
            Distance to target
          </label>
          <button type="button" class="btn small accent" onClick={app.openRangefinder} data-testid="open-rangefinder">
            <Icon name="camera" size={18} /> Rangefinder
          </button>
        </div>
        <div class="distance-row">
          <button type="button" class="step big" aria-label="Minus 5" onClick={() => setDistance(stepDist(distDisplay, -5, u.distance))}>
            −5
          </button>
          <div class="distance-input-wrap">
            <NumberField
              id="distance"
              label={`Distance to target in ${distanceLabel(u.distance)}`}
              value={distDisplay}
              min={LIMITS.distance.min}
              max={LIMITS.distance.max}
              class={`distance-input${distInvalid ? ' invalid' : ''}`}
              placeholder="150"
              invalid={distInvalid}
              onChange={(v) => setDistance(v === null ? null : toYards(v, u.distance))}
            />
            <span class="distance-unit">{distanceLabel(u.distance)}</span>
          </div>
          <button type="button" class="step big" aria-label="Plus 5" onClick={() => setDistance(stepDist(distDisplay, 5, u.distance))}>
            +5
          </button>
        </div>
        <div class="nudge">
          <button type="button" class="chip" aria-label="Minus 1" onClick={() => setDistance(stepDist(distDisplay, -1, u.distance))}>
            −1
          </button>
          <button type="button" class="chip" aria-label="Plus 1" onClick={() => setDistance(stepDist(distDisplay, 1, u.distance))}>
            +1
          </button>
        </div>
        {range?.green && (
          <div class="green-chips" role="group" aria-label="Play to" data-testid="green-chips">
            {(['front', 'center', 'back'] as const).map((k) => {
              const yd = range.green![k];
              const on = shot.distance !== null && Math.abs(shot.distance - yd) < 0.5;
              return (
                <button key={k} type="button" class={`chip${on ? ' on' : ''}`} onClick={() => setDistance(Math.max(1, Math.round(yd)))}>
                  <small>{k === 'center' ? 'Middle' : k === 'front' ? 'Front' : 'Back'}</small> {fmtDistance(yd, u)}
                </button>
              );
            })}
          </div>
        )}
        {range && <p class="fine">{range.label}</p>}
      </section>

      <RecommendationCard
        result={result}
        units={u}
        onFocusField={focusField}
        advice={advice}
        clubStat={stat}
        learned={result.status === 'ok' && learned.has(result.club.id)}
        usePersonalLine
      />

      {result.status === 'ok' && active && (
        <details class="card">
          <summary>
            <span class="card-title">Hit it? Track this shot</span>
          </summary>
          <ShotTracker hole={holeNumber(active, active.current)} defaultClub={result.club.id} compact />
        </details>
      )}

      <section class="card" aria-labelledby="green-label">
        <h3 class="field-label" id="green-label">
          The green
        </h3>
        <div class="green-grid">
          <PinPicker value={pin} onChange={setPin} />
          <div>
            <p class="sub">Trouble — tap where you can't miss</p>
            <TroublePicker value={shot.trouble} onChange={(trouble) => update({ trouble })} />
          </div>
        </div>
      </section>

      <section class="card" id="wind-section" aria-labelledby="wind-label">
        <div class="field-head">
          <h3 class="field-label" id="wind-label">
            Wind
          </h3>
          <button type="button" class="btn small ghost" onClick={getLive} disabled={live.phase === 'loading'} data-testid="live-weather">
            {live.phase === 'loading' ? (
              <>
                <span class="spinner" aria-hidden="true" /> Getting weather…
              </>
            ) : live.phase === 'ok' ? (
              'Refresh live'
            ) : (
              'Use live weather'
            )}
          </button>
        </div>
        <div aria-live="polite">
          {live.phase === 'error' && (
            <p class="banner warn" data-testid="live-error">
              {CONDITIONS_FAILURE_TEXT[live.reason]}
            </p>
          )}
          {live.phase === 'ok' && (
            <div class="live" data-testid="live-ok">
              <p>
                Live: <strong>{Math.round(mphTo(live.data.windMph, u.wind))} {windLabel(u.wind)}</strong> from <strong>{compassName(live.data.windFromDeg)}</strong>
                {live.data.gustMph !== null && live.data.gustMph > live.data.windMph + 4 && <> · gusts {Math.round(mphTo(live.data.gustMph, u.wind))}</>} ·{' '}
                {Math.round(fahrenheitTo(live.data.temperatureF, u.temperature))}
                {tempLabel(u.temperature)}
              </p>
              <p class="sub">{live.aimingDeg === null ? 'Which way are you hitting? That places the wind.' : 'Hitting toward'}</p>
              <AimingPicker value={live.aimingDeg} onChange={setAiming} />
              <p class="fine">Weather station wind at 10 m, from Open-Meteo. Wind on the course can differ.</p>
            </div>
          )}
        </div>
        <div class="wind-grid">
          <WindPicker fromDeg={shot.wind.fromDeg} onChange={(deg) => update({ wind: { ...shot.wind, fromDeg: deg } })} disabled={shot.wind.speedMph === 0} />
          <div class="wind-speed">
            <Stepper
              label="Wind speed"
              value={windDisplay}
              step={u.wind === 'kmh' ? 5 : 2}
              min={0}
              max={Math.round(mphTo(50, u.wind))}
              unit={windLabel(u.wind)}
              describe={(v) => (v === 0 || v === null ? 'Calm' : `${v} ${windLabel(u.wind)}`)}
              onChange={(v) => update({ wind: { ...shot.wind, speedMph: toMph(v ?? 0, u.wind) } })}
            />
            <Segmented
              label="Quick wind speed"
              value={String(windDisplay)}
              options={(u.wind === 'kmh' ? [0, 10, 20, 30] : [0, 5, 10, 20]).map((n) => ({ value: String(n), label: n === 0 ? 'Calm' : String(n) }))}
              onChange={(v) => update({ wind: { ...shot.wind, speedMph: toMph(Number(v), u.wind) } })}
              columns={4}
            />
          </div>
        </div>
      </section>

      <section class="card" id="elevation-section">
        <Field label="Elevation" hint={elevDisplay === 0 ? 'Level' : elevDisplay > 0 ? 'Target above you' : 'Target below you'}>
          <Stepper
            label="Elevation change"
            value={elevDisplay}
            step={u.height === 'm' ? 2 : 5}
            min={Math.round(feetTo(-300, u.height))}
            max={Math.round(feetTo(300, u.height))}
            unit={heightLabel(u.height)}
            describe={(v) => (!v ? 'Flat' : `${v > 0 ? 'Up' : 'Down'} ${Math.abs(v)} ${heightLabel(u.height)}`)}
            onChange={(v) => update({ elevationFt: toFeet(v ?? 0, u.height) })}
          />
        </Field>
      </section>

      <section class="card">
        <Field label="Lie">
          <Segmented label="Lie" value={shot.lie} options={LIES} onChange={(lie) => update({ lie })} columns={4} />
        </Field>
        <Field label="Stance">
          <Segmented label="Stance" value={shot.stance} options={STANCES} onChange={(stance) => update({ stance })} columns={3} />
        </Field>
      </section>

      <details class="card air" id="temperature-section">
        <summary>
          <span class="field-label">Air</span>
          <span class="field-hint">
            {shot.temperatureF === null ? 'Normal' : `${Math.round(fahrenheitTo(shot.temperatureF, u.temperature))}${tempLabel(u.temperature)}`}
            {' · '}
            {shot.altitudeFt === null ? 'Home altitude' : `${Math.round(feetTo(shot.altitudeFt, u.height)).toLocaleString()} ${heightLabel(u.height)}`}
          </span>
        </summary>
        <Field label="Temperature">
          <Stepper
            label="Temperature"
            value={shot.temperatureF === null ? null : Math.round(fahrenheitTo(shot.temperatureF, u.temperature))}
            step={u.temperature === 'C' ? 2 : 5}
            min={Math.round(fahrenheitTo(-10, u.temperature))}
            max={Math.round(fahrenheitTo(125, u.temperature))}
            unit={tempLabel(u.temperature)}
            seed={Math.round(fahrenheitTo(profile.baseline.temperatureF, u.temperature))}
            nullable
            describe={(v) => (v === null ? 'Normal' : `${v}${tempLabel(u.temperature)}`)}
            onChange={(v) => update({ temperatureF: v === null ? null : toFahrenheit(v, u.temperature) })}
          />
        </Field>
        <Field label="Course altitude" id="altitude-section">
          <Stepper
            label="Course altitude"
            value={shot.altitudeFt === null ? null : Math.round(feetTo(shot.altitudeFt, u.height))}
            step={u.height === 'm' ? 100 : 250}
            min={0}
            max={Math.round(feetTo(14000, u.height))}
            unit={heightLabel(u.height)}
            seed={Math.round(feetTo(profile.baseline.altitudeFt, u.height))}
            nullable
            describe={(v) => (v === null ? 'Same as home' : `${v.toLocaleString()} ${heightLabel(u.height)}`)}
            onChange={(v) => update({ altitudeFt: v === null ? null : toFeet(v, u.height) })}
          />
        </Field>
      </details>

      {result.status === 'ok' && <WhyPanel rec={result} units={u} learned={learned.has(result.club.id)} />}

      <button type="button" class="btn ghost wide" onClick={newShot} data-testid="new-shot">
        New shot
      </button>
    </div>
  );
}

/** "How should I play this hole?" — shown when a round is in progress. */
function HolePlanCard({ round }: { round: Round }) {
  const { golf, clubs, clubStats, units, go } = useApp();
  const idx = round.current;
  const par = roundPars(round)[idx] ?? 4;
  const yards = holeYardage(round, idx);
  const number = holeNumber(round, idx);
  const plan = useMemo(() => {
    const done = golf.rounds.filter((r) => r.status === 'complete' && r.source === 'app').sort((a, b) => b.date - a.date);
    const misses = { left: 0, right: 0, hit: 0 };
    for (const r of done.slice(0, 10)) for (const h of r.holes) {
      if (h.fairway === 'left') misses.left++;
      else if (h.fairway === 'right') misses.right++;
      else if (h.fairway === 'hit') misses.hit++;
    }
    const history = done
      .filter((r) => r.courseId && r.courseId === round.courseId)
      .map((r) => r.holes[number - 1 - r.startHole]?.strokes)
      .filter((s): s is number => typeof s === 'number');
    const driver = clubs.find((c) => c.type === 'driver');
    const drive = driver ? clubStats.get(driver.id) : undefined;
    return holePlan({ par, yards, clubs, driveTotal: drive && drive.count >= 3 ? drive.recent : null, misses, history });
  }, [golf.rounds, clubs, clubStats, par, yards, number, round.courseId]);

  return (
    <section class="card plan" aria-label="How to play this hole" data-testid="hole-plan">
      <div class="plan-head">
        <p class="eyebrow">
          Hole {number} · Par {par}
          {yards !== null && ` · ${fmtDistance(yards, units)} ${distanceLabel(units.distance)}`}
        </p>
        <button type="button" class="link" onClick={() => go('round')}>
          Scorecard
        </button>
      </div>
      {plan.teeClub && (
        <p class="plan-club">
          Off the tee: <strong>{plan.teeClub.name}</strong>
        </p>
      )}
      <ul class="plan-lines">
        {plan.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

function stepDist(current: number | null, delta: number, unit: 'yd' | 'm'): number {
  const base = current === null ? (unit === 'm' ? 135 : 150) : Math.round(current);
  const next = Math.min(LIMITS.distance.max, Math.max(LIMITS.distance.min, base + delta));
  return toYards(next, unit);
}
