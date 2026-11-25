# MURDERS & ACQUISITIONS

*"We're all just trying to make a living."*

An incremental factory game. One ambitious mosquito finds the perfect sleeping human and builds a blood-extraction
company under his bed, one night at a time. Blood is counted in BU (Blood Units), the company's proprietary metric.

## Play

Open `index.html` from any static server (for example `python3 -m http.server`, then http://localhost:8000).
There is no build step and there are no dependencies.

- **Press and hold** anywhere in the room: Rhonda, the founder, flies to the arm and drinks. **Let go** to fly it home.
  Holding past full makes him itch, and the hand comes.
- **Build** from the cards that appear when the operation needs them, then **tap a spot** to place it: storage close to
  the bite means shorter trips. Tap a building to upgrade it.
- **Breeding pools** hatch staff who bite and carry on their own.
- **Scatter** (Space) pulls everyone off the skin when the hand moves.
- From night 2 he **sleeps in waves**. **Push** (F) while he is deep under: bites are twice as fast and so is the itch.
  **Ease off** when he goes light, or the hand comes.
- After the first loss Rhonda founds **Occupational Health & Safety**: a **Lookout** in hi-vis on a perch above the bite
  calls swats and Scatters for you, then files Form 7-B for 24 seconds (15 once promoted to Safety Officer).
  Scratches, and any swat that lands during the paperwork, are still yours.
- **HR** only hatches staff up to the spots on the arm plus two spares: a rig, not a pool, is how the crew grows.
- Every morning the report lists **what held us back** (full storage, casualties and their causes, interruptions,
  queues for the arm, clotting), most expensive first, with what would fix it.
- **Suspicion** builds from bites, scratches, swats and, most of all, squashed staff. Past a point he buys things:
  a **fan** (every flight slower; answered by a **Windbreak**), then a **repellent** (bites slower; answered by **Gas masks**).
  He forgets some of it each day.
- Every night ends at the alarm. At dawn, raw blood clots: a share of whatever is unrefined is lost.
  **Refineries** turn stored blood into blood that keeps (the gold line under Stored).
- **Days** have no clock and no host: he is at work. Build and upgrade, then tap **Nightfall** (N).
- New cards appear when the operation hits a wall: a crowded arm (**Extraction rig**), long flights to storage after he
  rolls over (**Drip line**), a full floor (**Floor space**). With no floor left, a card upgrades the cheapest building.
- At 100% **suspicion** he books an **exterminator** three nights out. If suspicion is under 80% that morning he
  cancels; otherwise the bedroom is fumigated (a "workforce restructuring": 40% of non-executive staff, newest first,
  all raw blood, one level off every pool; suspicion drops to 40%, three nights' grace, half-price rehiring for two).
  The morning report itemises suspicion: bites per division, each disturbance, bodies found, and what he forgot.
- **Acquisitions**: once the arm's rig is maxed (night 3+), the board offers **the foot** (5,000 BU). A second division
  with no staff and no infrastructure: bigger, slower bites, less itch, rubs and kicks instead of scratches and swats,
  and socks (the blanket) three times a night. When he rolls onto the arm, the arm goes dark and lends its crew to the foot.
- With two divisions each gets a **General Manager** (its longest-serving employee) who runs it to a policy (lie low,
  standard, aggressive) while you are on the other floor. Tap the **staff plate** (Tab) to change floors. A
  **Leadership Seminar** shortens how late a GM reads his sleep; a **Processing plant** gives the foot its own storage
  and refining. Scatter covers both floors.
- **The lease**: 14 nights per host, then the annual report and relocation to a fresh host. Staff, buildings,
  divisions and blood move; his suspicion, purchases and any booking do not.
- **Careers**: every night an employee survives counts. Intern, Associate (2 nights), Senior Associate (5), Partner (9):
  each rank bites faster and carries more, with a band on the hard hat (partners wear bowlers). Promotions are announced
  in the morning; the memorial remembers rank.
- **Saliva R&D** (from day 4): a lab on the headboard, then two lines of research, three phases each. **Numbing agent**:
  less itch. **Blood thinner**: faster, fuller bites, but bigger welts (each bite is noticed more).
- **Premium levels**: storage tanks and refineries go to level 6 (gold hoops, gold stacks) at steeply rising prices.
- **He deflates**: the more of him the company has taken (tonight, and over the lease), the paler and flatter he gets.
  He has a comfortable nightly limit (8,000 BU, half as much again with the foot); past it each bite brings up less,
  down to a trickle. The new host after a relocation arrives full.
- **Camera**: close on the floor you are on. Pinch, scroll or +/- to zoom; all the way out shows the whole room.
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
| `tests/balance.js` | Balance report, careful vs reckless with and without a lookout: `node tests/balance.js [nights] [seeds]` |
| `tests/bot.js` | The test players (a human-paced night bot and a campaign runner) |
| `tests/acquisitions.test.js` | The foot, GMs and policies, the plant, the roll, suspicion, the exterminator, the lease: `node tests/acquisitions.test.js` |
| `tests/depth.test.js` | Careers, Saliva R&D, the host running dry and deflating: `node tests/depth.test.js` |
| `tests/strategies.js` | Strategy simulations over a lease (never acquire, untrained/trained/aggressive GMs, lying low, hands-on, reckless): `node tests/strategies.js [nights] [seeds]` |
| `tests/regression.js` | Golden regression against `tests/golden/baseline.json` (`--write` re-records it after an intentional balance change); `tests/golden/pr6-saves.json` holds saves written before divisions existed, checked by `sim.test.js` |
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
