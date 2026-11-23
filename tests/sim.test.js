// Headless checks of the night simulation and the campaign: node tests/sim.test.js
const assert = require('assert');
require('../src/config.js'); require('../src/campaign.js'); require('../src/sim.js');
const { sim, config: C, campaign: K } = globalThis.MA;
const DT = 1 / 30;

// a human-paced player: holds until Rhonda is full (plus a beat), rests between trips, takes a moment to act on a
// new card, builds on the shortest-trip pad, and presses Scatter a little after the hand starts to move
function play(camp, opts) {
  opts = opts || {};
  const S = sim.newNight(camp, { seed: opts.seed || 7 });
  const log = { firstDeposit: null, unlock: {}, built: {}, firstHire: null, firstAuto: null, tutScratch: null, order: [] };
  let rest = 0, recallAt = null; const seen = {};
  while (S.state !== 'over' && S.time < 600) {
    const f = S.founder;
    if (!opts.passive) {
      if (f.st === 'home') { rest += DT; S.hold = rest > (opts.rest || 0.8); }
      else if (f.st === 'drink') S.hold = opts.greedy ? true : f.greed < 0.25;
      else if (f.st === 'toSkin') S.hold = true; else { S.hold = false; rest = 0; }
      if (opts.handsOff && S.workers.length >= 2) S.hold = false;
    }
    sim.step(S, DT);
    for (const e of S.events) {
      if (e.type === 'deliver' && e.founder && log.firstDeposit === null) log.firstDeposit = S.time;
      if (e.type === 'deliver' && !e.founder && log.firstAuto === null) log.firstAuto = S.time;
      if (e.type === 'unlock') { log.unlock[e.what] = S.time; log.order.push(e.what); }
      if (e.type === 'build' && !e.upgrade) log.built[e.b.type] = log.built[e.b.type] || S.time;
      if (e.type === 'hatch' && e.first) log.firstHire = S.time;
      if (e.type === 'telegraph' && e.tutorial) log.tutScratch = S.time;
      if (e.type === 'telegraph' && opts.careful && (e.kind === 'swat' || e.kind === 'scratch')) recallAt = S.time + 0.6;
      if (e.type === 'impact' && e.tutorial) log.tutResult = { dead: e.dead.length, nearMiss: e.nearMiss };
    }
    S.events.length = 0;
    if (recallAt !== null && S.time >= recallAt) { sim.recall(S); recallAt = null; }
    if (!opts.passive && !opts.noBuild) for (const t of opts.buildOrder || ['tank', 'pool', 'rig']) {
      if (!S.unlocked.includes(t)) continue; seen[t] = seen[t] || S.time;
      if (S.time - seen[t] < 2.5 || sim.costOf(S, t) > S.bank) continue;
      if (t === 'tank' && sim.derived(S).counts.tank > 0 && S.queued === 0 && S.bank < sim.derived(S).cap * 0.85) continue;
      const pads = sim.padsByTrip(S); const p = opts.far ? pads[pads.length - 1] : pads[0]; // with no pads left the card upgrades instead
      if (sim.build(S, t, p && p.pad)) break;
    }
  }
  return { S, log, r: sim.report(S) };
}

// ---------- night 1: the tutorial arc ----------
const n1 = play(K.newCampaign(), { careful: true, handsOff: true });
const L = n1.log;
console.log('night 1  ', JSON.stringify({ ...n1.r, lost: n1.r.lost.length, names: undefined, firstDeposit: +L.firstDeposit.toFixed(1), unlockOrder: L.order, builtAt: L.built, firstHireAt: +L.firstHire.toFixed(1), firstAutoAt: +L.firstAuto.toFixed(1), tutScratchAt: +L.tutScratch.toFixed(1), end: +n1.S.time.toFixed(1) }));
assert.ok(L.firstDeposit !== null && L.firstDeposit < 6, 'the first manual deposit lands within seconds');
assert.deepStrictEqual(L.order.slice(0, 3), ['tank', 'pool', 'scatter'], 'cards appear one problem at a time: storage, then staff, then the hand');
assert.ok(L.unlock.tank > L.firstDeposit, 'the storage card waits for the bottle cap to fill');
assert.ok(L.built.tank < L.unlock.pool + 0.01 && L.unlock.pool >= L.built.tank, 'the pool card follows the first tank');
assert.ok(L.firstHire !== null && L.firstHire < 75, 'the first employee hatches inside the first minute and a quarter');
assert.ok(L.firstAuto !== null && L.firstAuto > L.firstHire && L.firstAuto - L.firstHire < 8, 'the first employee delivers on their own within seconds');
assert.ok(L.tutScratch !== null && L.tutScratch > L.firstHire, 'the first disturbance comes after the first employee');
assert.deepStrictEqual(L.tutResult, { dead: 0, nearMiss: true }, 'pressing Scatter on the tutorial scratch is a clean near miss');
assert.strictEqual(n1.S.state, 'over', 'night 1 reaches the morning');
assert.ok(n1.S.time > 140 && n1.S.time <= 160, 'night 1 lasts about two and a half minutes');
assert.ok(n1.r.auto > n1.r.manual * 3, 'by morning the staff out-produce the founder several times over');
assert.ok(n1.r.staff >= 3 && n1.r.staff <= 12, 'night 1 ends with a small crew, not an army');

