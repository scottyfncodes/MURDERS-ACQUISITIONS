// Headless checks of the depth pass: careers, Saliva R&D and a host who deflates. node tests/depth.test.js
const assert = require('assert');
require('../src/config.js'); require('../src/campaign.js'); require('../src/sim.js');
const { sim, config: C, campaign: K } = globalThis.MA;
const { play } = require('./bot.js');
const DT = 1 / 30;
const run = (S, secs, each) => { for (let t = 0; t < secs && S.state !== 'over'; t += DT) { sim.step(S, DT); if (each) each(S); S.events.length = 0; } };
const crew = (n, since, from) => Array.from({ length: n }, (_, i) => ({ id: from + i, name: `Staff ${from + i}`, trait: 'Quiet', larvae: 50, since }));
const colony = (o) => K.cleanCampaign(Object.assign({ night: 6, buildings: [{ type: 'tank', level: 3, pad: 1 }, { type: 'tank', level: 3, pad: 2 }, { type: 'pool', level: 3, pad: 9 }, { type: 'pool', level: 3, pad: 3 }, { type: 'rig', level: 3 }].concat(o.extra || []), workers: o.workers || crew(8, 6, 1), nextId: 90, hires: 8, unlocks: ['tank', 'pool', 'scatter', 'rig', 'push', 'refinery'].concat(o.unlocks || []), host: { n: 1, start: 1 } }, o.camp || {}));
// loads per second of biting, with storage drained and nothing in the way
function throughput(camp, secs) { const S = sim.newNight(camp, { seed: 4 }); S.schedule = []; S.hiring = false; S.rhythm = false; for (const D of sim.divs(S)) D.pace = 1; let loads = 0; run(S, secs || 60, (x) => { x.bank = 0; x.refined = 0; x.divisions.arm.irritation = 0; x.taken = 0; }); for (const D of sim.divs(S)) loads += D.stats.loads; return { loads, ml: Math.round(S.stats.autoMl), S }; }

// ---------- careers ----------
{
  assert.deepStrictEqual(C.CAREER.map((k) => k.at), [0, 2, 5, 9]);
  const S = sim.newNight(colony({ workers: crew(1, 6, 1).concat(crew(1, 4, 2), crew(1, 1, 3)) }), { seed: 1 });
  assert.deepStrictEqual(S.workers.map((w) => sim.rankOf(S, w)), [0, 1, 2], 'nights served make the rank: hired tonight, two nights, five nights');
  const interns = throughput(colony({ workers: crew(8, 6, 1) })).ml, partners = throughput(colony({ workers: crew(8, 1, 1), camp: { night: 12 } })).ml;
  console.log('careers    interns', interns, 'mL/min, partners', partners);
  assert.ok(partners > interns * 1.3, 'a crew of partners brings in a third more than a crew of interns');
  // promotions are announced at dawn
  const camp = colony({ workers: crew(2, 5, 1).concat(crew(2, 2, 3)) }), x = play(camp, { seed: 2, careful: true, handsOff: true }), n = K.dawn(camp, x.S, x.r);
  const promoted = n.news.promotions.map((p) => p.rank).sort();
  assert.ok(promoted.includes('Associate'), `staff hired on night 5 make Associate after night 6 (${JSON.stringify(n.news.promotions)})`);
  assert.ok(n.news.promotions.every((p) => n.workers.some((w) => w.name === p.name)), 'only the living are promoted');
  // the dead keep their rank on the memorial
  const S2 = sim.newNight(colony({ workers: crew(6, 1, 1), camp: { night: 12 } }), { seed: 3 }); S2.schedule = []; run(S2, 6, (q) => { q.bank = 0; q.refined = 0; }); sim.startEvent(S2, 'swat'); run(S2, 4);
  if (S2.lost.length) assert.ok(S2.lost.every((l) => l.rank === 3), 'a partner is remembered as a partner');
}

