// The test players: a human-paced bot that plays one night, and a campaign runner that plays nights and days in a row.
// Shared by tests/sim.test.js (rules) and tests/balance.js (the balance report).
require('../src/config.js'); require('../src/campaign.js'); require('../src/sim.js');
const { sim, campaign: K } = globalThis.MA;
const DT = 1 / 30;
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// two kinds of manager. Careful: notices most warnings, reacts like a person, pushes only in deep sleep.
// Reckless: pushes all night, notices few warnings, reacts late
const PROFILES = {
  careful: { push: 'timed', attention: { notice: 0.85, reaction: [0.45, 1.2] } },
  reckless: { push: 'always', attention: { notice: 0.35, reaction: [0.6, 1.5] } },
};

// a human-paced player: holds until Rhonda is full (plus a beat), rests between trips, takes a moment to act on a
// new card, builds on the shortest-trip pad, and presses Scatter a little after the hand starts to move
function play(camp, opts) {
  opts = opts || {};
  const S = sim.newNight(camp, { seed: opts.seed || 7 });
  const log = { actions: 0, firstDeposit: null, unlock: {}, built: {}, firstHire: null, firstAuto: null, tutScratch: null, order: [] };
  let rest = 0, recallAt = null, nextAct = 0; const seen = {};
  // attention: a human misses some warnings and reacts at human speed. `careful: true` alone keeps the old perfect bot
  const att = opts.attention || null, rnd = mulberry((opts.seed || 7) * 7919 + 13);
  while (S.state !== 'over' && S.time < 600) {
    const f = S.founder;
    if (!opts.passive) {
      if (f.st === 'home') { rest += DT; S.hold = rest > (opts.rest || 0.8); }
      else if (f.st === 'drink') S.hold = opts.greedy ? true : f.greed < 0.25;
      else if (f.st === 'toSkin') S.hold = true; else { S.hold = false; rest = 0; }
      if (opts.handsOff && S.workers.length >= 2) S.hold = false;
      if (S.unlocked.includes('push') && opts.push) {
        // a careful manager also eases off once he runs dry (leave him something for tomorrow)
        const want = (opts.push === 'always' || (opts.push === 'timed' && S.depth > 0.55)) && !(opts.dryEase && sim.yieldOf(S) < 1);
        // a person manages one floor at a time and can act about once every 1.2 s; the floor they leave goes back to its GM
        for (const D of sim.divs(S)) {
          if (D.offline || (D.id !== S.focus && !opts.handsOn) || S.time < nextAct) continue;
          if ((D.pace === 2) !== want) { if (D.id !== S.focus) { sim.setFocus(S, D.id); log.actions++; } sim.setPush(S, want, D.id); log.actions++; nextAct = S.time + 1.2; }
        }
      }
    }
    if (opts.maxStaff) sim.setHiring(S, S.workers.length < opts.maxStaff); // a lean workforce: HR stops at a headcount
    sim.step(S, DT); if (opts.drain) { S.bank = 0; S.refined = 0; } if (opts.tick) opts.tick(S);
    for (const e of S.events) {
      if (opts.onEvent) opts.onEvent(e, S);
      if (e.type === 'deliver' && e.founder && log.firstDeposit === null) log.firstDeposit = S.time;
      if (e.type === 'deliver' && !e.founder && log.firstAuto === null) log.firstAuto = S.time;
      if (e.type === 'unlock') { log.unlock[e.what] = S.time; log.order.push(e.what); }
      if (e.type === 'build' && !e.upgrade) log.built[e.b.type] = log.built[e.b.type] || S.time;
      if (e.type === 'hatch' && e.first) log.firstHire = S.time;
      if (e.type === 'telegraph' && e.tutorial) log.tutScratch = S.time;
      if (e.type === 'telegraph' && MA.config.HAZARDS[e.kind]) { if (att) { if (rnd() < att.notice) recallAt = S.time + att.reaction[0] + rnd() * (att.reaction[1] - att.reaction[0]); } else if (opts.careful) recallAt = S.time + 0.6; }
      if (e.type === 'impact' && e.tutorial) log.tutResult = { dead: e.dead.length, nearMiss: e.nearMiss };
    }
    S.events.length = 0;
    if (recallAt !== null && S.time >= recallAt) { if (sim.recall(S)) log.actions++; recallAt = null; }
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

// the day: answer what he bought, keep the lookout if the policy allows, then spend on whatever held the colony back
function day(camp, n, policy) {
  const D = sim.newNight(camp, { day: true, seed: 50 + n }), last = camp.lastReport || {};
  const buy = (t) => { if (!D.unlocked.includes(t) || sim.costOf(D, t) > D.bank) return false; const p = sim.padsByTrip(D)[0]; return !!sim.build(D, t, p && p.pad); };
  for (const t of ['windbreak', 'masks']) buy(t);
  // acquisitions: buy the foot when allowed, then give it a rig, a drip line, a lookout and (if trained) a seminar
  const buyFor = (t, dv) => { if (!D.unlocked.includes(t) || sim.costOf(D, t, dv) > D.bank) return false; return !!sim.build(D, t, null, dv); };
  if (policy.acquire && n >= (policy.acquireFrom || 1)) buy('acquire');
  if (D.divisions.foot) {
    const lvl = (t) => (D.buildings.find((b) => b.type === t && b.div === 'foot') || { level: 0 }).level;
    if (lvl('rig') < 2) buyFor('rig', 'foot');
    if (lvl('plant') < 1) buyFor('plant', 'foot');
    if (D.unlocked.includes('drip') && !lvl('drip')) buyFor('drip', 'foot');
    if (policy.lookout && !lvl('lookout')) buyFor('lookout', 'foot');
    const lvlOf = (t, dv) => (D.buildings.find((b) => b.type === t && b.div === dv) || { level: 0 }).level;
    if (policy.train) for (const dv of ['foot', 'arm']) if (lvlOf('seminar', dv) < policy.train) buyFor('seminar', dv);
    if (lvl('rig') < 4) buyFor('rig', 'foot');
    for (let i = 0; i < 2; i++) if (lvl('plant') < 3 && (camp.lastReport || {}).storageFullSec > 10) buyFor('plant', 'foot');
    const p = typeof policy.gm === 'function' ? policy.gm(camp) : policy.gm || 'standard'; sim.setPolicy(D, 'foot', p); sim.setPolicy(D, 'arm', p);
  }
  if (policy.lookout) { buy('lookout'); if (last.deadOnReport && D.buildings.some((b) => b.type === 'lookout' && b.level < 2)) buy('lookout'); }
  if (!D.buildings.some((b) => b.type === 'refinery') || last.clotted > 60) buy('refinery');
  // a manager who reads the morning report does not buy capacity when the host was the bottleneck
  if (camp.constraint !== 'host') for (let i = 0; i < 6; i++) { let want = last.storageFullSec > 4 ? (i % 2 ? 'refinery' : 'tank') : last.hrCapped ? 'rig' : 'pool'; if (want === 'pool' && policy.maxStaff && sim.derived(D).housing >= policy.maxStaff) want = 'refinery'; if (!buy(want) && !buy('rig') && !buy('tank') && !buy('floor')) break; }
  // R&D: the lab, then one phase of research a day, in the strategy's order
  if (policy.research) { buy('lab'); for (const t of policy.research) if (buy(t)) break; }
  const out = K.foldDay(camp, D, true); out.daySpent = D.spent; return out;
}
// a whole campaign: nights and days in a row, with a per-night log of everything the balance report needs
function campaign(opts) {
  const prof = PROFILES[opts.profile], log = []; let camp = K.newCampaign();
  for (let n = 1; n <= opts.nights; n++) {
    if (camp.leaseEnded) camp = Object.assign(K.relocate(camp), { lastReport: camp.lastReport });
    // harvest: a manager who conserves the host all lease and drains him on its last nights (he is leaving anyway)
    const harvest = opts.harvestFrom && K.leaseNight(camp) >= opts.harvestFrom, o = harvest ? Object.assign({}, opts, { gm: 'aggressive', dryEase: false, push: 'always' }) : opts;
    let daySpent = 0; if (camp.phase === 'day') { camp = Object.assign(day(camp, n, o), { lastReport: camp.lastReport }); daySpent = camp.daySpent || 0; }
    const lie = opts.lieLow && camp.booking !== null, startStaff = camp.workers.length, x = play(camp, { seed: opts.seed * 100 + n, dryEase: o.dryEase, maxStaff: opts.maxStaff, push: lie ? 'never' : o.push || prof.push, handsOn: opts.handsOn, attention: prof.attention, handsOff: n > 1, buildOrder: ['windbreak', 'masks'].concat(opts.lookout ? ['lookout'] : [], camp.constraint === 'host' ? [] : ['tank', 'pool', 'refinery', 'rig', 'drip', 'floor']) });
    const sus0 = camp.suspicion, booked = camp.booking; camp = Object.assign(K.fold(camp, x.S, x.r), { lastReport: x.r }); const news = camp.news || {};
    log.push({ night: n, blood: x.r.extracted, lost: x.r.lost.length, staffStart: startStaff, staffEnd: x.r.staff, hireSpend: x.r.hireSpend, suspicion: Math.round(Math.min(100, sus0 + x.r.suspicion)), hits: x.r.hits, calls: x.r.calls, lookoutCalls: x.r.lookoutCalls, offArm: x.r.offArmSec, storageFull: x.r.storageFullSec, lookout: x.r.lookout, divisions: x.S.divOrder.length, actions: x.log.actions, booked: news.booking ? 1 : 0, fumigated: news.fumigation ? news.fumigation.lost.length : -1, cancelled: news.cancelled ? 1 : 0, hostNight: K.leaseNight(Object.assign({}, camp, { night: n })) , host: camp.host.n, susAfter: Math.round(camp.suspicion), spent: Math.round(x.S.spent + daySpent), report: x.r, bank: Math.round(camp.bank), opCost: news.costs ? news.costs.total : 0, vigor: camp.host.vigor === undefined ? 1 : camp.host.vigor, deadRanks: x.r.lost.map((l) => l.rank || 0), fumRanks: news.fumigation ? news.fumigation.lost.map((l) => l.rank || 0) : [], staffRanks: x.S.workers.map((w) => sim.rankOf(x.S, w)) });
  }
  return { camp, log };
}

module.exports = { play, day, campaign, PROFILES, DT };
