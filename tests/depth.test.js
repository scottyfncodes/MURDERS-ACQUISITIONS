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
  console.log('careers    interns', interns, 'BU/min, partners', partners);
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
  console.log('thinner    plain', plain.ml, 'BU/min, thinned', fast.ml);
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

// ---------- his condition (vigor) carries from night to night ----------
{
  const night = (v) => sim.newNight(colony({ camp: { host: { n: 1, start: 1, vigor: v, lastVigor: v } } }), { seed: 1 });
  assert.strictEqual(night(1).supply, C.HOST.supply, 'a fresh host spares his full supply');
  assert.ok(night(0.5).supply < C.HOST.supply * 0.7, 'a drained one spares much less');
  // the morning after: what was taken drains him; dry bites drain him far more; a quiet night lets him recover
  const after = (v, taken) => { const camp = colony({ camp: { host: { n: 1, start: 1, vigor: v, lastVigor: v } } }), S = sim.newNight(camp, { seed: 1 }), r = sim.report(S); r.host.taken = Math.round(taken(S)); return K.dawn(camp, S, Object.assign(r, { suspicion: 0, susParts: [] })).host.vigor; };
  const fair = after(0.8, (S) => S.supply), greedy = after(0.8, (S) => S.supply * 1.4), rest = after(0.5, () => 0);
  console.log('vigor      0.80 -> fair', fair.toFixed(2), ' greedy', greedy.toFixed(2), '; 0.50 after a quiet night ->', rest.toFixed(2));
  assert.ok(greedy < fair - 0.1, 'draining him dry costs tomorrow far more than taking his fill');
  assert.ok(rest > 0.65, 'a night off restores him');
  // Rhonda notices when he first looks tired
  const notes = (v, last) => sim.newNight(colony({ camp: { night: 7, host: { n: 1, start: 1, vigor: v, lastVigor: last } } }), { seed: 1 }).events.filter((e) => e.type === 'memo').map((e) => e.text);
  assert.ok(notes(0.7, 0.8).includes(C.NOTES.pale[0]), 'Rhonda remarks the night he first looks tired');
  assert.ok(!notes(0.7, 0.72).includes(C.NOTES.pale[0]), 'and not every night after');
  const moved = K.relocate(Object.assign(colony({}), { host: { n: 1, start: 1, vigor: 0.2, lastVigor: 0.3 } }));
  assert.strictEqual(moved.host.vigor, 1, 'the new host arrives in good health');
  // easing off leaves a dry host alone; pushing keeps going
  const dry = (pace) => { const S = sim.newNight(colony({}), { seed: 3 }); S.schedule = []; S.hiring = false; S.rhythm = false; S.divisions.arm.pace = pace; S.taken = S.supply * 1.05; const t0 = S.taken; run(S, 20, (x) => { x.bank = 0; x.refined = 0; x.divisions.arm.irritation = 0; }); return S.taken - t0; };
  const eased = dry(0), pushed = dry(2); console.log('dry host   20 s eased', Math.round(eased), 'BU, pushed', Math.round(pushed), 'BU');
  assert.ok(eased < 30 && pushed > 150, 'ease off stops at what he can spare; push takes the rest');
}

// ---------- he runs dry ----------
{
  const S = sim.newNight(colony({}), { seed: 1 });
  S.taken = 0; assert.strictEqual(sim.yieldOf(S), 1, 'a fresh night: every bite is full');
  S.taken = S.supply * 0.99; assert.strictEqual(sim.yieldOf(S), 1, 'full bites right up to what he can spare'); S.taken = S.supply * 1.3; const y = sim.yieldOf(S); assert.ok(y > 0.4 && y < 0.7, `past it, a bite brings up about half (${y.toFixed(2)})`);
  S.taken = sim.hardCap(S) - 1; assert.strictEqual(sim.yieldOf(S), C.ECON.dryFloor, 'then a trickle');
  // a crew far bigger than the host still gets more by working harder, but not much more
  const T = sim.newNight(colony({ workers: crew(30, 1, 1), camp: { night: 12 }, extra: [{ type: 'rig', level: 5 }] }), { seed: 2 }); T.hiring = false; T.rhythm = false; T.divisions.arm.pace = 2;
  run(T, 400, (x) => { x.bank = 0; x.refined = 0; x.divisions.arm.irritation = 0; });
  assert.ok(T.taken > T.supply && T.taken <= sim.hardCap(T) + 1, `a huge crew drains him past his comfortable limit, never past the hard one (${Math.round(T.taken)} of ${T.supply})`);
  // a second limb opens up more of him
  const F = sim.newNight(colony({ camp: { divisions: ['arm', 'foot'] } }), { seed: 1 }); assert.strictEqual(F.supply, Math.round(C.HOST.supply * (1 + C.ECON.acquiredSupply)));
}

