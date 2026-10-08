# CADDAIE — notes for contributors and agents

- `src/core` is the single source of truth for golf math, handicap, stats, strategy, geometry and swing metrics. Keep it pure (no I/O, no randomness) and covered by `tests/unit`.
- Free-first: browser APIs, open-source libraries and free keyless services only. Never present an estimate as a measurement; say where a number comes from and how accurate it is.
- The AI may only explain a locked decision. Anything that lets model output change a club or a number is a bug; extend `checkTake` in `src/ai/contract.ts` (shared with `worker/`) instead.
- Never put secrets in client code or `wrangler.toml`. The browser only ever knows the API's public URL.
- Run `npm run check` (typecheck, unit, build, e2e) before pushing.
