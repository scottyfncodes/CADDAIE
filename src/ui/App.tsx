import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { normalizeEndpoint } from '../ai/client';
import { displayMath } from '../core/format';
import { LIMITS, recommend } from '../core/recommend';
import type { Lie, PlayerContext, ShotInput, Stance } from '../core/types';
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
import { defaultSituation, loadProfile, loadSituation, safeStorage, saveProfile, saveSituation, type Profile } from '../state/profile';
import { AiPanel } from './AiPanel';
import { Field, NumberField, Segmented, Stepper } from './controls';
import { RecommendationCard, WhyPanel } from './Recommendation';
import { Settings } from './Settings';
import { TroublePicker } from './TroublePicker';
import { AimingPicker, WindPicker, compassName } from './WindPicker';
import { Wordmark } from './Wordmark';

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

const BUILD_ENDPOINT = normalizeEndpoint(import.meta.env.VITE_CADDAIE_API_URL);

type Live =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ok'; data: LiveConditions; aimingDeg: number | null }
  | { phase: 'error'; reason: ConditionsFailure };

export function App() {
  const storage = useMemo(() => safeStorage(), []);
  const [profile, setProfile] = useState<Profile>(() => loadProfile(storage));
  const [shot, setShot] = useState<ShotInput>(() => loadSituation(storage));
  const [note, setNote] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [live, setLive] = useState<Live>({ phase: 'idle' });
  const [storageOk, setStorageOk] = useState(storage !== null);
  const [showMini, setShowMini] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const u = profile.units;

  useEffect(() => {
    if (!saveProfile(profile, storage)) setStorageOk(false);
  }, [profile, storage]);
  useEffect(() => {
    saveSituation(shot, storage);
  }, [shot, storage]);

  // Compact answer bar once the main card scrolls away, so the answer is always in view.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setShowMini(!e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ctx: PlayerContext = useMemo(
    () => ({ clubs: profile.clubs, handedness: profile.handedness, tendency: profile.tendency, baseline: profile.baseline }),
    [profile],
  );
  const result = useMemo(() => recommend(shot, ctx), [shot, ctx]);
  const update = (patch: Partial<ShotInput>) => setShot((s) => ({ ...s, ...patch }));

  const endpoint = profile.aiEnabled ? normalizeEndpoint(profile.aiEndpoint) ?? BUILD_ENDPOINT : null;

  const focusField = (f: string) => {
    if (f === 'settings' || f === 'clubs') return setSettingsOpen(true);
    const el = document.getElementById(f === 'distance' ? 'distance' : `${f}-section`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLInputElement) el.focus();
  };

  const newShot = () => {
    setShot((s) => ({ ...defaultSituation(), wind: s.wind, temperatureF: s.temperatureF, altitudeFt: s.altitudeFt }));
    setNote('');
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

  const distDisplay = shot.distance === null ? null : yardsTo(shot.distance, u.distance);
  const windDisplay = Math.round(mphTo(shot.wind.speedMph, u.wind));
  const elevDisplay = Math.round(feetTo(shot.elevationFt, u.height));
  const distInvalid = result.status === 'invalid' && result.field === 'distance';

  return (
    <div class="app">
      <header class="topbar">
        <Wordmark />
        {showMini && result.status === 'ok' && (
          <button type="button" class="mini" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to recommendation" data-testid="mini">
            <strong>{result.club.short}</strong>
            <span>
              {displayMath(result, u).total} {distanceLabel(u.distance)}
            </span>
          </button>
        )}
        <button type="button" class="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)} data-testid="open-settings">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.94 4.56-.02-2.1 2.02-1.6-2-3.46-2.44.9a8.2 8.2 0 0 0-1.82-1.05L16.3 3.2h-4l-.38 2.55c-.65.26-1.26.6-1.82 1.05l-2.44-.9-2 3.46 2.02 1.6a8.3 8.3 0 0 0 0 2.08l-2.02 1.6 2 3.46 2.44-.9c.56.44 1.17.79 1.82 1.05l.38 2.55h4l.38-2.55c.65-.26 1.26-.6 1.82-1.05l2.44.9 2-3.46-2.02-1.58Z"
            />
          </svg>
        </button>
      </header>

      <main class="layout">
        <div class="col-answer">
          <div ref={heroRef}>
            <RecommendationCard result={result} units={u} onFocusField={focusField} />
          </div>

          <section class="card distance-card" aria-labelledby="distance-label">
            <label id="distance-label" class="field-label" for="distance">
              Distance to target
            </label>
            <div class="distance-row">
              <button type="button" class="step big" aria-label="Minus 5" onClick={() => update({ distance: stepDist(distDisplay, -5, u.distance) })}>
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
                  onChange={(v) => update({ distance: v === null ? null : toYards(v, u.distance) })}
                />
                <span class="distance-unit">{distanceLabel(u.distance)}</span>
              </div>
              <button type="button" class="step big" aria-label="Plus 5" onClick={() => update({ distance: stepDist(distDisplay, 5, u.distance) })}>
                +5
              </button>
            </div>
            <div class="nudge">
              <button type="button" class="chip" aria-label="Minus 1" onClick={() => update({ distance: stepDist(distDisplay, -1, u.distance) })}>
                −1
              </button>
              <button type="button" class="chip" aria-label="Plus 1" onClick={() => update({ distance: stepDist(distDisplay, 1, u.distance) })}>
                +1
              </button>
            </div>
          </section>

          {result.status === 'ok' && <WhyPanel rec={result} units={u} />}
          {result.status === 'ok' && (
            <AiPanel rec={result} bag={profile.clubs} units={u} endpoint={endpoint} note={note} onNote={setNote} />
          )}
        </div>

        <div class="col-inputs">
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
                    Live: <strong>{Math.round(mphTo(live.data.windMph, u.wind))} {windLabel(u.wind)}</strong> from{' '}
                    <strong>{compassName(live.data.windFromDeg)}</strong>
                    {live.data.gustMph !== null && live.data.gustMph > live.data.windMph + 4 && (
                      <> · gusts {Math.round(mphTo(live.data.gustMph, u.wind))}</>
                    )}{' '}
                    · {Math.round(fahrenheitTo(live.data.temperatureF, u.temperature))}
                    {tempLabel(u.temperature)}
                  </p>
                  <p class="sub">{live.aimingDeg === null ? 'Which way are you hitting? That places the wind.' : 'Hitting toward'}</p>
                  <AimingPicker value={live.aimingDeg} onChange={setAiming} />
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

          <section class="card">
            <Field label="Trouble" hint="Tap where you can't miss">
              <TroublePicker value={shot.trouble} onChange={(trouble) => update({ trouble })} />
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

          <button type="button" class="btn ghost wide" onClick={newShot} data-testid="new-shot">
            New shot
          </button>
        </div>
      </main>

      {settingsOpen && (
        <Settings profile={profile} onChange={setProfile} onClose={() => setSettingsOpen(false)} buildEndpoint={BUILD_ENDPOINT} storageOk={storageOk} />
      )}
    </div>
  );
}

function stepDist(current: number | null, delta: number, unit: 'yd' | 'm'): number {
  const base = current === null ? (unit === 'm' ? 135 : 150) : Math.round(current);
  const next = Math.min(LIMITS.distance.max, Math.max(LIMITS.distance.min, base + delta));
  return toYards(next, unit);
}
