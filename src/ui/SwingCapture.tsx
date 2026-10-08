/** Record (or pick) a swing, review it, and run the on-device analysis. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { analyzeSwing, type CameraAngle, type SwingResult } from '../core/swing';
import { audioContext, beep, CAMERA_FAILURE_TEXT, openCamera, recorderMime, stopStream, type CameraFailure } from '../services/camera';
import { extractPoses, type ExtractProgress } from '../services/pose';
import { Icon } from './kit';

export const ANGLE_LABEL: Record<CameraAngle, string> = { dtl: 'Down the line', 'face-on': 'Face on' };

type Step = 'guide' | 'camera' | 'review' | 'analyzing';

/** Seconds to walk from the phone to the ball and settle at address. */
const COUNTDOWN = 10;

export function SwingCapture({
  angle,
  initialVideo,
  onClose,
  onAnalyzed,
}: {
  angle: CameraAngle;
  initialVideo: Blob | null;
  onClose: () => void;
  onAnalyzed: (r: SwingResult, video: Blob) => void;
}) {
  const [step, setStep] = useState<Step>(initialVideo ? 'review' : 'guide');
  const [video, setVideo] = useState<Blob | null>(initialVideo);

  return (
    <div class="capture" role="dialog" aria-modal="true" aria-label={`Record a swing: ${ANGLE_LABEL[angle]}`} data-testid="swing-capture">
      <header class="capture-head">
        <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2>{ANGLE_LABEL[angle]}</h2>
        <span class="capture-step">{step === 'guide' ? 'Set up' : step === 'camera' ? 'Record' : step === 'review' ? 'Review' : 'Analyzing'}</span>
      </header>
      {step === 'guide' && <Guide angle={angle} onReady={() => setStep('camera')} />}
      {step === 'camera' && (
        <Recorder
          angle={angle}
          onDone={(b) => {
            setVideo(b);
            setStep('review');
          }}
        />
      )}
      {(step === 'review' || step === 'analyzing') && video && (
        <Review
          video={video}
          angle={angle}
          analyzing={step === 'analyzing'}
          onAnalyzing={() => setStep('analyzing')}
          onRetake={() => {
            setVideo(null);
            setStep('camera');
          }}
          onResult={(r) => (r.ok ? onAnalyzed(r, video) : setStep('review'))}
        />
      )}
    </div>
  );
}

export function AngleDiagram({ angle }: { angle: CameraAngle }) {
  // Top-down view: golfer, ball, target line and where the phone goes.
  return (
    <svg viewBox="0 0 200 150" class="angle-diagram" role="img" aria-label={angle === 'dtl' ? 'Phone behind the golfer, on the target line' : 'Phone facing the golfer, opposite the ball'}>
      <line x1="30" y1="60" x2="190" y2="60" class="dg-line" stroke-dasharray="4 5" />
      <text x="186" y="52" class="dg-text" text-anchor="end">
        target
      </text>
      <circle cx="100" cy="60" r="4" class="dg-ball" />
      <ellipse cx="100" cy="90" rx="16" ry="10" class="dg-golfer" />
      <circle cx="100" cy="90" r="6" class="dg-head" />
      {angle === 'dtl' ? (
        <>
          <rect x="18" y="70" width="14" height="22" rx="3" class="dg-phone" />
          <path d="M34 80 L84 84" class="dg-ray" />
          <text x="25" y="108" class="dg-text" text-anchor="middle">
            phone
          </text>
        </>
      ) : (
        <>
          <rect x="93" y="8" width="14" height="22" rx="3" class="dg-phone" />
          <path d="M100 32 L100 52" class="dg-ray" />
          <text x="122" y="22" class="dg-text">
            phone
          </text>
        </>
      )}
    </svg>
  );
}

