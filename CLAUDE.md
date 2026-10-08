# HitWhat — notes for contributors and agents

- `src/core` is the single source of truth for golf math, handicap, stats, strategy, geometry and swing metrics. Keep it pure (no I/O, no randomness) and covered by `tests/unit`.
- Free-first: browser APIs, open-source libraries and free keyless services only. Never present an estimate as a measurement; say where a number comes from and how accurate it is.
- No paid APIs or AI models. The caddie's words come from deterministic code (`src/core/voice.ts`, `src/core/strategy.ts`).
- Never put secrets in client code. There are none to put: every service HitWhat calls is free and keyless.
- Run `npm run check` (typecheck, unit, build, e2e) before pushing.
