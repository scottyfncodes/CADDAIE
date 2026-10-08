/** Start a round: pick or create a course and tees, then go. */
import { useState } from 'preact/hooks';
import { defaultTee, emptyHole, type Course, type Round, type TeeInfo } from '../core/round';
import { newId } from '../state/golf';
import { findNearbyCourses, loadCourseMap, OSM_ATTRIBUTION, OSM_FAILURE_TEXT, type NearbyCourse } from '../services/osm';
import { currentFix, GPS_ERROR_TEXT } from '../services/sensors';
import { useApp } from './context';
import { Icon, Sheet } from './kit';
import { TeeEditor } from './TeeEditor';

type Find = { phase: 'idle' } | { phase: 'loading' } | { phase: 'done'; courses: NearbyCourse[] } | { phase: 'error'; text: string };

export function StartRound({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const { golf, updateGolf, storage } = useApp();
  const recent = [...golf.courses].sort((a, b) => lastPlayed(b, golf.rounds) - lastPlayed(a, golf.rounds));
  const [course, setCourse] = useState<Course | null>(recent[0] ?? null);
  const [teeIdx, setTeeIdx] = useState(0);
  const [tee, setTee] = useState<TeeInfo>(recent[0]?.tees[0] ?? defaultTee());
  const [name, setName] = useState('');
  const [holes, setHoles] = useState<9 | 18>(18);
  const [nine, setNine] = useState<0 | 9>(0);
  const [find, setFind] = useState<Find>({ phase: 'idle' });
  const [mapNote, setMapNote] = useState<string | null>(null);

  const pickCourse = (c: Course) => {
    setCourse(c);
    setTeeIdx(0);
    setTee(c.tees[0] ?? defaultTee());
    setName('');
  };

  const findNearby = async () => {
    setFind({ phase: 'loading' });
    try {
      const fix = await currentFix(15000, 60000);
      const r = await findNearbyCourses(fix);
      if (!r.ok) return setFind({ phase: 'error', text: OSM_FAILURE_TEXT[r.reason] });
      setFind({ phase: 'done', courses: r.courses });
    } catch (e) {
      const m = (e as Error).message;
      setFind({ phase: 'error', text: GPS_ERROR_TEXT[m === 'denied' ? 'denied' : m === 'unsupported' ? 'unsupported' : 'unavailable'] });
    }
  };

  const useNearby = async (n: NearbyCourse) => {
    const existing = golf.courses.find((c) => c.osmId === n.osmId);
    if (existing) return pickCourse(existing);
    const t = defaultTee();
    const c: Course = { id: newId(), name: n.name, tees: [t], osmId: n.osmId, location: n.center, targets: {} };
    pickCourse(c);
    setMapNote('Looking for hole pars on the map…');
    const m = await loadCourseMap(n.center, storage);
    if (!m.ok) return setMapNote(null);
    const byRef = new Map(m.map.holes.map((h) => [h.ref, h]));
    const count = byRef.has(10) ? 18 : 9;
    if (!byRef.size) return setMapNote('This course has no hole details on the map. Set the pars from your scorecard.');
    const par = Array.from({ length: count }, (_, i) => byRef.get(i + 1)?.par ?? 4);
    const si = Array.from({ length: count }, (_, i) => byRef.get(i + 1)?.strokeIndex ?? null);
    const filled = [...byRef.values()].filter((h) => h.par !== null).length;
    setTee({ ...t, par, yardage: Array(count).fill(null), strokeIndex: si });
    setMapNote(`Filled par for ${filled} of ${count} holes from OpenStreetMap. Check them against your scorecard.`);
  };

  const canStart = !!course || name.trim().length > 0;

  const start = () => {
    const now = Date.now();
    let c: Course = course ?? { id: newId(), name: name.trim().slice(0, 60), tees: [], osmId: null, location: null, targets: {} };
    const tees = [...c.tees];
    if (teeIdx < tees.length && c.tees.length) tees[teeIdx] = tee;
    else tees.push(tee);
    c = { ...c, tees };
    const count: 9 | 18 = tee.par.length === 9 ? 9 : holes;
    const round: Round = {
      id: newId(),
      source: 'app',
      status: 'active',
      date: now,
      courseId: c.id,
      courseName: c.name,
      tee,
      holeCount: count,
      startHole: count === 9 && tee.par.length === 18 ? nine : 0,
      holes: Array.from({ length: count }, emptyHole),
      manualScore: null,
      current: 0,
    };
    updateGolf((g) => ({
      ...g,
      courses: [...g.courses.filter((x) => x.id !== c.id), c],
      rounds: [...g.rounds.map((r) => (r.status === 'active' ? { ...r, status: 'complete' as const } : r)), round],
    }));
    onStarted();
  };

  return (
    <Sheet
      title="Start a round"
      onClose={onClose}
      testid="start-round"
      action={
        <button type="button" class="btn small" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <section class="card">
        <h3 class="card-title">Course</h3>
        {recent.length > 0 && (
          <div class="choice-list" role="radiogroup" aria-label="Saved courses">
            {recent.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={course?.id === c.id} class={`choice${course?.id === c.id ? ' on' : ''}`} onClick={() => pickCourse(c)}>
                <Icon name="flag" size={20} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" class="btn ghost" onClick={findNearby} disabled={find.phase === 'loading'} data-testid="find-courses">
          <Icon name="gps" size={20} /> {find.phase === 'loading' ? 'Looking nearby…' : 'Find courses near me'}
        </button>
        {find.phase === 'error' && <p class="banner warn">{find.text}</p>}
        {find.phase === 'done' && (
          <>
            {find.courses.length === 0 ? (
              <p class="muted">No mapped golf courses within 3 km. Type the course name below.</p>
            ) : (
              <div class="choice-list" role="radiogroup" aria-label="Courses near you">
                {find.courses.map((n) => (
                  <button key={n.osmId} type="button" role="radio" aria-checked={course?.osmId === n.osmId} class={`choice${course?.osmId === n.osmId ? ' on' : ''}`} onClick={() => useNearby(n)}>
                    <Icon name="gps" size={20} />
                    <span>{n.name}</span>
                    <small>{n.distanceM < 1000 ? `${Math.round(n.distanceM)} m` : `${(n.distanceM / 1000).toFixed(1)} km`}</small>
                  </button>
                ))}
              </div>
            )}
            <p class="fine">{OSM_ATTRIBUTION}</p>
          </>
        )}
        <label class="field-stack">
          <span>{recent.length || find.phase === 'done' ? 'Or a new course' : 'Course name'}</span>
          <input
            class="text-input"
            placeholder="e.g. Pine Valley Muni"
            value={name}
            maxLength={60}
            data-testid="course-name"
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              setName(v);
              if (v.trim()) {
                setCourse(null);
                setTeeIdx(0);
                if (course) setTee(defaultTee());
              }
            }}
          />
        </label>
        {mapNote && <p class="fine">{mapNote}</p>}
      </section>

      <section class="card">
        <h3 class="card-title">Tees</h3>
        {course && course.tees.length > 0 && (
          <div class="chips" role="radiogroup" aria-label="Saved tees" style={{ '--cols': Math.min(3, course.tees.length + 1) }}>
            {course.tees.map((t, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={teeIdx === i}
                class={`chip${teeIdx === i ? ' on' : ''}`}
                onClick={() => {
                  setTeeIdx(i);
                  setTee(t);
                }}
              >
                {t.name}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={teeIdx === course.tees.length}
              class={`chip${teeIdx === course.tees.length ? ' on' : ''}`}
              onClick={() => {
                setTeeIdx(course.tees.length);
                setTee({ ...defaultTee(course.tees[0]?.par.length === 9 ? 9 : 18), par: [...(course.tees[0]?.par ?? defaultTee().par)], name: 'New tees' });
              }}
            >
              + New
            </button>
          </div>
        )}
        <TeeEditor tee={tee} onChange={setTee} />
      </section>

      {tee.par.length === 18 && (
        <section class="card">
          <h3 class="card-title">Playing</h3>
          <div class="chips" role="radiogroup" aria-label="Holes to play" style={{ '--cols': 3 }}>
            {(
              [
                { h: 18, n: 0, label: '18 holes' },
                { h: 9, n: 0, label: 'Front 9' },
                { h: 9, n: 9, label: 'Back 9' },
              ] as const
            ).map((o) => {
              const on = holes === o.h && (o.h === 18 || nine === o.n);
              return (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  class={`chip${on ? ' on' : ''}`}
                  onClick={() => {
                    setHoles(o.h);
                    setNine(o.n);
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <button type="button" class="btn primary wide" disabled={!canStart} onClick={start} data-testid="start-round-go">
        Tee off
      </button>
      {!canStart && <p class="fine center">Pick or name a course to start.</p>}
    </Sheet>
  );
}

const lastPlayed = (c: Course, rounds: Round[]) => Math.max(0, ...rounds.filter((r) => r.courseId === c.id).map((r) => r.date));
