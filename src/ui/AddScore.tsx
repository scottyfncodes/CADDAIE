/** Enter a past round as a total score, for handicap history. */
import { useState } from 'preact/hooks';
import { defaultTee, type Round, type TeeInfo } from '../core/round';
import { newId } from '../state/golf';
import { NumberField } from './controls';
import { useApp } from './context';
import { Sheet } from './kit';

const today = () => new Date().toISOString().slice(0, 10);

export function AddScoreSheet({ onClose }: { onClose: () => void }) {
  const { golf, updateGolf } = useApp();
  const [date, setDate] = useState(today());
  const [courseId, setCourseId] = useState<string>('');
  const [course, setCourse] = useState('');
  const [holes, setHoles] = useState<9 | 18>(18);
  const [score, setScore] = useState<number | null>(null);
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState<number | null>(null);
  const [par, setPar] = useState<number | null>(72);
  const [error, setError] = useState<string | null>(null);

  const pickSaved = (id: string) => {
    setCourseId(id);
    const c = golf.courses.find((x) => x.id === id);
    if (!c) return;
    const t = c.tees[0];
    setCourse(c.name);
    if (t) {
      setRating(t.rating !== null ? String(t.rating) : '');
      setSlope(t.slope);
      setPar(t.par.reduce((a, b) => a + b, 0));
    }
  };

  const save = () => {
    const r = parseFloat(rating);
    const minScore = holes === 9 ? 20 : 40;
    if (score === null || score < minScore || score > (holes === 9 ? 120 : 220)) return setError(`Enter the ${holes}-hole score.`);
    if (!course.trim()) return setError('Enter the course name.');
    const p = par ?? (holes === 9 ? 36 : 72);
    // A flat par layout that sums to the scorecard par; only the total matters for a score-only round.
    const base = Math.floor(p / 18);
    const extra = p - base * 18;
    const tee: TeeInfo = {
      ...defaultTee(18),
      name: 'Tees',
      rating: Number.isFinite(r) && r > 20 && r < 90 ? Math.round(r * 10) / 10 : null,
      slope: slope !== null && slope >= 55 && slope <= 155 ? slope : null,
      par: Array.from({ length: 18 }, (_, i) => base + (i < extra ? 1 : 0)),
    };
    if (holes === 9) {
      const p9 = par ?? 36;
      const b9 = Math.floor(p9 / 9);
      const e9 = p9 - b9 * 9;
      tee.par = Array.from({ length: 18 }, (_, i) => b9 + (i % 9 < e9 ? 1 : 0));
    }
    const when = new Date(`${date}T12:00:00`).getTime();
    const round: Round = {
      id: newId(),
      source: 'manual',
      status: 'complete',
      date: Number.isFinite(when) ? when : Date.now(),
      courseId: courseId || null,
      courseName: course.trim().slice(0, 60),
      tee,
      holeCount: holes,
      startHole: 0,
      holes: [],
      manualScore: score,
      current: 0,
    };
    updateGolf((g) => ({ ...g, rounds: [...g.rounds, round] }));
    onClose();
  };

  return (
    <Sheet
      title="Add a past score"
      onClose={onClose}
      testid="add-score"
      action={
        <button type="button" class="btn small" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <section class="card">
        {golf.courses.length > 0 && (
          <label class="field-stack">
            <span>Saved course</span>
            <select class="text-input" value={courseId} onChange={(e) => pickSaved((e.currentTarget as HTMLSelectElement).value)} aria-label="Saved course">
              <option value="">Another course</option>
              {golf.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label class="field-stack">
          <span>Course</span>
          <input class="text-input" value={course} maxLength={60} placeholder="Course name" onInput={(e) => setCourse((e.currentTarget as HTMLInputElement).value)} data-testid="score-course" />
        </label>
        <div class="form-grid">
          <label class="field-stack">
            <span>Date</span>
            <input class="text-input" type="date" value={date} max={today()} onInput={(e) => setDate((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <div class="field-stack">
            <span>Holes</span>
            <div class="chips" role="radiogroup" aria-label="Holes" style={{ '--cols': 2 }}>
              {([18, 9] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={holes === h}
                  class={`chip${holes === h ? ' on' : ''}`}
                  onClick={() => {
                    setHoles(h);
                    setPar(h === 9 ? 36 : 72);
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label class="field-stack">
          <span>Score</span>
          <NumberField id="score-total" label="Total score" value={score} min={20} max={220} class="text-input big" placeholder={holes === 9 ? '45' : '90'} onChange={setScore} />
        </label>
        <p class="fine">Use your adjusted score if you know it (each hole capped at net double bogey). Otherwise your total is fine.</p>
      </section>

      <section class="card">
        <h3 class="card-title">From the scorecard</h3>
        <div class="form-grid three">
          <label class="field-stack">
            <span>Rating</span>
            <input class="text-input" inputMode="decimal" placeholder="71.4" value={rating} onInput={(e) => setRating((e.currentTarget as HTMLInputElement).value)} aria-label="Course rating" data-testid="score-rating" />
          </label>
          <label class="field-stack">
            <span>Slope</span>
            <NumberField id="score-slope" label="Slope rating" value={slope} min={55} max={155} class="text-input" placeholder="128" onChange={setSlope} />
          </label>
          <label class="field-stack">
            <span>Par</span>
            <NumberField id="score-par" label="Par" value={par} min={27} max={80} class="text-input" onChange={setPar} />
          </label>
        </div>
        <p class="fine">Rating and slope are for the full 18 from the tees you played. Without them the score still counts in your stats, but not your handicap estimate.</p>
      </section>

      {error && (
        <p class="banner warn" role="alert">
          {error}
        </p>
      )}
      <button type="button" class="btn primary wide" onClick={save} data-testid="save-score">
        Save score
      </button>
    </Sheet>
  );
}