// determinism: same seed, same inputs, same night
{ const a = play(K.newCampaign(), { careful: true, seed: 3 }), b = play(K.newCampaign(), { careful: true, seed: 3 }); assert.deepStrictEqual(a.r, b.r, 'a night is deterministic for a seed and inputs'); }

// nobody touches anything: nothing unlocks, nothing breaks, the alarm still rings
{ const p = play(K.newCampaign(), { passive: true }); assert.strictEqual(p.r.extracted, 0); assert.deepStrictEqual(p.S.unlocked, []); assert.strictEqual(p.S.state, 'over'); }

// the tutorial scratch is safe even if the player does nothing about it
{ const p = play(K.newCampaign(), { handsOff: true }); assert.ok(p.log.tutResult && p.log.tutResult.dead === 0, 'missing the tutorial Scatter costs nobody'); }

// greed: drinking past full itches him, and the hand comes for Rhonda; she is knocked off, never killed
{
  const S = sim.newNight(K.newCampaign(), { seed: 2 }); let hit = null, tele = null;
  S.hold = true; for (let i = 0; i < 30 * 12 && !hit; i++) { sim.step(S, DT); for (const e of S.events) { if (e.type === 'telegraph') tele = e; if (e.type === 'impact') hit = e; } S.events.length = 0; }
  assert.ok(tele && tele.kind === 'scratch' && !tele.tutorial, 'holding past full brings the hand');
  assert.ok(hit && hit.founder, 'staying put gets Rhonda clipped');
  assert.strictEqual(S.founder.belly, 0, 'the load she was carrying is lost'); assert.strictEqual(S.lost.length, 0, 'the founder is never killed');
}

// placement: storage close to the bite is faster than storage far away
{
  const camp = K.cleanCampaign({ night: 2, bank: 0, buildings: [{ type: 'pool', level: 1, pad: 9 }], workers: [1, 2, 3].map((i) => ({ id: i, name: `W ${i}`, trait: 'Quiet', larvae: 50 })), nextId: 4, hires: 3, unlocks: ['tank', 'pool', 'scatter'] });
  const near = K.cleanCampaign(camp), far = K.cleanCampaign(camp);
  const nearPad = sim.padsByTrip(sim.newNight(near, { seed: 1 })).filter((p) => p.pad !== 9)[0].pad, farPad = sim.padsByTrip(sim.newNight(far, { seed: 1 })).filter((p) => p.pad !== 9).pop().pad;
  near.buildings.push({ type: 'tank', level: 1, pad: nearPad }); far.buildings.push({ type: 'tank', level: 1, pad: farPad });
  const run = (c) => { const S = sim.newNight(c, { seed: 4 }); S.schedule = []; S.hiring = false; while (S.time < 60) { sim.step(S, DT); S.irritation = 0; S.bank = 0; S.events.length = 0; } return S.extracted; };
  const a = run(near), b = run(far); console.log('placement', { near: Math.round(a), far: Math.round(b) });
  assert.ok(a > b * 1.25, 'a tank by the arm beats a tank in the far corner (staff unload at the nearest tank)');
}