// ---------- Saliva R&D ----------
{
  const early = sim.newNight(colony({ camp: { night: 3 } }), { seed: 1 }); assert.ok(!early.unlocked.includes('lab'), 'no R&D before the fourth day');
  const S = sim.newNight(colony({}), { seed: 1, day: true }); assert.ok(S.unlocked.includes('lab'), 'the lab is pitched from the fourth day');
  assert.ok(!S.unlocked.includes('numbing') && !S.unlocked.includes('thinner'), 'research waits for the lab');
  S.bank = 1e5; S.refined = 1e5; assert.ok(sim.build(S, 'lab'), 'the lab is built'); assert.strictEqual(sim.costOf(S, 'lab'), Infinity, 'once');
  assert.ok(S.unlocked.includes('numbing') && S.unlocked.includes('thinner'), 'and opens both lines of research');
  for (let i = 0; i < 3; i++) { assert.ok(sim.build(S, 'numbing')); assert.ok(sim.build(S, 'thinner')); }
  assert.strictEqual(sim.research(S, 'numbing'), 3); assert.strictEqual(sim.costOf(S, 'thinner'), Infinity, 'three phases each');
  const lab = { type: 'lab', level: 1 }, thin = (l) => ({ type: 'thinner', level: l }), numb = (l) => ({ type: 'numbing', level: l });
  // blood thinner: faster bites, bigger welts (each bite noticed more)
  const plain = throughput(colony({})), fast = throughput(colony({ extra: [lab, thin(3)] }));
  console.log('thinner    plain', plain.ml, 'mL/min, thinned', fast.ml);
  assert.ok(fast.loads > plain.loads * 1.1 && fast.ml > plain.ml * 1.4, 'thinned blood is bitten faster and fuller');
  const per = (x) => x.S.divisions.arm.stats.noticed / x.loads;
  assert.ok(per(fast) > per(plain) * 1.3, 'and every bite is noticed more');
  // numbing agent: the itch builds slower
  const itch = (extra) => { const T = sim.newNight(colony({ extra }), { seed: 4 }); T.schedule = []; T.hiring = false; T.rhythm = false; T.divisions.arm.pace = 2; let peak = 0; run(T, 30, (x) => { x.bank = 0; x.refined = 0; x.divisions.arm.eventCd = 99; peak = Math.max(peak, x.divisions.arm.irritation); }); return peak; };
  const raw = itch([]), numbed = itch([lab, numb(3)]); console.log('numbing    itch', raw.toFixed(1), '->', numbed.toFixed(1));
  assert.ok(numbed < raw * 0.75, 'numbed bites itch less');
  // research saves
  const camp = colony({ extra: [lab, thin(2), numb(1)], unlocks: ['lab', 'numbing', 'thinner'] }), back = K.cleanCampaign(JSON.parse(JSON.stringify(camp)));
  assert.deepStrictEqual(back.buildings.filter((b) => ['lab', 'thinner', 'numbing'].includes(b.type)).map((b) => [b.type, b.level]), [['lab', 1], ['thinner', 2], ['numbing', 1]], 'research survives a save');
}

// ---------- he deflates ----------
{
  const S = sim.newNight(colony({ camp: { hostTotals: { extracted: 0, lost: 0, best: 0, hired: 0, fumigations: 0, cancelled: 0 } } }), { seed: 1 });
  assert.strictEqual(sim.drainOf(S, 0), 0); assert.strictEqual(sim.drainOf(S, 1e9), 1);
  assert.ok(sim.drainOf(S, 60000) > 0.9, 'a full lease of a working colony leaves him nearly empty');
  const pale = (ex, last) => sim.newNight(colony({ camp: { night: 7, hostTotals: { extracted: ex, lost: 0, best: 0, hired: 0, fumigations: 0, cancelled: 0 }, history: [{ night: 6, extracted: last, staff: 8, lost: 0, hires: 0, clotted: 0, suspicion: 10 }] } }), { seed: 1 }).events.filter((e) => e.type === 'memo').map((e) => e.text);
  assert.ok(pale(23000, 4000).includes(C.NOTES.pale[0]), 'Rhonda remarks the night he first looks tired');
  assert.ok(!pale(26000, 1000).includes(C.NOTES.pale[0]), 'and not every night after');
  const moved = K.relocate(Object.assign(colony({}), { hostTotals: { extracted: 60000, lost: 0, best: 0, hired: 0, fumigations: 0, cancelled: 0 } }));
  assert.strictEqual(sim.newNight(moved, { seed: 1 }).leaseDrawn, 0, 'the new host arrives full');
}

// ---------- he runs dry ----------
{
  const S = sim.newNight(colony({}), { seed: 1 });
  S.taken = 0; assert.strictEqual(sim.yieldOf(S), 1, 'a fresh night: every bite is full');
  S.taken = S.supply; const y = sim.yieldOf(S); assert.ok(y > 0.4 && y < 0.7, `at his limit a bite brings up about half (${y.toFixed(2)})`);
  S.taken = sim.hardCap(S) - 1; assert.strictEqual(sim.yieldOf(S), C.ECON.dryFloor, 'then a trickle');
  // a crew far bigger than the host still gets more by working harder, but not much more
  const T = sim.newNight(colony({ workers: crew(30, 1, 1), camp: { night: 12 }, extra: [{ type: 'rig', level: 5 }] }), { seed: 2 }); T.hiring = false;
  run(T, 400, (x) => { x.bank = 0; x.refined = 0; });
  assert.ok(T.taken > T.supply && T.taken <= sim.hardCap(T) + 1, `a huge crew drains him past his comfortable limit, never past the hard one (${Math.round(T.taken)} of ${T.supply})`);
  // a second limb opens up more of him
  const F = sim.newNight(colony({ camp: { divisions: ['arm', 'foot'] } }), { seed: 1 }); assert.strictEqual(F.supply, Math.round(C.HOST.supply * (1 + C.ECON.acquiredSupply)));
}

console.log('depth ok');
