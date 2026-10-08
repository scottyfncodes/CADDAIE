/**
 * GPS shot tracking: tap "Hitting from here" before each shot. When you hit
 * the next one (or mark where the ball finished), CADDAIE measures the walk.
 * That is start-to-finish distance, so it includes roll, and it's only as
 * good as the two GPS fixes.
 */
import { useState } from 'preact/hooks';
import { distanceYards } from '../core/geo';
import type { ShotRecord } from '../core/shots';
import { fmtDistance } from '../core/format';
import { distanceLabel } from '../core/units';
import { newId } from '../state/golf';
import { currentFix, GPS_ERROR_TEXT } from '../services/sensors';
import { useApp } from './context';

/** Worst combined GPS error we'll accept for a measured shot, in metres. */
const MAX_ERROR_M = 30;

export function ShotTracker({ hole, defaultClub, compact }: { hole: number | null; defaultClub: string | null; compact?: boolean }) {
  const { golf, updateGolf, profile, active, units } = useApp();
  const bag = profile.clubs.filter((c) => c.inBag);
  const [club, setClub] = useState<string>(defaultClub ?? bag.find((c) => c.type === 'driver')?.id ?? bag[0]?.id ?? '');
  const [full, setFull] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const roundId = active?.id ?? null;
  const pending = [...golf.shots].reverse().find((s) => s.from && s.distance === null && s.roundId === roundId && (roundId === null || s.hole === hole)) ?? null;
  const done = golf.shots.filter((s) => roundId && s.roundId === roundId && s.hole === hole && s.distance !== null);
  const clubName = (id: string) => profile.clubs.find((c) => c.id === id)?.name ?? id;

  const mark = async (startNew: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const fix = await currentFix();
      updateGolf((g) => {
        let shots = g.shots;
        let note: string | null = null;
        if (pending?.from) {
          const err = pending.from.accuracy + fix.accuracy;
          const yds = distanceYards(pending.from, fix);
          if (err > MAX_ERROR_M) {
            note = `GPS was too rough (±${Math.round(err / 0.9144)} yds) to measure that ${clubName(pending.clubId)}.`;
            shots = shots.filter((s) => s.id !== pending.id);
          } else if (yds < 5 || yds > 450) {
            note = 'That distance doesn’t look like a shot, so it wasn’t saved.';
            shots = shots.filter((s) => s.id !== pending.id);
          } else {
            shots = shots.map((s) => (s.id === pending.id ? { ...s, distance: Math.round(yds), from: null } : s));
            note = `${clubName(pending.clubId)}: ${fmtDistance(yds, units)} ${distanceLabel(units.distance)} (±${Math.max(1, Math.round(err / 0.9144 / 2))}).`;
          }
        }
        if (startNew && club) {
          const rec: ShotRecord = { id: newId(), at: Date.now(), clubId: club, distance: null, source: 'gps', full, roundId, hole, from: { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy } };
          shots = [...shots, rec];
        }
        setMsg(note ?? (startNew ? `Marked. Hit your ${clubName(club)}, then tap again from where it lands.` : null));
        return { ...g, shots };
      });
    } catch (e) {
      const reason = (e as Error).message === 'denied' ? 'denied' : (e as Error).message === 'unsupported' ? 'unsupported' : 'unavailable';
      setMsg(GPS_ERROR_TEXT[reason]);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => pending && updateGolf((g) => ({ ...g, shots: g.shots.filter((s) => s.id !== pending.id) }));

  return (
    <section class={`tracker${compact ? ' compact' : ''}`} aria-label="Track shots with GPS" data-testid="tracker">
      {!compact && (
        <p class="muted">Tap before each shot. CADDAIE measures it when you mark the next one, and learns your real distances.</p>
      )}
      <label class="inline-select">
        <span>Club</span>
        <select value={club} onChange={(e) => setClub((e.currentTarget as HTMLSelectElement).value)} aria-label="Club for this shot">
          {bag.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label class="check-row">
        <input type="checkbox" checked={full} onChange={(e) => setFull((e.currentTarget as HTMLInputElement).checked)} />
        <span>Full swing (counts toward your averages)</span>
      </label>
      <div class="row">
        <button type="button" class="btn" disabled={busy || !club} onClick={() => mark(true)} data-testid="mark-shot">
          {busy ? 'Getting GPS…' : 'Hitting from here'}
        </button>
        {pending && (
          <button type="button" class="btn ghost" disabled={busy} onClick={() => mark(false)} data-testid="mark-finish">
            Ball finished here
          </button>
        )}
      </div>
      {pending && (
        <p class="tracker-pending">
          Measuring your {clubName(pending.clubId)}…{' '}
          <button type="button" class="link" onClick={cancel}>
            Cancel
          </button>
        </p>
      )}
      <p class="tracker-msg" aria-live="polite" data-testid="tracker-msg">
        {msg}
      </p>
      {done.length > 0 && (
        <ul class="tracker-list">
          {done.map((s) => (
            <li key={s.id}>
              {clubName(s.clubId)} <strong>{fmtDistance(s.distance ?? 0, units)}</strong> {distanceLabel(units.distance)}
              {!s.full && <span class="muted"> · partial</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
