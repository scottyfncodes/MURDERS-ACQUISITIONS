// The campaign: the colony that persists from night to night, and the save that holds it.
// A night (sim.js) starts from a campaign and never writes to it; fold() turns a finished night into the next campaign.
// Pure data and rules: no DOM, no storage access (main.js reads and writes localStorage), so it runs in Node tests.
(function (root) {
  const MA = (root.MA = root.MA || {});
  const C = MA.config;

  const V1_KEY = 'murders-acquisitions.v1', V2_KEY = 'murders-acquisitions.v2';
  const PLACEABLE = ['tank', 'pool', 'refinery'], SINGLES = ['rig', 'drip', 'windbreak', 'masks', 'lookout', 'seminar', 'plant', 'lab', 'numbing', 'thinner'];

  function newCampaign() {
    return { night: 1, phase: 'night', divisions: ['arm'], gmPolicy: {}, host: { n: 1, start: 1, vigor: 1, lastVigor: 1 }, constraint: null, morale: 70, appoint: {}, hostTotals: freshTotals(), booking: null, grace: 0, rehire: 0, residue: 0, leaseEnded: false, leases: [], bank: 0, refined: 0, zones: 1, suspicion: 0, counters: {}, newCounter: null, buildings: [], workers: [], lost: [], nextId: 1, hires: 0, unlocks: [], totals: { extracted: 0, nights: 0 }, history: [] };
  }
  function freshTotals() { return { extracted: 0, lost: 0, fumigations: 0, cancelled: 0, best: 0, hired: 0 }; }
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
    // the divisions the company owns: always the arm (the original division), plus any acquisitions, in order
    c.divisions = ['arm'].concat((Array.isArray(raw.divisions) ? raw.divisions : []).filter((id, i, a) => id !== 'arm' && C.DIVISIONS[id] && a.indexOf(id) === i));
    const divOk = (id) => (c.divisions.includes(id) ? id : 'arm');
    const usedPads = new Set(), singles = new Set();
    for (const b of Array.isArray(raw.buildings) ? raw.buildings.slice(0, 40) : []) {
      if (!b || typeof b !== 'object') continue;
      const def = C.BUILDINGS[b.type];
      if (SINGLES.includes(b.type)) {
        // a division's rig, drip line and lookout are one per division; the rest are one per colony
        const perDiv = C.DIVISION_BUILDINGS.includes(b.type), dv = perDiv ? divOk(b.div) : null, key = perDiv ? `${b.type}@${dv}` : b.type;
        if (!singles.has(key)) { singles.add(key); c.buildings.push(Object.assign({ type: b.type, level: Math.max(1, int(b.level, 1, def.maxLevel)), pad: -1 }, perDiv ? { div: dv } : {})); }
        continue;
      }
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
      c.workers.push({ id, name: str(w.name, 40), trait: str(w.trait, 40), bio: str(w.bio, 120), larvae: int(w.larvae, 40, 9999), loads: int(w.loads, 0, 1e7), since: Math.max(1, int(w.since, 1, 9999)), div: divOk(w.div) });
    }
    for (const w of Array.isArray(raw.lost) ? raw.lost.slice(-60) : []) {
      if (!w || typeof w !== 'object' || typeof w.name !== 'string') continue;
      c.lost.push({ name: str(w.name, 40), trait: str(w.trait, 40), larvae: int(w.larvae, 0, 9999), night: Math.max(1, int(w.night, 1, 9999)), cause: str(w.cause, 20) }); if (Number.isInteger(w.rank) && w.rank > 0 && w.rank < C.CAREER.length) c.lost[c.lost.length - 1].rank = w.rank;
    }
    c.nextId = Math.max(int(raw.nextId, 1, 1e6), maxId + 1);
    c.hires = Math.max(int(raw.hires, 0, 1e6), c.workers.length);
    c.unlocks = (Array.isArray(raw.unlocks) ? raw.unlocks : []).filter((u, i, a) => (C.BUILD_ORDER.includes(u) || u === 'scatter' || u === 'push') && a.indexOf(u) === i);
    for (const b of c.buildings) if (!c.unlocks.includes(b.type)) c.unlocks.push(b.type);
    if (c.zones > 1 && !c.unlocks.includes('floor')) c.unlocks.push('floor');
    c.refined = Math.min(c.bank, num(raw.refined, 0, 1e7));
    c.suspicion = num(raw.suspicion, 0, 100);
    // the host lifecycle: which host this is, and the night their lease started. A save from before leases starts one now
    const h = raw.host && typeof raw.host === 'object' ? raw.host : null;
    const vig = (v) => (Number.isFinite(v) ? Math.max(0.05, Math.min(1, v)) : 1);
    c.host = h ? { n: Math.max(1, int(h.n, 1, 999)), start: Math.min(c.night, Math.max(1, int(h.start, 1, 9999))), vigor: vig(h.vigor), lastVigor: vig(h.lastVigor) } : { n: 1, start: c.night, vigor: 1, lastVigor: 1 };
    const ht = raw.hostTotals && typeof raw.hostTotals === 'object' ? raw.hostTotals : {}; c.hostTotals = freshTotals(); for (const k of Object.keys(c.hostTotals)) c.hostTotals[k] = num(ht[k], 0);
    c.booking = Number.isInteger(raw.booking) && raw.booking >= c.night - 1 && raw.booking <= c.night + 3 ? raw.booking : null;
    c.grace = int(raw.grace, 0, 9); c.rehire = int(raw.rehire, 0, 9); c.residue = int(raw.residue, 0, 9); c.leaseEnded = raw.leaseEnded === true; c.morale = Number.isFinite(raw.morale) ? Math.max(0, Math.min(100, Math.round(raw.morale))) : 70;
    c.appoint = {}; if (raw.appoint && typeof raw.appoint === 'object') for (const [k, v] of Object.entries(raw.appoint)) if (/^(gm|lookout)@[a-z]+$/.test(k) && Number.isInteger(v) && v > 0) c.appoint[k] = v;
    c.constraint = ['host', 'storage', 'spots', 'staff', 'hazards'].includes(raw.constraint) ? raw.constraint : null;
    c.leases = (Array.isArray(raw.leases) ? raw.leases.slice(-20) : []).filter((x) => x && typeof x === 'object').map((x) => ({ n: Math.max(1, int(x.n, 1, 999)), nights: int(x.nights, 0, 99), extracted: int(x.extracted, 0), lost: int(x.lost, 0, 1e5), fumigations: int(x.fumigations, 0, 99) }));
    const gp = raw.gmPolicy && typeof raw.gmPolicy === 'object' ? raw.gmPolicy : {}; c.gmPolicy = {}; for (const id of c.divisions) if (['lie', 'standard', 'aggressive'].includes(gp[id])) c.gmPolicy[id] = gp[id];
    c.newCounter = c.phase === 'day' && C.ECON.counters.some((k) => k.id === raw.newCounter) ? raw.newCounter : null;
    const ct = raw.counters && typeof raw.counters === 'object' ? raw.counters : {};
    for (const k of C.ECON.counters) if (ct[k.id] === true) { c.counters[k.id] = true; if (!c.unlocks.includes(k.answer)) c.unlocks.push(k.answer); }
    const t = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
    c.totals = { extracted: num(t.extracted, 0), nights: int(t.nights, 0, 9999) };
    c.history = (Array.isArray(raw.history) ? raw.history.slice(0, 30) : []).filter((h) => h && typeof h === 'object').map((h) => ({ night: Math.max(1, int(h.night, 1, 9999)), extracted: int(h.extracted, 0), staff: int(h.staff, 0, 999), lost: int(h.lost, 0, 999), hires: int(h.hires, 0, 999), clotted: int(h.clotted, 0, 1e7), suspicion: num(h.suspicion, 0, 100) }));
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
      night: camp.night, phase: camp.phase, newCounter: camp.newCounter, suspicion: camp.suspicion, counters: camp.counters, constraint: camp.constraint, host: camp.host, hostTotals: camp.hostTotals, booking: camp.booking, grace: camp.grace, rehire: camp.rehire, residue: camp.residue || 0, leaseEnded: camp.leaseEnded, leases: camp.leases, bank: S.bank, refined: S.refined, zones: S.zones,
      divisions: S.divOrder.slice(),
      buildings: S.buildings.filter((b) => b.type !== 'nest').map((b) => Object.assign({ type: b.type, level: b.level, pad: b.pad }, b.div ? { div: b.div } : {})),
      workers: S.workers.map((w) => ({ id: w.id, name: w.name, trait: w.trait, bio: w.bio, larvae: w.larvae, loads: w.loads, since: w.since, div: w.lent || w.div })), // staff lent for the night go home
      gmPolicy: Object.assign({}, S.gmPolicy), morale: Math.round(S.morale),
      appoint: Object.fromEntries(Object.entries(S.appoint || {}).filter(([, id]) => S.workers.some((w) => w.id === id))),
      lost: camp.lost.concat(S.lost.map((w) => Object.assign({ name: w.name, trait: w.trait, larvae: w.larvae, night: camp.night, cause: w.cause }, w.rank ? { rank: w.rank } : {}))),
      nextId: S.nextId, hires: S.hires, unlocks: S.unlocked.slice(), totals: camp.totals, history: camp.history,
    };
  }
  const E = () => C.ECON;
  // what happened this morning, for the morning screen: attached to the campaign but never saved
  function withNews(camp, news) { Object.defineProperty(camp, 'news', { value: news, enumerable: false, configurable: true }); return camp; }
  // the night of the current host's lease (1..14)
  function operatingCosts(c, night) {
    const heads = c.workers.length, payroll = c.workers.reduce((a, w) => a + C.CAREER[rankAt(night - w.since)].pay, 0);
    const upkeep = c.buildings.reduce((a, b) => a + (C.ECON.upkeep[b.type] || 0) * b.level, 0);
    return { heads, payroll, upkeep, total: payroll + upkeep, short: 0 };
  }
  function rankAt(served) { let r = 0; C.CAREER.forEach((k, i) => { if (served >= k.at) r = i; }); return r; }
  function leaseNight(camp) { return camp.night - camp.host.start + 1; }
  // dawn: a finished night becomes the next day. Unrefined blood clots (the first clot unlocks the refinery); he takes stock of
  // what he noticed; he may buy a countermeasure, book an exterminator, cancel one, or have the bedroom fumigated
  function dawn(camp, S, report) {
    const n = snapshot(camp, S), ec = E(), news = { suspicion: null, fumigation: null, booking: null, cancelled: false, leaseEnded: false, promotions: [] };
    n.night = camp.night + 1; n.phase = 'day'; n.bank = Math.max(0, S.bank - report.clotted); n.refined = Math.min(n.bank, S.refined);
    if (report.clotted > 0 && !n.unlocks.includes('refinery')) n.unlocks.push('refinery');
    // the host: what was taken tonight drains him (dry bites far more); a day off restores some of the rest
    { const h = report.host; if (h && h.base) { const comfy = Math.min(h.taken, h.supply), dry = Math.max(0, h.taken - h.supply), v0 = camp.host.vigor;
      const v1 = Math.max(ec.vigorMin, Math.min(1, v0 + ec.vigorRegen * (1 - v0) - ec.vigorDrain * Math.pow(comfy / h.base, 2) - ec.vigorDryDrain * dry / h.base));
      n.host = Object.assign({}, n.host, { vigor: v1, lastVigor: v0 }); news.host = { before: v0, after: v1, taken: h.taken, supply: h.supply, base: h.base, next: Math.round(h.base * (ec.vigorSupplyFloor + (1 - ec.vigorSupplyFloor) * v1)) }; } }
    // suspicion: what he noticed last night, and how drained he feels this morning (a pale host asks questions); then he
    // forgets some of it during the day (more, the more there is to forget)
    const pale = news.host ? Math.round(ec.paleSuspicion * Math.max(0, ec.paleFrom - news.host.after)) : 0;
    const before = camp.suspicion, raw = before + report.suspicion + pale, sus = Math.min(100, raw);
    n.counters = Object.assign({}, camp.counters); n.newCounter = null;
    const next = ec.counters.find((k) => !n.counters[k.id]);
    if (next && sus >= next.at) { n.counters[next.id] = true; n.unlocks.push(next.answer); n.newCounter = next.id; }
    const forget = Math.min(sus, ec.suspicionForgetBase + ec.suspicionForgetShare * sus);
    let after = Math.max(0, sus - forget);
    // the exterminator: booked when he hits 100%, three nights' notice; on the day he cancels if suspicion has fallen far enough
    n.booking = camp.booking; n.grace = Math.max(0, camp.grace - 1); n.rehire = Math.max(0, camp.rehire - 1); n.residue = Math.max(0, (camp.residue || 0) - 1);
    if (n.booking !== null && camp.night >= n.booking) {
      n.booking = null;
      if (sus < ec.cancelBelow) { news.cancelled = true; n.hostTotals = Object.assign({}, camp.hostTotals, { cancelled: camp.hostTotals.cancelled + 1 }); }
      else { news.fumigation = fumigate(n, report); after = ec.fumigatedSuspicion; n.grace = ec.fumigationGrace; n.rehire = ec.rehireNights; n.residue = ec.residueNights; n.morale = Math.max(0, (Number.isFinite(n.morale) ? n.morale : 70) - ec.fumigationMorale); }
    } else if (n.booking === null && n.grace === 0 && raw >= ec.bookAt) { n.booking = camp.night + ec.warningNights; news.booking = n.booking; }
    n.suspicion = after;
    news.suspicion = { before, parts: (report.susParts || []).concat(pale ? [{ key: 'pale', count: Math.round(news.host.after * 100), v: pale }] : []), gain: report.suspicion + pale, raw, forget, after, next, booking: n.booking };
    const ht = Object.assign({}, n.hostTotals || camp.hostTotals); ht.extracted += report.extracted; ht.lost += report.lost.length + (news.fumigation ? news.fumigation.lost.length : 0); ht.best = Math.max(ht.best, report.extracted); ht.hired += report.hires; if (news.fumigation) ht.fumigations++;
    n.hostTotals = ht;
    n.totals = { extracted: camp.totals.extracted + report.extracted, nights: camp.totals.nights + 1 };
    n.history = [{ night: camp.night, extracted: report.extracted, staff: report.staff, lost: report.lost.length, hires: report.hires, clotted: report.clotted, suspicion: Math.round(sus) }].concat(camp.history);
    // operating costs: everyone on payroll at their rank's pay, and upkeep on every building level. What cannot be paid is
    // written off as morale (staff are not let go for it: that would be a death spiral, and bad PR)
    if (camp.night >= 2) { const c = operatingCosts(n, camp.night), paid = Math.min(n.bank, c.total); n.bank -= paid; n.refined = Math.min(n.refined, n.bank); c.short = c.total - paid; news.costs = c; }
    n.constraint = report.constraint || null;
    // morale: what carries over is the grief, not the good mood (above normal it resets); a day off lifts it part of the way back
    // to normal; an unpaid payroll does not
    { const m0 = Math.min(70, Number.isFinite(n.morale) ? n.morale : 70), m1 = Math.round(Math.max(0, Math.min(100, m0 + (70 - m0) * 0.4 - (news.costs && news.costs.short ? 10 : 0)))); n.morale = m1; news.morale = { night: m0, before: Number.isFinite(camp.morale) ? camp.morale : 70, after: m1 }; }
    // careers: whoever made it through the night has served one more; some of them are promoted
    news.promotions = n.workers.map((w) => ({ name: w.name, from: rankAt(camp.night - w.since), to: rankAt(n.night - w.since) })).filter((p) => p.to > p.from).map((p) => ({ name: p.name, rank: C.CAREER[p.to].name }));
    // the lease: after the host's 14th night, the annual report
    if (leaseNight(camp) >= ec.leaseNights) { n.leaseEnded = true; news.leaseEnded = true; }
    return withNews(cleanCampaign(n), news);
  }
  function fold(camp, S, report) { return dawn(camp, S, report); }
  // fumigation (a "workforce restructuring"): staff go, last hired first, more from the most exposed division; the raw blood
  // in the tanks is gone; every pool loses a level. Rhonda, the GMs and the lookouts were in a meeting
  function fumigate(n, report) {
    const ec = E(), protectedIds = new Set();
    for (const id of n.divisions) {
      const mine = n.workers.filter((w) => w.div === id).sort((a, b) => a.id - b.id), posts = [];
      if (n.buildings.some((b) => b.type === 'lookout' && b.div === id)) posts.push('lookout'); if (n.divisions.length > 1) posts.push('gm');
      const free = mine.slice(); for (const job of posts) { const want = n.appoint && n.appoint[`${job}@${id}`], w = free.find((x) => x.id === want) || free[0]; if (w) { protectedIds.add(w.id); free.splice(free.indexOf(w), 1); } }
    }
    const staff = n.workers.filter((w) => !protectedIds.has(w.id)), cut = Math.round(staff.length * ec.fumigationStaffShare);
    const exposure = {}; for (const p of report.susParts || []) if (p.key === 'bites') exposure[p.div] = p.v; const total = Object.values(exposure).reduce((a, v) => a + v, 0) || 1;
    // each division's share of the cut follows its share of the exposure
    // (blended half and half with its share of the staff, so one short night cannot hand the whole cut to one division)
    const share = (id) => 0.5 * (exposure[id] || 0) / total + 0.5 * staff.filter((w) => w.div === id).length / Math.max(1, staff.length);
    const quota = {}; let given = 0; n.divisions.forEach((id, i) => { quota[id] = i === n.divisions.length - 1 ? cut - given : Math.round(cut * share(id)); given += quota[id]; });
    const gone = [];
    // who goes is decided by a consultant: seniority is not considered (neither is merit). A fixed draw per night, so a reload changes nothing
    let seed = (n.night * 2654435761 + staff.length * 97) >>> 0; const lot = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const id of n.divisions) { const pool = staff.filter((w) => w.div === id).map((w) => ({ w, k: lot() })).sort((a, b) => a.k - b.k).map((x) => x.w); gone.push(...pool.slice(0, Math.max(0, quota[id]))); }
    while (gone.length < cut) { const rest = staff.filter((x) => !gone.includes(x)); if (!rest.length) break; gone.push(rest[Math.floor(lot() * rest.length)]); }
    n.workers = n.workers.filter((w) => !gone.includes(w));
    const rankOf = (w) => rankAt(n.night - 1 - w.since);
    n.lost = n.lost.concat(gone.map((w) => Object.assign({ name: w.name, trait: w.trait, larvae: w.larvae, night: n.night - 1, cause: 'fumigation' }, rankOf(w) ? { rank: rankOf(w) } : {})));
    const rawLost = Math.max(0, Math.round(n.bank - n.refined)); n.bank = n.refined;
    let pools = 0; for (const b of n.buildings) if (b.type === 'pool' && b.level > 1) { b.level--; pools++; }
    return { lost: gone.map((w) => ({ name: w.name, div: w.div, rank: rankOf(w) })), seniors: gone.filter((w) => rankOf(w) >= 2).length, byDiv: n.divisions.map((id) => ({ id, lost: gone.filter((w) => w.div === id).length })), raw: rawLost, pools, executives: protectedIds.size };
  }
  // the lease is up: the company moves with him. Same staff, same company, a new host who has never seen a mosquito
  function relocate(camp) {
    const n = JSON.parse(JSON.stringify(camp)), ec = E();
    n.leases = camp.leases.concat([{ n: camp.host.n, nights: leaseNight(camp) - 1, extracted: camp.hostTotals.extracted, lost: camp.hostTotals.lost, fumigations: camp.hostTotals.fumigations }]);
    n.host = { n: camp.host.n + 1, start: camp.night, vigor: 1, lastVigor: 1 }; n.hostTotals = freshTotals(); n.leaseEnded = false;
    n.suspicion = 0; n.counters = {}; n.newCounter = null; n.booking = null; n.grace = 0; n.rehire = 0; n.residue = 0; n.phase = 'day';
    const out = cleanCampaign(n); return withNews(out, { relocated: out.host.n });
  }

  // the next countermeasure he has not bought yet, if any
  function nextCounter(camp) { return C.ECON.counters.find((k) => !camp.counters[k.id]) || null; }
  // a day (no clock, no host) saves what was built; nightfall hands the colony to the next night
  function foldDay(camp, S, nightfall) { const n = snapshot(camp, S); n.lost = camp.lost; n.phase = nightfall ? 'night' : 'day'; n.newCounter = nightfall ? null : camp.newCounter; return cleanCampaign(n); }

  // what Rhonda plans for the coming night: true statements about the colony, never promises
  function plan(camp) {
    const counts = { tank: 0, pool: 0, rig: 0, refinery: 0, drip: 0 }; camp.buildings.forEach((b) => { counts[b.type] += b.type === 'pool' ? b.level : 1; });
    const housing = camp.buildings.filter((b) => b.type === 'pool').reduce((a, b) => a + 3 * b.level, 0);
    const out = [`Night ${camp.night} runs ${Math.round(nightLength(camp.night))} seconds, ${Math.round(nightLength(camp.night) - nightLength(camp.night - 1))} longer than last night.`];
    const clot = camp.history[0] && camp.history[0].clotted;
    if (clot && !counts.refinery) out.push(`${clot} BU clotted overnight. A refinery keeps blood from going off.`);
    if (!counts.pool) out.push('Build a breeding pool. Employees do the biting for you.');
    else if (camp.constraint === 'host') out.push('Last night the host was the limit. More staff would only cost payroll; spare him, or drain him and pay for it.');
    else if (camp.workers.length >= housing) out.push('Every pool is full. Another pool means more staff.');
    if (camp.workers.length >= C.ECON.slotsBase && !camp.unlocks.includes('rig')) out.push('The arm fits three at a time. When it gets crowded, we can build a rig.');
    if (out.length < 3) out.push('He is still asleep. He has no idea.');
    return out.slice(0, 3);
  }

  MA.campaign = { operatingCosts, rankAt, V1_KEY, V2_KEY, newCampaign, defaults, fromSave, migrateV1, cleanCampaign, fold, dawn, relocate, fumigate, leaseNight, foldDay, nextCounter, plan, nightLength };
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
