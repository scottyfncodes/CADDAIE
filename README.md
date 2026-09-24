# CADD<ins>AI</ins>E

**The AI golf caddie.** Tell it the shot and get the club, the number and the reason at a glance.

CADDAIE is a mobile-first, installable web app for the golfer standing over the ball with a phone. A deterministic
yardage engine on the phone does all the math: club, swing, plays-like number and aim. An optional AI layer explains
that decision in caddie language, but it can never change it.

- **Live app:** https://scottyfncodes.github.io/CADDAIE/ (GitHub Pages)
- **AI proxy:** `worker/`, a Cloudflare Worker that keeps the Anthropic API key server-side

## What it does

| You give it | You get back |
| --- | --- |
| Distance (the only required input) | **The club**, in huge type |
| Wind speed and direction relative to your target, or live weather | **The swing**: full, smooth, choke down, knockdown, partial |
| Elevation change | **Plays-like number** with every adjustment itemised |
| Lie (tee, fairway, first cut, rough, deep rough, bunker, hardpan) | **Aim**: yards left or right, and why |
| Stance (up, down or sidehill) | Alternatives ("6 Iron only if you're flushing it") |
| Where the trouble is (short, long, left, right) | Short caddie notes, plus an optional AI read |
| Temperature and altitude (optional; filled by live weather) | A confidence level |

If information is missing, CADDAIE asks for the smallest thing it needs ("How far to the target?") rather than guessing.

## Design principles

1. **Situation → Recommendation → Reasoning → Shot.** The answer card is the first thing on screen. When you scroll
   down to the inputs, a compact answer pill stays in the header.
2. **Deterministic math, AI words.** All arithmetic lives in `src/core/` as pure, tested functions. The AI gets a
   *locked* brief and may only explain it. Any AI answer that names a different club or a yardage the engine didn't
   produce is thrown away, both on the proxy and again in the browser.
3. **Never held hostage by the network.** GPS, weather, the AI proxy and the network itself are all optional. Every
   failure has a plain-language message and a manual path. The app shell is cached by a service worker, so the
   caddie works offline.
4. **Phone in the sun.** Large tap targets (48px or more), high contrast, a numeric keypad for the one number you
   type, steppers for everything else, and light and dark themes.

## Project layout

```
src/
  core/        Deterministic golf engine. Pure TypeScript, no I/O.
    types.ts        Domain model (clubs, shot input, recommendation)
    adjustments.ts  Rules of thumb: wind, elevation, temperature, altitude, lie, stance
    recommend.ts    Validation → adjustments → club selection → aim → notes
    clubs.ts        Default bag, lie restrictions, gap analysis
    units.ts        yd/m, mph/kmh, °F/°C, ft/m and sum-preserving rounding
    format.ts       Display formatting in the golfer's units
  ai/          AI layer (contract, brief builder, client, offline voice)
    contract.ts     Shared by browser and Worker: brief/take schema + contradiction checks
  services/    Live conditions: GPS + Open-Meteo (keyless)
  state/       Local profile and last shot, with sanitised persistence
  ui/          Preact components and CSS
worker/        CADDAIE API: Cloudflare Worker proxy to Claude
tests/unit     Vitest: engine, units, persistence, AI contract/client, weather, Worker
tests/e2e      Playwright: user flows on iPhone and desktop viewports
docs/          Architecture and deployment notes
```

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests
npm run test:e2e       # Playwright (builds and serves the production bundle)
npm run check          # typecheck + unit + build + e2e
```

To run with the AI layer locally:

```bash
cd worker && npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars   # git-ignored
npx wrangler dev                                  # http://localhost:8787
# then in the app: Settings → AI caddie → API address = http://localhost:8787
```

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short:

- **Client:** `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages.
- **AI proxy (optional):** `cd worker && npx wrangler secret put ANTHROPIC_API_KEY && npx wrangler deploy`, then set
  the repo variable `CADDAIE_API_URL` to the Worker URL and re-run the Pages deploy.

Without the proxy, CADDAIE is fully functional: every number comes from the on-device engine, and the AI panel says
it isn't connected.

## Security

- No secrets live in client code, the repo or the build. The browser only knows the proxy's public URL.
- The proxy accepts only CADDAIE origins, validates and size-limits every request, rate-limits per IP, and returns
  stable error codes, never upstream error text.
- A history audit found no committed credentials. The former Yahoo proxy read its client ID and secret from Worker
  environment variables.

## History

This repository was previously `the-wire-proxy`, a Cloudflare Worker that proxied Yahoo Fantasy Sports OAuth for a
different project. That code had nothing to do with golf and was removed. Its useful idea, a Worker that keeps
credentials server-side, lives on as `worker/`. The Caddy AI concept started as a CodePen prototype.
