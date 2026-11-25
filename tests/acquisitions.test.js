// Headless checks of the Acquisitions design: node tests/acquisitions.test.js
// The foot, its GMs and policies, the processing plant, the roll, the suspicion breakdown, the exterminator and the lease.
const assert = require('assert');
require('../src/config.js'); require('../src/campaign.js'); require('../src/sim.js');
const { sim, config: C, campaign: K } = globalThis.MA;
const { play } = require('./bot.js');
const DT = 1 / 30;
const run = (S, secs, each) => { for (let t = 0; t < secs && S.state !== 'over'; t += DT) { sim.step(S, DT); if (each) each(S); S.events.length = 0; } };
const crew = (n, dv, from) => Array.from({ length: n }, (_, i) => ({ id: from + i, name: `${dv} ${from + i}`, trait: 'Quiet', larvae: 50, div: dv }));
const base = { tank: 3, pool: 3 };
function colony(o) {
  o = o || {};
  const b = [{ type: 'tank', level: base.tank, pad: 1 }, { type: 'tank', level: base.tank, pad: 2 }, { type: 'pool', level: base.pool, pad: 9 }, { type: 'pool', level: base.pool, pad: 3 }, { type: 'rig', level: o.rig || 4, div: 'arm' }];
  if (o.foot) b.push({ type: 'rig', level: 2, div: 'foot' });
  if (o.lookout) b.push({ type: 'lookout', level: 1, div: 'arm' });
  if (o.seminar) b.push({ type: 'seminar', level: o.seminar, div: 'foot' });
  if (o.plant) b.push({ type: 'plant', level: o.plant, div: 'foot' });
  const w = crew(o.arm || 8, 'arm', 1).concat(o.foot ? crew(o.footStaff || 8, 'foot', 40) : []);
  return K.cleanCampaign(Object.assign({ night: 5, divisions: o.foot ? ['arm', 'foot'] : ['arm'], bank: o.bank || 0, buildings: b, workers: w, nextId: 90, hires: w.length, unlocks: ['tank', 'pool', 'scatter', 'rig', 'lookout', 'push', 'refinery'].concat(o.foot ? ['acquire', 'seminar', 'plant'] : []), host: { n: 1, start: 1 } }, o.camp || {}));
}

// ---------- the offer and the purchase ----------
{
  const early = sim.newNight(colony({ camp: { night: 2 } }), { seed: 1 }); run(early, 1);
  assert.ok(!early.unlocked.includes('acquire'), 'no offer before night 3, however big the rig');
  const small = sim.newNight(colony({ rig: 3 }), { seed: 1 }); run(small, 1);
  assert.ok(!small.unlocked.includes('acquire'), 'no offer while the arm still has room to grow');
  const S = sim.newNight(colony({ bank: 6000 }), { seed: 1 }); run(S, 1);
  assert.ok(S.unlocked.includes('acquire'), 'a full rig at the arm from night 3: the board offers the foot');
  assert.strictEqual(sim.costOf(S, 'acquire'), C.BUILDINGS.acquire.cost);
  assert.ok(C.BUILDINGS.acquire.cost >= 4000, 'the foot is a capital decision (more than a night of the arm\'s output), not an impulse buy');
  assert.strictEqual(sim.costOf(S, 'plant'), Infinity, 'the arm cannot build a processing plant');
  S.bank = 6000; S.refined = 6000; const got = sim.build(S, 'acquire');
  assert.ok(got && S.divisions.foot, 'the foot is bought'); assert.strictEqual(sim.costOf(S, 'acquire'), Infinity, 'and only once');
  assert.ok(S.unlocked.includes('seminar') && S.unlocked.includes('plant'), 'leadership training and the plant come with it');
  const gm = S.workers.filter((w) => w.job === 'gm'); assert.deepStrictEqual(gm.map((w) => [w.div, w.id]), [['arm', 1]], 'the arm\'s longest-serving employee becomes its GM');
  assert.ok(Number.isFinite(sim.costOf(S, 'plant', 'foot')), 'the foot can build a plant');
}

