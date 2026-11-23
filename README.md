# MURDERS & ACQUISITIONS

*"We're all just trying to make a living."*

An incremental factory game. One ambitious mosquito finds the perfect sleeping human and builds a blood-extraction
company under his bed, one night at a time.

## Play

Open `index.html` from any static server (for example `python3 -m http.server`, then http://localhost:8000).
There is no build step and there are no dependencies.

- **Press and hold** anywhere in the room: Rhonda, the founder, flies to the arm and drinks. **Let go** to fly it home.
  Holding past full makes him itch, and the hand comes.
- **Build** from the cards that appear when the operation needs them, then **tap a spot** to place it: storage close to
  the bite means shorter trips. Tap a building to upgrade it.
- **Breeding pools** hatch staff who bite and carry on their own.
- **Scatter** (Space) pulls everyone off the skin when the hand moves.
- Every night ends at the alarm. At dawn, raw blood clots: a share of whatever is unrefined is lost.
  **Refineries** turn stored blood into blood that keeps (the gold line under Stored).
- **Days** have no clock and no host: he is at work. Build and upgrade, then tap **Nightfall** (N).
- New cards appear when the operation hits a wall: a crowded arm (**Extraction rig**), long flights to storage after he
  rolls over (**Drip line**), a full floor (**Floor space**). With no floor left, a card upgrades the cheapest building.
- The colony, its staff and its stored blood carry over from night to night.
- B holds the bite on a keyboard; P pauses, M mutes.

## Layout

| Path | What |
|---|---|
| `src/config.js` | Every number and every line of company voice |
| `src/campaign.js` | The colony that persists between nights, and the save that holds it (no DOM; runs in Node) |
| `src/sim.js` | One night's simulation (no DOM; runs in Node) |
| `src/render.js` | The isometric bedroom diorama and its camera |
| `src/audio.js` | Sound effects and music |
| `src/main.js` | Boot, the opening, frame loop, input, HUD |
| `tests/sim.test.js` | Headless simulation and save checks: `node tests/sim.test.js` |
| `art-direction/` | The approved look and the shot list |

Progress is saved under `murders-acquisitions.v2`. A save from the earlier one-shift game (`murders-acquisitions.v1`)
is read once for the mute setting and the old performance reviews (shown under Company records as the previous
employer) and is never modified.

Audio in `assets/audio` is Ogg; `media/compat` holds MP3 copies for browsers that cannot decode Ogg.
Fonts are Alfa Slab One and Archivo (SIL Open Font License, see `fonts/NOTICE.md`).

## Deployment

Hosted on Vercel through its GitHub integration, with no build step (the repository root is the site).
`main` is the production branch: every merge to `main` deploys to production. Every other branch and
pull request gets its own preview deployment.

by HaveAnApp
