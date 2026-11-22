// The shift simulation: pure state and rules, no drawing and no DOM (so it can be tested headless).
(function (root) {
  const MA = (root.MA = root.MA || {});
  const C = MA.config;
  const { FEEL, ECON, PACE, BUILDINGS, PADS, SITES, POLICIES, MEMOS } = C;

  function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newShift(opts) {
    opts = opts || {};
    const seed = Number.isFinite(opts.seed) ? opts.seed : (Date.now() & 0xffffffff);
    const rand = mulberry(seed);
    const sleeper = C.SLEEPERS[clamp(opts.sleeper | 0, 0, C.SLEEPERS.length - 1)];
    const S = {
      seed, rand, sleeper, shiftNo: opts.shiftNo || 1, state: 'playing', time: 0, shiftLen: sleeper.shift, sleepLost: 0, wakeT: 0,
      bank: ECON.startBank, raw: 0, taken: 0, extracted: 0, refined: 0, spent: 0, supply: sleeper.supply,
      irritation: 0, morale: 70, pace: 1, hiring: true, staff: { refine: 2, hatch: 0 },
      workers: [], lost: [], nextId: 1, buildings: [], nextBid: 1, site: 'arm', siteBlocked: 0, covered: 0,
      recallT: 0, recallCd: 0, hev: null, eventCd: 4, armOut: 1, footOut: 0,
      quarter: 0, quotasMet: 0, quotas: ECON.quotas.map((q) => Math.round((q * sleeper.shift) / FEEL.shift_seconds / 10) * 10), policies: [], offer: null, hatchProgress: 0,
      mods: { extract: 1, bite: 1, refine: 1, hatch: 1, cap: 1, irritation: 1, kill: 1, recallCd: 1, housing: 0, moraleDrift: 0 },
      schedule: [{ at: 105, kind: 'blanket' }, { at: Math.min(150, sleeper.shift * 0.5), kind: 'roll' }, { at: 205, kind: 'blanket' }].filter((e) => e.at < sleeper.shift - 20),
      events: [], flags: {}, stats: { loads: 0, swats: 0, scratches: 0, nearMisses: 0, peakStaff: 0, queuedSeconds: 0, hires: 0, idleMemoAt: 22 },
    };
    S.buildings.push(mk(S, 'rig', -1), mk(S, 'tank', 0), mk(S, 'refinery', 1));
    for (let i = 0; i < ECON.startWorkers; i++) hire(S, true);
    memo(S, MEMOS.start(sleeper));
    return S;
  }

  function mk(S, type, pad) { return { id: S.nextBid++, type, level: 1, pad, born: S.time }; }
  function memo(S, text, tone) { S.events.push({ type: 'memo', text, tone: tone || 'info' }); }
  function once(S, key, fn) { if (!S.flags[key]) { S.flags[key] = true; fn(); } }

  function derived(S) {
    const d = { slots: 0, cap: 0, stations: 0, nurseStations: 0, housing: ECON.baseHousing + S.mods.housing, counts: { rig: 0, tank: 0, refinery: 0, hatchery: 0, pool: 0 } };
    for (const b of S.buildings) {
      d.counts[b.type]++;
      if (b.type === 'rig') d.slots += 4 + 3 * (b.level - 1);
      else if (b.type === 'tank') d.cap += 120 * (1 + 0.75 * (b.level - 1));
      else if (b.type === 'refinery') d.stations += 3 * b.level;
      else if (b.type === 'hatchery') d.nurseStations += 2 * b.level;
      else if (b.type === 'pool') d.housing += 10 * b.level;
    }
    d.cap = Math.round(d.cap * S.mods.cap);
    return d;
  }

  function costOf(S, type) {
    const def = BUILDINGS[type];
    if (def.single) { const b = S.buildings.find((x) => x.type === type); return b.level >= def.maxLevel ? Infinity : Math.round(def.cost * Math.pow(def.growth, b.level - 1)); }
    const n = S.buildings.filter((x) => x.type === type).length;
    if (S.buildings.filter((x) => x.pad >= 0).length >= PADS.length) return Infinity;
    return Math.round(def.cost * Math.pow(def.growth, Math.max(0, n - (type === 'tank' || type === 'refinery' ? 1 : 0))));
  }
  function upgradeCost(b) { const def = BUILDINGS[b.type]; const max = def.maxLevel || ECON.maxLevel; return b.level >= max ? Infinity : def.single ? Math.round(def.cost * Math.pow(def.growth, b.level - 1)) : Math.round(def.cost * 1.6 * Math.pow(2, b.level - 1)); }

  function pay(S, cost, what) {
    if (!(cost <= S.bank)) { S.events.push({ type: 'deny', what, cost }); return false; }
    S.bank -= cost; S.spent += cost; return true;
  }
  function build(S, type) {
    if (S.state !== 'playing' || !BUILDINGS[type]) return null;
    if (BUILDINGS[type].single) return upgrade(S, S.buildings.find((b) => b.type === type).id);
    const cost = costOf(S, type);
    if (!pay(S, cost, type)) return null;
    const used = new Set(S.buildings.map((b) => b.pad)); let pad = 0; while (used.has(pad)) pad++;
    const b = mk(S, type, pad); S.buildings.push(b);
    S.events.push({ type: 'build', b, cost }); once(S, 'firstBuild', () => memo(S, MEMOS.firstBuild));
    if (type === 'hatchery' && S.staff.hatch === 0) S.staff.hatch = 1;
    assign(S); return b;
  }
  function upgrade(S, id) {
    const b = S.buildings.find((x) => x.id === id); if (S.state !== 'playing' || !b) return null;
    const cost = upgradeCost(b);
    if (!pay(S, cost, b.type)) return null;
    b.level++; b.born = S.time; S.events.push({ type: 'build', b, cost, upgrade: true }); assign(S); return b;
  }

  function hire(S, free) {
    const d = derived(S);
    if (!free && S.workers.length >= d.housing) return null;
    const r = S.rand, t = C.TRAITS[(r() * C.TRAITS.length) | 0];
    const w = { id: S.nextId++, name: `${C.FIRST[(r() * C.FIRST.length) | 0]} ${C.LAST[(r() * C.LAST.length) | 0]}`, trait: t[0], bio: t[1], larvae: 40 + ((r() * 400) | 0), job: 'extract', st: 'wait', t: r() * 0.8, dur: 1, loads: 0, carry: 0, pos: [12.4, 9.6, 0.6], from: null, to: null, jit: [r() - 0.5, r() - 0.5, r()] };
    S.workers.push(w); S.stats.hires++; S.stats.peakStaff = Math.max(S.stats.peakStaff, S.workers.length);
    assign(S); return w;
  }

  // staffing: the player sets refiners and nurses; everyone else extracts
  function assign(S) {
    const n = S.workers.length, wantR = Math.min(S.staff.refine, n), wantH = Math.min(S.staff.hatch, n - wantR);
    const cur = { refine: [], hatch: [], extract: [] }; for (const w of S.workers) cur[w.job].push(w);
    const move = (from, to, k) => { const pool = cur[from].slice().sort((a, b) => (a.st === 'wait' ? -1 : 0) - (b.st === 'wait' ? -1 : 0) || a.carry - b.carry); for (let i = 0; i < k && pool[i]; i++) { const w = pool[i]; cur[from].splice(cur[from].indexOf(w), 1); cur[to].push(w); w.job = to; w.st = to === 'extract' ? 'wait' : 'station'; w.t = 0; w.carry = 0; w.from = null; } };
    if (cur.refine.length > wantR) move('refine', 'extract', cur.refine.length - wantR);
    if (cur.hatch.length > wantH) move('hatch', 'extract', cur.hatch.length - wantH);
    if (cur.refine.length < wantR) move('extract', 'refine', wantR - cur.refine.length);
    if (cur.hatch.length < wantH) move('extract', 'hatch', wantH - cur.hatch.length);
    cur.refine.forEach((w, i) => (w.slot = i)); cur.hatch.forEach((w, i) => (w.slot = i));
  }
  function setStaff(S, job, n) { if (!(job in S.staff)) return; S.staff[job] = clamp(Math.round(Number(n) || 0), 0, 99); const other = job === 'refine' ? 'hatch' : 'refine'; const max = Math.max(0, S.workers.length - S.staff[other]); S.staff[job] = Math.min(S.staff[job], max); assign(S); }
  function setPace(S, p) { S.pace = clamp(p | 0, 0, 2); }
  function setHiring(S, on) { S.hiring = !!on; if (!on) once(S, 'freeze', () => memo(S, MEMOS.hiringFrozen)); }

  function sitePos(S) { return SITES[S.site]; }
  function padCenter(b) { const p = b.pad < 0 ? null : PADS[b.pad]; return p ? [p[0] + 1.0, p[1] + 0.9] : null; }
  function fly(w, to, dur) { w.from = w.pos.slice(); w.to = to; w.t = 0; w.dur = dur; }
  function siteOpen(S) { return S.siteBlocked <= 0 && S.covered <= 0 && S.recallT <= 0 && !(S.hev && (S.hev.kind === 'roll' || S.hev.kind === 'stir')); }

  function recall(S) {
    if (S.state !== 'playing' || S.recallCd > 0) { S.events.push({ type: 'deny', what: 'recall' }); return false; }
    S.recallT = FEEL.recall_hold_s; S.recallCd = FEEL.recall_cooldown_s * S.mods.recallCd;
    retreat(S); S.events.push({ type: 'recall' }); return true;
  }
  function retreat(S) { for (const w of S.workers) if (w.job === 'extract' && (w.st === 'bite' || w.st === 'toSkin')) { w.st = 'retreat'; fly(w, waitPoint(S, w), 0.45); } }
  function waitPoint(S, w) { const r = sitePos(S).rig; return [r[0] + 0.6 + w.jit[0] * 1.6, r[1] + 1.2 + w.jit[1] * 1.2, 1.0 + w.jit[2] * 0.9]; }

  function startEvent(S, kind) {
    const tele = kind === 'swat' ? FEEL.swat_telegraph_ms / 1000 : kind === 'scratch' ? FEEL.scratch_telegraph_ms / 1000 : kind === 'roll' ? 2 : kind === 'blanket' ? 0.8 : 1.2;
    S.hev = { kind, t: 0, telegraph: tele, hold: kind === 'roll' ? 6 : kind === 'blanket' ? 5 : kind === 'swat' ? 1.2 : 0.9, hit: false };
    S.events.push({ type: 'telegraph', kind });
    if (kind === 'swat') once(S, 'swatMemo', () => memo(S, MEMOS.swatWarn, 'warn'));
    if (kind === 'roll') memo(S, MEMOS.roll, 'warn');
  }
  function impact(S) {
    const e = S.hev, kind = e.kind; e.hit = true;
    if (kind === 'swat' || kind === 'scratch') {
      const onSkin = S.workers.filter((w) => w.job === 'extract' && (w.st === 'bite' || (w.st === 'toSkin' && w.t / w.dur > 0.5)));
      const rate = (kind === 'swat' ? ECON.swatKill : ECON.scratchKill) * S.mods.kill;
      let k = Math.round(onSkin.length * rate); if (onSkin.length && k === 0 && kind === 'swat') k = 1;
      const dead = onSkin.sort(() => S.rand() - 0.5).slice(0, k);
      for (const w of dead) { S.workers.splice(S.workers.indexOf(w), 1); S.lost.push({ name: w.name, trait: w.trait, larvae: w.larvae, at: S.time, cause: kind }); }
      const nearMiss = dead.length === 0 && S.recallT > 0;
      S.stats[kind === 'swat' ? 'swats' : 'scratches']++; if (nearMiss) S.stats.nearMisses++;
      S.sleepLost += kind === 'swat' ? ECON.swatSleepCost : ECON.scratchSleepCost;
      S.irritation = Math.max(0, S.irritation - ECON.eventRelief); S.siteBlocked = Math.max(S.siteBlocked, kind === 'swat' ? 3.5 : 2.5);
      if (dead.length) { S.morale = Math.max(0, S.morale - 4 - dead.length); memo(S, MEMOS.loss(dead.map((w) => w.name)), 'loss'); }
      else if (nearMiss) memo(S, MEMOS.nearMiss, 'good');
      else if (kind === 'scratch') once(S, 'scratchMemo', () => memo(S, MEMOS.scratch));
      retreat(S); assign(S);
      S.events.push({ type: 'impact', kind, dead, nearMiss, at: sitePos(S).skin.slice() });
    } else if (kind === 'stir') {
      S.sleepLost += ECON.stirSleepCost; S.irritation = 55; S.siteBlocked = 5; retreat(S); S.events.push({ type: 'impact', kind, dead: [] });
    } else if (kind === 'blanket') {
      S.covered = e.hold; retreat(S); memo(S, MEMOS.blanket); S.events.push({ type: 'impact', kind, dead: [] });
    } else if (kind === 'roll') {
      retreat(S); S.events.push({ type: 'impact', kind, dead: [] });
    }
  }

  function quotaCheck(S) {
    const qLen = S.shiftLen / 4;
    while (S.quarter < 4 && S.extracted >= S.quotas[S.quarter]) {
      S.quarter++; S.quotasMet++;
      const pool = POLICIES.filter((p) => !S.policies.includes(p.id)).sort(() => S.rand() - 0.5).slice(0, 3);
      S.offer = pool.map((p) => p.id); S.events.push({ type: 'quotaMet', quarter: S.quarter }); memo(S, MEMOS.quotaMet(S.quarter), 'good');
      return;
    }
    if (S.quarter < 4 && S.time >= qLen * (S.quarter + 1)) { S.quarter++; S.morale = Math.max(0, S.morale - 8); S.events.push({ type: 'quotaMissed', quarter: S.quarter }); memo(S, MEMOS.quotaMissed(S.quarter), 'warn'); }
  }
  function pickPolicy(S, id) {
    if (!S.offer || !S.offer.includes(id)) return false;
    const p = POLICIES.find((x) => x.id === id); S.policies.push(id); S.offer = null; p.apply(S, api); S.events.push({ type: 'policy', id }); return true;
  }

  function step(S, dt) {
    if (S.state === 'waking') { S.wakeT += dt; if (S.wakeT >= 3) { S.state = 'over'; S.events.push({ type: 'over' }); } moveWorkers(S, dt); return; }
    if (S.state !== 'playing' || S.offer) return;
    S.time += dt;
    const d = derived(S), pace = PACE[S.pace], prod = 0.8 + 0.4 * (S.morale / 100);
    S.recallT = Math.max(0, S.recallT - dt); S.recallCd = Math.max(0, S.recallCd - dt); S.siteBlocked = Math.max(0, S.siteBlocked - dt); S.covered = Math.max(0, S.covered - dt); S.eventCd = Math.max(0, S.eventCd - dt);
    S.morale = clamp(S.morale + (pace.morale + S.mods.moraleDrift) * dt, 0, 100);

    // extraction crew
    const open = siteOpen(S), site = sitePos(S), ex = S.workers.filter((w) => w.job === 'extract');
    let onWay = ex.filter((w) => w.st === 'toSkin' || w.st === 'bite').length, biting = 0, queued = 0;
    const biteDur = FEEL.bite_seconds * pace.bite * S.mods.bite * S.sleeper.bite / prod;
    const tank = S.buildings.find((b) => b.type === 'tank'), tc = padCenter(tank);
    for (const w of ex) {
      w.t += dt;
      if (w.st === 'wait') {
        if (!w.from || w.t > w.dur) { if (!w.to || dist(w.pos, waitPoint(S, w)) > 0.3) fly(w, waitPoint(S, w), 0.7); }
        if (open && onWay < d.slots && S.taken < S.supply && w.t > 0.2 + w.jit[2] * 0.9) { onWay++; w.st = 'toSkin'; fly(w, [site.skin[0] + w.jit[0] * 0.5, site.skin[1] + 0.02, site.skin[2] + (w.jit[2] - 0.5) * 1.5], FEEL.fly_seconds); }
      } else if (w.st === 'toSkin') {
        if (w.t >= w.dur) { w.st = 'bite'; w.t = 0; w.dur = biteDur * (0.8 + S.rand() * 0.4); w.from = null; }
      } else if (w.st === 'bite') {
        biting++;
        if (w.t >= w.dur) { const load = Math.min(ECON.loadMl * S.mods.extract, S.supply - S.taken); S.taken += load; w.carry = load; w.st = 'toTank'; fly(w, [tc[0] + w.jit[0] * 0.5, tc[1] + w.jit[1] * 0.5, 2.6], FEEL.fly_seconds); }
      } else if (w.st === 'toTank' || w.st === 'queue') {
        if (w.t >= w.dur) {
          if (S.raw + w.carry <= d.cap + 0.001) { S.raw += w.carry; S.extracted += w.carry; S.stats.loads++; w.loads++; S.events.push({ type: 'deliver', ml: w.carry, at: w.pos.slice() }); w.carry = 0; w.st = 'wait'; w.t = 0; w.from = null; w.to = null; }
          else { queued++; if (w.st !== 'queue') { w.st = 'queue'; fly(w, [tc[0] + 1.2 + w.jit[0] * 1.4, tc[1] + 1.0 + w.jit[1], 2.2 + w.jit[2] * 0.8], 0.5); } }
        }
      } else if (w.st === 'retreat') { if (w.t >= w.dur) { w.st = 'wait'; w.t = 0; w.from = null; } }
    }
    S.biting = biting; S.queued = queued;
    if (queued > 0) { S.stats.queuedSeconds += dt; if (S.stats.queuedSeconds > 3) once(S, 'fullMemo', () => memo(S, MEMOS.storageFull, 'warn')); }

    // refining and hatching
    const refiners = S.workers.filter((w) => w.job === 'refine').length, nurses = S.workers.filter((w) => w.job === 'hatch').length;
    const rate = Math.min(refiners, d.stations) * ECON.refinePerStation * S.mods.refine * prod;
    const done = Math.min(S.raw, rate * dt); S.raw -= done; S.bank += done; S.refined += done; S.refineRate = done / dt;
    if (refiners === 0 && S.raw > d.cap * 0.8) once(S, 'noRef', () => memo(S, MEMOS.noRefiners, 'warn'));
    const hireCost = ECON.hireBase + S.workers.length * ECON.hirePerHead; S.hireCost = hireCost;
    const active = Math.min(nurses, d.nurseStations);
    S.hatching = active > 0 && S.hiring && S.workers.length < d.housing && S.bank >= hireCost;
    if (active > 0 && S.hiring && S.workers.length >= d.housing) once(S, 'housing' + d.housing, () => memo(S, MEMOS.housingFull, 'warn'));
    if (S.hatching) { S.hatchProgress += (active / (ECON.hatchSeconds * S.mods.hatch)) * dt; if (S.hatchProgress >= 1) { S.hatchProgress -= 1; S.bank -= hireCost; S.spent += hireCost; const w = hire(S); if (w) S.events.push({ type: 'hatch', w }); } }

    // the sleeper
    const late = S.time >= ECON.lateLightSleepAt * (S.shiftLen / FEEL.shift_seconds);
    if (late) once(S, 'late', () => { memo(S, MEMOS.lightSleep, 'warn'); S.events.push({ type: 'lightSleep' }); });
    S.irritation = clamp(S.irritation + (biting * ECON.irritationPerBiter * pace.irritation * S.sleeper.irritation * S.mods.irritation - FEEL.irritation_decay_per_s * (late ? 0.5 : 1)) * dt, 0, 100);
    if (S.hev) {
      const e = S.hev; e.t += dt;
      if (!e.hit && e.t >= e.telegraph) impact(S);
      if (e.kind === 'roll') { const k = clamp((e.t - e.telegraph) / 2.5, 0, 1); if (S.site === 'arm') { S.armOut = 1 - k; if (k >= 1) { S.site = 'foot'; S.events.push({ type: 'relocate' }); } } else S.footOut = clamp((e.t - e.telegraph - 2.5) / 2.5, 0, 1); }
      if (e.t >= e.telegraph + e.hold) { if (e.kind === 'roll') { S.footOut = 1; S.armOut = 0; } S.hev = null; S.eventCd = ECON.eventCooldown; }
    } else {
      const due = S.schedule.find((x) => !x.done && S.time >= x.at);
      if (due) { due.done = true; startEvent(S, due.kind); }
      else if (S.eventCd <= 0 && S.irritation >= 99) startEvent(S, 'stir');
      else if (S.eventCd <= 0 && S.irritation >= ECON.eventThreshold) startEvent(S, S.time < FEEL.quarter_seconds * 0.8 || S.rand() < 0.4 ? 'scratch' : 'swat');
    }

    if (S.time >= S.stats.idleMemoAt && !S.hev) { S.stats.idleMemoAt = S.time + 26 + S.rand() * 10; memo(S, MEMOS.idle[(S.rand() * MEMOS.idle.length) | 0], 'idle'); }
    quotaCheck(S);
    moveWorkers(S, dt);
    if (S.time >= S.shiftLen - S.sleepLost) wake(S);
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  function moveWorkers(S, dt) {
    const refs = S.buildings.filter((b) => b.type === 'refinery'), hats = S.buildings.filter((b) => b.type === 'hatchery');
    for (const w of S.workers) {
      if (S.state === 'waking') { if (!w.home) { w.home = true; fly(w, [5 + w.jit[0] * 6, 3.5 + w.jit[1] * 2, 0.4], 1.2 + w.jit[2]); w.t = 0; } w.t += dt; }
      if (w.job !== 'extract' && S.state !== 'waking') {
        const list = w.job === 'refine' ? refs : hats;
        if (list.length) { const b = list[w.slot % list.length], c = padCenter(b), k = Math.floor(w.slot / list.length), a = k * 1.3 + b.id; const tgt = [c[0] + Math.cos(a) * 0.9 + 0.5, c[1] + 0.9 + Math.sin(a) * 0.35 + (k % 2) * 0.3, 0.35]; if (dist(w.pos, tgt) > 0.4 && (!w.to || dist(w.to, tgt) > 0.1)) fly(w, tgt, 0.8); }
        w.t += dt;
      }
      if (w.from && w.to) { const k = clamp(w.t / w.dur, 0, 1), e = k * k * (3 - 2 * k); w.pos = [w.from[0] + (w.to[0] - w.from[0]) * e, w.from[1] + (w.to[1] - w.from[1]) * e, w.from[2] + (w.to[2] - w.from[2]) * e + Math.sin(k * Math.PI) * 0.7]; if (k >= 1) w.from = null; }
    }
  }

  function wake(S) { if (S.state !== 'playing') return; S.state = 'waking'; S.wakeT = 0; S.hev = null; S.offer = null; memo(S, MEMOS.wake); S.events.push({ type: 'wake' }); }

  function review(S) {
    const pct = (S.extracted / S.supply) * 100, eff = S.extracted > 0 ? clamp((S.refined / S.extracted) * 100 - (S.stats.queuedSeconds / Math.max(1, S.time)) * 40, 0, 100) : 0;
    const everStaff = S.workers.length + S.lost.length, lossRate = everStaff ? S.lost.length / everStaff : 0;
    const score = Math.round(clamp(pct / 70, 0, 1) * 50 + (S.quotasMet / 4) * 20 + (eff / 100) * 10 + (1 - clamp(lossRate / 0.4, 0, 1)) * 20 * clamp(pct / 30, 0, 1));
    const r = C.RATINGS.find((x) => score >= x[0]);
    return { shiftNo: S.shiftNo, sleeper: S.sleeper.label, extracted: Math.round(S.extracted), pct: Math.round(pct * 10) / 10, efficiency: Math.round(eff), casualties: S.lost.length, staff: S.workers.length, peakStaff: S.stats.peakStaff, quotasMet: S.quotasMet, nearMisses: S.stats.nearMisses, score, rating: r[1], remark: r[2], lost: S.lost.slice(), policies: S.policies.slice() };
  }

  const api = { newShift, step, build, upgrade, hire, setStaff, setPace, setHiring, recall, pickPolicy, costOf, upgradeCost, derived, review, wake, startEvent, padCenter, sitePos, siteOpen, assign };
  MA.sim = api;
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
