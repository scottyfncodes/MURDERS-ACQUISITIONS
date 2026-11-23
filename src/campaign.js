// The campaign: the colony that persists from night to night, and the save that holds it.
// A night (sim.js) starts from a campaign and never writes to it; fold() turns a finished night into the next campaign.
// Pure data and rules: no DOM, no storage access (main.js reads and writes localStorage), so it runs in Node tests.
(function (root) {
  const MA = (root.MA = root.MA || {});
  const C = MA.config;

  const V1_KEY = 'murders-acquisitions.v1', V2_KEY = 'murders-acquisitions.v2';
  const PLACEABLE = ['tank', 'pool', 'refinery'], SINGLES = ['rig', 'drip'];

  function newCampaign() {
    return { night: 1, phase: 'night', bank: 0, refined: 0, zones: 1, buildings: [], workers: [], lost: [], nextId: 1, hires: 0, unlocks: [], totals: { extracted: 0, nights: 0 }, history: [] };
  }
  function defaults() { return { v: 2, settings: { muted: false, seenOpening: false }, campaign: newCampaign(), archive: null }; }

  // ---------- validation: storage is user-editable, so nothing is trusted on the way in ----------
  const num = (v, d, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max === undefined ? 1e9 : max) : d);
  const int = (v, d, max) => Math.floor(num(v, d, max));
  const str = (v, n) => String(typeof v === 'string' ? v : '').slice(0, n);

  function cleanCampaign(raw) {
    const c = newCampaign(); if (!raw || typeof raw !== 'object') return c;
    c.night = Math.max(1, int(raw.night, 1, 9999));
    c.bank = num(raw.bank, 0, 1e7);
    c.phase = raw.phase === 'day' && c.night > 1 ? 'day' : 'night';
    c.zones = Math.min(C.ZONES.length, Math.max(1, int(raw.zones, 1, C.ZONES.length)));
    const usedPads = new Set(), singles = new Set();
    for (const b of Array.isArray(raw.buildings) ? raw.buildings.slice(0, 40) : []) {
      if (!b || typeof b !== 'object') continue;
      const def = C.BUILDINGS[b.type];
      if (SINGLES.includes(b.type)) { if (!singles.has(b.type)) { singles.add(b.type); c.buildings.push({ type: b.type, level: Math.max(1, int(b.level, 1, def.maxLevel)), pad: -1 }); } continue; }
      if (!PLACEABLE.includes(b.type)) continue;
      const pad = b.pad; // a pad out of range is dropped, never clamped onto a real one
      if (!Number.isInteger(pad) || pad < 0 || pad >= C.PADS.length || usedPads.has(pad)) continue;
      usedPads.add(pad); const zone = C.ZONES.findIndex((z) => z.includes(pad)); if (zone + 1 > c.zones) c.zones = zone + 1; // a building on the window side means it was bought
      c.buildings.push({ type: b.type, level: Math.max(1, int(b.level, 1, def.maxLevel || C.ECON.maxLevel)), pad });
    }
    let maxId = 0; const ids = new Set();
    for (const w of Array.isArray(raw.workers) ? raw.workers.slice(0, 200) : []) {
      if (!w || typeof w !== 'object' || typeof w.name !== 'string') continue;
      const id = Math.max(1, int(w.id, 0, 1e6)); if (ids.has(id)) continue; ids.add(id); maxId = Math.max(maxId, id);
      c.workers.push({ id, name: str(w.name, 40), trait: str(w.trait, 40), bio: str(w.bio, 120), larvae: int(w.larvae, 40, 9999), loads: int(w.loads, 0, 1e7), since: Math.max(1, int(w.since, 1, 9999)) });
    }
    for (const w of Array.isArray(raw.lost) ? raw.lost.slice(-60) : []) {
      if (!w || typeof w !== 'object' || typeof w.name !== 'string') continue;
      c.lost.push({ name: str(w.name, 40), trait: str(w.trait, 40), larvae: int(w.larvae, 0, 9999), night: Math.max(1, int(w.night, 1, 9999)), cause: str(w.cause, 20) });
    }
    c.nextId = Math.max(int(raw.nextId, 1, 1e6), maxId + 1);
    c.hires = Math.max(int(raw.hires, 0, 1e6), c.workers.length);
    c.unlocks = (Array.isArray(raw.unlocks) ? raw.unlocks : []).filter((u, i, a) => (C.BUILD_ORDER.includes(u) || u === 'scatter') && a.indexOf(u) === i);
    for (const b of c.buildings) if (!c.unlocks.includes(b.type)) c.unlocks.push(b.type);
    if (c.zones > 1 && !c.unlocks.includes('floor')) c.unlocks.push('floor');
    c.refined = Math.min(c.bank, num(raw.refined, 0, 1e7));
    const t = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
    c.totals = { extracted: num(t.extracted, 0), nights: int(t.nights, 0, 9999) };
    c.history = (Array.isArray(raw.history) ? raw.history.slice(0, 30) : []).filter((h) => h && typeof h === 'object').map((h) => ({ night: Math.max(1, int(h.night, 1, 9999)), extracted: int(h.extracted, 0), staff: int(h.staff, 0, 999), lost: int(h.lost, 0, 999), hires: int(h.hires, 0, 999), clotted: int(h.clotted, 0, 1e7) }));
    return c;
  }

  // v1 kept a career and the last eight reviews; they are archived as the player's previous employer
  function cleanReview(r) {
    return r && typeof r === 'object' && typeof r.rating === 'string'
      ? { shiftNo: Math.max(1, int(r.shiftNo, 1, 9999)), sleeper: str(r.sleeper, 60), rating: str(r.rating, 40), score: num(r.score, 0, 100), extracted: num(r.extracted, 0), pct: num(r.pct, 0, 100), casualties: int(r.casualties, 0, 9999) }
      : null;
  }
  function cleanArchive(a) {
    if (!a || typeof a !== 'object') return null;
    const reviews = Array.isArray(a.reviews) ? a.reviews.map(cleanReview).filter(Boolean).slice(0, 8) : [];
    const out = { shifts: int(a.shifts, 0, 1e6), best: cleanReview(a.best), reviews, career: num(a.career, 0, 1e6) };
    return out.shifts || out.reviews.length || out.best ? out : null;
  }

  function fromSave(raw) {
    const d = defaults(); if (!raw || typeof raw !== 'object' || raw.v !== 2) return d;
    const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    d.settings = { muted: s.muted === true, seenOpening: s.seenOpening === true };
    d.campaign = cleanCampaign(raw.campaign);
    d.archive = cleanArchive(raw.archive);
    return d;
  }

  // read-only: the v1 object is never modified and the v1 key is never written
  function migrateV1(v1) {
    const d = defaults(); if (!v1 || typeof v1 !== 'object') return d;
    d.settings.muted = v1.muted === true;
    d.archive = cleanArchive(v1);
    return d;
  }

  // ---------- the night boundary ----------
  function nightLength(n) { const F = C.FEEL; return Math.min(F.night_max_seconds, F.night1_seconds + F.night_grow_seconds * (Math.max(1, n) - 1)); }

  // the colony as a night or a day left it: buildings, staff, blood, what has been learned
  function snapshot(camp, S) {
    return {
      night: camp.night, phase: camp.phase, bank: S.bank, refined: S.refined, zones: S.zones,
      buildings: S.buildings.filter((b) => b.type !== 'nest').map((b) => ({ type: b.type, level: b.level, pad: b.pad })),
      workers: S.workers.map((w) => ({ id: w.id, name: w.name, trait: w.trait, bio: w.bio, larvae: w.larvae, loads: w.loads, since: w.since })),
      lost: camp.lost.concat(S.lost.map((w) => ({ name: w.name, trait: w.trait, larvae: w.larvae, night: camp.night, cause: w.cause }))),
      nextId: S.nextId, hires: S.hires, unlocks: S.unlocked.slice(), totals: camp.totals, history: camp.history,
    };
  }
  // dawn: a finished night becomes the next day. Unrefined blood clots, and the first clot is what unlocks the refinery
  function fold(camp, S, report) {
    const n = snapshot(camp, S);
    n.night = camp.night + 1; n.phase = 'day'; n.bank = Math.max(0, S.bank - report.clotted); n.refined = Math.min(n.bank, S.refined);
    if (report.clotted > 0 && !n.unlocks.includes('refinery')) n.unlocks.push('refinery');
    n.totals = { extracted: camp.totals.extracted + report.extracted, nights: camp.totals.nights + 1 };
    n.history = [{ night: camp.night, extracted: report.extracted, staff: report.staff, lost: report.lost.length, hires: report.hires, clotted: report.clotted }].concat(camp.history);
    return cleanCampaign(n);
  }
  // a day (no clock, no host) saves what was built; nightfall hands the colony to the next night
  function foldDay(camp, S, nightfall) { const n = snapshot(camp, S); n.lost = camp.lost; n.phase = nightfall ? 'night' : 'day'; return cleanCampaign(n); }

  // what Rhonda plans for the coming night: true statements about the colony, never promises
  function plan(camp) {
    const counts = { tank: 0, pool: 0, rig: 0, refinery: 0, drip: 0 }; camp.buildings.forEach((b) => { counts[b.type] += b.type === 'pool' ? b.level : 1; });
    const housing = camp.buildings.filter((b) => b.type === 'pool').reduce((a, b) => a + 3 * b.level, 0);
    const out = [`Night ${camp.night} runs ${Math.round(nightLength(camp.night))} seconds, ${Math.round(nightLength(camp.night) - nightLength(camp.night - 1))} longer than last night.`];
    const clot = camp.history[0] && camp.history[0].clotted;
    if (clot && !counts.refinery) out.push(`${clot} mL clotted overnight. A refinery keeps blood from going off.`);
    if (!counts.pool) out.push('Build a breeding pool. Employees do the biting for you.');
    else if (camp.workers.length >= housing) out.push('Every pool is full. Another pool means more staff.');
    if (camp.workers.length >= C.ECON.slotsBase && !camp.unlocks.includes('rig')) out.push('The arm fits three at a time. When it gets crowded, we can build a rig.');
    if (out.length < 3) out.push('He is still asleep. He has no idea.');
    return out.slice(0, 3);
  }

  MA.campaign = { V1_KEY, V2_KEY, newCampaign, defaults, fromSave, migrateV1, cleanCampaign, fold, foldDay, plan, nightLength };
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
