/** The CADDAIE wordmark. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span class={`wordmark wordmark-${size}`} aria-label="CADDAIE" role="img">
      <span aria-hidden="true">CADD</span>
      <span class="wordmark-ai" aria-hidden="true">
        AI
      </span>
      <span aria-hidden="true">E</span>
    </span>
  );
}
