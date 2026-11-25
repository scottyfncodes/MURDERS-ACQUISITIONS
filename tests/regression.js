// Golden regression: the exact behaviour of a set of seeded campaigns and nights, compared field by field.
// node tests/regression.js          checks the current code against tests/golden/baseline.json
// node tests/regression.js --write  records a new baseline (only for intentional, documented balance changes)
const fs = require('fs'), path = require('path'), assert = require('assert');
const { campaign, play } = require('./bot.js');
const { sim, campaign: K } = globalThis.MA;
const FILE = path.join(__dirname, 'golden', 'baseline.json');

function nightFrom(camp, seed) { return play(camp, { seed: 7000 + seed, push: 'timed', attention: { notice: 0.8, reaction: [0.4, 1.1] }, handsOff: true }).r; }

function snapshot() {
  const out = { campaigns: {}, traces: {} };
  for (const profile of ['careful', 'reckless']) for (const lookout of [false, true]) for (let seed = 1; seed <= 6; seed++) {
    const { log, camp } = campaign({ profile, lookout, nights: 6, seed });
    // night 7 played from the saved colony: the baseline's copy of `camp` is a save in the old format, so loading it later tests compatibility
    const saved = K.cleanCampaign(camp), next = nightFrom(saved, seed);
    out.campaigns[`${profile}-${lookout ? 'lookout' : 'none'}-${seed}`] = { nights: log.map((l) => l.report), camp: saved, next };
  }
  // fine-grained traces: one night each, sampled every 2.5 s
  const staff = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Staff ${i + 1}`, trait: 'Quiet', larvae: 50 }));
  const scenes = {
    night1: K.newCampaign(),
    crowded: K.cleanCampaign({ night: 4, bank: 300, buildings: [{ type: 'tank', level: 2, pad: 1 }, { type: 'pool', level: 3, pad: 9 }, { type: 'pool', level: 3, pad: 3 }, { type: 'rig', level: 4, pad: -1 }, { type: 'refinery', level: 1, pad: 7 }, { type: 'lookout', level: 1, pad: -1 }], workers: staff(16), nextId: 17, hires: 16, unlocks: ['tank', 'pool', 'scatter', 'rig', 'refinery', 'lookout', 'push'], counters: { fan: true } }),
    rolled: K.cleanCampaign({ night: 3, bank: 120, buildings: [{ type: 'tank', level: 1, pad: 0 }, { type: 'pool', level: 2, pad: 9 }, { type: 'drip', level: 1, pad: -1 }], workers: staff(6), nextId: 7, hires: 6, unlocks: ['tank', 'pool', 'scatter', 'drip', 'push'] }),
  };
  for (const [k, camp] of Object.entries(scenes)) {
    const samples = []; let next = 0;
    play(camp, { seed: 4242, push: 'timed', attention: { notice: 0.8, reaction: [0.4, 1.1] }, handsOff: k !== 'night1', onEvent: () => {}, tick: (S) => { if (S.time >= next) { next += 2.5; samples.push([+S.time.toFixed(4), S.bank, S.refined, S.irritation, S.extracted, S.workers.length, S.lost.length, S.site, S.hev ? S.hev.kind : null, S.workers.map((w) => w.st).join('')]); } } });
    out.traces[k] = samples;
  }
  return JSON.parse(JSON.stringify(out));
}
module.exports = { snapshot, nightFrom, FILE };

// compare the current code with the baseline: returns the number of differences (and prints the first few)
function check(quiet) {
  const want = JSON.parse(fs.readFileSync(FILE, 'utf8')), now = snapshot();
  let diffs = 0;
  const walk = (a, b, p) => { if (diffs > 12) return; if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-9) { diffs++; if (!quiet) console.log('DIFF', p, a, '->', b); } return; } if (a && typeof a === 'object') { for (const k of Object.keys(a)) walk(a[k], (b || {})[k], `${p}.${k}`); if (Array.isArray(a) && b && b.length !== a.length) { diffs++; if (!quiet) console.log('DIFF', p, 'length', a.length, '->', b.length); } return; } if (a !== b) { diffs++; if (!quiet) console.log('DIFF', p, JSON.stringify(a), '->', JSON.stringify(b)); } };
  // every recorded value must match; new keys may be added (additive save fields such as a building's division)
  walk(want, now, '');
  // saves written by the baseline's code load into this code and play the next night identically
  for (const [k, c] of Object.entries(want.campaigns)) { const seed = Number(k.split('-').pop()), loaded = K.fromSave(JSON.parse(JSON.stringify({ v: 2, settings: {}, campaign: c.camp }))).campaign; walk(c.next, JSON.parse(JSON.stringify(nightFrom(loaded, seed))), `${k}.fromOldSave`); }
  return diffs;
}
module.exports.check = check;

if (require.main === module) {
  if (process.argv.includes('--write')) { fs.writeFileSync(FILE, JSON.stringify(snapshot())); console.log('baseline written', FILE); }
  else { const diffs = check(); assert.strictEqual(diffs, 0, `${diffs} differences from the golden baseline`); console.log('regression ok: identical to the baseline'); }
}
