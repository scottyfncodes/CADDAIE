import { describe, expect, it } from 'vitest';
import { LM, analyzeSwing, goodCount, swingTendencies, type Landmark, type PoseFrame, type SwingAnalysis } from '../../src/core/swing';

type P = { x: number; y: number };
const lerp = (a: P, b: P, u: number): P => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

interface Opts {
  fps?: number;
  /** Seconds the hips start moving toward the target, relative to the top. */
  hipLead?: number;
  headRise?: number;
  hipTurn?: number;
  duration?: number;
}

/**
 * A right-handed face-on swing (camera facing the golfer, target to image right).
 * Address 0–1 s, top at 1.9 s, impact at 2.2 s, finish held from 2.8 s.
 */
function faceOn(o: Opts = {}): PoseFrame[] {
  const fps = o.fps ?? 30;
  const hipLead = o.hipLead ?? 0.1;
  const frames: PoseFrame[] = [];
  const addr = { x: 0.5, y: 0.65 };
  const top = { x: 0.35, y: 0.3 };
  const imp = { x: 0.52, y: 0.65 };
  const fin = { x: 0.65, y: 0.3 };
  for (let t = 0; t <= (o.duration ?? 4); t += 1 / fps) {
    let h: P;
    let turn = 0; // 0 = square, 1 = fully turned at the top
    if (t < 1) h = addr;
    else if (t < 1.9) {
      const u = (t - 1) / 0.9;
      h = lerp(addr, top, easeInOut(u));
      turn = easeInOut(u);
    } else if (t < 2.2) {
      const u = (t - 1.9) / 0.3;
      h = lerp(top, imp, u * u);
      turn = 1 - u;
    } else if (t < 2.8) h = lerp(imp, fin, 1 - (1 - (t - 2.2) / 0.6) ** 2);
    else h = fin;
    const hipStart = 1.9 - hipLead;
    const shift = t < hipStart ? 0 : Math.min(1, (t - hipStart) / 0.5) * 0.06;
    const finishShift = t > 2.2 ? Math.min(1, (t - 2.2) / 0.6) * 0.04 : 0;
    const hx = 0.5 + shift + finishShift;
    const hipW = 0.06 * (1 - turn * (o.hipTurn ?? 0.4));
    const shW = 0.1 * (1 - turn * 0.6);
    const rise = t > 1.9 ? Math.min(1, (t - 1.9) / 0.3) * (o.headRise ?? 0) : 0;
    frames.push({ t, p: body({ hx, hipW, shW, hands: h, noseY: 0.3 - rise, shoulderX: 0.5 }) });
  }
  return frames;
}

function body(b: { hx: number; hipW: number; shW: number; hands: P; noseY: number; shoulderX?: number; hipX?: number; shoulderY?: number }): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0.9 }));
  const set = (i: number, x: number, y: number) => (p[i] = { x, y, v: 0.9 });
  const sx = b.shoulderX ?? b.hx;
  const sy = b.shoulderY ?? 0.4;
  set(LM.nose, sx, b.noseY);
  set(LM.lShoulder, sx + b.shW, sy);
  set(LM.rShoulder, sx - b.shW, sy);
  set(LM.lHip, (b.hipX ?? b.hx) + b.hipW, 0.6);
  set(LM.rHip, (b.hipX ?? b.hx) - b.hipW, 0.6);
  set(LM.lWrist, b.hands.x + 0.005, b.hands.y);
  set(LM.rWrist, b.hands.x - 0.005, b.hands.y);
  set(LM.lElbow, (sx + b.shW + b.hands.x) / 2, (sy + b.hands.y) / 2);
  set(LM.rElbow, (sx - b.shW + b.hands.x) / 2, (sy + b.hands.y) / 2);
  set(LM.lKnee, 0.55, 0.75);
  set(LM.rKnee, 0.45, 0.75);
  set(LM.lAnkle, 0.61, 0.9);
  set(LM.rAnkle, 0.39, 0.9);
  return p;
}

/** Down-the-line: golfer faces image right, ball to the right. */
function dtl(o: { extension?: boolean } = {}): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const addr = { x: 0.66, y: 0.66 };
  const top = { x: 0.45, y: 0.28 };
  for (let t = 0; t <= 4; t += 1 / 30) {
    let h: P;
    let u2 = 0;
    if (t < 1) h = addr;
    else if (t < 1.9) h = lerp(addr, top, easeInOut((t - 1) / 0.9));
    else if (t < 2.2) {
      const u = (t - 1.9) / 0.3;
      h = lerp(top, addr, u * u);
      u2 = u;
    } else if (t < 2.8) {
      h = lerp(addr, { x: 0.55, y: 0.3 }, 1 - (1 - (t - 2.2) / 0.6) ** 2);
      u2 = 1;
    } else {
      h = { x: 0.55, y: 0.3 };
      u2 = 1;
    }
    const ext = o.extension ? u2 : 0;
    const p = body({ hx: 0.45, hipX: 0.45 + ext * 0.06, hipW: 0.005, shW: 0.005, hands: h, noseY: 0.3, shoulderX: 0.62 - ext * 0.08, shoulderY: 0.42 - ext * 0.03 });
    p[LM.lKnee] = { x: 0.5, y: 0.76, v: 0.9 };
    p[LM.lAnkle] = { x: 0.47, y: 0.92, v: 0.9 };
    frames.push({ t, p });
  }
  return frames;
}

