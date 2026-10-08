/**
 * On-device pose estimation with MediaPipe Pose Landmarker (Apache-2.0).
 * The library, its WebAssembly runtime and the model ship with HitWhat and are
 * loaded only when the golfer analyses a swing. Frames are processed in the
 * browser; the video is never uploaded.
 */
import type { Landmark, PoseFrame } from '../core/swing';

type Landmarker = {
  detectForVideo(v: HTMLVideoElement, ts: number): { landmarks: { x: number; y: number; visibility?: number }[][] };
  close(): void;
};

let loading: Promise<Landmarker> | null = null;

const base = () => new URL('./', document.baseURI).href;

export function loadPose(): Promise<Landmarker> {
  if (!loading) {
    loading = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(`${base()}mediapipe`);
      const create = (delegate: 'GPU' | 'CPU') =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${base()}models/pose_landmarker_lite.task`, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return (await create('GPU')) as unknown as Landmarker;
      } catch {
        return (await create('CPU')) as unknown as Landmarker;
      }
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    // Some browsers don't fire 'seeked' when the time doesn't change.
    setTimeout(done, 1500);
  });
}

export interface ExtractProgress {
  phase: 'loading' | 'scanning' | 'measuring';
  pct: number;
}

/**
 * Run pose estimation over a clip. A quick 10 fps pass finds the swing, then a
 * 30 fps pass measures it, so long clips stay fast.
 */
export async function extractPoses(
  video: HTMLVideoElement,
  onProgress: (p: ExtractProgress) => void,
  signal?: AbortSignal,
): Promise<{ frames: PoseFrame[]; aspect: number }> {
  onProgress({ phase: 'loading', pct: 0 });
  const lm = await loadPose();
  if (video.readyState < 1) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  const duration = Math.min(Number.isFinite(video.duration) ? video.duration : 10, 30);
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 9 / 16;
  let ts = 0;

  const sample = async (from: number, to: number, fps: number, phase: ExtractProgress['phase']) => {
    const out: PoseFrame[] = [];
    const n = Math.max(1, Math.floor((to - from) * fps));
    for (let i = 0; i <= n; i++) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const t = Math.min(to, from + i / fps);
      await seek(video, t);
      // MediaPipe needs strictly increasing timestamps.
      ts += 1000 / fps;
      const res = lm.detectForVideo(video, ts);
      const p = res.landmarks?.[0];
      out.push({ t, p: p ? p.map((l): Landmark => ({ x: l.x, y: l.y, v: l.visibility ?? 0.9 })) : null });
      onProgress({ phase, pct: (i + 1) / (n + 1) });
    }
    return out;
  };

  if (duration <= 7) return { frames: await sample(0, duration, 30, 'measuring'), aspect };

  // Coarse pass: find the moment of fastest hand movement (impact).
  const coarse = await sample(0, duration, 10, 'scanning');
  let impactT = duration / 2;
  let best = 0;
  for (let i = 1; i < coarse.length; i++) {
    const a = coarse[i - 1].p;
    const b = coarse[i].p;
    if (!a || !b) continue;
    const s = Math.hypot(b[15].x + b[16].x - a[15].x - a[16].x, b[15].y + b[16].y - a[15].y - a[16].y);
    if (s > best) {
      best = s;
      impactT = coarse[i].t;
    }
  }
  const from = Math.max(0, impactT - 3.5);
  const to = Math.min(duration, impactT + 2.5);
  return { frames: await sample(from, to, 30, 'measuring'), aspect };
}
