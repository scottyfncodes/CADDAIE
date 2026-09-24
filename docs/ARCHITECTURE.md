# CADDAIE architecture

```
 ┌──────────────── Browser (GitHub Pages, installable PWA) ─────────────────┐
 │                                                                           │
 │  UI (Preact) ──► core/recommend()  ── pure, deterministic, offline ──┐    │
 │     ▲                 │                                              │    │
 │     │                 ▼                                              │    │
 │     │           Recommendation ──► ai/brief (locked decision)        │    │
 │     │                 │                    │                         │    │
 │     │          ai/localVoice          ai/client ──── HTTPS ───┐      │    │
 │     │          (always shown)         checkTake() again       │      │    │
 │     │                                                         │      │    │
 │  services/conditions ── GPS + Open-Meteo (keyless) ────────┐  │      │    │
 │  state/profile ── localStorage (sanitised) ────────────────┘  │      │    │
 └───────────────────────────────────────────────────────────────┼──────┘    │
                                                                 ▼
                             ┌──────── worker/ (Cloudflare) ────────────────┐
                             │ CORS allow-list · validate brief · rate limit │
                             │ ANTHROPIC_API_KEY (secret) → Claude          │
                             │ checkTake() → {take, concern} or error code   │
                             └───────────────────────────────────────────────┘
```

## The deterministic layer (`src/core`)

All arithmetic is here, and none of it is left to the AI. Units are imperial internally (yards, feet, mph, °F) and
convert at the UI edge.

| Factor | Rule | Where |
| --- | --- | --- |
| Headwind | +1% of distance per mph of head component | `RULES.headwindPctPerMph` |
| Tailwind | −0.5% per mph, capped at −10% | `tailwindPctPerMph`, `tailwindMaxPct` |
| Crosswind | 0.75 yd drift per mph per 150 yd; aim into it | `crossDriftYdsPerMphPer150` |
| Uphill / downhill | +1 yd per 3 ft up; −0.8 yd per 3 ft down | `uphillYdsPerFt`, `downhillYdsPerFt` |
| Temperature | ±1% per 10°F from the golfer's baseline | `tempPctPerF` |
| Altitude | ~2% farther per 1,000 ft above the golfer's **home** altitude | `altitudePctPer1000Ft` |
| Lie | rough +5%, deep rough +12%, fairway bunker +5%; first cut flags a flyer | `liePct` |
| Stance | uphill +5%, downhill −5%, ball below feet +3%; sidehill changes aim | `stancePct`, `stanceAimYards` |
| Tendency | "usually short" +3%, "usually long" −3% | `tendencyPct` |

**Club selection** (`selectClub`):

- Within 3 yards under a carry: that club, full swing.
- 1–2 yards past a carry: the shorter club, full swing.
- Between clubs: more club, hit smooth or choked down, as long as the take-off stays within what that club type allows.
- A real hole in the bag: whichever club is closer (a hard swing or a big choke-down).
- Strategy bias: with trouble short, always get there. With trouble long, stay below the hole.
- Into the wind at 10 mph or more: club up and knock it down ("when it's breezy, swing easy").
- Beyond the longest club: that club plus what it leaves. Inside the shortest wedge: a partial swing with a percentage.
- Driver is only allowed off the tee. Woods are excluded from bunkers, and woods and long irons from deep rough.

**Display arithmetic**: `displayMath` rounds each adjustment with a largest-remainder method, so the on-screen sum
(distance + each line = plays-like) is always exact in yards and in meters.

## The AI layer (`src/ai`, `worker/`)

- `buildBrief` converts a `Recommendation` into a small JSON brief in the golfer's units. It carries the situation,
  the **locked decision**, the bag, and an optional free-text note ("tree overhanging left").
- The Worker validates the brief (`isValidBrief`: types, lengths, list sizes, 6 KB cap) before any model call. It
  then calls Claude with a structured-output JSON schema `{ take, concern }`, low effort, a 15 s timeout and server-side
  refusal fallbacks.
- `checkTake` runs on the Worker **and again in the browser**. It rejects:
  - wrong shape, empty text or oversized text → `malformed`
  - any club that isn't the pick or a listed alternative → `contradiction`
  - any yardage that doesn't match a number from the brief (±2) → `contradiction`
- `concern` is shown as a flagged "Heads-up" and never changes a number.
- One request per unique situation. Results are cached by brief key, and a new situation aborts any in-flight request.
- Every failure (`unconfigured`, `offline`, `timeout`, `unavailable`, `rate-limited`, `malformed`, `contradiction`)
  maps to one calm sentence. The deterministic answer and the offline caddie voice are always on screen already.

## Live conditions (`src/services/conditions.ts`)

GPS position → Open-Meteo current wind, gusts, temperature and elevation. Open-Meteo needs no key, so the browser calls
it directly and no secret is involved. Weather gives an absolute wind direction, so the golfer taps which way they're
hitting (N, NE, …) and CADDAIE converts it to "into / off the right / helping". Denied permission, a timeout, being
offline or a bad payload all fall back to the manual inputs with a clear message.

## Persistence (`src/state/profile.ts`)

The profile (bag, units, handedness, tendency, home altitude, AI settings) and the last shot live in `localStorage`.
Everything read back is sanitised field by field, so corrupt or old data degrades to defaults instead of a blank screen.
Private-mode Safari, which throws on write, is detected and reported once in Settings.

## PWA

The manifest has any and maskable icons, and there is an Apple touch icon, standalone display, theme colours and
safe-area insets. A build-time plugin in `vite.config.ts` generates `sw.js` with the exact hashed asset list. Pages
are network-first with a cached-shell fallback. Hashed assets are cache-first. Weather and AI requests are never
cached.
