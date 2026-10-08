/** Camera access and recording. Video never leaves the device. */

export type CameraFailure = 'unsupported' | 'denied' | 'busy' | 'insecure';

export const CAMERA_FAILURE_TEXT: Record<CameraFailure, string> = {
  unsupported: 'This browser can’t use the camera.',
  denied: 'Camera access is off for HitWhat. Allow it in Settings › Safari › Camera, then try again.',
  busy: 'The camera is in use by another app.',
  insecure: 'The camera only works when HitWhat is opened over https.',
};

export async function openCamera(opts: { facing?: 'environment' | 'user'; fps?: number; width?: number } = {}): Promise<{ ok: true; stream: MediaStream } | { ok: false; reason: CameraFailure }> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { ok: false, reason: 'insecure' };
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'unsupported' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: opts.facing ?? 'environment' },
        width: { ideal: opts.width ?? 1280 },
        height: { ideal: Math.round(((opts.width ?? 1280) * 9) / 16) },
        frameRate: { ideal: opts.fps ?? 30 },
      },
    });
    return { ok: true, stream };
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, reason: 'denied' };
    if (name === 'NotReadableError' || name === 'AbortError') return { ok: false, reason: 'busy' };
    return { ok: false, reason: 'unsupported' };
  }
}

export const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

/** The best recording format this browser supports (Safari records MP4). */
export function recorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* keep looking */
    }
  }
  return '';
}

/** A short beep so a golfer standing away from the phone knows recording started/stopped. */
export function beep(ctx: AudioContext | null, freq = 880, ms = 140) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* sound is a nicety */
  }
}

export function audioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}
