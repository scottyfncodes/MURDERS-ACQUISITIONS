// Headless checks of the shift simulation: node tests/sim.test.js
const assert = require('assert');
require('../src/config.js'); require('../src/sim.js');
const { sim, config } = globalThis.MA;

// a simple manager: buys what unblocks the line, pulls the crew on a swat warning when `careful`
function play(opts) {
  const S = sim.newShift({ seed: opts.seed, sleeper: opts.sleeper || 0 });
  const log = { firstBuild: null, q: [] };
  let acc = 0;
  while (S.state !== 'over' && S.time < 400) {
    sim.step(S, 1 / 30); acc += 1 / 30;
    if (S.time >= (log.q.length + 1) * 75 && log.q.length < 4) log.q.push(Math.round(S.extracted));
    for (const e of S.events) { if (e.type === 'build' && log.firstBuild === null) log.firstBuild = S.time; if (e.type === 'telegraph' && opts.careful && (e.kind === 'swat' || e.kind === 'scratch')) sim.recall(S); }
    S.events.length = 0;
    if (S.offer) sim.pickPolicy(S, S.offer[0]);
    if (acc >= 0.5 && S.state === 'playing' && !opts.passive) {
      acc = 0; const d = sim.derived(S), n = S.workers.length, ex = n - S.staff.refine - S.staff.hatch;
      if (opts.pace !== undefined) sim.setPace(S, opts.pace);
      const want = [];
      if (d.counts.hatchery === 0) want.push('hatchery');
      if (n >= d.housing - 1) want.push('pool');
      if (S.queued > 0 || S.raw > d.cap * 0.8) { if (S.staff.refine >= d.stations) want.push('refinery'); else sim.setStaff(S, 'refine', S.staff.refine + 1); want.push('tank'); }
      if (ex > d.slots * 1.4) want.push('rig');
      if (d.counts.hatchery && S.staff.hatch < d.nurseStations && n > 8) sim.setStaff(S, 'hatch', S.staff.hatch + 1);
      if (S.staff.refine < Math.ceil(ex / 2.2)) sim.setStaff(S, 'refine', S.staff.refine + 1);
      want.push('hatchery', 'pool');
      for (const t of want) { if (sim.costOf(S, t) <= S.bank) { sim.build(S, t); break; } }
    }
  }
  return { S, log, r: sim.review(S) };
}

const a = play({ seed: 7, careful: true });
console.log('careful  ', JSON.stringify({ ...a.r, lost: a.r.lost.length, firstBuild: a.log.firstBuild, end: Math.round(a.S.time), q: a.log.q, swats: a.S.stats.swats, scr: a.S.stats.scratches }));
const b = play({ seed: 7, careful: false, pace: 2 });
console.log('reckless ', JSON.stringify({ ...b.r, lost: b.r.lost.length, end: Math.round(b.S.time), q: b.log.q, swats: b.S.stats.swats, scr: b.S.stats.scratches }));
const c = play({ seed: 7, passive: true });
console.log('passive  ', JSON.stringify({ ...c.r, lost: c.r.lost.length, end: Math.round(c.S.time) }));

assert.ok(a.log.firstBuild !== null && a.log.firstBuild <= 10, 'a first building is affordable within ten seconds');
assert.strictEqual(a.S.state, 'over', 'a shift ends in a review');
assert.ok(a.r.extracted > c.r.extracted * 2, 'managing the plant beats leaving it alone');
assert.ok(a.r.casualties < b.r.casualties, 'pulling the crew on the warning saves staff');
assert.ok(b.S.time < a.S.time, 'aggressive extraction wakes the sleeper sooner');
assert.ok(a.r.pct <= 100 && a.r.extracted <= a.S.supply, 'never more than the supply');
for (const k of ['extracted', 'pct', 'efficiency', 'casualties', 'score', 'rating']) assert.ok(k in a.r, 'review has ' + k);
// denied purchases never spend
{ const S = sim.newShift({ seed: 1 }); S.bank = 0; assert.strictEqual(sim.build(S, 'refinery'), null); assert.strictEqual(S.bank, 0); assert.ok(S.events.some((e) => e.type === 'deny')); }
// every sleeper finishes a shift
for (let i = 0; i < config.SLEEPERS.length; i++) { const x = play({ seed: 3 + i, sleeper: i, careful: true }); assert.strictEqual(x.S.state, 'over'); console.log('sleeper', i, x.r.extracted, x.r.pct + '%', x.r.rating, 'staff', x.r.peakStaff, 'lost', x.r.casualties, 'quotas', x.r.quotasMet); }
console.log('sim ok');
// promotions widen the policy drawer: rank 0 never offers a rank-gated policy
{ const gated = config.POLICIES.filter((p) => p.rank).map((p) => p.id); for (let s = 1; s < 30; s++) { const S = sim.newShift({ seed: s, rank: 0 }); S.extracted = S.quotas[0]; sim.step(S, 1 / 30); assert.ok(S.offer && S.offer.every((id) => !gated.includes(id)), 'rank 0 offer'); }
  let seen = false; for (let s = 1; s < 40 && !seen; s++) { const S = sim.newShift({ seed: s, rank: 4 }); S.extracted = S.quotas[0]; sim.step(S, 1 / 30); seen = S.offer.some((id) => gated.includes(id)); } assert.ok(seen, 'rank 4 can be offered gated policies'); }
console.log('career ok');
