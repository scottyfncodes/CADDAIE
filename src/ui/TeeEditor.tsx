/** Scorecard details for one set of tees: par, rating/slope, optional yardage and stroke index. */
import { useState } from 'preact/hooks';
import type { TeeInfo } from '../core/round';
import { NumberField } from './controls';

export function TeeEditor({ tee, onChange }: { tee: TeeInfo; onChange: (t: TeeInfo) => void }) {
  const [more, setMore] = useState(false);
  const n = tee.par.length;
  const set = (patch: Partial<TeeInfo>) => onChange({ ...tee, ...patch });
  const setAt = <K extends 'par' | 'yardage' | 'strokeIndex'>(key: K, i: number, v: TeeInfo[K][number]) => {
    const arr = [...tee[key]] as TeeInfo[K];
    arr[i] = v as never;
    set({ [key]: arr } as Partial<TeeInfo>);
  };
  const resize = (holes: 9 | 18) => {
    if (holes === n) return;
    const grow = <T,>(a: T[], fill: T) => (holes === 18 ? [...a, ...Array(9).fill(fill)] : a.slice(0, 9));
    set({ par: grow(tee.par, 4), yardage: grow(tee.yardage, null), strokeIndex: grow(tee.strokeIndex, null) });
  };
  const total = tee.par.reduce((a, b) => a + b, 0);

  return (
    <div class="tee-editor">
      <div class="form-grid">
        <label class="field-stack">
          <span>Tees</span>
          <input class="text-input" value={tee.name} maxLength={30} onInput={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })} aria-label="Tee name" />
        </label>
        <label class="field-stack">
          <span>Course rating</span>
          <input
            class="text-input"
            inputMode="decimal"
            placeholder="e.g. 71.4"
            value={tee.rating ?? ''}
            aria-label="Course rating"
            data-testid="tee-rating"
            onChange={(e) => {
              const v = parseFloat((e.currentTarget as HTMLInputElement).value);
              set({ rating: Number.isFinite(v) && v > 20 && v < 90 ? Math.round(v * 10) / 10 : null });
            }}
          />
        </label>
        <label class="field-stack">
          <span>Slope</span>
          <NumberField id="tee-slope" label="Slope rating" value={tee.slope} min={55} max={155} class="text-input" placeholder="e.g. 128" onChange={(v) => set({ slope: v !== null && v >= 55 && v <= 155 ? v : null })} />
        </label>
      </div>
      <p class="fine">Rating and slope are printed on the scorecard. CADDAIE needs them to estimate your handicap.</p>

      <div class="field-head">
        <span class="field-label">Par · {total}</span>
        <div class="chips mini" role="radiogroup" aria-label="Holes on this card" style={{ '--cols': 2 }}>
          {([9, 18] as const).map((h) => (
            <button key={h} type="button" role="radio" aria-checked={n === h} class={`chip${n === h ? ' on' : ''}`} onClick={() => resize(h)}>
              {h} holes
            </button>
          ))}
        </div>
      </div>
      <div class="par-grid" role="group" aria-label="Par for each hole">
        {tee.par.map((p, i) => (
          <button key={i} type="button" class={`par-cell par-${p}`} aria-label={`Hole ${i + 1} par ${p}. Tap to change.`} onClick={() => setAt('par', i, p === 5 ? 3 : p + 1)}>
            <small>{i + 1}</small>
            <strong>{p}</strong>
          </button>
        ))}
      </div>
      <p class="fine">Tap a hole to cycle par 3 → 4 → 5.</p>

      <button type="button" class="link" onClick={() => setMore(!more)} aria-expanded={more}>
        {more ? 'Hide yardage and stroke index' : 'Add yardage and stroke index (optional)'}
      </button>
      {more && (
        <div class="hole-table" role="table" aria-label="Yardage and stroke index">
          <div class="hole-row head" role="row">
            <span role="columnheader">Hole</span>
            <span role="columnheader">Yards</span>
            <span role="columnheader">Index</span>
          </div>
          {tee.par.map((_, i) => (
            <div class="hole-row" role="row" key={i}>
              <span role="cell">{i + 1}</span>
              <NumberField id={`yd-${i}`} label={`Hole ${i + 1} yards`} value={tee.yardage[i]} min={40} max={800} class="text-input" onChange={(v) => setAt('yardage', i, v !== null && v >= 40 ? v : null)} />
              <NumberField id={`si-${i}`} label={`Hole ${i + 1} stroke index`} value={tee.strokeIndex[i]} min={1} max={18} class="text-input" onChange={(v) => setAt('strokeIndex', i, v !== null && v >= 1 && v <= 18 ? v : null)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
