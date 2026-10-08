/**
 * Wind direction relative to the target, picked on a compass around the
 * target line. Top of the dial = the target, so "wind from the top" is a headwind.
 */
import { normDeg } from '../core/adjustments';

const DIRS = [
  { deg: 0, label: 'Into', aria: 'Into your face' },
  { deg: 45, label: '', aria: 'Into, off the right' },
  { deg: 90, label: 'R', aria: 'From the right' },
  { deg: 135, label: '', aria: 'Helping, off the right' },
  { deg: 180, label: 'Help', aria: 'Helping, from behind' },
  { deg: 225, label: '', aria: 'Helping, off the left' },
  { deg: 270, label: 'L', aria: 'From the left' },
  { deg: 315, label: '', aria: 'Into, off the left' },
];

export function WindPicker({ fromDeg, onChange, disabled }: { fromDeg: number; onChange: (deg: number) => void; disabled?: boolean }) {
  const current = Math.round(normDeg(fromDeg) / 45) % 8;
  return (
    <div class={`wind-dial${disabled ? ' is-calm' : ''}`} role="radiogroup" aria-label="Wind direction relative to your target">
      <div class="wind-center" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="40" height="40">
          <line x1="20" y1="34" x2="20" y2="8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
          <path d="M20 8 L30 12 L20 16 Z" fill="var(--flag)" />
          <circle cx="20" cy="34" r="3" fill="currentColor" />
        </svg>
        {!disabled && (
          <span class="wind-arrow" style={{ transform: `rotate(${DIRS[current].deg}deg)` }}>
            <span />
          </span>
        )}
      </div>
      {DIRS.map((d, i) => (
        <button
          key={d.deg}
          type="button"
          role="radio"
          aria-checked={i === current}
          aria-label={d.aria}
          class={`wind-dir${i === current ? ' on' : ''}`}
          style={{ '--a': `${d.deg}deg` }}
          onClick={() => onChange(d.deg)}
        >
          <span>{d.label || '•'}</span>
        </button>
      ))}
    </div>
  );
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (deg: number) => COMPASS[Math.round(normDeg(deg) / 45) % 8];

/** Which way the golfer is hitting, used to turn live (absolute) wind into relative wind. */
export function AimingPicker({ value, onChange }: { value: number | null; onChange: (deg: number) => void }) {
  return (
    <div class="chips compass" role="radiogroup" aria-label="Direction you are hitting" style={{ '--cols': 4 }}>
      {COMPASS.map((c, i) => (
        <button key={c} type="button" role="radio" aria-checked={value === i * 45} class={`chip${value === i * 45 ? ' on' : ''}`} onClick={() => onChange(i * 45)}>
          {c}
        </button>
      ))}
    </div>
  );
}
