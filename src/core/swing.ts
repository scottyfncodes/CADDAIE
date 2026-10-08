/**
 * Swing analysis from 2D pose landmarks (MediaPipe Pose layout).
 *
 * Deliberately conservative: a single phone camera sees a flat projection of
 * the body at 30–60 frames per second. That supports timing (tempo,
 * sequencing), gross movement (head, hips) and body angles seen side-on. It
 * does NOT support club path, face angle, speed or rotation in degrees, so
 * nothing here reports them. Each metric is only measured from the camera
 * angle that can see it; otherwise it says so.
 */

export type CameraAngle = 'dtl' | 'face-on';
export type Rating = 'good' | 'ok' | 'watch' | 'na';

export interface Landmark {
  x: number;
  y: number;
  /** Visibility / presence score 0–1. */
  v: number;
}

export interface PoseFrame {
  /** Seconds from the start of the clip. */
  t: number;
  /** 33 landmarks in MediaPipe order, normalised 0–1 image coordinates; null if no person found. */
  p: Landmark[] | null;
}

export const LM = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
} as const;

/** Skeleton edges for drawing overlays. */
export const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export type MetricKey = 'tempo' | 'head' | 'posture' | 'spine' | 'shoulders' | 'hips' | 'arms' | 'backswing' | 'transition' | 'path' | 'finish';

export type IssueCode =
  | 'tempo-quick'
  | 'tempo-slow'
  | 'head-rise'
  | 'head-drop'
  | 'head-slide'
  | 'head-sway'
  | 'head-forward'
  | 'posture-upright'
  | 'posture-bent'
  | 'posture-legs'
  | 'stance-narrow'
  | 'stance-wide'
  | 'early-extension'
  | 'shoulder-turn'
  | 'hip-turn'
  | 'hip-sway'
  | 'arm-bend'
  | 'short-backswing'
  | 'early-hands'
  | 'over-top'
  | 'finish-back'
  | 'finish-balance';

export interface SwingMetric {
  key: MetricKey;
  label: string;
  value: string;
  rating: Rating;
  detail: string;
  /** The underlying number, for comparisons over time (units vary by metric). */
  raw: number | null;
  issue: IssueCode | null;
}

export interface KeyFrames {
  address: number;
  top: number;
  impact: number;
  finish: number;
}

export interface SwingAnalysis {
  ok: true;
  angle: CameraAngle;
  metrics: SwingMetric[];
  tempo: { ratio: number; back: number; down: number } | null;
  /** Times (s) of the key positions. */
  keyFrames: KeyFrames;
  /** Landmarks at each key position, for overlays. */
  keyPoses: Record<keyof KeyFrames, Landmark[]>;
  focus: { title: string; tip: string };
  quality: { fps: number; warnings: string[] };
}

export type SwingResult = SwingAnalysis | { ok: false; reason: string };

export const METRIC_LABEL: Record<MetricKey, string> = {
  tempo: 'Tempo',
  head: 'Head movement',
  posture: 'Address posture',
  spine: 'Posture through impact',
  shoulders: 'Shoulder turn',
  hips: 'Hip rotation',
  arms: 'Lead arm',
  backswing: 'Backswing length',
  transition: 'Transition',
  path: 'Downswing path',
  finish: 'Balance & finish',
};