// ---------- operating costs and bottlenecks ----------
{
  const camp = colony({ workers: crew(4, 6, 1).concat(crew(4, 1, 10)), camp: { night: 6, bank: 5000 } });
  const c = K.operatingCosts(camp, 6), C2 = C.CAREER;
  assert.strictEqual(c.payroll, 4 * C2[0].pay + 4 * C2[2].pay, 'payroll is set by rank: interns on a stipend, seniors on a salary');
  assert.ok(c.upkeep > 0, 'buildings cost upkeep');
  const S = sim.newNight(camp, { seed: 1 }), r = sim.report(S), n = K.dawn(camp, S, Object.assign(r, { suspicion: 0, susParts: [] }));
  assert.strictEqual(n.news.costs.total, c.total); assert.ok(Math.abs(n.bank - Math.max(0, S.bank - r.clotted - c.total)) < 1, `paid at dawn (${n.bank} vs ${S.bank} - ${r.clotted} - ${c.total})`);
  const first = K.newCampaign(), x = play(first, { careful: true, handsOff: true }); assert.ok(!K.dawn(first, x.S, x.r).news.costs, 'the first night is pre-revenue: no costs');
  // when he has nothing left to give, the morning says so, and does not blame storage
  const T = sim.newNight(colony({ workers: crew(20, 1, 1), camp: { night: 12 }, extra: [{ type: 'rig', level: 5 }] }), { seed: 2 }); T.rhythm = false; T.divisions.arm.pace = 1; run(T, 400, (q) => { q.bank = 0; q.refined = 0; q.divisions.arm.irritation = 0; });
  const rep = sim.report(T); assert.strictEqual(rep.constraint, 'host', 'a big crew on a small host: the host is the bottleneck');
  const held = C.MORNING.held(rep); assert.ok(/^The host/.test(held[0].text) && !held.some((h) => /^Storage was full/.test(h.text)), 'and the morning report says so first');
}