// ---------- the campaign boundary ----------
{
  let camp = K.newCampaign(); const one = play(camp, { careful: true, handsOff: true }); camp = K.fold(camp, one.S, one.r);
  assert.strictEqual(camp.night, 2); assert.strictEqual(camp.workers.length, one.r.staff, 'the staff come back the next night');
  assert.strictEqual(camp.buildings.length, one.S.buildings.length - 1, 'every building comes back (the bottle cap is implicit)');
  assert.ok(Math.abs(camp.bank - (one.S.bank - one.r.clotted)) < 1e-6, 'stored blood carries over, less what clotted at dawn');
  assert.ok(one.r.clotted > 0 && camp.unlocks.includes('refinery'), 'the first clot unlocks the refinery');
  assert.strictEqual(camp.phase, 'day', 'dawn hands over to the day');
  assert.deepStrictEqual(camp.history[0].night, 1); assert.ok(camp.totals.extracted === one.r.extracted);
  const S2 = sim.newNight(camp, { seed: 9 });
  assert.strictEqual(S2.tut, null, 'night 2 has no tutorial'); assert.strictEqual(S2.shiftLen, K.nightLength(2)); assert.ok(K.nightLength(2) > K.nightLength(1));
  assert.ok(S2.unlocked.includes('scatter') && S2.unlocked.includes('pool'), 'what was learned stays learned');
  assert.deepStrictEqual(S2.workers.map((w) => w.name), camp.workers.map((w) => w.name), 'same names, same people');
  const two = play(camp, { careful: true, seed: 9 }); assert.strictEqual(two.S.state, 'over'); console.log('night 2  ', JSON.stringify({ ...two.r, lost: two.r.lost.length, names: undefined, unlocked: two.S.unlocked }));
  assert.ok(two.S.unlocked.includes('rig'), 'a crowded arm unlocks the extraction rig');
  const camp3 = K.fold(camp, two.S, two.r); assert.strictEqual(camp3.night, 3); assert.strictEqual(camp3.lost.length, two.r.lost.length);
}

// denied purchases never spend; locked or occupied is refused
{
  const S = sim.newNight(K.newCampaign(), { seed: 1 });
  assert.strictEqual(sim.build(S, 'tank', 1), null, 'a locked card cannot be built'); assert.strictEqual(S.bank, 0);
  S.unlocked.push('tank'); S.bank = 10; assert.strictEqual(sim.build(S, 'tank', 1), null); assert.strictEqual(S.bank, 10); assert.ok(S.events.some((e) => e.type === 'deny'));
  S.bank = 30; assert.ok(sim.build(S, 'tank', 1)); S.bank = 100; assert.strictEqual(sim.build(S, 'tank', 1), null, 'an occupied pad is refused'); assert.strictEqual(S.bank, 100);
}

// ---------- saves ----------
{
  const one = play(K.newCampaign(), { careful: true }); const camp = K.fold(K.newCampaign(), one.S, one.r);
  const saved = { v: 2, settings: { muted: true, seenOpening: true }, campaign: camp, archive: null };
  assert.deepStrictEqual(K.fromSave(JSON.parse(JSON.stringify(saved))), saved, 'a save round-trips unchanged');
  for (const junk of [null, 5, 'x', [], { v: 1 }, { v: 2, campaign: 'no' }, { v: 2, campaign: { night: -4, bank: 'lots', buildings: [{ type: 'tank', pad: 1 }, { type: 'tank', pad: 1 }, { type: 'nuke', pad: 2 }, { type: 'pool', pad: 99 }], workers: [{ name: 7 }, null] } }]) {
    const d = K.fromSave(junk); assert.ok(d.campaign.night >= 1 && d.campaign.bank >= 0 && d.campaign.buildings.length <= 1, 'junk is cleaned, not trusted');
    sim.newNight(d.campaign, { seed: 1 });
  }
  const v1 = Object.freeze({ shifts: 3, muted: true, career: 140, seenHint: true, lastSleeper: 2, best: Object.freeze({ shiftNo: 2, sleeper: 'Night nurse, 41', rating: 'Meets Expectations', score: 71, extracted: 3300, pct: 44, casualties: 1 }), reviews: Object.freeze([Object.freeze({ shiftNo: 2, sleeper: 'Night nurse, 41', rating: 'Meets Expectations', score: 71, extracted: 3300, pct: 44, casualties: 1 })]) });
  const before = JSON.stringify(v1), m = K.migrateV1(v1);
  assert.strictEqual(JSON.stringify(v1), before, 'migration never modifies the v1 save');
  assert.strictEqual(m.settings.muted, true, 'mute carries over'); assert.strictEqual(m.settings.seenOpening, false, 'veterans see the new opening once');
  assert.strictEqual(m.archive.shifts, 3); assert.strictEqual(m.archive.reviews.length, 1); assert.strictEqual(m.archive.best.score, 71); assert.strictEqual(m.campaign.night, 1);
  assert.deepStrictEqual(K.fromSave(JSON.parse(JSON.stringify(m))), m, 'a migrated save round-trips');
  assert.strictEqual(K.migrateV1(null).archive, null, 'a new player has no archive');
  assert.notStrictEqual(K.V1_KEY, K.V2_KEY);
}

