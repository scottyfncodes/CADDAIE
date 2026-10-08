/** First launch: what CADDAIE is, in five lines, and one obvious next step. */
import type { Tab } from './context';
import { Icon } from './kit';
import { Wordmark } from './Wordmark';

const ROWS: { icon: Parameters<typeof Icon>[0]['name']; title: string; text: string }[] = [
  { icon: 'round', title: 'Keep score', text: 'Hole by hole, with feedback after every hole.' },
  { icon: 'caddie', title: 'Get the club', text: 'One clear call for every shot, from your own numbers.' },
  { icon: 'camera', title: 'Measure the distance', text: 'A camera rangefinder using GPS and course maps.' },
  { icon: 'swing', title: 'Check your swing', text: 'Film it, and get one thing to work on.' },
  { icon: 'handicap', title: 'Track your handicap', text: 'An estimate that sharpens with every round.' },
];

export function Welcome({ onDone }: { onDone: (next: Tab) => void }) {
  return (
    <main class="welcome" data-testid="welcome">
      <div class="welcome-top">
        <Wordmark size="lg" />
        <h1>Your caddie, in your pocket.</h1>
        <p class="lede">CADDAIE learns your game from every round you play, then gives you one clear decision when you're standing over the ball.</p>
      </div>
      <ul class="welcome-list">
        {ROWS.map((r) => (
          <li key={r.title}>
            <span class="welcome-icon">
              <Icon name={r.icon} />
            </span>
            <div>
              <strong>{r.title}</strong>
              <span>{r.text}</span>
            </div>
          </li>
        ))}
      </ul>
      <div class="welcome-actions">
        <button type="button" class="btn primary wide" onClick={() => onDone('round')} data-testid="welcome-start">
          Get started
        </button>
        <button type="button" class="btn ghost wide" onClick={() => onDone('caddie')} data-testid="welcome-caddie">
          I just need a club for this shot
        </button>
        <p class="fine center">No account. Your rounds and videos stay on this phone, and scoring works offline.</p>
      </div>
    </main>
  );
}
