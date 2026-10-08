/** Where the trouble is, laid out around the green the way the golfer sees it. */
import type { Trouble } from '../core/types';

const SPOTS: { t: Trouble; label: string; area: string }[] = [
  { t: 'long', label: 'Long', area: 'long' },
  { t: 'left', label: 'Left', area: 'left' },
  { t: 'right', label: 'Right', area: 'right' },
  { t: 'short', label: 'Short', area: 'short' },
];

export function TroublePicker({ value, onChange }: { value: Trouble[]; onChange: (v: Trouble[]) => void }) {
  const toggle = (t: Trouble) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <div class="trouble" role="group" aria-label="Where is the trouble?">
      {SPOTS.map((s) => (
        <button
          key={s.t}
          type="button"
          aria-pressed={value.includes(s.t)}
          class={`chip trouble-${s.area}${value.includes(s.t) ? ' danger' : ''}`}
          onClick={() => toggle(s.t)}
        >
          {s.label}
        </button>
      ))}
      <div class="trouble-green" aria-hidden="true">
        <svg viewBox="0 0 60 44" width="60" height="44">
          <ellipse cx="30" cy="24" rx="27" ry="17" fill="var(--green)" />
          <line x1="30" y1="26" x2="30" y2="4" stroke="var(--text)" stroke-width="2" stroke-linecap="round" />
          <path d="M30 4 L41 8 L30 12 Z" fill="var(--flag)" />
        </svg>
      </div>
    </div>
  );
}
