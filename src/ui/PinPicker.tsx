/** Pin position on a 3×3 green, plus a "not sure" state. */
import type { PinDepth, PinPosition, PinSide } from '../core/strategy';
import { pinText } from '../core/strategy';

const DEPTHS: PinDepth[] = ['back', 'middle', 'front'];
const SIDES: PinSide[] = ['left', 'center', 'right'];

export function PinPicker({ value, onChange }: { value: PinPosition | null; onChange: (p: PinPosition | null) => void }) {
  return (
    <div class="pin-picker">
      <div class="pin-green" role="radiogroup" aria-label="Pin position">
        {DEPTHS.map((depth) =>
          SIDES.map((side) => {
            const on = value?.depth === depth && value.side === side;
            const p = { depth, side };
            return (
              <button
                key={`${depth}-${side}`}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Pin ${pinText(p).toLowerCase()}`}
                class={`pin-cell${on ? ' on' : ''}`}
                onClick={() => onChange(on ? null : p)}
              >
                {on && (
                  <svg viewBox="0 0 20 24" width="18" height="22" aria-hidden="true">
                    <path d="M5 23V2l12 5-12 5" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                  </svg>
                )}
              </button>
            );
          }),
        )}
      </div>
      <p class="pin-caption">{value ? `Pin: ${pinText(value)}` : 'Tap where the pin is'}</p>
    </div>
  );
}