// ---------- careers: appointments, dodging, grief ----------
{
  const camp = colony({ extra: [{ type: 'lookout', level: 1 }], workers: crew(1, 1, 1).concat(crew(5, 12, 2)), camp: { night: 12 } });
  const S = sim.newNight(camp, { seed: 1 }); run(S, 0.5);
  const look = S.workers.find((w) => w.job === 'lookout'); assert.strictEqual(look.id, 1, 'by default the most senior takes the perch');
  const fast = sim.execOf(S, S.divisions.arm, 'lookout');
  const pick = sim.candidates(S, 'lookout', 'arm').find((w) => sim.rankOf(S, w) === 0);
  assert.ok(sim.appoint(S, 'lookout', 'arm', pick.id), 'the player appoints someone else');
  assert.ok(sim.execOf(S, S.divisions.arm, 'lookout') > fast, 'an intern files paperwork slower than a partner');
  assert.strictEqual(S.workers.find((w) => w.id === 1).job, 'extract', 'the partner goes back to the skin');
  const n = K.dawn(camp, S, Object.assign(sim.report(S), { suspicion: 0, susParts: [] }));
  assert.strictEqual(n.appoint['lookout@arm'], pick.id); assert.strictEqual(sim.newNight(n, { seed: 2 }).workers.find((w) => w.job === 'lookout').id, pick.id, 'and the appointment sticks');
  // veterans flinch clear of a hand far more often than interns
  const survive = (since, night) => { let dodged = 0, dead = 0; for (let seed = 1; seed <= 12; seed++) { const T = sim.newNight(colony({ workers: crew(12, since, 1), camp: { night } }), { seed }); T.schedule = []; T.hiring = false; run(T, 8, (q) => { q.bank = 0; q.refined = 0; q.divisions.arm.irritation = 0; }); sim.startEvent(T, 'swat'); run(T, 3); dodged += T.stats.dodges || 0; dead += T.lost.length; } return dodged / Math.max(1, dodged + dead); };
  const interns = survive(12, 12), partners = survive(1, 12); console.log('swat      survival on the skin: interns', interns.toFixed(2), ' partners', partners.toFixed(2));
  assert.ok(partners > interns + 0.1, 'partners survive a swat far more often');
  // a veteran's death is announced by name and hurts morale more than an intern's
  const grief = (since) => { const T = sim.newNight(colony({ workers: crew(10, since, 1), camp: { night: 12 } }), { seed: 4 }); T.schedule = []; T.hiring = false; C.CAREER.forEach((k) => (k._d = k.dodge, k.dodge = 0)); run(T, 8, (q) => { q.bank = 0; q.refined = 0; q.divisions.arm.irritation = 0; }); const m0 = T.morale; sim.startEvent(T, 'swat'); const memos = []; run(T, 3, (q) => { for (const e of q.events) if (e.type === 'memo') memos.push(e.text); }); C.CAREER.forEach((k) => (k.dodge = k._d)); return { drop: m0 - T.morale, lost: T.lost.length, memos }; };
  const gi = grief(12), gp = grief(1);
  assert.ok(gp.lost > 0 && gp.memos.some((t) => /Partner/.test(t) && /desk has been reassigned/.test(t)), 'a partner is mourned by name');
  assert.ok(gp.drop / gp.lost > gi.drop / Math.max(1, gi.lost) + 5, 'and a partner is missed more than an intern');
  // morale carries the grief into the next morning, not a good mood
  const rich = Object.assign({}, camp, { bank: 20000 });
  const sad = K.dawn(rich, Object.assign(sim.newNight(rich, { seed: 1 }), { morale: 30 }), Object.assign(sim.report(sim.newNight(rich, { seed: 1 })), { suspicion: 0, susParts: [] }));
  assert.ok(sad.morale > 30 && sad.morale < 70, `grief lifts over a day, partly (${sad.morale})`);
  const glad = K.dawn(rich, Object.assign(sim.newNight(rich, { seed: 1 }), { morale: 95 }), Object.assign(sim.report(sim.newNight(rich, { seed: 1 })), { suspicion: 0, susParts: [] }));
  assert.strictEqual(glad.morale, 70, 'a good night does not bank morale');
}

// ---------- fumigation: every rank is at risk; the room airs out; a pale host asks questions ----------
{
  const camp = colony({ workers: crew(10, 1, 1).concat(crew(10, 10, 20)), camp: { night: 12, suspicion: 90, booking: 12 } });
  const S = sim.newNight(camp, { seed: 1 }), n = K.dawn(camp, S, Object.assign(sim.report(S), { suspicion: 20, susParts: [] })), f = n.news.fumigation;
  assert.ok(f && f.seniors > 0 && f.lost.some((w) => w.rank < 2), 'the cut falls on seniors and juniors alike');
  assert.strictEqual(n.residue, C.ECON.residueNights);
  const T = sim.newNight(n, { seed: 1 }); assert.ok(T.fumesUntil > 0 && !sim.siteOpen(T, T.divisions.arm), 'the next night starts with the room airing out');
  assert.ok(T.supply < sim.newNight(Object.assign({}, n, { residue: 0 }), { seed: 1 }).supply, 'and less of him to work with');
  const pale = (v) => { const c = colony({ camp: { host: { n: 1, start: 1, vigor: v, lastVigor: v } } }), P = sim.newNight(c, { seed: 1 }), r = sim.report(P); r.host.taken = Math.round(P.supply * 1.3); return K.dawn(c, P, Object.assign(r, { suspicion: 0, susParts: [] })).news.suspicion.parts.find((p) => p.key === 'pale'); };
  assert.ok(pale(0.5) && pale(0.5).v > 0, 'a drained host asks questions: it is on the suspicion breakdown');
  // new fields survive a save
  const back = K.cleanCampaign(JSON.parse(JSON.stringify(n))); assert.strictEqual(back.residue, n.residue); assert.strictEqual(back.morale, n.morale); assert.deepStrictEqual(back.appoint, n.appoint); assert.strictEqual(back.host.vigor, n.host.vigor);
}

console.log('depth ok');