// ---------- phase 2: days, clotting, the refinery, the drip line, the floor ----------
const staff = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Staff ${i + 1}`, trait: 'Quiet', larvae: 50 }));
const colony = (extra) => K.cleanCampaign(Object.assign({ night: 2, bank: 100, buildings: [{ type: 'tank', level: 1, pad: 1 }, { type: 'pool', level: 2, pad: 9 }], workers: staff(4), nextId: 5, hires: 4, unlocks: ['tank', 'pool', 'scatter'] }, extra || {}));
const runNight = (S, secs, each) => { while (S.state === 'playing' && S.time < secs) { sim.step(S, DT); if (each) each(S); S.events.length = 0; } return S; };

// clotting: raw blood loses a share at dawn, refined blood keeps; spending takes raw first
{
  const S = sim.newNight(colony(), { seed: 1 }); S.refined = 40; assert.strictEqual(sim.report(S).clotted, Math.round(60 * C.ECON.clotShare), 'only the raw part clots');
  S.unlocked.push('refinery'); assert.ok(sim.build(S, 'refinery', 3)); assert.ok(Math.abs(S.refined - 30) < 1e-9 && Math.abs(S.bank - 30) < 1e-9, 'a 70 mL purchase from 60 raw + 40 refined takes all 60 raw before 10 refined');
  const T = sim.newNight(colony({ buildings: [{ type: 'tank', level: 1, pad: 1 }, { type: 'pool', level: 2, pad: 9 }, { type: 'refinery', level: 1, pad: 3 }] }), { seed: 2 });
  runNight(T, 30, (x) => { x.irritation = 0; }); assert.ok(T.refined > 30 && T.refined <= T.bank + 1e-9, 'the refinery refines stored blood through the night');
  const D = sim.newNight(colony({ phase: 'day', buildings: [{ type: 'tank', level: 1, pad: 1 }, { type: 'refinery', level: 1, pad: 3 }] }), { day: true, seed: 2 }); runNight(D, 30); assert.strictEqual(D.refined, 0, 'nothing refines while the day has no clock');
}

// the day: no host, no bites, no clock; what is built in the day is there at night
{
  const camp = colony({ phase: 'day' }), D = sim.newNight(camp, { day: true, seed: 3 }); let denied = false;
  D.hold = true; runNight(D, 20, (x) => { if (x.events.some((e) => e.type === 'deny' && e.what === 'day')) denied = true; });
  assert.ok(denied, 'holding in the day explains that he is at work'); assert.strictEqual(D.extracted, 0); assert.strictEqual(D.state, 'playing', 'a day never ends on its own');
  assert.strictEqual(D.workers.length, 4); assert.ok(D.workers.every((w) => w.st === 'wait'), 'staff stay home in the day');
  assert.ok(sim.build(D, 'tank', 3), 'building works in the day');
  const kept = K.foldDay(camp, D, false); assert.strictEqual(kept.phase, 'day'); assert.strictEqual(kept.night, 2, 'saving a day does not advance the night');
  const dusk = K.foldDay(camp, D, true); assert.strictEqual(dusk.phase, 'night'); assert.ok(dusk.buildings.some((b) => b.type === 'tank' && b.pad === 3), 'the day build is in the night');
  const N = sim.newNight(dusk, { seed: 3 }); assert.strictEqual(N.phase, 'night'); assert.ok(N.buildings.filter((b) => b.type === 'tank').length === 2);
}

// the drip line: after the roll to the foot, tanks by the arm are a long trip; the drip line fixes it and it shows
{
  const S = sim.newNight(colony({ workers: staff(6), buildings: [{ type: 'tank', level: 1, pad: 0 }, { type: 'pool', level: 2, pad: 9 }] }), { seed: 4 });
  S.schedule = [{ at: 1, kind: 'roll' }]; runNight(S, 25, (x) => { x.irritation = 0; });
  assert.strictEqual(S.site, 'foot'); assert.ok(sim.tripSeconds(S, sim.nearestStore(S)) > C.ECON.longTripSeconds, 'the foot is a long way from an arm-side tank');
  assert.ok(S.unlocked.includes('drip'), 'long trips unlock the drip line');
  const measure = (withDrip) => { const T = sim.newNight(colony({ workers: staff(6), buildings: [{ type: 'tank', level: 1, pad: 0 }, { type: 'pool', level: 2, pad: 9 }].concat(withDrip ? [{ type: 'drip', level: 1, pad: -1 }] : []) }), { seed: 5 }); T.schedule = []; T.hiring = false; runNight(T, 60, (x) => { x.irritation = 0; x.bank = 0; x.refined = 0; }); return T.extracted; };
  const a = measure(true), b = measure(false); console.log('drip line', { with: Math.round(a), without: Math.round(b) }); assert.ok(a > b * 1.2, 'unloading at the bite is faster than flying to the tank');
}

// the floor: when the near floor is full, the window side is for sale; buying it opens four spots
{
  const S = sim.newNight(colony({ bank: 0 }), { seed: 6 }); S.bank = 1e5;
  while (sim.freePads(S).length) { const p = sim.freePads(S)[0]; assert.ok(sim.build(S, 'tank', p)); }
  sim.step(S, DT); assert.ok(S.unlocked.includes('floor'), 'a full floor unlocks Floor space'); const cheap = sim.cheapestUpgrade(S, 'tank'); assert.strictEqual(sim.costOf(S, 'tank'), sim.upgradeCost(cheap), 'with no floor left, the card upgrades the cheapest tank'); const lv = cheap.level; assert.ok(sim.build(S, 'tank')); assert.strictEqual(cheap.level, lv + 1);
  assert.ok(sim.build(S, 'floor')); assert.deepStrictEqual(sim.freePads(S), C.ZONES[1].slice().sort((a, b) => a - b), 'the window side opens');
  assert.strictEqual(sim.costOf(S, 'floor'), Infinity, 'the floor is bought once');
  const back = K.cleanCampaign({ night: 3, buildings: [{ type: 'pool', level: 1, pad: C.ZONES[1][0] }] }); assert.strictEqual(back.zones, 2, 'a building on the window side means the floor was bought');
}

// a phase 1 save (no day, refined or zones yet) loads as a night with the near floor
{
  const old = { v: 2, settings: { muted: false, seenOpening: true }, campaign: { night: 3, bank: 120, buildings: [{ type: 'tank', level: 1, pad: 1 }, { type: 'pool', level: 1, pad: 3 }], workers: staff(3), nextId: 4, hires: 3, unlocks: ['tank', 'pool', 'scatter'], totals: { extracted: 900, nights: 2 }, history: [] }, archive: null };
  const d = K.fromSave(old); assert.strictEqual(d.campaign.phase, 'night'); assert.strictEqual(d.campaign.zones, 1); assert.strictEqual(d.campaign.refined, 0); assert.strictEqual(d.campaign.bank, 120);
  sim.newNight(d.campaign, { seed: 1 });
}

// four nights of a sensible player: the operation grows, and each night asks for something new
{
  let camp = K.newCampaign(); const firsts = [];
  for (let n = 1; n <= 4; n++) {
    if (camp.phase === 'day') { const D = sim.newNight(camp, { day: true, seed: 20 + n }); for (const t of ['refinery', 'tank', 'pool']) { const p = sim.padsByTrip(D)[0]; if (D.unlocked.includes(t) && p && sim.costOf(D, t) <= D.bank && D.buildings.filter((b) => b.type === t).length < (t === 'refinery' ? 1 : 9)) sim.build(D, t, p.pad); } camp = K.foldDay(camp, D, true); }
    const before = camp.unlocks.slice(), x = play(camp, { careful: true, seed: 30 + n, buildOrder: ['tank', 'pool', 'refinery', 'rig', 'drip', 'floor'] });
    firsts.push({ night: n, new: x.S.unlocked.filter((u) => !before.includes(u)), extracted: x.r.extracted, staff: x.r.staff, clotted: x.r.clotted, lost: x.r.lost.length });
    camp = K.fold(camp, x.S, x.r);
  }
  console.log('campaign ', JSON.stringify(firsts));
  assert.ok(firsts[3].extracted > firsts[0].extracted * 2, 'night 4 out-produces night 1 by a wide margin');
  assert.ok(camp.unlocks.includes('refinery') && camp.unlocks.includes('rig'), 'clotting and crowding have both happened by night 4');
}
console.log('sim ok');