const TIPS: Record<IssueCode, { title: string; tip: string }> = {
  'tempo-quick': { title: 'Smooth out the takeaway', tip: 'Count "one-two" on the way back and "three" on the way down. Let the backswing take its time.' },
  'tempo-slow': { title: 'Keep it moving at the top', tip: 'Your backswing is very slow for your downswing. Keep a continuous motion so the top never stalls.' },
  'head-rise': { title: 'Stay down through the ball', tip: 'Keep your chest over the ball until after impact. Feel like you are still looking at the spot where the ball was.' },
  'head-drop': { title: 'Keep your height', tip: 'Your head is dropping into impact. Keep the knee flex you set up with instead of dipping.' },
  'head-slide': { title: 'Keep your head behind the ball', tip: 'Let your hips shift toward the target, but keep your head steady until the ball is gone.' },
  'head-sway': { title: 'Turn, don’t sway', tip: 'Your head is drifting away from the target. Feel the trail hip turning back instead of sliding.' },
  'head-forward': { title: 'Stay in your posture', tip: 'Your head moves toward the ball. Keep your weight in the middle of your feet and your chest down.' },
  'posture-upright': { title: 'Bend from the hips', tip: 'Push your hips back and tilt your chest over the ball until your arms hang straight down.' },
  'posture-bent': { title: 'Stand a little taller', tip: 'You are bent over a lot at address. Raise your chest a touch and let the arms hang naturally.' },
  'posture-legs': { title: 'Soften your knees', tip: 'Add a little knee flex at address so your lower body can rotate.' },
  'stance-narrow': { title: 'Widen your stance', tip: 'For full swings, feet about shoulder-width apart give you a stable base.' },
  'stance-wide': { title: 'Narrow your stance', tip: 'A very wide stance limits hip turn. Try feet about shoulder-width apart.' },
  'early-extension': { title: 'Keep your hips back', tip: 'You stand up through impact. Feel your backside stay on an imaginary wall behind you as you swing through.' },
  'shoulder-turn': { title: 'Make a fuller shoulder turn', tip: 'Turn your back to the target at the top. Let your lead shoulder work under your chin.' },
  'hip-turn': { title: 'Let your hips turn', tip: 'Your hips stay square in the backswing. Allow the trail hip to turn back and the lead heel to stay light.' },
  'hip-sway': { title: 'Turn, don’t slide', tip: 'Your hips slide away from the target. Feel the trail hip turning behind you instead.' },
  'arm-bend': { title: 'Keep the lead arm wider', tip: 'Your lead arm folds at the top. Make the backswing a little shorter and keep width.' },
  'short-backswing': { title: 'Complete your backswing', tip: 'Your hands stop below shoulder height. Keep turning until your back faces the target.' },
  'early-hands': { title: 'Start down with your lower body', tip: 'Try starting the downswing with your lower body while keeping the hands quieter.' },
  'over-top': { title: 'Drop the hands first', tip: 'Your hands move out toward the ball to start down. Let them drop before you turn through.' },
  'finish-back': { title: 'Finish on your lead side', tip: 'Your weight stays back at the finish. Hold a finish with your belt buckle facing the target.' },
  'finish-balance': { title: 'Hold your finish', tip: 'You are moving at the finish. Swing at a speed you can hold in balance for three seconds.' },
};

/** Priority for choosing the one thing to work on: fundamentals before details. */
const PRIORITY: MetricKey[] = ['posture', 'spine', 'transition', 'path', 'head', 'hips', 'shoulders', 'backswing', 'arms', 'tempo', 'finish'];

type V = { x: number; y: number };
const sub = (a: V, b: V) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: V) => Math.hypot(a.x, a.y);
const mid = (a: V, b: V) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
};
const deg = (r: number) => (r * 180) / Math.PI;
/** Angle at b formed by a-b-c, degrees. */
const jointAngle = (a: V, b: V, c: V) => {
  const u = sub(a, b);
  const w = sub(c, b);
  const d = len(u) * len(w);
  return d === 0 ? 180 : deg(Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / d))));
};

interface Frame {
  t: number;
  pt: (i: number) => V;
  vis: (i: number) => number;
  raw: Landmark[];
}

const KEY_POINTS = [LM.lShoulder, LM.rShoulder, LM.lWrist, LM.rWrist, LM.lHip, LM.rHip];

/** Convert to aspect-correct units and drop frames where the golfer can't be seen. */
function prepare(frames: PoseFrame[], aspect: number): Frame[] {
  const out: Frame[] = [];
  for (const f of frames) {
    if (!f.p || f.p.length < 29) continue;
    const p = f.p;
    if (KEY_POINTS.some((i) => !(p[i].v >= 0.3))) continue;
    out.push({ t: f.t, raw: p, pt: (i) => ({ x: p[i].x * aspect, y: p[i].y }), vis: (i) => p[i].v });
  }
  // Light 3-frame smoothing of positions to tame landmark jitter.
  return out.map((f, i) => {
    const a = out[Math.max(0, i - 1)];
    const c = out[Math.min(out.length - 1, i + 1)];
    return { ...f, pt: (k: number) => { const p0 = a.pt(k), p1 = f.pt(k), p2 = c.pt(k); return { x: (p0.x + 2 * p1.x + p2.x) / 4, y: (p0.y + 2 * p1.y + p2.y) / 4 }; } };
  });
}

