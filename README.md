# MURDERS & ACQUISITIONS

*"We're all just trying to make a living."*

An incremental factory game. You manage a mosquito-run blood plant under a sleeping human for one night shift:
build and staff the line, meet the quarterly quotas, and bank as much as you can before the alarm.

## Play

Open `index.html` from any static server (for example `python3 -m http.server`, then http://localhost:8000).
There is no build step and there are no dependencies.

- **Build** from the cards (keys 1 to 5). Tap a building to upgrade it.
- **Staff** sets how many refine and how many nurse in the hatchery; everyone else extracts.
- **Pace** trades speed for the sleeper's irritation. Irritation becomes scratches and swats.
- **All Hands Back** (Space) pulls the crew when the hand twitches.
- P pauses, M mutes.

## Layout

| Path | What |
|---|---|
| `src/config.js` | Every number and every line of company voice |
| `src/sim.js` | The shift simulation (no DOM; runs in Node) |
| `src/render.js` | The isometric diorama |
| `src/audio.js` | Sound effects and music |
| `src/main.js` | Boot, frame loop, input, HUD |
| `tests/sim.test.js` | Headless simulation checks: `node tests/sim.test.js` |
| `art-direction/` | The approved look and the shot list |

Audio in `assets/audio` is Ogg; `media/compat` holds MP3 copies for browsers that cannot decode Ogg.
Fonts are Alfa Slab One and Archivo (SIL Open Font License, see `fonts/NOTICE.md`).

## Deployment

Hosted on Vercel through its GitHub integration, with no build step (the repository root is the site).
`main` is the production branch: every merge to `main` deploys to production. Every other branch and
pull request gets its own preview deployment.

by HaveAnApp
