import { render } from 'preact';
import { App } from './ui/App';
import './ui/styles.css';

render(<App />, document.getElementById('app')!);

// Offline support. Registered after first paint so it never slows the initial screen.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* Offline caching is a bonus; the app works without it. */
    });
  });
}