// ---------- GMs: policies, lag, the founder's floor ----------
{
  const S = sim.newNight(colony({ foot: true }), { seed: 3 }); run(S, 0.5);
  const A = sim.div(S, 'arm'), F = sim.div(S, 'foot');
  assert.ok(S.workers.some((w) => w.job === 'gm' && w.div === 'arm') && S.workers.some((w) => w.job === 'gm' && w.div === 'foot'), 'each division has a GM');
  let gmBites = 0; S.gmPolicy.foot = 'lie'; run(S, 20, (x) => { if (x.workers.some((w) => w.job === 'gm' && w.st === 'bite')) gmBites++; assert.strictEqual(F.pace, 0, 'lie low: the GM holds the foot at ease off'); });
  assert.strictEqual(gmBites, 0, 'GMs do not bite');
  S.gmPolicy.foot = 'aggressive'; run(S, 2); assert.strictEqual(F.pace, 2, 'aggressive: the GM pushes');
  sim.setPace(S, 0, 'arm'); run(S, 3); assert.strictEqual(A.pace, 0, 'the floor you are on is yours: its GM does not override you');
  sim.setFocus(S, 'foot'); sim.setPace(S, 1, 'foot'); run(S, 3); assert.strictEqual(F.pace, 1, 'nor on the foot when you go there');
  assert.ok(A.pace === 0 || A.pace === 2, 'the arm you left is back on its GM\'s standard policy (push in deep sleep, ease off otherwise)');
  // leadership training: the lag between his sleep and the GM's reading of it
  const lag = [0, 1, 2].map((lv) => sim.gmLag(sim.newNight(colony({ foot: true, seminar: lv || undefined }), { seed: 3 }), { id: 'foot' }));
  assert.ok(lag[0] > lag[1] && lag[1] > lag[2], `each seminar level shortens the GM's lag (${lag.join(' → ')} s)`);
}

// an untrained GM reads his sleep late: measured against a perfect reading, the trained one is right more often
{
  const share = (sem) => {
    const S = sim.newNight(colony({ foot: true, seminar: sem }), { seed: 9 }); let right = 0, n = 0;
    run(S, 120, (x) => { const F = sim.div(x, 'foot'); if (F.offline) return; n++; if ((F.pace === 2) === (x.depth > C.ECON.gmPushAbove)) right++; });
    return right / n;
  };
  const untrained = share(undefined), trained = share(2);
  console.log('GM reads   untrained', untrained.toFixed(2), ' trained', trained.toFixed(2));
  assert.ok(untrained < 0.85, 'an untrained GM is wrong often enough to matter');
  assert.ok(trained > untrained + 0.08, 'training makes a measurable difference');
}

// ---------- the foot itself ----------
{
  const S = sim.newNight(colony({ foot: true }), { seed: 4 });
  assert.strictEqual(S.schedule.filter((e) => e.kind === 'blanket' && e.div === 'foot').length, C.DIVISIONS.foot.socks, 'the foot goes under the covers a few times a night');
  const kinds = new Set(); run(S, 400, (x) => { x.bank = 0; x.refined = 0; for (const D of sim.divs(x)) if (D.hev) kinds.add(`${D.id}:${D.hev.kind}`); });
  assert.ok(![...kinds].some((k) => k === 'foot:scratch' || k === 'foot:swat'), 'the foot is rubbed and kicked, never scratched or swatted');
  assert.ok([...kinds].some((k) => k === 'foot:rub' || k === 'foot:kick'), `the foot has its own hazards (${[...kinds].join(', ')})`);
}

// ---------- the roll: the arm goes dark and lends its crew to the foot ----------
{
  const camp = colony({ foot: true, arm: 6, footStaff: 4 }), S = sim.newNight(camp, { seed: 2 }); S.hiring = false;
  const roll = S.schedule.find((e) => e.kind === 'roll'); assert.ok(roll, 'he still rolls over');
  let lent = null; run(S, roll.at + 15, (x) => { if (lent === null && sim.div(x, 'arm').offline) lent = x.workers.filter((w) => w.lent === 'arm').length; });
  assert.ok(sim.div(S, 'arm').offline, 'after the roll the arm is offline for the rest of the night');
  assert.strictEqual(lent, 5, 'its extract staff (everyone but the GM) are lent to the foot');
  assert.ok(S.workers.filter((w) => w.lent === 'arm').every((w) => w.div === 'foot'), 'lent staff work at the foot');
  run(S, 900); const n = K.dawn(camp, S, sim.report(S));
  assert.strictEqual(n.workers.filter((w) => w.div === 'arm').length, 6, 'at dawn the lent staff go home to the arm');
  assert.ok(n.workers.every((w) => !w.lent), 'the loan is not saved');
}

