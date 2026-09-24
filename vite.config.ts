import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emits `sw.js` with a precache list of the exact hashed build output, so the
 * app shell works offline without pulling in a PWA plugin dependency.
 */
function serviceWorker(): Plugin {
  return {
    name: 'caddaie-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const staticFiles = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg'];
      const precache = ['./', ...files, ...staticFiles].map((f) => (f === './' ? f : `./${f}`));
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the app from /CADDAIE/. Relative base keeps it portable.
  base: './',
  plugins: [preact(), serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
  },
} as never);
