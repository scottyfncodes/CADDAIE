# Deploying CADDAIE

CADDAIE is a static web app. There is no server, no API key and no secret anywhere.

`.github/workflows/deploy.yml` runs on every push to `main`: it runs the unit tests, builds with Vite and publishes
`dist/` to GitHub Pages with `actions/deploy-pages`.

One-time repo setup, if Pages isn't already on: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

The app uses a relative base (`./`), so it works at `https://<user>.github.io/CADDAIE/` or any other path.

The only network services the app calls are free and keyless, straight from the browser:

| Service | Used for |
| --- | --- |
| OpenStreetMap Overpass API | Nearby courses, greens and hole pars (cached on the device) |
| Open-Meteo | Live wind and temperature, terrain elevation |

Everything else (scoring, the caddie, stats, the handicap estimate, swing analysis) runs on the phone.