// ---------- the processing plant ----------
{
  const cap = (lv) => sim.derived(sim.newNight(colony({ foot: true, plant: lv }), { seed: 1 })).cap;
  assert.strictEqual(cap(2) - cap(undefined), 2 * C.ECON.plantCap, 'each plant level stores more raw blood');
  const refined = (lv) => { const S = sim.newNight(colony({ foot: true, plant: lv, bank: 800 }), { seed: 1 }); S.schedule = []; S.hiring = false; const r0 = S.refined; run(S, 20); return S.refined - r0; };
  assert.ok(Math.abs(refined(1) - refined(undefined) - 20 * C.ECON.plantRefine) < 1, 'and refines it as it goes');
}

// ---------- the suspicion breakdown adds up ----------
{
  const x = play(colony({ foot: true }), { seed: 6, careful: true, handsOff: true, push: 'timed' });
  const parts = x.r.susParts, sum = parts.reduce((a, p) => a + p.v, 0);
  assert.ok(parts.some((p) => p.key === 'bites' && p.div === 'arm') && parts.some((p) => p.key === 'bites' && p.div === 'foot'), 'bites are itemised per division');
  assert.strictEqual(Math.round(sum), x.r.suspicion, 'the items add up to the night\'s total');
  const camp = colony({ foot: true, camp: { suspicion: 30 } }), n = K.dawn(camp, x.S, x.r), s = n.news.suspicion;
  assert.strictEqual(s.before, 30); assert.strictEqual(s.raw, 30 + x.r.suspicion);
  assert.ok(Math.abs(s.after - Math.max(0, Math.min(100, s.raw) - s.forget)) < 1e-9, 'the morning shows before, gain, forgetting and after');
  // easing off is noticed less than pushing
  const calm = play(colony(), { seed: 6, careful: true, push: 'never' }), hard = play(colony(), { seed: 6, careful: true, push: 'always' });
  const bites = (r) => r.susParts.find((p) => p.key === 'bites');
  assert.ok(bites(calm.r).v / bites(calm.r).count < bites(hard.r).v / bites(hard.r).count, 'a pushed bite is noticed more than a gentle one');
}

// ---------- the exterminator ----------
const quiet = (camp) => { const S = sim.newNight(camp, { seed: 1 }); const r = sim.report(S); return { S, r: Object.assign({}, r, { suspicion: 0, susParts: [] }) }; };
const night = (camp, gain) => { const q = quiet(camp); q.r.suspicion = gain; q.r.susParts = gain ? [{ key: 'bites', div: 'arm', count: 1, v: gain }] : []; return K.dawn(camp, q.S, q.r); };
{
  // booked at 100: three nights' notice
  let camp = colony({ foot: true, lookout: true, camp: { suspicion: 80 } });
  camp = night(camp, 30); assert.strictEqual(camp.booking, 5 + C.ECON.warningNights, 'he books the exterminator for three nights later');
  assert.strictEqual(camp.news.booking, camp.booking);
  const booked = camp;
  // cancellation: lie low for three nights and he cancels
  let calm = booked; for (let i = 0; i < 3; i++) calm = night(calm, 4);
  assert.ok(calm.news.cancelled, `three quiet nights get it cancelled (suspicion ${Math.round(calm.suspicion)})`); assert.strictEqual(calm.booking, null);
  assert.strictEqual(calm.hostTotals.cancelled, 1);
  // keep going and he comes
  let hot = booked; for (let i = 0; i < 3; i++) hot = night(hot, 35);
  const f = hot.news.fumigation; assert.ok(f, 'keep it up and the bedroom is fumigated');
  const staff = booked.workers.length, protectedN = 2 + 1; // a GM per division and the arm's lookout
  assert.strictEqual(f.lost.length, Math.round((staff - protectedN) * C.ECON.fumigationStaffShare), '40% of the non-executive staff');
  assert.strictEqual(hot.workers.length, staff - f.lost.length);
  for (const id of [1, 40]) assert.ok(hot.workers.some((w) => w.id === id), 'the GMs were in a meeting');
  assert.ok(hot.workers.some((w) => w.id === 2), 'and so was the lookout');
  assert.strictEqual(hot.bank, hot.refined, 'the raw blood is gone; refined stock survives');
  assert.ok(hot.buildings.filter((b) => b.type === 'pool').every((b) => b.level === base.pool - 1), 'every pool loses a level');
  assert.strictEqual(hot.suspicion, C.ECON.fumigatedSuspicion); assert.strictEqual(hot.grace, C.ECON.fumigationGrace); assert.strictEqual(hot.rehire, C.ECON.rehireNights);
  assert.strictEqual(hot.hostTotals.fumigations, 1);
  // grace: no new booking straight away, even on a bad night
  const after = night(hot, 80); assert.strictEqual(after.booking, null, 'no second booking during the grace nights');
  // the restructuring is reported as a restructuring
  const lines = C.MORNING.restructure(f); assert.ok(typeof lines === 'string' ? lines.length : lines.length, 'the morning has the corporate version');
  // no death spiral: a fumigated colony plays a full, productive night
  const x = play(hot, { seed: 8, careful: true, handsOff: true, push: 'timed' });
  assert.ok(x.r.extracted > 0.5 * play(booked, { seed: 8, careful: true, handsOff: true, push: 'timed' }).r.extracted, 'the colony keeps more than half its output the night after');
}