const ok = (r: ReturnType<typeof analyzeSwing>): SwingAnalysis => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const metric = (a: SwingAnalysis, k: string) => a.metrics.find((m) => m.key === k)!;

describe('swing analysis — face on', () => {
  it('finds the key positions and measures tempo', () => {
    const a = ok(analyzeSwing(faceOn(), 'face-on'));
    expect(a.keyFrames.top).toBeGreaterThan(1.75);
    expect(a.keyFrames.top).toBeLessThan(2.0);
    expect(a.keyFrames.impact).toBeGreaterThan(2.1);
    expect(a.keyFrames.impact).toBeLessThan(2.3);
    expect(a.tempo!.ratio).toBeGreaterThan(2.6);
    expect(a.tempo!.ratio).toBeLessThan(3.6);
    expect(metric(a, 'tempo').rating).toBe('good');
    expect(metric(a, 'tempo').value).toMatch(/^\d\.\d : 1$/);
  });

  it('a good swing reads good, and measures only what face-on can see', () => {
    const a = ok(analyzeSwing(faceOn(), 'face-on'));
    expect(metric(a, 'transition').rating).toBe('good');
    expect(metric(a, 'head').rating).toBe('good');
    expect(metric(a, 'hips').rating).toBe('good');
    expect(metric(a, 'shoulders').rating).toBe('good');
    expect(metric(a, 'finish').rating).toBe('good');
    expect(metric(a, 'spine').rating).toBe('na');
    expect(metric(a, 'path').rating).toBe('na');
    expect(a.focus.title).toBe('Repeat this swing');
  });

  it('flags hands starting the downswing before the hips', () => {
    const a = ok(analyzeSwing(faceOn({ hipLead: -0.2 }), 'face-on'));
    expect(metric(a, 'transition').rating).toBe('watch');
    expect(metric(a, 'transition').value).toBe('Early hand movement');
    expect(a.focus.tip).toBe('Try starting the downswing with your lower body while keeping the hands quieter.');
  });

  it('flags the head rising', () => {
    const a = ok(analyzeSwing(faceOn({ headRise: 0.04 }), 'face-on'));
    expect(metric(a, 'head').rating).toBe('watch');
    expect(metric(a, 'head').value).toMatch(/high/);
  });

  it('flags hips that do not turn', () => {
    const a = ok(analyzeSwing(faceOn({ hipTurn: 0 }), 'face-on'));
    expect(metric(a, 'hips').rating).toBe('watch');
  });

  it('works for a mirrored video / left-hander (direction is read from the swing)', () => {
    const mirrored = faceOn().map((f) => ({ t: f.t, p: f.p!.map((l) => ({ ...l, x: 1 - l.x })) }));
    const a = ok(analyzeSwing(mirrored, 'face-on'));
    expect(metric(a, 'transition').rating).toBe('good');
    expect(metric(a, 'finish').rating).toBe('good');
  });

  it('refuses clips it cannot read, with a reason', () => {
    expect(analyzeSwing([], 'face-on').ok).toBe(false);
    const still = faceOn().map((f) => ({ t: f.t, p: body({ hx: 0.5, hipW: 0.06, shW: 0.1, hands: { x: 0.5, y: 0.65 }, noseY: 0.3 }) }));
    const r = analyzeSwing(still, 'face-on');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/full swing/);
    const lowFps = faceOn({ fps: 8 });
    expect(analyzeSwing(lowFps, 'face-on').ok).toBe(false);
  });

  it('warns when the clip ends before the finish', () => {
    const a = ok(analyzeSwing(faceOn({ duration: 2.4 }), 'face-on'));
    expect(metric(a, 'finish').rating).toBe('na');
    expect(a.quality.warnings.join(' ')).toMatch(/ends right after impact/);
  });
});

describe('swing analysis — down the line', () => {
  it('reads posture and path, not rotation', () => {
    const a = ok(analyzeSwing(dtl(), 'dtl'));
    expect(metric(a, 'posture').rating).toBe('good');
    expect(metric(a, 'spine').rating).toBe('good');
    expect(metric(a, 'shoulders').rating).toBe('na');
    expect(metric(a, 'hips').rating).toBe('na');
    expect(metric(a, 'path').detail).toMatch(/not a club-path measurement/);
  });

  it('flags early extension', () => {
    const a = ok(analyzeSwing(dtl({ extension: true }), 'dtl'));
    expect(metric(a, 'spine').rating).toBe('watch');
    expect(a.focus.title).toBe('Keep your hips back');
  });
});

describe('tendencies', () => {
  it('reports an issue that keeps coming back', () => {
    const bad = ok(analyzeSwing(faceOn({ hipLead: -0.2 }), 'face-on'));
    const good = ok(analyzeSwing(faceOn(), 'face-on'));
    const t = swingTendencies([bad, bad, good, bad]);
    expect(t).toHaveLength(1);
    expect(t[0].issue).toBe('early-hands');
    expect(t[0].text).toMatch(/3 of your last 4 swings/);
    expect(swingTendencies([bad, good])).toEqual([]);
    expect(goodCount(good)).toBeGreaterThan(goodCount(bad));
  });
});