const hands = (f: Frame) => mid(f.pt(LM.lWrist), f.pt(LM.rWrist));
const hipC = (f: Frame) => mid(f.pt(LM.lHip), f.pt(LM.rHip));
const shC = (f: Frame) => mid(f.pt(LM.lShoulder), f.pt(LM.rShoulder));

export function analyzeSwing(frames: PoseFrame[], angle: CameraAngle, aspect = 9 / 16): SwingResult {
  const F = prepare(frames, aspect);
  if (F.length < 12) return { ok: false, reason: 'CADDAIE couldn’t see a golfer clearly in enough of the video. Make sure your whole body is in frame and well lit.' };
  const dts = F.slice(1).map((f, i) => f.t - F[i].t).filter((d) => d > 0);
  const dt = median(dts);
  const fps = 1 / dt;
  if (fps < 12) return { ok: false, reason: 'The video frame rate is too low to measure a swing. Record at 30 or 60 fps.' };

  const torso = median(F.slice(0, Math.max(5, Math.floor(F.length / 4))).map((f) => len(sub(shC(f), hipC(f)))));
  if (!(torso > 0.02)) return { ok: false, reason: 'The golfer is too small in the frame. Move the phone closer so your body fills most of the height.' };

  const H = F.map(hands);
  const speed = H.map((h, i) => (i === 0 ? 0 : len(sub(h, H[i - 1])) / torso / Math.max(1e-3, F[i].t - F[i - 1].t)));
  const ys = H.map((h) => h.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY;
  if (range < torso * 0.8) return { ok: false, reason: 'CADDAIE couldn’t find a full swing in this clip. Record from address to finish with the whole swing in view.' };

  // Impact: fastest hands while the hands are low.
  let impact = -1;
  for (let i = 1; i < F.length; i++) {
    if (H[i].y < minY + range * 0.7) continue;
    if (impact === -1 || speed[i] > speed[impact]) impact = i;
  }
  // Top: highest hands in the 2.5 s before impact.
  let top = -1;
  for (let i = 0; i < impact; i++) {
    if (F[impact].t - F[i].t > 2.5) continue;
    if (top === -1 || H[i].y < H[top].y) top = i;
  }
  if (impact <= 0 || top < 0 || H[top].y > minY + range * 0.45) {
    return { ok: false, reason: 'CADDAIE couldn’t find the top of the backswing. Start recording before you take the club back.' };
  }
  // Address: where the hands settle before the backswing; takeaway is the last frame still there.
  const before = F.map((_, i) => i).filter((i) => i < top && F[top].t - F[i].t <= 3 && H[i].y >= minY + range * 0.65);
  if (!before.length) return { ok: false, reason: 'The clip starts mid-swing. Start recording at address.' };
  const still = before.filter((i) => speed[i] < 0.6);
  const addrPos = { x: median((still.length ? still : before).map((i) => H[i].x)), y: median((still.length ? still : before).map((i) => H[i].y)) };
  let takeaway = before[0];
  for (const i of before) if (len(sub(H[i], addrPos)) < torso * 0.12) takeaway = i;
  const address = Math.max(before[0], takeaway - 1);

  const back = F[top].t - F[takeaway].t;
  const down = F[impact].t - F[top].t;
  if (down <= 0 || back < 0.25 || back > 2.5 || down > 0.8) {
    return { ok: false, reason: 'That doesn’t look like a full swing. Record one full swing from address to finish.' };
  }

  // Finish: the end of the motion after impact (or the last frame we have).
  let finish = F.length - 1;
  for (let i = impact + 1; i < F.length; i++) {
    if (F[i].t - F[impact].t > 2) {
      finish = i - 1;
      break;
    }
  }
  const afterImpact = F[F.length - 1].t - F[impact].t;

  // Direction conventions, read from the swing itself so handedness and mirrored video don't matter.
  // Face-on: hands go away from the target in the backswing.
  const targetDir = Math.sign(addrPos.x - H[top].x) || 1;
  // Down the line: the hands are on the ball side of the hips at address.
  const ballDir = Math.sign(H[address].x - hipC(F[address]).x) || 1;

  const A = F[address];
  const T = F[top];
  const I = F[impact];
  const Fi = F[finish];
  const warnings: string[] = [];
  if (fps < 24) warnings.push('Low frame rate: timing numbers are rough.');
  if (afterImpact < 0.6) warnings.push('The clip ends right after impact, so the finish wasn’t checked.');

  const visOk = (f: Frame, idx: number[]) => idx.every((i) => f.vis(i) >= 0.5);
  const metrics: SwingMetric[] = [];
  const add = (m: Omit<SwingMetric, 'label'>) => metrics.push({ ...m, label: METRIC_LABEL[m.key] });
  const na = (key: MetricKey, detail: string) => add({ key, value: 'Not measured', rating: 'na', detail, raw: null, issue: null });
  const otherAngle = angle === 'dtl' ? 'face-on' : 'down-the-line';

  // Tempo
  const ratio = back / down;
  const tempoValue = `${ratio.toFixed(1)} : 1`;
  const tempoDetail = `Backswing ${back.toFixed(2)} s · downswing ${down.toFixed(2)} s. Good players are usually near 3 : 1.`;
  if (ratio < 2.5) add({ key: 'tempo', value: tempoValue, rating: 'watch', detail: `Quick backswing. ${tempoDetail}`, raw: ratio, issue: 'tempo-quick' });
  else if (ratio > 4.2) add({ key: 'tempo', value: tempoValue, rating: 'watch', detail: `Slow backswing for the downswing. ${tempoDetail}`, raw: ratio, issue: 'tempo-slow' });
  else add({ key: 'tempo', value: tempoValue, rating: 'good', detail: tempoDetail, raw: ratio, issue: null });

  // Head movement, address → impact
  if (!visOk(A, [LM.nose]) || !visOk(I, [LM.nose])) na('head', 'Your head wasn’t clearly visible.');
  else {
    const d = sub(I.pt(LM.nose), A.pt(LM.nose));
    const vert = d.y / torso; // + = dropped
    const side = (d.x / torso) * (angle === 'face-on' ? targetDir : ballDir);
    const size = Math.max(Math.abs(vert), Math.abs(side));
    const word = size < 0.2 ? 'Slightly' : 'Clearly';
    if (vert < -0.12) add({ key: 'head', value: `${word} high`, rating: 'watch', detail: 'Your head rises between address and impact.', raw: size, issue: 'head-rise' });
    else if (vert > 0.12) add({ key: 'head', value: `${word} low`, rating: 'watch', detail: 'Your head drops between address and impact.', raw: size, issue: 'head-drop' });
    else if (angle === 'face-on' && side > 0.12) add({ key: 'head', value: 'Moving forward', rating: 'watch', detail: 'Your head slides toward the target before impact.', raw: size, issue: 'head-slide' });
    else if (angle === 'face-on' && side < -0.25) add({ key: 'head', value: 'Moving back', rating: 'watch', detail: 'Your head drifts well away from the target.', raw: size, issue: 'head-sway' });
    else if (angle === 'dtl' && side > 0.12) add({ key: 'head', value: 'Toward the ball', rating: 'watch', detail: 'Your head moves toward the ball through impact.', raw: size, issue: 'head-forward' });
    else add({ key: 'head', value: 'Steady', rating: 'good', detail: 'Your head stays quiet from address to impact.', raw: size, issue: null });
  }

  const spineAngle = (f: Frame) => {
    const v = sub(shC(f), hipC(f));
    return deg(Math.atan2(Math.abs(v.x), -v.y));
  };

  if (angle === 'dtl') {
    // Address posture: forward bend and knee flex, seen side-on.
    const spine = spineAngle(A);
    const knees = [
      { v: A.vis(LM.lKnee) + A.vis(LM.lAnkle), a: jointAngle(A.pt(LM.lHip), A.pt(LM.lKnee), A.pt(LM.lAnkle)) },
      { v: A.vis(LM.rKnee) + A.vis(LM.rAnkle), a: jointAngle(A.pt(LM.rHip), A.pt(LM.rKnee), A.pt(LM.rAnkle)) },
    ].sort((a, b) => b.v - a.v)[0];
    const kneeSeen = knees.v >= 1;
    const value = `Spine ${Math.round(spine)}°${kneeSeen ? ` · knees ${Math.round(knees.a)}°` : ''}`;
    if (spine < 22) add({ key: 'posture', value, rating: 'watch', detail: 'Quite upright at address. Most good players tilt about 30–45° forward.', raw: spine, issue: 'posture-upright' });
    else if (spine > 52) add({ key: 'posture', value, rating: 'watch', detail: 'Bent over a lot at address. Most good players tilt about 30–45° forward.', raw: spine, issue: 'posture-bent' });
    else if (kneeSeen && knees.a > 172) add({ key: 'posture', value, rating: 'watch', detail: 'Your legs are nearly straight at address.', raw: spine, issue: 'posture-legs' });
    else add({ key: 'posture', value, rating: 'good', detail: 'Athletic forward tilt at address.', raw: spine, issue: null });

    // Posture through impact (early extension)
    const lost = spine - spineAngle(I);
    const hipToBall = ((hipC(I).x - hipC(A).x) / torso) * ballDir;
    if (lost > 10 || hipToBall > 0.15) {
      add({ key: 'spine', value: `Stood up ${Math.max(0, Math.round(lost))}°`, rating: 'watch', detail: 'Your hips move toward the ball and your upper body rises before impact (often called early extension).', raw: lost, issue: 'early-extension' });
    } else {
      add({ key: 'spine', value: lost > 5 ? `Lost ${Math.round(lost)}°` : 'Held', rating: lost > 5 ? 'ok' : 'good', detail: 'You keep your forward tilt into impact.', raw: lost, issue: null });
    }

    // Downswing path: hands farther from the body coming down than going back = out toward the ball.
    const midY = (H[address].y + H[top].y) / 2;
    const cross = (from: number, to: number) => {
      for (let i = from; i !== to; i += from < to ? 1 : -1) if ((H[i].y - midY) * (H[i + (from < to ? 1 : -1)].y - midY) <= 0) return i;
      return -1;
    };
    const b = cross(takeaway, top);
    const d = cross(top, impact);
    if (b < 0 || d < 0) na('path', 'Couldn’t track the hands through the swing.');
    else {
      const out = ((H[d].x - hipC(F[d]).x - (H[b].x - hipC(F[b]).x)) / torso) * ballDir;
      if (out > 0.15) add({ key: 'path', value: 'Out toward the ball', rating: 'watch', detail: 'Your hands are farther from your body coming down than going back. That often means an over-the-top move. This is an indicator from hand position, not a club-path measurement.', raw: out, issue: 'over-top' });
      else add({ key: 'path', value: out < -0.05 ? 'Dropping inside' : 'On the same track', rating: 'good', detail: 'Your hands come down on or inside their backswing track. This is an indicator from hand position, not a club-path measurement.', raw: out, issue: null });
    }
    na('shoulders', `Rotation is measured from the ${otherAngle} view.`);
    na('hips', `Rotation is measured from the ${otherAngle} view.`);
    na('transition', `Sequencing is measured from the ${otherAngle} view.`);
    na('arms', `Measured from the ${otherAngle} view.`);
  } else {
    // Face-on: stance width
    const shoulderW = Math.abs(A.pt(LM.lShoulder).x - A.pt(LM.rShoulder).x);
    if (A.vis(LM.lAnkle) >= 0.5 && A.vis(LM.rAnkle) >= 0.5 && shoulderW > 0) {
      const stance = Math.abs(A.pt(LM.lAnkle).x - A.pt(LM.rAnkle).x) / shoulderW;
      const value = `Stance ${stance.toFixed(1)}× shoulders`;
      if (stance < 0.8) add({ key: 'posture', value, rating: 'ok', detail: 'A narrow stance. Fine for short shots; a touch narrow for full swings.', raw: stance, issue: 'stance-narrow' });
      else if (stance > 1.9) add({ key: 'posture', value, rating: 'watch', detail: 'A very wide stance can restrict your turn.', raw: stance, issue: 'stance-wide' });
      else add({ key: 'posture', value, rating: 'good', detail: 'A balanced stance width.', raw: stance, issue: null });
    } else na('posture', 'Your feet weren’t clearly visible.');

    // Shoulder and hip turn from apparent width (a flat image can't give exact degrees).
    const width = (f: Frame, a: number, b: number) => Math.abs(f.pt(a).x - f.pt(b).x);
    const sRatio = width(T, LM.lShoulder, LM.rShoulder) / Math.max(1e-6, width(A, LM.lShoulder, LM.rShoulder));
    if (sRatio <= 0.6) add({ key: 'shoulders', value: 'Full turn', rating: 'good', detail: 'Your shoulders turn well away from the camera at the top.', raw: sRatio, issue: null });
    else if (sRatio <= 0.78) add({ key: 'shoulders', value: 'Partial turn', rating: 'ok', detail: 'A reasonable turn. A little more would add width and power.', raw: sRatio, issue: null });
    else add({ key: 'shoulders', value: 'Limited', rating: 'watch', detail: 'Your shoulders don’t appear to turn much by the top.', raw: sRatio, issue: 'shoulder-turn' });

    const hRatio = width(T, LM.lHip, LM.rHip) / Math.max(1e-6, width(A, LM.lHip, LM.rHip));
    const sway = ((hipC(T).x - hipC(A).x) / torso) * -targetDir; // + = away from target
    if (sway > 0.3) add({ key: 'hips', value: 'Sliding', rating: 'watch', detail: 'Your hips slide away from the target instead of turning.', raw: hRatio, issue: 'hip-sway' });
    else if (hRatio > 0.93) add({ key: 'hips', value: 'Restricted', rating: 'watch', detail: 'Your hips stay almost square to the camera at the top.', raw: hRatio, issue: 'hip-turn' });
    else add({ key: 'hips', value: 'Turning', rating: 'good', detail: 'Your hips turn in the backswing without sliding.', raw: hRatio, issue: null });

    // Lead arm at the top
    const lead = targetDir > 0 ? { s: LM.lShoulder, e: LM.lElbow, w: LM.lWrist } : { s: LM.rShoulder, e: LM.rElbow, w: LM.rWrist };
    if (T.vis(lead.e) < 0.5) na('arms', 'Your lead arm was hidden at the top.');
    else {
      const elbow = jointAngle(T.pt(lead.s), T.pt(lead.e), T.pt(lead.w));
      if (elbow < 130) add({ key: 'arms', value: 'Folding', rating: 'watch', detail: `Lead arm bends to about ${Math.round(elbow)}° at the top (approximate).`, raw: elbow, issue: 'arm-bend' });
      else add({ key: 'arms', value: elbow >= 150 ? 'Extended' : 'Slight bend', rating: elbow >= 150 ? 'good' : 'ok', detail: 'Your lead arm keeps its width at the top (approximate).', raw: elbow, issue: null });
    }

    // Transition: do the hips start toward the target before the hands start down?
    let furthest = takeaway;
    for (let i = takeaway; i <= impact; i++) if (hipC(F[i]).x * targetDir < hipC(F[furthest]).x * targetDir) furthest = i;
    let hipStart = -1;
    for (let i = furthest; i < F.length && F[i].t <= F[impact].t + 0.15; i++) {
      if ((hipC(F[i]).x - hipC(F[furthest]).x) * targetDir > torso * 0.03) {
        hipStart = i;
        break;
      }
    }
    // The threshold fires late; walk back to where the move toward the target began.
    if (hipStart > 0) {
      const crossed = F[hipStart].t;
      while (hipStart > furthest && crossed - F[hipStart - 1].t <= 0.25 && (hipC(F[hipStart]).x - hipC(F[hipStart - 1]).x) * targetDir > torso * 0.002) hipStart--;
    }
    if (hipStart < 0) na('transition', 'Couldn’t see your hips move toward the target.');
    else {
      const lead = F[top].t - F[hipStart].t; // + = hips first
      const ms = Math.round(Math.abs(lead) * 1000);
      if (lead < -Math.max(0.06, dt * 1.5)) add({ key: 'transition', value: 'Early hand movement', rating: 'watch', detail: `Your hands start down about ${ms} ms before your hips move toward the target.`, raw: lead, issue: 'early-hands' });
      else add({ key: 'transition', value: lead > dt ? 'Lower body first' : 'Together', rating: 'good', detail: 'Your lower body starts the downswing with or before your hands.', raw: lead, issue: null });
    }
    na('spine', `Measured from the ${otherAngle} view.`);
    na('path', `Measured from the ${otherAngle} view.`);
  }

  // Backswing length: hand height at the top relative to the shoulders.
  const handsAbove = (Math.min(T.pt(LM.lShoulder).y, T.pt(LM.rShoulder).y) - H[top].y) / torso;
  if (handsAbove < -0.05) add({ key: 'backswing', value: 'Short', rating: 'watch', detail: 'Your hands stop below shoulder height at the top.', raw: handsAbove, issue: 'short-backswing' });
  else add({ key: 'backswing', value: handsAbove > 0.25 ? 'Full' : 'Three-quarter', rating: handsAbove > 0.25 ? 'good' : 'ok', detail: 'Hand height at the top of the backswing.', raw: handsAbove, issue: null });

  // Finish and balance
  if (afterImpact < 0.6) na('finish', 'The clip ends before the finish.');
  else {
    const tail = F.filter((f) => f.t >= F[F.length - 1].t - 0.4 && f.t > F[impact].t + 0.4);
    const sx = tail.map((f) => hipC(f).x);
    const wobble = tail.length >= 3 ? (Math.max(...sx) - Math.min(...sx)) / torso : 0;
    let forward: number | null = null;
    if (angle === 'face-on' && Fi.vis(LM.lAnkle) >= 0.5 && Fi.vis(LM.rAnkle) >= 0.5) {
      const ax = [Fi.pt(LM.lAnkle).x, Fi.pt(LM.rAnkle).x].sort((a, b) => (a - b) * targetDir);
      const span = (ax[1] - ax[0]) * targetDir;
      if (Math.abs(span) > 1e-3) forward = ((hipC(Fi).x - ax[0]) * targetDir) / span;
    }
    if (forward !== null && forward < 0.45) add({ key: 'finish', value: 'Weight back', rating: 'watch', detail: 'Your hips finish over your trail foot.', raw: forward, issue: 'finish-back' });
    else if (wobble > 0.15) add({ key: 'finish', value: 'Moving', rating: 'watch', detail: 'You are still moving at the end of the clip.', raw: wobble, issue: 'finish-balance' });
    else add({ key: 'finish', value: 'Balanced', rating: 'good', detail: forward !== null ? 'You finish balanced on your lead side.' : 'You hold a stable finish.', raw: forward ?? wobble, issue: null });
  }

  const ordered = PRIORITY.map((k) => metrics.find((m) => m.key === k)).filter((m): m is SwingMetric => !!m);
  const firstWatch = ordered.find((m) => m.rating === 'watch' && m.issue);
  const focus = firstWatch
    ? TIPS[firstWatch.issue as IssueCode]
    : { title: 'Repeat this swing', tip: 'Nothing stood out from this angle. Record the other angle to check the rest of your swing.' };

  return {
    ok: true,
    angle,
    metrics: ordered,
    tempo: { ratio, back, down },
    keyFrames: { address: A.t, top: T.t, impact: I.t, finish: Fi.t },
    keyPoses: { address: A.raw, top: T.raw, impact: I.raw, finish: Fi.raw },
    focus,
    quality: { fps: Math.round(fps), warnings },
  };
}


export interface Tendency {
  key: MetricKey;
  issue: IssueCode;
  count: number;
  of: number;
  text: string;
}

/**
 * Recurring problems across saved swings (newest first): an issue showing up
 * in at least 3 of the last 6 swings where that metric was measured.
 */
export function swingTendencies(analyses: SwingAnalysis[]): Tendency[] {
  const recent = analyses.slice(0, 6);
  const out: Tendency[] = [];
  for (const key of PRIORITY) {
    const measured = recent.map((a) => a.metrics.find((m) => m.key === key)).filter((m): m is SwingMetric => !!m && m.rating !== 'na');
    if (measured.length < 3) continue;
    const counts = new Map<IssueCode, number>();
    for (const m of measured) if (m.rating === 'watch' && m.issue) counts.set(m.issue, (counts.get(m.issue) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) {
      out.push({ key, issue: top[0], count: top[1], of: measured.length, text: `${METRIC_LABEL[key]}: ${TIPS[top[0]].title.toLowerCase()} (in ${top[1]} of your last ${measured.length} swings).` });
    }
  }
  return out;
}

/** Count of "good" checks, used to pick a best swing when the golfer hasn't starred one. */
export const goodCount = (a: SwingAnalysis) => a.metrics.filter((m) => m.rating === 'good').length;