// ---------- the lease and the annual report ----------
{
  let camp = colony({ foot: true, camp: { night: 14, suspicion: 50, booking: 15, host: { n: 1, start: 1 } } });
  assert.strictEqual(K.leaseNight(camp), 14);
  camp = night(camp, 5); assert.ok(camp.leaseEnded && camp.news.leaseEnded, 'after the 14th night the lease is over');
  const keep = { bank: camp.bank, workers: camp.workers.length, buildings: camp.buildings.length, divisions: camp.divisions.slice() };
  const moved = K.relocate(camp);
  assert.strictEqual(moved.host.n, 2); assert.strictEqual(moved.host.start, camp.night); assert.strictEqual(K.leaseNight(moved), 1, 'a fresh host, night 1 of 14');
  assert.strictEqual(moved.suspicion, 0); assert.strictEqual(moved.booking, null); assert.deepStrictEqual(moved.counters, {}, 'the new host has not bought a fan yet');
  assert.deepStrictEqual({ bank: moved.bank, workers: moved.workers.length, buildings: moved.buildings.length, divisions: moved.divisions }, keep, 'the company moves with everything it owns');
  assert.strictEqual(moved.leases.length, 1); assert.strictEqual(moved.leases[0].nights, 14);
  assert.ok(!moved.leaseEnded); assert.strictEqual(moved.news.relocated, 2);
  const x = play(moved, { seed: 3, careful: true, handsOff: true }); assert.strictEqual(x.S.state, 'over', 'the new host sleeps through a night');
}

// ---------- saves ----------
{
  let camp = colony({ foot: true, seminar: 1, plant: 2, camp: { suspicion: 61, booking: 7, grace: 0, rehire: 1, gmPolicy: { foot: 'aggressive' }, host: { n: 2, start: 3 } } });
  camp.leases = [{ n: 1, nights: 14, extracted: 50000, lost: 9, fumigations: 1 }];
  const back = K.fromSave(JSON.parse(JSON.stringify({ v: 2, settings: { muted: false, seenOpening: true }, campaign: camp }))).campaign;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(camp)), 'an Acquisitions save round-trips');
  const bad = K.cleanCampaign(Object.assign({}, camp, { gmPolicy: { foot: 'embezzle', arm: 'lie' }, booking: 'soon', host: { n: -1 } }));
  assert.deepStrictEqual(bad.gmPolicy, { arm: 'lie' }, 'unknown policies are dropped'); assert.strictEqual(bad.booking, null); assert.ok(bad.host.n >= 1);
  // a save from PR #6/#7 (no host, no booking) starts its first lease where it is
  const legacy = K.cleanCampaign({ night: 9, buildings: camp.buildings.filter((b) => b.div !== 'foot'), workers: camp.workers.filter((w) => w.div === 'arm'), suspicion: 40, counters: { fan: true } });
  assert.strictEqual(K.leaseNight(legacy), 1); assert.strictEqual(legacy.booking, null); assert.strictEqual(legacy.suspicion, 40, 'suspicion carries over');
}

console.log('acquisitions ok');
