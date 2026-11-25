// One night: pure state and rules, no drawing and no DOM (so it can be tested headless).
// A night starts from the campaign (campaign.js) and never writes back to it; the campaign folds it in at dawn.
(function (root) {
  const MA = (root.MA = root.MA || {});
  const C = MA.config;
  const { FEEL, ECON, PACE, BUILDINGS, PADS, SITES, POLICIES, MEMOS, NOTES, NEST, ZONES, DIVISIONS, DIVISION_ORDER, DIVISION_BUILDINGS } = C;

  function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const flyTime = (a, b, speed) => (FEEL.fly_base_s + FEEL.fly_per_tile_s * Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] - b[2]) * 0.5)) / (speed || 1);

  function newNight(camp, opts) {
    opts = opts || {};
    const seed = Number.isFinite(opts.seed) ? opts.seed : (Date.now() & 0x7fffffff);
    const host = C.HOST, n = camp.night, day = !!opts.day, len = day ? Infinity : MA.campaign.nightLength(n), fresh = camp.hires === 0 && camp.buildings.length === 0;
    const S = {
      seed, rand: mulberry(seed), night: n, phase: day ? 'day' : 'night', host, sleeper: host, state: 'playing', time: 0, shiftLen: len, sleepLost: 0, wakeT: 0,
      bank: camp.bank, refined: Math.min(camp.bank, camp.refined || 0), zones: camp.zones || 1, refineRate: 0, counters: Object.assign({}, camp.counters || {}), suspicion: 0, depth: 1, rhythm: n >= 2 && !day, wave: 0, extracted: 0, spent: 0, taken: 0, supply: host.supply, morale: 70, hold: false, hiring: true,
      founder: { pos: [NEST[0] + 0.3, NEST[1] + 0.2, 0.9], st: 'home', t: 0, dur: 1, from: null, to: null, belly: 0, greed: 0, trips: 0 },
      workers: [], lost: [], nextId: camp.nextId, hires: camp.hires, buildings: [], nextBid: 1,
      divisions: {}, divOrder: [], focus: 'arm', recallCd: 0, armOut: 1, footOut: 0,
      unlocked: camp.unlocks.slice(), corp: false, hatchProgress: 0, hatchCost: 0, rate: 0, recent: [],
      quarter: 0, quotasMet: 0, quotas: [], policies: [], offer: null,
      mods: { extract: 1, bite: 1, refine: 1, hatch: 1, cap: 1, irritation: 1, kill: 1, recallCd: 1, housing: 0, moraleDrift: 0 },
      schedule: n >= 2 && !day ? [{ at: 0.35, kind: 'blanket' }, { at: 0.5, kind: 'roll' }, { at: 0.68, kind: 'blanket' }].map((e) => ({ at: Math.round(e.at * len), kind: e.kind })) : [],
      tut: n === 1 && fresh && !day ? { step: 'bite', at: 0, scratched: false } : null,
      events: [], flags: {}, stats: { offArm: 0, stuckWS: 0, waitWS: 0, activeWS: 0, hireSpend: 0, calls: 0, lookoutCalls: 0, deadBy: { swat: 0, scratch: 0 }, deadWhileCooling: 0, deadOnReport: 0, hrCapped: false, longTrip: 0, loads: 0, manualMl: 0, autoMl: 0, swats: 0, scratches: 0, nearMisses: 0, peakStaff: 0, queuedSeconds: 0, slotWait: 0, hires: 0, built: 0, idleNoteAt: 40, firstHireAt: null, firstAuto: false },
    };
    for (const id of camp.divisions || ['arm']) addDivision(S, id);
    focusAccessors(S);
    S.wave = S.rand() * ECON.sleepCycleSeconds; if (S.rhythm) for (const D of divs(S)) D.pace = 0;
    S.buildings.push({ id: S.nextBid++, type: 'nest', level: 1, pad: -2, born: -9 });
    for (const b of camp.buildings) S.buildings.push(Object.assign({ id: S.nextBid++, type: b.type, level: b.level, pad: b.pad, born: -9 }, DIVISION_BUILDINGS.includes(b.type) ? { div: b.div || 'arm' } : {}));
    for (const w of camp.workers) S.workers.push(body(S, w, spawnPoint(S)));
    S.stats.peakStaff = S.workers.length;
    S.refined = Math.min(S.refined, S.bank); S.bank = Math.min(S.bank, derived(S).cap + S.refined); // tanks hold raw blood; refined blood keeps elsewhere
    for (const D of divs(S)) { const lw = assignLookout(S, D); if (lw) lw.pos = lookoutPoint(S, D).slice(); }
    if (n >= 2) {
      unlock(S, 'tank'); unlock(S, 'pool'); if (S.workers.length) unlock(S, 'scatter'); S.events.length = 0;
      if (!day) { const fresh2 = unlock(S, 'push'); S.events.length = 0; note(S, fresh2 ? NOTES.rhythm : NOTES.nightStart(n, S.workers.length), fresh2 ? 'warn' : 'info'); if (fresh2) S.events.push({ type: 'unlock', what: 'push' }); }
      else if (camp.newCounter) note(S, NOTES.counter[camp.newCounter], 'warn');
      else { const clot = camp.history[0] && camp.history[0].clotted; note(S, clot && !S.buildings.some((b) => b.type === 'refinery') ? NOTES.clotted(clot) : NOTES.dayStart(n - 1), clot ? 'warn' : 'info'); }
    }
    return S;
  }

  // ---------- divisions ----------
  // everything that belongs to one operating site. The UI reads the focused division through S.site, S.irritation, ...
  const DIV_FIELDS = ['site', 'irritation', 'hev', 'eventCd', 'siteBlocked', 'covered', 'recallT', 'lookoutCd', 'pace', 'biting', 'queued'];
  function addDivision(S, id) {
    if (S.divisions[id] || !DIVISIONS[id]) return null;
    const D = { id, site: DIVISIONS[id].site, irritation: 0, hev: null, eventCd: 4, siteBlocked: 0, covered: 0, recallT: 0, lookoutCd: 0, pace: 1, biting: 0, queued: 0, stats: { loads: 0, autoMl: 0 } };
    S.divisions[id] = D; S.divOrder.push(id); return D;
  }
  function divs(S) { return S.divOrder.map((id) => S.divisions[id]); }
  function div(S, id) { return S.divisions[id || S.focus] || S.divisions[S.divOrder[0]]; }
  function home(S) { return S.divisions.arm || div(S); } // the original division: Rhonda's, and the one the night's events happen to
  function divOf(S, x) { return S.divisions[(x && x.div) || 'arm'] || home(S); }
  function focusAccessors(S) { for (const k of DIV_FIELDS) Object.defineProperty(S, k, { get: () => div(S)[k], set: (v) => { div(S)[k] = v; }, enumerable: true, configurable: true }); }
  function setFocus(S, id) { if (S.divisions[id]) S.focus = id; }

  function note(S, text, tone) { S.events.push({ type: 'memo', text, tone: tone || 'info' }); }
  function once(S, key, fn) { if (!S.flags[key]) { S.flags[key] = true; fn(); } }
  function unlock(S, what) { if (S.unlocked.includes(what)) return false; S.unlocked.push(what); S.events.push({ type: 'unlock', what }); return true; }

  // ---------- the colony ----------
  function padCenter(b) { const p = b.pad < 0 ? null : PADS[b.pad]; return p ? [p[0] + 1.0, p[1] + 0.9] : null; }
  function storePoint(b, S) { if (b.type === 'nest') return [NEST[0], NEST[1], 0.75]; if (b.type === 'drip') { const r = sitePos(S, divOf(S, b)).rig; return [r[0] + 1.6, r[1] + 0.4, 1.5]; } const c = padCenter(b); return [c[0], c[1], 1.6 + b.level * 0.45 + 0.5]; }
  function sitePos(S, D) { return SITES[(D || div(S)).site]; }
  function skinPoint(S, D) { const k = sitePos(S, D).skin; return [k[0], k[1], k[2]]; }
  function founderSkin(S) { const H = home(S), k = sitePos(S, H).skin; return H.site === 'arm' ? [k[0] + 0.2, k[1] + 0.25, k[2] + 0.3] : [k[0] + 0.25, k[1] + 0.1, k[2] + 0.3]; }
  // crews unload at the storage nearest the bite (tanks and the drip line; the bottle cap is Rhonda's): this is why placement matters
  function nearestStore(S, founder, D) {
    D = D || (founder ? home(S) : div(S)); const k = skinPoint(S, D); let best = null, bd = Infinity;
    const ok = (b) => b.type === 'tank' || (b.type === 'drip' && divOf(S, b) === D) || (b.type === 'nest' && founder);
    for (const b of S.buildings) if (ok(b)) { const d = flyTime(storePoint(b, S), k); if (d < bd - 1e-9) { bd = d; best = b; } }
    return best || S.buildings.find((b) => b.type === 'nest');
  }
  function has(S, type) { return S.buildings.some((b) => b.type === type); }
  function divBuilding(S, type, D) { return S.buildings.find((b) => b.type === type && (!DIVISION_BUILDINGS.includes(type) || divOf(S, b) === D)); }
  // what he has bought, less what has been answered
  function windFactor(S) { return S.counters.fan && !has(S, 'windbreak') ? ECON.fanFlightFactor : 1; }
  function repellentFactor(S) { return S.counters.repellent && !has(S, 'masks') ? ECON.repellentBiteFactor : 1; }
  function ft(S, a, b, speed, D) { return flyTime(a, b, speed) * windFactor(S) * (PACE[(D || div(S)).pace].fly || 1); }
  function tripSeconds(S, b, D) { D = D || div(S); const k = skinPoint(S, D), p = storePoint(b, S); return 2 * ft(S, p, k, undefined, D); }
  function spawnPoint(S) { const pools = S.buildings.filter((b) => b.type === 'pool'); const b = pools.length ? pools[(S.workers.length) % pools.length] : null; const c = b ? padCenter(b) : NEST; return [c[0], c[1], 0.7]; }

  function raw(S) { return Math.max(0, S.bank - S.refined); }
  // colony totals, plus each division's bite spots, rig and lookout
  function derived(S) {
    const d = { divs: {}, slots: 0, cap: ECON.nestCap, housing: ECON.baseHousing + S.mods.housing, counts: { nest: 0, rig: 0, tank: 0, pool: 0, refinery: 0, hatchery: 0 }, rigLevel: 0 };
    for (const b of S.buildings) {
      d.counts[b.type]++;
      if (b.type === 'tank') d.cap += 120 * (1 + 0.75 * (b.level - 1));
      else if (b.type === 'pool') d.housing += 3 * b.level;
    }
    d.cap = Math.round(d.cap * S.mods.cap);
    d.crewCap = 0;
    for (const D of divs(S)) {
      const rig = divBuilding(S, 'rig', D), lk = divBuilding(S, 'lookout', D), x = { slots: ECON.slotsBase + (rig ? 3 * rig.level : 0), rigLevel: rig ? rig.level : 0, lookout: lk ? lk.level : 0 };
      x.crewCap = x.slots + ECON.reserveStaff + (x.lookout ? 1 : 0); d.divs[D.id] = x; d.slots += x.slots; d.crewCap += x.crewCap;
    }
    const H = d.divs[home(S).id]; d.rigLevel = H.rigLevel; d.lookout = H.lookout;
    return d;
  }
  function openPads(S) { return ZONES.slice(0, S.zones).flat(); }
  function freePads(S) { const used = new Set(S.buildings.map((b) => b.pad)); return openPads(S).filter((i) => !used.has(i)).sort((a, b) => a - b); }
  // free pads, closest trip first: what the placement view shows and the bots in the tests use
  function padsByTrip(S, D) { D = D || div(S); const k = skinPoint(S, D); return freePads(S).map((i) => { const c = padCenter({ pad: i }); return { pad: i, trip: 2 * ft(S, [c[0], c[1], 2.6], k, undefined, D) }; }).sort((a, b) => a.trip - b.trip); }

  function costOf(S, type, divId) {
    const def = BUILDINGS[type]; if (!def || type === 'nest') return Infinity;
    if (def.expand) return S.zones >= ZONES.length ? Infinity : def.cost;
    if (def.single) { const b = divBuilding(S, type, div(S, divId)); return b ? upgradeCost(b) : def.cost; }
    if (!freePads(S).length) { const b = cheapestUpgrade(S, type); return b ? upgradeCost(b) : Infinity; }
    return Math.round(def.cost * Math.pow(def.growth, S.buildings.filter((x) => x.type === type).length));
  }
  // with no floor left, a card upgrades the cheapest building of its kind instead
  function cheapestUpgrade(S, type) { let best = null; for (const b of S.buildings) if (b.type === type && upgradeCost(b) < (best ? upgradeCost(best) : Infinity)) best = b; return best; }
  function upgradeCost(b) { const def = BUILDINGS[b.type]; const max = def.maxLevel || ECON.maxLevel; return b.level >= max ? Infinity : def.single ? Math.round(def.cost * Math.pow(def.growth, b.level)) : Math.round(def.cost * 1.6 * Math.pow(2, b.level - 1)); }
  // spending takes raw blood first: refined blood is the part worth keeping
  function spend(S, cost) { const raw = S.bank - S.refined; if (cost > raw) S.refined = Math.max(0, S.refined - (cost - raw)); S.bank -= cost; S.spent += cost; }
  function pay(S, cost, what) {
    if (!(cost <= S.bank)) { S.events.push({ type: 'deny', what, cost }); return false; }
    spend(S, cost); return true;
  }

  function build(S, type, pad, divId) {
    const def = BUILDINGS[type];
    if (S.state !== 'playing' || !def || !S.unlocked.includes(type)) return null;
    if (def.expand) { const cost = costOf(S, type); if (cost === Infinity || !pay(S, cost, type)) return null; S.zones++; S.events.push({ type: 'expand', zone: S.zones - 1, cost }); note(S, NOTES.floorBought, 'good'); return { type, zone: S.zones - 1 }; }
    const D = div(S, divId);
    if (def.single) { const have = divBuilding(S, type, D); if (have) return upgrade(S, have.id); }
    else if (!freePads(S).length && def.place) { const b = cheapestUpgrade(S, type); if (!b) { S.events.push({ type: 'deny', what: type, cost: 0 }); return null; } return upgrade(S, b.id); }
    else if (!Number.isInteger(pad) || !freePads(S).includes(pad)) { S.events.push({ type: 'deny', what: type, cost: 0 }); return null; }
    const cost = costOf(S, type, D.id);
    if (!pay(S, cost, type)) return null;
    const b = { id: S.nextBid++, type, level: 1, pad: def.single ? -1 : pad, born: S.time }; if (DIVISION_BUILDINGS.includes(type)) b.div = D.id; S.buildings.push(b); S.stats.built++;
    S.events.push({ type: 'build', b, cost });
    if (S.tut) {
      if (type === 'tank' && S.tut.step === 'tank') { S.tut.step = 'pool'; note(S, NOTES.tankBuilt, 'good'); unlock(S, 'pool'); }
      else if (type === 'pool' && (S.tut.step === 'pool' || S.tut.step === 'fill' || S.tut.step === 'tank')) { S.tut.step = 'eggs'; note(S, NOTES.eggs, 'good'); }
    }
    if (type === 'tank') unlock(S, 'pool');
    if (type === 'refinery') note(S, NOTES.refineryBuilt, 'good');
    if (NOTES.answered[type]) note(S, NOTES.answered[type], 'good');
    if (type === 'lookout') { const w = assignLookout(S, D); if (w) note(S, NOTES.lookoutHired(w.name), 'good'); }
    return b;
  }
  function upgrade(S, id) {
    const b = S.buildings.find((x) => x.id === id); if (S.state !== 'playing' || !b) return null;
    const cost = upgradeCost(b);
    if (!pay(S, cost, b.type)) return null;
    b.level++; b.born = S.time; S.events.push({ type: 'build', b, cost, upgrade: true });
    if (b.type === 'lookout') { const w = assignLookout(S, divOf(S, b)); if (w) note(S, NOTES.lookoutPromoted(w.name), 'good'); }
    return b;
  }

  // ---------- staff ----------
  function body(S, rec, at) {
    const r = S.rand;
    return { id: rec.id, name: rec.name, trait: rec.trait, bio: rec.bio, larvae: rec.larvae, loads: rec.loads || 0, since: rec.since || S.night, div: rec.div && S.divisions[rec.div] ? rec.div : 'arm', job: 'extract', st: 'wait', t: 0, delay: 0.2 + r() * 1.2, dur: 1, carry: 0, pos: at.slice(), from: null, to: null, jit: [r() - 0.5, r() - 0.5, r()] };
  }
  function hire(S, free) {
    const d = derived(S);
    if (!free && S.workers.length >= d.housing) return null;
    const r = S.rand, t = C.TRAITS[(r() * C.TRAITS.length) | 0];
    const w = body(S, { id: S.nextId++, name: `${C.FIRST[(r() * C.FIRST.length) | 0]} ${C.LAST[(r() * C.LAST.length) | 0]}`, trait: t[0], bio: t[1], larvae: 40 + ((r() * 400) | 0), loads: 0, since: S.night }, spawnPoint(S));
    S.workers.push(w); S.hires++; S.stats.hires++; S.stats.peakStaff = Math.max(S.stats.peakStaff, S.workers.length);
    return w;
  }
  function setHold(S, on) { S.hold = !!on; }
  function setPace(S, p, divId) { div(S, divId).pace = clamp(p | 0, 0, 2); }
  // from night 2 the pace is a switch: ease off (gentle, slower) or push (fast, itchy). Night 1 runs at the standard pace
  function setPush(S, on, divId) { if (!S.unlocked.includes('push')) return; const D = div(S, divId); D.pace = on ? 2 : 0; S.events.push({ type: 'push', on: !!on, div: D.id }); }
  function setHiring(S, on) { S.hiring = !!on; }

  function fly(w, to, dur) { w.from = w.pos.slice(); w.to = to; w.t = 0; w.dur = Math.max(0.05, dur); }
  function siteOpen(S, D) { D = D || div(S); return D.siteBlocked <= 0 && D.covered <= 0 && D.recallT <= 0 && !(D.hev && (D.hev.kind === 'roll' || D.hev.kind === 'stir')); }
  function waitPoint(S, w) { const r = sitePos(S, divOf(S, w)).rig; return [r[0] + 0.6 + w.jit[0] * 1.6, r[1] + 1.2 + w.jit[1] * 1.2, 1.0 + w.jit[2] * 0.9]; }

  // Occupational Health & Safety: the longest-serving employee is the lookout, on a perch above the bite
  function lookoutPoint(S, D) { return (D || div(S)).site === 'arm' ? [4.05, 5.75, 3.55] : [9.7, 4.45, 3.55]; }
  function assignLookout(S, D) {
    D = D || home(S); const mine = S.workers.filter((w) => divOf(S, w) === D);
    const want = !!divBuilding(S, 'lookout', D); let cur = mine.find((w) => w.job === 'lookout');
    if (!want) { if (cur) cur.job = 'extract'; return null; }
    if (!cur && mine.length) { cur = mine.reduce((a, b) => (b.id < a.id ? b : a)); cur.job = 'lookout'; cur.st = 'post'; cur.carry = 0; const to = lookoutPoint(S, D); fly(cur, to, ft(S, cur.pos, to, undefined, D)); }
    return cur || null;
  }
  function lookoutCall(S, D, w) {
    const lv = derived(S).divs[D.id].lookout; D.recallT = FEEL.recall_hold_s; D.lookoutCd = ECON.lookoutReport[Math.min(lv, ECON.lookoutReport.length) - 1];
    S.stats.lookoutCalls++; retreat(S, D); S.events.push({ type: 'recall', by: 'lookout', div: D.id, at: w.pos.slice() });
    once(S, 'lookoutCalled', () => note(S, NOTES.lookoutCalled(w.name), 'good'));
  }
  function recall(S) {
    if (S.state !== 'playing' || S.recallCd > 0 || !S.unlocked.includes('scatter')) { S.events.push({ type: 'deny', what: 'recall' }); return false; }
    for (const D of divs(S)) D.recallT = FEEL.recall_hold_s; S.recallCd = FEEL.recall_cooldown_s * S.mods.recallCd;
    S.stats.calls++; retreat(S); S.events.push({ type: 'recall' }); return true;
  }
  // pull a division's crew off the skin (or everyone's, with no division); Rhonda goes home if her division is pulled
  function retreat(S, D) {
    for (const w of S.workers) if (w.job === 'extract' && (w.st === 'bite' || w.st === 'toSkin') && (!D || divOf(S, w) === D)) { w.st = 'retreat'; fly(w, waitPoint(S, w), 0.45); }
    const f = S.founder; if ((!D || D === home(S)) && (f.st === 'drink' || f.st === 'toSkin')) { f.st = 'toHome'; const h = homePoint(S); fly(f, h, 0.6); }
  }
  function homePoint(S) { const p = storePoint(nearestStore(S, true, home(S)), S); return [p[0] + 0.35, p[1] + 0.25, p[2] + 0.35]; }

  // ---------- the founder: the only mosquito the player flies ----------
  function founderStep(S, dt, open) {
    const f = S.founder, H = home(S); f.t += dt;
    if (f.from && f.to) { const k = clamp(f.t / f.dur, 0, 1), e = k * k * (3 - 2 * k); f.pos = [f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1] + (f.to[1] - f.from[1]) * e, f.from[2] + (f.to[2] - f.from[2]) * e + Math.sin(k * Math.PI) * 0.5]; if (k >= 1) f.from = null; }
    const d = derived(S);
    if (f.st === 'home') {
      if (f.belly > 0.01) deposit(S, f, d, true);
      if (S.hold) {
        if (!open || S.state !== 'playing' || S.phase === 'day') { if (!f.denied) { f.denied = true; S.events.push({ type: 'deny', what: S.phase === 'day' ? 'day' : 'bite' }); } }
        else if (f.belly >= ECON.bellyMl - 0.05) { if (!f.denied) { f.denied = true; S.events.push({ type: 'deny', what: 'full' }); } }
        else { const to = founderSkin(S); f.st = 'toSkin'; fly(f, to, ft(S, f.pos, to, FEEL.founder_speed, H)); S.events.push({ type: 'takeoff' }); }
      } else f.denied = false;
    } else if (f.st === 'toSkin') {
      if (!S.hold || !open) { f.st = 'toHome'; fly(f, homePoint(S), ft(S, f.pos, homePoint(S), FEEL.founder_speed, H)); }
      else if (!f.from) { f.st = 'drink'; f.t = 0; f.greed = 0; S.events.push({ type: 'land' }); }
    } else if (f.st === 'drink') {
      if (!S.hold || !open) { f.st = 'toHome'; f.trips++; const h = homePoint(S); fly(f, h, ft(S, f.pos, h, FEEL.founder_speed, H)); S.events.push({ type: 'takeoff', full: f.belly >= ECON.bellyMl - 0.05 }); }
      else if (f.belly < ECON.bellyMl) { const k = Math.min(ECON.bellyMl - f.belly, (ECON.drinkMlPerS / repellentFactor(S)) * dt, S.supply - S.taken); f.belly += k; S.taken += k; if (f.belly >= ECON.bellyMl - 0.001) S.events.push({ type: 'full' }); }
      else { f.greed += dt; H.irritation = clamp(H.irritation + ECON.greedIrritationPerS * S.host.irritation * dt, 0, 100); if (f.greed > 0.4) once(S, 'greedy', () => note(S, NOTES.greedy, 'warn')); }
    } else if (f.st === 'toHome' || f.st === 'knocked') {
      if (!f.from) { if (f.st === 'knocked') { f.st = 'toHome'; fly(f, homePoint(S), ft(S, f.pos, homePoint(S), FEEL.founder_speed, H)); } else { f.st = 'home'; f.t = 0; deposit(S, f, d, true); } }
    }
  }
  // unload into storage: whatever fits goes in; the rest waits in the belly until there is room
  function deposit(S, w, d, founder) {
    const amount = founder ? w.belly : w.carry, room = Math.max(0, d.cap - (S.bank - S.refined)), ml = Math.min(amount, room);
    if (ml > 0.001) {
      S.bank += ml; S.extracted += ml; S.stats.loads++;
      if (founder) { w.belly -= ml; S.stats.manualMl += ml; } else { w.carry -= ml; S.stats.autoMl += ml; w.loads++; S.recent.push([S.time, ml]); const D = divOf(S, w); D.stats.loads++; D.stats.autoMl += ml; }
      S.events.push({ type: 'deliver', ml, at: w.pos.slice(), founder: !!founder, first: !founder && !S.stats.firstAuto && !!S.tut });
      if (!founder) S.stats.firstAuto = true;
      if (founder && S.tut && S.tut.step === 'bite') { S.tut.step = 'fill'; note(S, NOTES.firstBite, 'good'); }
    }
    return amount - ml <= 0.001;
  }

  // ---------- the hand ----------
  function startEvent(S, kind, opt, divId) {
    opt = opt || {}; const D = divId ? div(S, divId) : home(S);
    const tele = opt.tutorial ? FEEL.tutorial_scratch_telegraph_ms / 1000 : kind === 'swat' ? FEEL.swat_telegraph_ms / 1000 : kind === 'scratch' ? FEEL.scratch_telegraph_ms / 1000 : kind === 'roll' ? 2 : kind === 'blanket' ? 0.8 : 1.2;
    D.hev = { kind, div: D.id, t: 0, telegraph: tele, hold: kind === 'roll' ? 6 : kind === 'blanket' ? 5 : kind === 'swat' ? 1.2 : 0.9, hit: false, tutorial: !!opt.tutorial };
    S.events.push({ type: 'telegraph', kind, div: D.id, tutorial: !!opt.tutorial });
    if (opt.tutorial) { unlock(S, 'scatter'); note(S, NOTES.scratchTut, 'warn'); }
    else if (kind === 'swat') once(S, 'swatMemo', () => note(S, MEMOS.swatWarn, 'warn'));
    if (kind === 'roll') note(S, MEMOS.roll, 'warn');
  }
  function impact(S, D) {
    const e = D.hev, kind = e.kind; e.hit = true;
    if (kind === 'swat' || kind === 'scratch') {
      const onSkin = S.workers.filter((w) => w.job === 'extract' && divOf(S, w) === D && (w.st === 'bite' || (w.st === 'toSkin' && w.t / w.dur > 0.5)));
      const rate = e.tutorial ? 0 : (kind === 'swat' ? ECON.swatKill : ECON.scratchKill) * S.mods.kill;
      let k = Math.round(onSkin.length * rate); if (onSkin.length && k === 0 && kind === 'swat' && !e.tutorial) k = 1;
      const dead = onSkin.sort(() => S.rand() - 0.5).slice(0, k);
      for (const w of dead) { S.workers.splice(S.workers.indexOf(w), 1); S.lost.push({ name: w.name, trait: w.trait, larvae: w.larvae, at: S.time, cause: kind }); }
      if (dead.length) {
        S.stats.deadBy[kind] += dead.length; if (S.recallCd > 0) S.stats.deadWhileCooling += dead.length; else if (e.busy) S.stats.deadOnReport += dead.length;
        if (!e.tutorial && unlock(S, 'lookout')) note(S, NOTES.ohsFounded(dead[0].name), 'loss');
      }
      // the founder is never killed: she is knocked off, and the blood she was carrying is gone
      const f = S.founder, hitFounder = D === home(S) && (f.st === 'drink' || (f.st === 'toSkin' && f.t / f.dur > 0.5));
      if (hitFounder) { f.belly = 0; f.st = 'knocked'; const p = f.pos; fly(f, [p[0] - 0.8, p[1] + 1.4, 0.6], 0.7); once(S, 'founderHit', () => note(S, NOTES.founderHit, 'warn')); }
      const nearMiss = dead.length === 0 && !hitFounder && D.recallT > 0;
      S.stats[kind === 'swat' ? 'swats' : 'scratches']++; if (nearMiss) S.stats.nearMisses++;
      if (!e.tutorial) S.suspicion += (kind === 'swat' ? ECON.suspicionSwat : ECON.suspicionScratch) + dead.length * ECON.suspicionPerLoss;
      S.sleepLost += kind === 'swat' ? ECON.swatSleepCost : ECON.scratchSleepCost;
      D.irritation = Math.max(0, D.irritation - ECON.eventRelief); D.siteBlocked = Math.max(D.siteBlocked, kind === 'swat' ? 3.5 : 2.5);
      if (dead.length) { S.morale = Math.max(0, S.morale - 4 - dead.length); note(S, MEMOS.loss(dead.map((w) => w.name)), 'loss'); }
      else if (e.tutorial) note(S, nearMiss ? NOTES.tutSaved : NOTES.tutLucky, nearMiss ? 'good' : 'warn');
      else if (nearMiss) note(S, MEMOS.nearMiss, 'good');
      if (e.tutorial && S.tut) { S.tut.scratched = true; S.tut.step = 'free'; }
      retreat(S, D);
      S.events.push({ type: 'impact', kind, div: D.id, dead, nearMiss, onSkin: onSkin.length, founder: hitFounder, tutorial: e.tutorial, at: sitePos(S, D).skin.slice() });
    } else if (kind === 'stir') {
      S.sleepLost += ECON.stirSleepCost; S.suspicion += ECON.suspicionStir; D.irritation = 55; D.siteBlocked = 5; retreat(S, D); S.events.push({ type: 'impact', kind, div: D.id, dead: [] });
    } else if (kind === 'blanket') {
      D.covered = e.hold; retreat(S, D); note(S, MEMOS.blanket); S.events.push({ type: 'impact', kind, div: D.id, dead: [] });
    } else if (kind === 'roll') {
      retreat(S, D); S.events.push({ type: 'impact', kind, div: D.id, dead: [] });
    }
  }

  // ---------- quotas and policies: switched on at incorporation, a later phase (S.corp) ----------
  function quotaCheck(S) {
    const qLen = S.shiftLen / 4;
    while (S.quarter < 4 && S.extracted >= S.quotas[S.quarter]) {
      S.quarter++; S.quotasMet++;
      const pool = POLICIES.filter((p) => !S.policies.includes(p.id)).sort(() => S.rand() - 0.5).slice(0, 3);
      S.offer = pool.map((p) => p.id); S.events.push({ type: 'quotaMet', quarter: S.quarter }); note(S, MEMOS.quotaMet(S.quarter), 'good');
      return;
    }
    if (S.quarter < 4 && S.time >= qLen * (S.quarter + 1)) { S.quarter++; S.events.push({ type: 'quotaMissed', quarter: S.quarter }); note(S, MEMOS.quotaMissed(S.quarter), 'warn'); }
  }
  function pickPolicy(S, id) {
    if (!S.offer || !S.offer.includes(id)) return false;
    const p = POLICIES.find((x) => x.id === id); S.policies.push(id); S.offer = null; p.apply(S, api); S.events.push({ type: 'policy', id }); return true;
  }

  // ---------- the clock ----------
  // one division's crew: wait for a free bite spot, bite, carry to the nearest storage, unload
  function crewStep(S, D, dt, d, prod) {
    const pace = PACE[D.pace], open = siteOpen(S, D), site = sitePos(S, D), store = nearestStore(S, false, D), sp = storePoint(store, S), slots = d.divs[D.id].slots;
    const ex = S.workers.filter((w) => w.job === 'extract' && divOf(S, w) === D);
    let onWay = ex.filter((w) => w.st === 'toSkin' || w.st === 'bite').length, biting = 0, queued = 0, waiting = 0, active = 0;
    const biteDur = FEEL.bite_seconds * pace.bite * S.mods.bite * S.host.bite * repellentFactor(S) / prod;
    for (const w of ex) {
      w.t += dt;
      if (w.st === 'wait') {
        if (open && S.taken < S.supply && w.t > w.delay) {
          if (onWay < slots) { onWay++; w.st = 'toSkin'; const to = [site.skin[0] + w.jit[0] * 0.6, site.skin[1] + 0.02, site.skin[2] + (w.jit[2] - 0.5) * 1.5]; fly(w, to, ft(S, w.pos, to, undefined, D)); }
          else waiting++;
        }
      } else if (w.st === 'toSkin') {
        active++;
        if (w.t >= w.dur) { w.st = 'bite'; w.t = 0; w.dur = biteDur * (0.8 + S.rand() * 0.4); w.from = null; }
      } else if (w.st === 'bite') {
        biting++; active++;
        if (w.t >= w.dur) { const load = Math.min(ECON.loadMl * S.mods.extract, S.supply - S.taken); S.taken += load; w.carry = load; w.st = 'toTank'; const to = [sp[0] + w.jit[0] * 0.5, sp[1] + w.jit[1] * 0.5, sp[2] + 0.2]; fly(w, to, ft(S, w.pos, to, undefined, D)); }
      } else if (w.st === 'toTank' || w.st === 'queue') {
        if (w.st === 'toTank') active++;
        if (w.t >= w.dur) {
          if (deposit(S, w, d, false)) { w.st = 'wait'; w.t = 0; w.delay = 0.15 + w.jit[2] * 0.3; w.from = null; w.to = null; }
          else { queued++; if (w.st !== 'queue') { w.st = 'queue'; fly(w, [sp[0] + 0.9 + w.jit[0] * 1.2, sp[1] + 0.8 + w.jit[1], sp[2] - 0.2 + w.jit[2] * 0.6], 0.5); } }
        }
      } else if (w.st === 'retreat') { if (w.t >= w.dur) { w.st = 'wait'; w.t = 0; w.delay = 0.2; w.from = null; } }
    }
    if (D === home(S) && S.founder.st === 'drink') biting++;
    D.biting = biting; D.queued = queued;
    return { biting, queued, waiting, active, crew: ex.length, open, store };
  }

  // one division's sleeper-side: its itch, its lookout, its hazard (the night's scheduled events happen to the home division)
  function hazardStep(S, D, dt, d, depthMul, late) {
    const pace = PACE[D.pace], H = home(S), workersBiting = D.biting - (D === H && S.founder.st === 'drink' ? 1 : 0);
    D.irritation = clamp(D.irritation + ((workersBiting + (D === H && S.founder.st === 'drink' ? 0.6 : 0)) * ECON.irritationPerBiter * depthMul * pace.irritation * S.host.irritation * S.mods.irritation - FEEL.irritation_decay_per_s * (late && S.night >= 2 ? 0.5 : 1)) * dt, 0, 100);
    // the first night teaches one disturbance at a time: the crew cannot provoke the hand before the lesson
    if (D === H && S.tut && !S.tut.scratched && S.founder.st !== 'drink') D.irritation = Math.min(D.irritation, 34);
    D.lookoutCd = Math.max(0, D.lookoutCd - dt);
    if (D.hev && !D.hev.hit && !D.hev.called && (D.hev.kind === 'swat' || D.hev.kind === 'scratch')) {
      const e = D.hev, lw = S.workers.find((w) => w.job === 'lookout' && divOf(S, w) === D);
      if (lw && e.t + dt >= ECON.lookoutReaction) {
        e.called = true;
        if (e.kind === 'scratch') once(S, 'lookoutScratch', () => note(S, NOTES.lookoutScratch, 'info'));
        else if (D.recallT > 0) { /* already scattered */ }
        else if (D.lookoutCd > 0) { e.busy = true; once(S, 'lookoutBusy', () => note(S, NOTES.lookoutBusy, 'warn')); }
        else lookoutCall(S, D, lw);
      }
    }
    if (D.hev) {
      const e = D.hev; e.t += dt;
      if (!e.hit && e.t >= e.telegraph) impact(S, D);
      if (e.kind === 'roll') { const k = clamp((e.t - e.telegraph) / 2.5, 0, 1); if (D.site === 'arm') { S.armOut = 1 - k; if (k >= 1) { D.site = 'foot'; S.events.push({ type: 'relocate', div: D.id }); } } else S.footOut = clamp((e.t - e.telegraph - 2.5) / 2.5, 0, 1); }
      if (e.t >= e.telegraph + e.hold) { if (e.kind === 'roll') { S.footOut = 1; S.armOut = 0; } D.hev = null; D.eventCd = ECON.eventCooldown; }
    } else {
      const due = D === H ? S.schedule.find((x) => !x.done && S.time >= x.at) : null;
      const tutDue = D === H && S.tut && S.tut.step === 'crew' && !S.tut.scratched && S.stats.firstHireAt !== null && ((S.time - S.stats.firstHireAt >= 14 && S.workers.some((w) => w.st === 'bite')) || S.time >= S.shiftLen - 28);
      if (tutDue) { D.irritation = Math.max(D.irritation, 30); startEvent(S, 'scratch', { tutorial: true }, D.id); }
      else if (due) { due.done = true; startEvent(S, due.kind, null, D.id); }
      else if (D.eventCd <= 0 && D.irritation >= 99) startEvent(S, 'stir', null, D.id);
      else if (D.eventCd <= 0 && D.irritation >= ECON.eventThreshold) startEvent(S, S.night === 1 || S.time < S.shiftLen * 0.25 || S.rand() < 0.4 ? 'scratch' : 'swat', null, D.id);
    }
  }

  function step(S, dt) {
    if (S.state === 'waking') { S.wakeT += dt; if (S.wakeT >= 3) { S.state = 'over'; S.events.push({ type: 'over' }); } moveWorkers(S, dt); founderStep(S, dt, false); return; }
    if (S.state !== 'playing' || S.offer) return;
    S.time += dt;
    if (S.phase === 'day') { founderStep(S, dt, false); moveWorkers(S, dt); for (const D of divs(S)) { D.biting = 0; D.queued = 0; } S.rate = 0; S.refineRate = 0; return; }
    const d = derived(S), prod = 0.8 + 0.4 * (S.morale / 100), H = home(S), all = divs(S);
    S.recallCd = Math.max(0, S.recallCd - dt);
    for (const D of all) { D.recallT = Math.max(0, D.recallT - dt); D.siteBlocked = Math.max(0, D.siteBlocked - dt); D.covered = Math.max(0, D.covered - dt); D.eventCd = Math.max(0, D.eventCd - dt); }

    founderStep(S, dt, siteOpen(S, H));
    if (S.tut && S.tut.step === 'fill' && S.bank - S.refined >= d.cap - 0.01) { S.tut.step = 'tank'; }
    if (S.bank - S.refined >= d.cap - 0.01 && d.counts.tank === 0) once(S, 'nestFull', () => { note(S, NOTES.nestFull, 'warn'); unlock(S, 'tank'); });

    let queued = 0, waiting = 0, active = 0, closed = false, long = false;
    for (const D of all) {
      const c = crewStep(S, D, dt, d, prod); queued += c.queued; waiting += c.waiting; active += c.active;
      if (c.crew && !c.open) closed = true;
      if (S.workers.length && tripSeconds(S, c.store, D) > ECON.longTripSeconds) long = true;
    }
    S.queuedTotal = queued; // each division keeps its own biting/queued; this is the colony's
    S.stats.activeWS += active * dt; S.stats.stuckWS += queued * dt; S.stats.waitWS += waiting * dt; if (closed) S.stats.offArm += dt;
    if (queued > 0) { S.stats.queuedSeconds += dt; if (S.stats.queuedSeconds > 3 && d.counts.tank > 0) once(S, 'fullMemo', () => note(S, NOTES.storageFull, 'warn')); }
    // logistics: when staff fly the long way to storage, the drip line is the answer
    if (long) { S.stats.longTrip += dt; if (S.stats.longTrip > 3) once(S, 'dripNeed', () => { if (unlock(S, 'drip')) note(S, NOTES.dripNeed, 'warn'); }); }
    // the floor: when every open spot is taken, the window side is for sale
    if (!freePads(S).length && S.zones < ZONES.length) once(S, 'floorNeed', () => { if (unlock(S, 'floor')) note(S, NOTES.floorNeed, 'warn'); });
    // refining: stored blood becomes blood that keeps
    { const lv = S.buildings.reduce((a, b) => a + (b.type === 'refinery' ? b.level : 0), 0), k = Math.min(S.bank - S.refined, lv * ECON.refineMlPerS * dt); S.refineRate = k > 1e-6 ? k / dt : 0; if (k > 0) S.refined += k; }
    if (waiting > 0) { S.stats.slotWait += dt; if (S.stats.slotWait > 3) once(S, 'rigNeed', () => { if (unlock(S, 'rig')) note(S, NOTES.rigNeed, 'warn'); }); }
    S.recent = S.recent.filter((r) => S.time - r[0] < 12); S.rate = S.recent.reduce((a, r) => a + r[1], 0) * 5;

    // the pools hatch staff on their own while there is housing and blood to pay for them
    const pools = d.counts.pool, first = S.hires === 0;
    S.hatchCost = first ? 0 : ECON.hireBase + S.workers.length * ECON.hirePerHead;
    S.hatching = pools > 0 && S.hiring && S.workers.length < Math.min(d.housing, d.crewCap);
    if (pools > 0 && !first && S.workers.length >= d.crewCap && d.housing > d.crewCap) { S.stats.hrCapped = true; once(S, 'hr' + d.crewCap, () => note(S, NOTES.hrPause(d.slots), 'info')); }
    if (pools > 0 && S.workers.length >= d.housing && d.housing <= d.crewCap) once(S, 'housing' + d.housing, () => { if (!first) note(S, NOTES.housingFull, 'warn'); });
    if (S.hatching) {
      S.hatchProgress = Math.min(1, S.hatchProgress + dt / (first ? ECON.firstHatchSeconds : ECON.hatchSeconds / Math.sqrt(pools)));
      if (S.hatchProgress >= 1 && S.bank >= S.hatchCost) {
        S.hatchProgress = 0; spend(S, S.hatchCost); S.stats.hireSpend += S.hatchCost; const w = hire(S, false);
        if (w) {
          S.events.push({ type: 'hatch', w, first, at: w.pos.slice() });
          if (first) { S.stats.firstHireAt = S.time; if (!S.tut) unlock(S, 'scatter'); note(S, NOTES.firstHire(w.name), 'good'); if (S.tut) S.tut.step = 'crew'; }
        }
      }
    }

    // the sleeper: one body, one sleep; each division has its own itch and its own hazards
    if (S.rhythm) { const ph = ((S.time + S.wave) % ECON.sleepCycleSeconds) / ECON.sleepCycleSeconds; S.depth = clamp(0.5 + 0.85 * Math.cos(ph * Math.PI * 2), 0, 1); }
    const light = S.rhythm && S.depth < 0.35; if (light) once(S, 'lightWarn', () => note(S, NOTES.lightWarn, 'warn'));
    const depthMul = S.rhythm ? ECON.lightIrritation + (ECON.deepIrritation - ECON.lightIrritation) * S.depth : 1;
    const late = S.time >= S.shiftLen * 0.75;
    if (late && S.night >= 2) once(S, 'late', () => { note(S, MEMOS.lightSleep, 'warn'); S.events.push({ type: 'lightSleep' }); });
    for (const D of all) hazardStep(S, D, dt, d, depthMul, late);

    const left = S.shiftLen - S.sleepLost - S.time;
    if (left <= 20) once(S, 'alarmSoon', () => note(S, NOTES.alarmSoon, 'warn'));
    if (S.night >= 2 && S.time >= S.stats.idleNoteAt && !all.some((D) => D.hev)) { S.stats.idleNoteAt = S.time + 30 + S.rand() * 12; note(S, NOTES.idle[(S.rand() * NOTES.idle.length) | 0], 'idle'); }
    if (S.corp) quotaCheck(S);
    moveWorkers(S, dt);
    if (left <= 0) wake(S);
  }

  function moveWorkers(S, dt) {
    for (const w of S.workers) {
      if (w.job === 'lookout' && S.state === 'playing') { const D = divOf(S, w); w.t += dt; const to = lookoutPoint(S, D); if (!w.from && dist(w.pos, to) > 0.2) fly(w, to, ft(S, w.pos, to, undefined, D)); }
      if (S.state === 'waking') { if (!w.home) { w.home = true; const to = [5 + w.jit[0] * 6, 3.5 + w.jit[1] * 2, 0.4]; fly(w, to, 1.2 + w.jit[2]); } w.t += dt; }
      if (w.from && w.to) { const k = clamp(w.t / w.dur, 0, 1), e = k * k * (3 - 2 * k); w.pos = [w.from[0] + (w.to[0] - w.from[0]) * e, w.from[1] + (w.to[1] - w.from[1]) * e, w.from[2] + (w.to[2] - w.from[2]) * e + Math.sin(k * Math.PI) * 0.7]; if (k >= 1) w.from = null; }
    }
  }

  function wake(S) {
    if (S.state !== 'playing') return; S.state = 'waking'; S.wakeT = 0; for (const D of divs(S)) D.hev = null; S.offer = null; S.hold = false;
    const f = S.founder; if (f.st !== 'home') { f.st = 'toHome'; f.belly = 0; fly(f, homePoint(S), 0.9); }
    note(S, MEMOS.wake); S.events.push({ type: 'wake' });
  }

  function report(S) {
    const clotted = Math.round(Math.max(0, S.bank - S.refined) * ECON.clotShare), suspicion = Math.round(ECON.suspicionPerSqrtLoad * Math.sqrt(S.stats.loads) + S.suspicion);
    // what a staff member collects per second: observed, or one bite-and-carry cycle when too little ran to measure
    const d = derived(S), cycle = FEEL.bite_seconds + tripSeconds(S, nearestStore(S)) + 0.4, perWorker = S.stats.activeWS > 30 ? S.stats.autoMl / S.stats.activeWS : ECON.loadMl / cycle, open = Math.max(1, S.time - S.stats.offArm);
    const hire = ECON.hireBase + S.workers.length * ECON.hirePerHead, auto = S.stats.autoMl;
    const loss = { storageFullSec: Math.round(S.stats.queuedSeconds), lostToStorage: Math.round(S.stats.stuckWS * perWorker), lostToCrowd: Math.round(S.stats.waitWS * perWorker), offArmSec: Math.round(S.stats.offArm), lostToInterruptions: Math.round(S.stats.offArm * (auto / open)),
      hits: S.stats.swats + S.stats.scratches, calls: S.stats.calls + S.stats.lookoutCalls, lookoutCalls: S.stats.lookoutCalls, deadBy: Object.assign({}, S.stats.deadBy), deadWhileCooling: S.stats.deadWhileCooling, deadOnReport: S.stats.deadOnReport,
      replaceCost: S.lost.length * hire, hireSpend: Math.round(S.stats.hireSpend), lookout: d.lookout, refineries: d.counts.refinery, rigMaxed: d.rigLevel >= BUILDINGS.rig.maxLevel, crewCap: d.crewCap, slots: d.slots, hrCapped: S.stats.hrCapped,
      fanLoss: windFactor(S) > 1 ? Math.round(auto * (1 - 1 / ECON.fanFlightFactor) * 0.5) : 0, repellentLoss: repellentFactor(S) > 1 ? Math.round(auto * (1 - 1 / ECON.repellentBiteFactor) * 0.4) : 0 };
    return Object.assign(loss, { night: S.night, suspicion, clotted, refined: Math.floor(S.refined), extracted: Math.round(S.extracted), manual: Math.round(S.stats.manualMl), auto: Math.round(S.stats.autoMl), staff: S.workers.length, hires: S.stats.hires, lost: S.lost.slice(), banked: Math.floor(S.bank), cap: derived(S).cap, nearMisses: S.stats.nearMisses, scratches: S.stats.scratches, swats: S.stats.swats, built: S.stats.built, names: S.workers.map((w) => w.name) });
  }

  const api = { divs, div, home, divOf, setFocus, addDivision, raw, newNight, step, lookoutPoint, assignLookout, build, upgrade, hire, setHold, setPace, setPush, windFactor, repellentFactor, setHiring, recall, pickPolicy, costOf, upgradeCost, derived, report, wake, openPads, cheapestUpgrade, startEvent, padCenter, storePoint, nearestStore, tripSeconds, freePads, padsByTrip, sitePos, siteOpen, skinPoint };
  MA.sim = api;
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
