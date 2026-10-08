# Deploying CADDAIE

CADDAIE has two independently deployable parts:

| Part | Where | Required? | Secrets |
| --- | --- | --- | --- |
| Web app (`/`) | GitHub Pages | Yes | None |
| Explanation proxy (`worker/`) | Cloudflare Workers | No, and off by default (it calls a paid model API) | `ANTHROPIC_API_KEY` (Worker secret) |

The app is complete without the API. All recommendations are computed on the device.

## 1. Web app → GitHub Pages

`.github/workflows/deploy.yml` runs on pushes to `main`. It runs the unit tests, builds with
Vite, and publishes `dist/` with `actions/deploy-pages`.

One-time repo setup, if Pages isn't already on:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. If deploying from a branch other than `main`, allow it under **Settings → Environments → github-pages → Deployment
   branches**.

The app uses a relative base (`./`), so it works at `https://<user>.github.io/CADDAIE/` or any other path.

## 2. CADDAIE API → Cloudflare Workers (optional)

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key; it never touches the repo
npx wrangler deploy                           # prints https://caddaie-api.<account>.workers.dev
```

Configuration in `worker/wrangler.toml` (none of it secret):

- `ALLOWED_ORIGINS`: browser origins allowed to call the API. It must include `https://scottyfncodes.github.io`.
- `CADDAIE_MODEL`: the Claude model for explanations (default `claude-opus-5`).
- `RATE_LIMIT_PER_MINUTE`: best-effort, per-isolate, per-IP limit. For a hard limit, add a Cloudflare rate-limiting
  rule on `/v1/take`.

Check it:

```bash
curl https://caddaie-api.<account>.workers.dev/health
# {"ok":true,"service":"caddaie-api","ai":true}
```

## 3. Connect the two

Set a **repository variable** (not a secret, since it's a public URL): **Settings → Secrets and variables → Actions →
Variables → `CADDAIE_API_URL`** = the Worker URL. Re-run the Pages deploy. The address is baked in at build time.

A golfer can also point the app at an API manually under **Settings → AI caddie → CADDAIE API address**.

## Local development against the API

```bash
cd worker && echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars && npx wrangler dev
VITE_CADDAIE_API_URL=http://localhost:8787 npm run dev
```

`.dev.vars` and `.env*` are git-ignored.
