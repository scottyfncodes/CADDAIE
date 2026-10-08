/** The HitWhat wordmark. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span class={`wordmark wordmark-${size}`} aria-label="HitWhat" role="img">
      <span aria-hidden="true">HIT</span>
      <span class="wordmark-accent" aria-hidden="true">
        WHAT
      </span>
    </span>
  );
}
