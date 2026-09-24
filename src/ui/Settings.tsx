/** Golfer profile: bag, units, tendencies and AI connection. Saved on every change. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { normalizeEndpoint } from '../ai/client';
import { findGapIssues } from '../core/clubs';
import type { Club } from '../core/types';
import { IMPERIAL, METRIC, distanceLabel, feetTo, heightLabel, toFeet, toYards, yardsTo } from '../core/units';
import { defaultProfile, type Profile } from '../state/profile';
import { NumberField, Segmented } from './controls';
import { Wordmark } from './Wordmark';

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  onClose: () => void;
  buildEndpoint: string | null;
  storageOk: boolean;
}

export function Settings({ profile, onChange, onClose, buildEndpoint, storageOk }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const u = profile.units;
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const setClub = (id: string, patch: Partial<Club>) => set({ clubs: profile.clubs.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const gaps = findGapIssues(profile.clubs.filter((c) => c.carry > 0));
  const endpointOverride = profile.aiEndpoint.trim();
  const endpointInvalid = endpointOverride !== '' && !normalizeEndpoint(endpointOverride);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);

  return (
    <dialog ref={dialog} class="sheet" aria-labelledby="settings-title" onCancel={(e) => (e.preventDefault(), onClose())}>
      <header class="sheet-head">
        <h2 id="settings-title">Settings</h2>
        <button type="button" class="btn small" onClick={onClose} data-testid="close-settings">
          Done
        </button>
      </header>

      <div class="sheet-body">
        {!storageOk && (
          <p class="banner warn" role="status">
            This browser isn't letting CADDAIE save (private browsing?). Settings will reset when you close the app.
          </p>
        )}

        <section class="card">
          <h3 class="card-title">Your bag</h3>
          <p class="muted">Stock full-swing carry. The more honest these are, the better the caddie.</p>
          <ul class="bag" data-testid="bag">
            {profile.clubs.map((c) => (
              <li key={c.id} class={c.inBag ? '' : 'out'}>
                <label class="bag-toggle">
                  <input type="checkbox" checked={c.inBag} onChange={(e) => setClub(c.id, { inBag: (e.currentTarget as HTMLInputElement).checked })} />
                  <span>{c.name}</span>
                </label>
                <span class="bag-carry">
                  <NumberField
                    id={`carry-${c.id}`}
                    label={`${c.name} carry in ${distanceLabel(u.distance)}`}
                    value={c.carry > 0 ? yardsTo(c.carry, u.distance) : null}
                    min={1}
                    max={400}
                    class="carry-input"
                    onChange={(v) => setClub(c.id, { carry: v === null ? 0 : toYards(v, u.distance) })}
                  />
                  <small>{distanceLabel(u.distance)}</small>
                </span>
              </li>
            ))}
          </ul>
          {gaps.length > 0 && (
            <ul class="gaps" aria-label="Distance gaps">
              {gaps.map((g) => (
                <li key={g.longer.id}>
                  {g.longer.short} → {g.shorter.short}: {Math.round(yardsTo(g.gap, u.distance))} {distanceLabel(u.distance)}{' '}
                  {g.gap < 4 ? '— these two overlap' : '— big gap, expect choked-down shots'}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="card">
          <h3 class="card-title">Units</h3>
          <Segmented
            label="Unit system"
            value={u.distance === 'm' ? 'metric' : 'imperial'}
            options={[
              { value: 'imperial', label: 'Yards · mph · °F' },
              { value: 'metric', label: 'Meters · km/h · °C' },
            ]}
            onChange={(v) => set({ units: v === 'metric' ? { ...METRIC } : { ...IMPERIAL } })}
            columns={2}
          />
        </section>

        <section class="card">
          <h3 class="card-title">You</h3>
          <p class="sub">Handedness</p>
          <Segmented
            label="Handedness"
            value={profile.handedness}
            options={[
              { value: 'right', label: 'Right-handed' },
              { value: 'left', label: 'Left-handed' },
            ]}
            onChange={(v) => set({ handedness: v })}
            columns={2}
          />
          <p class="sub">When you miss the number, you usually…</p>
          <Segmented
            label="Distance tendency"
            value={profile.tendency}
            options={[
              { value: 'short', label: 'Come up short' },
              { value: 'neutral', label: 'Hit it right' },
              { value: 'long', label: 'Go long' },
            ]}
            onChange={(v) => set({ tendency: v })}
            columns={3}
          />
          <p class="sub">Home course altitude (where your carries were measured)</p>
          <div class="inline-field">
            <NumberField
              id="home-altitude"
              label={`Home altitude in ${heightLabel(u.height)}`}
              value={Math.round(feetTo(profile.baseline.altitudeFt, u.height))}
              min={0}
              max={14000}
              class="carry-input wide"
              onChange={(v) => set({ baseline: { ...profile.baseline, altitudeFt: Math.min(14000, toFeet(v ?? 0, u.height)) } })}
            />
            <small>{heightLabel(u.height)}</small>
          </div>
        </section>

        <section class="card">
          <h3 class="card-title">
            <span class="ai-ink">AI</span> caddie
          </h3>
          <label class="switch">
            <input type="checkbox" checked={profile.aiEnabled} onChange={(e) => set({ aiEnabled: (e.currentTarget as HTMLInputElement).checked })} />
            <span>Offer AI explanations</span>
          </label>
          <p class="muted">
            The AI only explains CADDAIE's numbers; it can't change them. It sends a short summary of the shot — never your location or
            settings.
          </p>
          <label class="sub" for="ai-endpoint">
            CADDAIE API address {buildEndpoint ? '(optional override)' : ''}
          </label>
          <input
            id="ai-endpoint"
            class="text-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellcheck={false}
            placeholder={buildEndpoint ?? 'https://caddaie-api.example.workers.dev'}
            value={profile.aiEndpoint}
            aria-invalid={endpointInvalid || undefined}
            onInput={(e) => set({ aiEndpoint: (e.currentTarget as HTMLInputElement).value })}
          />
          {endpointInvalid && <p class="error-text">That doesn't look like a web address.</p>}
        </section>

        <section class="card">
          <h3 class="card-title">Start over</h3>
          {confirmReset ? (
            <div class="row">
              <button
                type="button"
                class="btn danger"
                onClick={() => {
                  onChange(defaultProfile());
                  setConfirmReset(false);
                }}
              >
                Reset everything
              </button>
              <button type="button" class="btn ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" class="btn ghost" onClick={() => setConfirmReset(true)}>
              Reset bag and settings
            </button>
          )}
        </section>

        <footer class="about">
          <Wordmark />
          <p class="muted">Everything is stored on this device. Numbers are calculated on your phone, and still work offline.</p>
        </footer>
      </div>
    </dialog>
  );
}