function Guide({ angle, onReady }: { angle: CameraAngle; onReady: () => void }) {
  const tips =
    angle === 'dtl'
      ? [
          'Stand the phone upright behind you, on a line from your hands toward the target.',
          'About 3 big steps (2.5–3 m) away, at hand height (a bag or tripod works).',
          'Your whole body and the club at the top must fit in the frame, with space above your head.',
          'Shows posture, posture through impact and downswing path.',
        ]
      : [
          'Stand the phone upright facing your chest, straight across from the ball.',
          'About 3 big steps (2.5–3 m) away, at hand height.',
          'Head to feet in frame, with room for the club above you.',
          'Shows head movement, turn, sequencing and balance.',
        ];
  return (
    <div class="capture-body">
      <AngleDiagram angle={angle} />
      <ol class="guide-list">
        {tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p class="fine">Good light helps. Record at normal speed (not slo-mo). Video stays on this phone.</p>
      <button type="button" class="btn primary wide" onClick={onReady} data-testid="open-swing-camera">
        <Icon name="camera" size={20} /> Open camera
      </button>
    </div>
  );
}

function Recorder({ angle, onDone }: { angle: CameraAngle; onDone: (b: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);
  const [err, setErr] = useState<CameraFailure | 'no-recorder' | null>(null);
  const [phase, setPhase] = useState<'preview' | 'countdown' | 'recording'>('preview');
  const [count, setCount] = useState(COUNTDOWN);
  const [len, setLen] = useState(6);
  const [left, setLeft] = useState(0);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    let cancelled = false;
    openCamera({ facing, fps: 60, width: 1280 }).then((r) => {
      if (cancelled) return r.ok && stopStream(r.stream);
      if (!r.ok) return setErr(r.reason);
      stream.current = r.stream;
      if (videoRef.current) {
        videoRef.current.srcObject = r.stream;
        void videoRef.current.play().catch(() => {});
      }
    });
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      if (rec.current?.state === 'recording') rec.current.stop();
      stopStream(stream.current);
    };
  }, [facing]);

  const startRecording = () => {
    const mime = recorderMime();
    if (mime === null || !stream.current) return setErr('no-recorder');
    chunks.current = [];
    const r = mime ? new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: 6_000_000 }) : new MediaRecorder(stream.current);
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => onDone(new Blob(chunks.current, { type: r.mimeType || mime || 'video/mp4' }));
    rec.current = r;
    r.start(250);
    beep(audio.current, 1200, 200);
    setPhase('recording');
    setLeft(len);
    for (let i = 1; i <= len; i++) timers.current.push(window.setTimeout(() => setLeft(len - i), i * 1000));
    timers.current.push(window.setTimeout(stop, len * 1000));
  };

  const stop = () => {
    timers.current.forEach(clearTimeout);
    if (rec.current?.state === 'recording') {
      beep(audio.current, 600, 250);
      rec.current.stop();
    }
  };

  const go = () => {
    audio.current = audio.current ?? audioContext();
    setPhase('countdown');
    setCount(COUNTDOWN);
    for (let i = 1; i <= COUNTDOWN; i++)
      timers.current.push(
        window.setTimeout(() => {
          setCount(COUNTDOWN - i);
          if (COUNTDOWN - i > 0 && COUNTDOWN - i <= 3) beep(audio.current, 880, 90);
        }, i * 1000),
      );
    timers.current.push(window.setTimeout(startRecording, COUNTDOWN * 1000));
  };

  if (err) {
    return (
      <div class="capture-body">
        <p class="banner warn">{err === 'no-recorder' ? 'This browser can’t record video here. Record with the Camera app and choose the video instead.' : CAMERA_FAILURE_TEXT[err]}</p>
      </div>
    );
  }

  return (
    <div class="capture-cam">
      <video ref={videoRef} class={`capture-video${facing === 'user' ? ' mirror' : ''}`} playsInline muted autoPlay />
      <svg class="capture-ghost" viewBox="0 0 100 178" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect x="18" y="10" width="64" height="160" rx="6" />
        <text x="50" y="7" text-anchor="middle">
          {angle === 'dtl' ? 'keep the club in frame' : 'head to feet inside the box'}
        </text>
      </svg>
      {phase === 'countdown' && <div class="capture-count">{count || 'Go'}</div>}
      {phase === 'recording' && (
        <div class="capture-rec">
          <span class="rec-dot" /> Recording · {left}s
        </div>
      )}
      <div class="capture-controls">
        {phase === 'preview' && (
          <>
            <div class="chips mini on-dark" role="radiogroup" aria-label="Recording length" style={{ '--cols': 3 }}>
              {[4, 6, 10].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={len === n} class={`chip${len === n ? ' on' : ''}`} onClick={() => setLen(n)}>
                  {n}s
                </button>
              ))}
            </div>
            <button type="button" class="rec-btn" aria-label={`Start recording after a ${COUNTDOWN} second countdown`} onClick={go} data-testid="swing-record">
              <span />
            </button>
            <button type="button" class="btn small ghost on-dark" onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}>
              Flip camera
            </button>
            <p class="capture-hint">Tap record and walk to the ball. {COUNTDOWN}-second countdown (beeps at the end), then {len} seconds of recording.</p>
          </>
        )}
        {phase !== 'preview' && (
          <button type="button" class="btn ghost on-dark" onClick={phase === 'recording' ? stop : () => (timers.current.forEach(clearTimeout), setPhase('preview'))}>
            {phase === 'recording' ? 'Stop' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}

const PHASE_TEXT: Record<ExtractProgress['phase'], string> = {
  loading: 'Loading the swing model (first time only, about 18 MB)…',
  scanning: 'Finding your swing…',
  measuring: 'Measuring your swing…',
};

function Review({
  video,
  angle,
  analyzing,
  onAnalyzing,
  onRetake,
  onResult,
}: {
  video: Blob;
  angle: CameraAngle;
  analyzing: boolean;
  onAnalyzing: () => void;
  onRetake: () => void;
  onResult: (r: SwingResult) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [url] = useState(() => URL.createObjectURL(video));
  const [rate, setRate] = useState(1);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => (abort.current?.abort(), URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate]);

  const analyze = async () => {
    const v = ref.current;
    if (!v) return;
    setError(null);
    onAnalyzing();
    v.pause();
    abort.current = new AbortController();
    try {
      const { frames, aspect } = await extractPoses(v, setProgress, abort.current.signal);
      const r = analyzeSwing(frames, angle, aspect);
      if (!r.ok) setError(r.reason);
      onResult(r);
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      setError('The swing model couldn’t run on this device. Try closing other apps, or update iOS. Your video is still here.');
      onResult({ ok: false, reason: 'model' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div class="capture-body">
      <video ref={ref} class="review-video" src={url} playsInline muted loop autoPlay controls={!analyzing} data-testid="review-video" />
      {!analyzing && (
        <div class="chips" role="radiogroup" aria-label="Playback speed" style={{ '--cols': 3 }}>
          {[1, 0.5, 0.25].map((r) => (
            <button key={r} type="button" role="radio" aria-checked={rate === r} class={`chip${rate === r ? ' on' : ''}`} onClick={() => setRate(r)}>
              {r === 1 ? '1×' : r === 0.5 ? '½×' : '¼×'}
            </button>
          ))}
        </div>
      )}
      {analyzing && progress && (
        <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.pct * 100)}>
          <p>{PHASE_TEXT[progress.phase]}</p>
          <div class="bar">
            <span style={{ width: `${progress.phase === 'loading' ? 8 : Math.round(progress.pct * 100)}%` }} />
          </div>
        </div>
      )}
      {analyzing && !progress && <p class="muted center">Starting…</p>}
      {error && (
        <p class="banner warn" role="alert" data-testid="swing-error">
          {error}
        </p>
      )}
      {!analyzing && (
        <>
          <button type="button" class="btn primary wide" onClick={analyze} data-testid="analyze-swing">
            Analyze swing
          </button>
          <button type="button" class="btn ghost wide" onClick={onRetake}>
            Record again
          </button>
          <p class="fine center">Analysis runs on this phone. The video isn’t uploaded anywhere.</p>
        </>
      )}
    </div>
  );
}
