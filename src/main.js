// Boot, the frame loop, input and the HUD. The rules live in sim.js and campaign.js, the picture in render.js.
(function () {
  'use strict';
  const MA = window.MA, C = MA.config, sim = MA.sim, R = MA.render, audio = MA.audio, K = MA.campaign;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const HZ = C.HAZARDS, multi = (S) => S && S.divOrder.length > 1, hazardAt = (S, D) => D.hev && !D.hev.hit && HZ[D.hev.kind];
  const errorBox = $('error');
  function fail(msg) { errorBox.textContent = `Something went wrong: ${msg}. Reload to pick up from the start of this night.`; errorBox.hidden = false; }
  window.addEventListener('error', (e) => fail(e.message || 'unknown error'));
  window.addEventListener('unhandledrejection', (e) => fail((e.reason && e.reason.message) || 'unknown error'));

  // ---------- saved progress: v2 holds the colony; v1 is read once for settings and records, never written ----------
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function store() { try { localStorage.setItem(K.V2_KEY, JSON.stringify(save)); } catch (e) { /* private mode: play on without saving */ } }
  const saved2 = readJSON(K.V2_KEY);
  const save = saved2 ? K.fromSave(saved2) : K.migrateV1(readJSON(K.V1_KEY));
  if (!saved2) store();

  // ---------- state ----------
  const cv = $('game'), ctx = cv.getContext('2d');
  const fresh = new Set(); // cards unlocked but not yet tapped: they pulse once, not every night
  const G = { zoom: 1, pinch: null, mode: 'title', S: null, demo: null, paused: false, selected: null, placing: null, hitStop: 0, slow: 0, acc: 0, last: 0, shown: {}, memoQ: [], memoUntil: 0, modal: null, uiAt: 0, cineT: 0, base: null, cam: null, punch: null, press: null, cardsKey: '', idleAt: 0, hireAt: -99 };
  R.fx.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fit() { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', fit); fit();

  function makeDemo() { const S = sim.newNight(K.cleanCampaign(save.campaign), { seed: 11 }); S.demo = true; S.events.length = 0; return S; }
  G.demo = makeDemo();

  // ---------- night lifecycle ----------
  function clockIn() {
    audio.start(); audio.play('click');
    if (!save.settings.seenOpening && save.campaign.night === 1) startOpening(); else if (save.campaign.leaseEnded) showAnnual(); else if (save.campaign.phase === 'day') startDay(); else startNight();
  }
  function startOpening() {
    G.mode = 'opening'; G.cineT = 0; G.S = sim.newNight(save.campaign, {}); G.S.events.length = 0; G.cam = null;
    document.body.classList.remove('is-title', 'morning'); document.body.classList.add('is-cine'); $('hud').hidden = true; $('cine').hidden = false; caption(0, true);
  }
  function endOpening() {
    if (G.mode !== 'opening') return;
    save.settings.seenOpening = true; store(); $('cine').hidden = true; document.body.classList.remove('is-cine');
    startNight(G.S);
  }
  // the day: he is at work, nothing to bite, no clock. Build, then call nightfall
  function startDay() {
    G.S = sim.newNight(save.campaign, { day: true }); resetPlay(); document.body.classList.add('morning', 'is-day');
    for (const k of C.ECON.counters) if (G.S.counters[k.id] && !G.S.buildings.some((b) => b.type === k.answer)) fresh.add(k.answer); // what he bought is answered first
    $('nightfall').hidden = false; $('recall').hidden = true; G.dayAt = performance.now() / 1000; renderPanel(); drainEvents();
    const nw = save.campaign.news; if (nw) { const add = (text, tone) => { G.memoQ.push({ text, tone }); }; if (nw.relocated) add(C.NOTES.relocated(nw.relocated), 'good'); if (nw.fumigation) add(C.MORNING.restructureNote, 'loss'); if (nw.booking) add(C.MORNING.booked, 'warn'); if (nw.cancelled) add(C.MORNING.cancelled, 'good'); G.memoUntil = 0; } updateHud(0, performance.now() / 1000);
  }
  function nightfall() {
    if (!G.S || G.S.phase !== 'day') return; audio.play('click');
    save.campaign = K.foldDay(save.campaign, G.S, true); store(); startNight();
  }
  function resetPlay() {
    G.mode = 'play'; G.paused = false; G.selected = null; G.placing = null; G.acc = 0; G.memoQ = []; G.memoUntil = 0; G.shown = {}; G.cardsKey = ''; G.punch = null; G.slow = 0; G.idleAt = 0; G.hireAt = -99; G.flashCoach = null;
    R.fx.parts.length = 0; R.fx.labels.length = 0; closeModal();
    document.body.classList.remove('is-title', 'morning', 'is-cine', 'is-day'); $('hud').hidden = false; $('memo').hidden = true; $('nightfall').hidden = true; $('clock-out').hidden = G.S.phase === 'day';
  }
  function startNight(S) {
    G.S = S || sim.newNight(save.campaign, {}); store();
    $('recall').hidden = !G.S.unlocked.includes('scatter');
    resetPlay(); renderPanel(); drainEvents(); updateHud(0, performance.now() / 1000);
  }
  function toTitle() { G.mode = 'title'; G.S = null; G.demo = makeDemo(); G.cam = null; closeModal(); document.body.classList.add('is-title'); document.body.classList.remove('morning', 'is-cine', 'is-day'); $('hud').hidden = true; $('cine').hidden = true; titleStatus(); }
  function titleStatus() {
    const c = save.campaign;
    const k = K.leaseNight(c), L = C.ECON.leaseNights;
    $('title-status').textContent = c.night === 1 && !c.workers.length ? 'Night 1 · Subject asleep since 11:42 PM' : c.leaseEnded ? 'The lease is up · annual report' : c.phase === 'day' && k <= 1 ? `Moving day · Host #${c.host.n} · ${c.workers.length} on payroll` : c.phase === 'day' ? `Day ${k - 1} of ${L} · He is at work · ${c.workers.length} on payroll` : `Night ${k} of ${L} · ${c.workers.length} on payroll · ${fmt(c.bank)} BU stored`;
  }

  // ---------- the opening ----------
  function caption(t, force) {
    let i = 0; C.OPENING.forEach((c, k) => { if (t >= c.at) i = k; });
    if (!force && G.shown.cap === i) return; G.shown.cap = i;
    const c = C.OPENING[i], el = $('cine-cap'); $('cine-time').textContent = c.time; $('cine-line').textContent = c.line;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }
  function cineCam(t) {
    if (t < 4.5) return { f: [3.6, 3.4, 5.2], z: 2.5, k: 1 };
    if (t < 8.2) return { f: [3.8, 3.6, 5.0], z: 2.1, k: 1 };
    if (t < 12.6) return { f: [8.2, 4.2, 3.4], z: 1.35, k: 0.9 };
    return playCam(G.S);
  }

  // ---------- modals ----------
  function openModal(id) { closeModal(true); G.modal = id; const el = $(id); el.hidden = false; const b = el.querySelector('button'); if (b) b.focus({ preventScroll: true }); if (id === 'handbook') el.setAttribute('data-open', ''); }
  function closeModal(keepPause) { if (!G.modal) return; const el = $(G.modal); el.hidden = true; el.removeAttribute('data-open'); el.removeAttribute('data-ready'); const was = G.modal; G.modal = null; if (!keepPause && was === 'handbook' && G.paused && G.mode === 'play') openModal('pause-menu'); }
  function setPaused(p) { if (G.mode !== 'play' || !G.S || G.S.state !== 'playing') return; G.paused = p; G.S.hold = false; audio.hold(p); if (p) openModal('pause-menu'); else if (G.modal === 'pause-menu') closeModal(true); }

  $('handbook-list').innerHTML = C.HANDBOOK.map(([h, t]) => `<li><b>${h}.</b> ${t}</li>`).join('');
  function li(head, right, sub) { const el = document.createElement('li'), b = document.createElement('b'), s = document.createElement('span'), i = document.createElement('i'); b.textContent = head; s.textContent = sub; i.textContent = right; el.append(b, i, s); return el; }
  function showRecords() {
    const c = save.campaign, list = $('reviews-list'), old = $('archive-list'); list.innerHTML = ''; old.innerHTML = '';
    $('reviews-sub').textContent = c.history.length ? `${c.totals.nights} night${c.totals.nights === 1 ? '' : 's'} on file · ${fmt(c.totals.extracted)} BU collected · ${c.lost.length} lost` : 'The company has no records yet. Clock in to start one.';
    for (const h of c.history) list.append(li(`Night ${h.night}`, `${fmt(h.extracted)}`, `${fmt(h.extracted)} BU · ${h.staff} on payroll · ${h.lost} lost`));
    const a = save.archive; $('archive').hidden = !a;
    if (a) { $('archive-sub').textContent = `${a.shifts} shift${a.shifts === 1 ? '' : 's'} at Plant No. 1${a.best ? ` · best: ${a.best.rating}` : ''}.`; for (const r of a.reviews) old.append(li(`Shift ${r.shiftNo} · ${r.rating}`, String(r.score), `${r.sleeper} · ${fmt(r.extracted)} BU · ${r.casualties} lost`)); }
    openModal('reviews');
  }

  // ---------- the build panel: one card per unlocked building, or the placement prompt ----------
  const cards = {};
  function renderPanel() {
    const S = G.S, p = $('panel-build'); if (!S) return;
    const types = visibleCards(S);
    p.hidden = types.length === 0; G.cardsKey = types.join(',') + '|' + (G.placing || '') + '|' + (G.selected || '');
    p.innerHTML = ''; p.scrollLeft = 0; for (const k in cards) delete cards[k];
    if (G.placing) {
      const def = C.BUILDINGS[G.placing];
      p.innerHTML = `<div class="inspector placing"><span><b>Place the ${def.name.toLowerCase()}</b><small>Tap a glowing spot. Brighter means a shorter trip to the bite.</small></span><button type="button" class="x" id="cancel-place" aria-label="Cancel">×</button></div>`;
      $('cancel-place').addEventListener('click', () => { G.placing = null; audio.play('click'); renderPanel(); });
      return;
    }
    // an executive post: who holds it, how well, and the next candidate (most senior first)
    const post = typeof G.selected === 'string' ? { job: 'gm', div: G.selected.slice(3) } : (() => { const b = G.selected && S.buildings.find((x) => x.id === G.selected); return b && b.type === 'lookout' ? { job: 'lookout', div: sim.divOf(S, b).id } : null; })();
    if (post && S.divisions[post.div]) {
      const D = S.divisions[post.div], cur = S.workers.find((w) => w.job === post.job && sim.divOf(S, w) === D), list = sim.candidates(S, post.job, post.div), nxt = list.length ? list[(list.indexOf(cur) + 1) % list.length] : null;
      const rk = (w) => C.CAREER[sim.rankOf(S, w)].name, how = post.job === 'gm' ? `reads his sleep ${sim.gmLag(S, D).toFixed(1)} s late` : `paperwork ${Math.round(C.ECON.lookoutReport[Math.min(sim.derived(S).divs[D.id].lookout, C.ECON.lookoutReport.length) - 1] * sim.execOf(S, D, 'lookout'))} s`;
      p.innerHTML = `<div class="inspector" title="Veterans do the job better, and are missed on the skin."><span><b>${post.job === 'gm' ? 'General Manager' : 'Lookout'}${multi(S) ? ` · ${C.DIVISIONS[post.div].short}` : ''}</b><small>${cur ? `${cur.name}, ${rk(cur)} · ${how}` : 'Vacant'}</small></span><button type="button" class="up" id="appoint" ${nxt && nxt !== cur ? '' : 'disabled'}>${nxt && nxt !== cur ? `Appoint ${nxt.name.split(' ')[0]} (${rk(nxt)})` : 'No one else'}</button><button type="button" class="x" id="deselect" aria-label="Close">×</button></div>`;
      $('appoint').addEventListener('click', () => { if (nxt) { sim.appoint(S, post.job, post.div, nxt.id); audio.play('click'); drainEvents(); saveDay(); renderPanel(); } });
      $('deselect').addEventListener('click', () => { G.selected = null; audio.play('click'); renderPanel(); });
      return;
    }
    const sb = G.selected && S.buildings.find((x) => x.id === G.selected);
    if (sb) {
      const def = C.BUILDINGS[sb.type], cost = sim.upgradeCost(sb), extra = sb.type === 'tank' || sb.type === 'drip' ? ` · trip ${sim.tripSeconds(S, sb).toFixed(1)} s` : '';
      p.innerHTML = `<div class="inspector"><span><b>${def.name} · Lv ${sb.level}</b><small>${def.effect(sb.level)}${extra}. ${def.blurb}</small></span><button type="button" class="up" id="upgrade" ${cost === Infinity ? 'disabled' : ''}>${cost === Infinity ? 'Fully upgraded' : `Upgrade · ${fmt(cost)} BU`}</button><button type="button" class="x" id="deselect" aria-label="Close">×</button></div>`;
      $('upgrade').addEventListener('click', () => { sim.upgrade(S, sb.id); drainEvents(); renderPanel(); });
      $('deselect').addEventListener('click', () => { G.selected = null; audio.play('click'); renderPanel(); });
      return;
    }
    types.forEach((type, i) => {
      if (type === 'policy') { const pol = S.gmPolicy[S.focus] || 'standard', b = document.createElement('button'); b.type = 'button'; b.className = 'card gmpol'; b.id = 'build-policy'; b.title = C.NOTES.policyHint[pol]; b.innerHTML = `<b>GM · ${C.DIVISIONS[S.focus].short}</b><small>${C.NOTES.policyName[pol]}</small><span>Tap to change</span>`; b.addEventListener('click', cyclePolicy); p.append(b); return; }
      const def = C.BUILDINGS[type], b = document.createElement('button'); b.type = 'button'; b.className = 'card'; b.id = `build-${type}`;
      b.innerHTML = `<b>${divTag(S, type) ? def.short + divTag(S, type) : def.name}</b><small>${def.gain}</small><span></span>`; b.title = `${def.blurb} (${i + 1})`;
      if (fresh.has(type)) b.classList.add('fresh');
      b.addEventListener('click', () => pickCard(type)); p.append(b); cards[type] = b;
    });
    updateCards();
    const neu = types.find((t) => fresh.has(t)); if (neu && cards[neu]) cards[neu].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: R.fx.reduced ? 'auto' : 'smooth' });
  }
  // a card goes away once there is nothing left to buy (the floor, the drip line)
  function visibleCards(S) {
    const list = C.BUILD_ORDER.filter((t) => S.unlocked.includes(t) && !(C.BUILDINGS[t].acquiredOnly && sim.div(S) === sim.home(S)) && !((C.BUILDINGS[t].expand || C.BUILDINGS[t].maxLevel === 1 || C.BUILDINGS[t].acquire) && sim.costOf(S, t, S.focus) === Infinity));
    return S.phase === 'day' && multi(S) ? ['policy'].concat(list) : list;
  }
  const divTag = (S, type) => (multi(S) && C.DIVISION_BUILDINGS.includes(type) ? ` · ${C.DIVISIONS[S.focus].short}` : '');
  function cyclePolicy() { const S = G.S, order = ['lie', 'standard', 'aggressive'], cur = S.gmPolicy[S.focus] || 'standard'; sim.setPolicy(S, S.focus, order[(order.indexOf(cur) + 1) % 3]); audio.play('click'); saveDay(); G.cardsKey = ''; }
  function pickCard(type) {
    const S = G.S; if (!S || S.state !== 'playing') return; audio.start(); if (fresh.delete(type)) G.cardsKey = '';
    const cost = sim.costOf(S, type, S.focus);
    if (!(cost <= S.bank)) { S.events.push({ type: 'deny', what: type, cost }); drainEvents(); return; }
    if (C.BUILDINGS[type].single || C.BUILDINGS[type].acquire || !sim.freePads(S).length) { sim.build(S, type, null, S.focus); drainEvents(); renderPanel(); return; }
    audio.play('click'); G.selected = null; G.placing = type; renderPanel();
  }
  function placeAt(pad) { const S = G.S, type = G.placing; if (!S || !type) return; G.placing = null; sim.build(S, type, pad); drainEvents(); renderPanel(); }
  // last night's bottleneck, on the cards: what would have helped, and what would not
  const CAPACITY = ['tank', 'refinery', 'pool', 'rig', 'drip', 'plant'], BOTTLENECK = { storage: ['tank', 'refinery', 'drip'], spots: ['rig'], staff: ['pool'], hazards: ['lookout'] };
  function updateCards() {
    const S = G.S, d = sim.derived(S);
    for (const type in cards) {
      const def = C.BUILDINGS[type], cost = sim.costOf(S, type, S.focus), el = cards[type], mine = def.single && S.buildings.find((b) => b.type === type && (!C.DIVISION_BUILDINGS.includes(type) || (b.div || 'arm') === S.focus));
      const own = def.single ? (mine ? `Lv ${mine.level}` : 'new') : d.counts[type] ? `×${d.counts[type]}` : 'new';
      const up = !def.single && !sim.freePads(S).length && cost !== Infinity, cheap = up ? sim.cheapestUpgrade(S, type) : null, price = cost === Infinity ? (def.single ? `Max · ${own}` : `Maxed · ${own}`) : up ? `${fmt(cost)} BU · ${own}` : `${fmt(cost)} BU · ${own}`;
      const lim = save.campaign.constraint, hint = !lim ? null : lim === 'host' && CAPACITY.includes(type) ? 'Host is the limit' : (BOTTLENECK[lim] || []).includes(type) ? 'The bottleneck' : null;
      const owned = !!mine, sub = hint && cost !== Infinity ? hint : up ? (cheap ? `Upgrade one to Lv ${cheap.level + 1}` : 'Upgrade one') : owned && cost === Infinity && def.requires ? def.effect(mine.level) : owned && def.upgradeGain ? (typeof def.upgradeGain === 'function' ? def.upgradeGain(mine.level) : def.upgradeGain) : def.gain; if (el._sub !== sub) { el._sub = sub; el.children[1].textContent = sub; el.classList.toggle('hinted', !!hint && sub === hint); el.classList.toggle('limit', sub === 'Host is the limit'); }
      if (el._price !== price) { el._price = price; el.children[2].textContent = price; }
      el.classList.toggle('can', cost <= S.bank);
    }
  }

  // ---------- input: press and hold anywhere to bite; a quick tap on a building inspects it ----------
  function inPlay() { return G.mode === 'play' && G.S && G.S.state === 'playing' && !G.modal && !G.paused; }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  // two fingers pinch the camera; the second finger cancels the bite the first one started
  const touches = new Map();
  const spread = () => { const p = [...touches.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  cv.addEventListener('pointerdown', (e) => { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2 && G.mode === 'play') { if (G.press) { G.press = null; if (G.S) sim.setHold(G.S, false); } G.pinch = { d: spread(), z: G.zoom }; } }, true);
  cv.addEventListener('pointermove', (e) => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (G.pinch && touches.size >= 2) { G.zoom = Math.max(0.6, Math.min(2.2, G.pinch.z * spread() / Math.max(10, G.pinch.d))); } });
  const lift = (e) => { touches.delete(e.pointerId); if (touches.size < 2) G.pinch = null; };
  ['pointerup', 'pointercancel'].forEach((k) => cv.addEventListener(k, lift, true));
  cv.addEventListener('wheel', (e) => { if (G.mode !== 'play') return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    audio.start(); if (G.pinch) return;
    if (G.mode === 'opening') { endOpening(); return; }
    if (!inPlay()) return;
    if (G.placing) { const pad = R.pickPad(view(), G.S, e.clientX, e.clientY); if (pad >= 0) placeAt(pad); else audio.play('deny'); return; }
    G.press = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    sim.setHold(G.S, true);
  });
  function release(e) {
    const p = G.press; if (!p || (e && e.pointerId !== p.id)) return; G.press = null;
    if (G.S) sim.setHold(G.S, false);
    if (e && inPlay() && performance.now() - p.at < 260 && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 14) {
      const b = R.pick(view(), G.S, e.clientX, e.clientY);
      if (b) { G.selected = b.id; audio.play('click'); renderPanel(); } else if (G.selected) { G.selected = null; renderPanel(); }
    }
  }
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release); cv.addEventListener('lostpointercapture', release);

  $('recall').addEventListener('click', () => { if (G.S) { sim.recall(G.S); drainEvents(); } });
  function switchFloor() { const S = G.S; if (!S || !multi(S) || G.mode !== 'play') return; const order = S.divOrder, i = order.indexOf(S.focus); sim.setFocus(S, order[(i + 1) % order.length]); audio.play('click'); G.shown.pv = null; G.cardsKey = ''; G.selected = null; }
  $('p-staff').addEventListener('click', switchFloor); $('p-staff').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchFloor(); } });
  function setPush(on) { if (!G.S || G.S.phase === 'day') return; sim.setPush(G.S, on); drainEvents(); }
  $('ease').addEventListener('click', () => setPush(false)); $('push').addEventListener('click', () => setPush(true));
  $('pause').addEventListener('click', () => setPaused(true)); $('resume').addEventListener('click', () => setPaused(false));
  $('mute').addEventListener('click', () => { save.settings.muted = !save.settings.muted; applyMute(); store(); });
  function applyMute() { audio.setMuted(save.settings.muted); $('mute').setAttribute('aria-pressed', String(save.settings.muted)); $('mute').setAttribute('aria-label', save.settings.muted ? 'Unmute sound' : 'Mute sound'); }
  $('clock-in').addEventListener('click', clockIn); $('again').addEventListener('click', () => { audio.start(); audio.play('click'); if (save.campaign.leaseEnded) showAnnual(); else startDay(); });
  // the annual report: the lease is over; the company moves with him to a new host
  function showAnnual() {
    const c = save.campaign, a = C.NOTES.annual(c.hostTotals, c.host.n);
    $('annual-eyebrow').textContent = `Annual report · host #${c.host.n} · ${C.ECON.leaseNights} nights`; $('annual-h').textContent = a.title; $('annual-note').textContent = a.note;
    const g = $('annual-grid'); g.innerHTML = ''; for (const [k, v] of a.grid) { const el = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; el.append(dt, dd); g.append(el); }
    $('annual-sub').textContent = `The company keeps its staff, buildings, divisions and blood. He keeps nothing: his successor has never seen a mosquito.`;
    $('hud').hidden = true; document.body.classList.remove('is-title'); openModal('annual');
  }
  $('relocate').addEventListener('click', () => { audio.play('click'); save.campaign = K.relocate(save.campaign); store(); closeModal(); startDay(); }); $('nightfall').addEventListener('click', nightfall); $('to-title').addEventListener('click', toTitle);
  $('skip').addEventListener('click', (e) => { e.stopPropagation(); audio.start(); endOpening(); });
  $('cine').addEventListener('pointerdown', () => { audio.start(); endOpening(); });
  $('open-handbook').addEventListener('click', () => { audio.start(); audio.play('click'); openModal('handbook'); }); $('pause-handbook').addEventListener('click', () => openModal('handbook'));
  $('close-handbook').addEventListener('click', () => closeModal()); $('open-reviews').addEventListener('click', () => { audio.start(); audio.play('click'); showRecords(); }); $('close-reviews').addEventListener('click', () => closeModal());
  $('clock-out').addEventListener('click', () => { G.paused = false; audio.hold(false); closeModal(true); sim.wake(G.S); drainEvents(); });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; const k = e.key.toLowerCase();
    if (G.mode === 'opening') { if (!e.repeat && (k === 'escape' || k === 'enter' || k === ' ')) { e.preventDefault(); endOpening(); } return; }
    if (e.repeat) return;
    if (k === 'm') { $('mute').click(); return; }
    if (k === 'escape') { if (G.modal === 'pause-menu') setPaused(false); else if (G.modal === 'handbook' || G.modal === 'reviews') closeModal(); else if (G.placing) { G.placing = null; renderPanel(); } else if (G.mode === 'play') setPaused(true); return; }
    if (G.modal) return;
    if (G.mode === 'title') { if ((k === ' ' || k === 'enter') && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); clockIn(); } return; }
    if (k === 'p') setPaused(!G.paused);
    else if (k === 'b' && inPlay()) sim.setHold(G.S, true);
    else if (k === 'f' && G.S && G.S.unlocked.includes('push')) setPush(G.S.pace !== 2);
    else if (k === 'tab' && G.S && multi(G.S)) { e.preventDefault(); switchFloor(); }
    else if (k === ' ') { e.preventDefault(); if (G.S && G.S.unlocked.includes('scatter')) $('recall').click(); }
    else if (k === 'n' && G.S && G.S.phase === 'day') nightfall();
    else if ((k === '=' || k === '+') && G.mode === 'play') zoomBy(1.15); else if ((k === '-' || k === '_') && G.mode === 'play') zoomBy(1 / 1.15);
    else if (k >= '1' && k <= '6' && G.S) { const t = visibleCards(G.S)[Number(k) - 1]; if (t) pickCard(t); }
  });
  addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'b' && G.S) sim.setHold(G.S, false); });
  addEventListener('blur', () => { if (G.S) sim.setHold(G.S, false); G.press = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play' && !G.paused) setPaused(true); });

  // ---------- events from the sim: every one answers on screen and in sound ----------
  function flash(id, cls) { const el = $(id); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function saveDay() { if (G.S && G.S.phase === 'day') { save.campaign = K.foldDay(save.campaign, G.S, false); store(); } }
  function drainEvents() {
    const S = G.S; if (!S) return;
    for (const e of S.events) {
      R.onEvent(S, e);
      switch (e.type) {
        case 'memo': if (e.tone === 'idle' && G.memoQ.length) break; if (e.tone === 'idle' || e.tone === 'info') G.memoQ.push(e); else { G.memoQ = [e]; G.memoUntil = 0; } break;
        case 'unlock': if (e.what === 'push') { /* shown by the HUD */ } else if (e.what === 'scatter') { $('recall').hidden = false; flash('recall', 'arrive'); } else { audio.play('hatch'); fresh.add(e.what); } G.cardsKey = ''; break;
        case 'expand': audio.play('coin'); setTimeout(() => audio.play('thud'), C.FEEL.build_drop_ms); flash('p-bank', 'pulse'); G.cardsKey = ''; saveDay(); break;
        case 'build': saveDay(); audio.play('coin'); setTimeout(() => audio.play('thud'), C.FEEL.build_drop_ms); flash('p-bank', 'pulse'); G.cardsKey = ''; break;
        case 'deny': if (e.what === 'day') { G.flashCoach = { text: C.NOTES.dayBite, until: performance.now() / 1000 + 2.2 }; break; } audio.play('deny'); if (e.what === 'recall') flash('recall', 'deny'); else if (e.what === 'full') { flash('p-bank', 'deny'); } else if (cards[e.what]) { const c = cards[e.what]; c.classList.remove('deny'); void c.offsetWidth; c.classList.add('deny'); flash('p-bank', 'deny'); } break;
        case 'deliver': audio.play(e.founder ? 'plip' : 'plip', e.founder ? 0 : 0.09); if (e.first) audio.play('hatch'); if (e.founder) flash('p-bank', 'pulse'); break;
        case 'takeoff': audio.play('buzz', 0.2); break;
        case 'full': audio.play('click'); break;
        case 'telegraph': if (HZ[e.kind]) { audio.play('warn'); $('recall').classList.add('alarm'); } break;
        case 'impact': $('recall').classList.remove('alarm'); if (HZ[e.kind]) { audio.play('hit'); if ((e.kind === 'swat' || e.kind === 'kick') && !R.fx.reduced && (!e.div || e.div === S.focus)) G.hitStop = C.FEEL.hit_stop_ms / 1000; flash('p-clock', 'pulse'); if (e.dead.length) flash('p-staff', 'deny'); } break;
        case 'recall': audio.play('whistle'); if (e.by === 'lookout') G.lookoutFlash = performance.now() / 1000; break;
        case 'push': audio.play(e.on ? 'buzz' : 'click'); break;
        case 'acquire': audio.play('quota'); audio.play('stamp'); G.cardsKey = ''; G.focusCoachAt = performance.now() / 1000; saveDay(); break;
        case 'lend': G.cardsKey = ''; break;
        case 'hatch': audio.play('hatch', 0.5); flash('p-staff', 'pulse');
          if (e.first) { audio.play('quota'); audio.play('stamp'); G.hireAt = performance.now() / 1000; if (!R.fx.reduced) { G.slow = 1.4; G.punch = { f: [e.at[0], e.at[1], 1.4], until: performance.now() / 1000 + 2.4 }; } }
          break;
        case 'wake': audio.play('alarm'); audio.music(false); document.body.classList.add('morning'); G.placing = null; if (G.modal) closeModal(true); break;
        case 'over': finish(); break;
      }
    }
    S.events.length = 0;
  }

  // ---------- the morning ----------
  function finish() {
    const S = G.S, r = sim.report(S), before = save.campaign;
    save.campaign = K.fold(before, S, r); store();
    const news = save.campaign.news || {}, ln = K.leaseNight(Object.assign({}, before, { night: r.night }));
    $('review-eyebrow').textContent = `${C.MORNING.lease(ln, C.ECON.leaseNights)} · 6:30 AM`; $('review-h').textContent = news.fumigation ? C.MORNING.restructureHead : C.MORNING.headline(r); $('review-note').textContent = news.fumigation ? C.MORNING.fumigatedNote : C.MORNING.note(r);
    // after a restructuring the morning counts the company that is left, not the one that went to bed
    const fum = news.fumigation, crew = fum ? save.campaign.workers : S.workers;
    $('r-extracted').textContent = `${fmt(r.extracted)} BU`; $('r-manual').textContent = `${fmt(r.manual)} BU`; $('r-auto').textContent = `${fmt(r.auto)} BU`;
    $('r-banked').textContent = `${fmt(fum ? save.campaign.bank : r.banked)} BU`; $('r-staff').textContent = String(crew.length); $('r-lost').textContent = String(r.lost.length + (fum ? fum.lost.length : 0));
    const names = crew.map((w) => w.name), shown = names.slice(0, 6);
    $('r-staff-list').textContent = names.length > 6 ? `${shown.join(', ')} and ${names.length - 6} more.` : names.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}.` : `${shown[0] || ''}.`;
    $('r-payroll').hidden = crew.length === 0;
    { const m = news.morale; const show = m && (m.night < 62 || m.after < 62); $('r-morale').hidden = !show; if (show) $('r-morale').textContent = C.MORNING.morale(m.after, m.after - m.before); }
    { const c = news.costs; $('r-costs').hidden = !c; if (c) $('r-costs').textContent = C.MORNING.costs(c); }
    { const h = news.host; $('r-host').hidden = !h || r.night < 2; if (h) $('r-host-text').textContent = C.MORNING.hostLine(h, C.ECON.leaseNights - K.leaseNight(save.campaign) + 1); }
    const promo = (news.promotions || []).filter((p) => crew.some((w) => w.name === p.name)), pl = $('r-promo-list'); $('r-promo').hidden = !promo.length; pl.innerHTML = '';
    for (const p of promo.slice(0, 4)) { const l = document.createElement('li'); l.textContent = `${p.name} `; const sp = document.createElement('span'); sp.textContent = `→ ${p.rank}`; l.append(sp); pl.append(l); }
    if (promo.length > 4) { const l = document.createElement('li'); l.textContent = `and ${promo.length - 4} more.`; pl.append(l); }
    const list = $('r-lost-list'); list.innerHTML = ''; for (const w of r.lost) { const l = document.createElement('li'); l.textContent = `${w.name} `; const s = document.createElement('span'); s.textContent = `· ${w.rank ? `${C.CAREER[w.rank].name} · ` : ''}${w.trait} · supported ${w.larvae} larvae`; l.append(s); list.append(l); }
    $('r-memoriam').hidden = r.lost.length === 0;
    const clot = C.MORNING.clot(r); $('r-clot').hidden = !clot; $('r-clot').textContent = clot;
    // each division's night, then the suspicion breakdown: where it came from, what he forgets, what happens next
    const dv = $('r-divs'); dv.hidden = r.divisions.length < 2; dv.innerHTML = '';
    for (const x of r.divisions) { const el = document.createElement('div'), b = document.createElement('b'), st = document.createElement('strong'), sp = document.createElement('span'); b.textContent = C.DIVISIONS[x.id].name; st.textContent = `${fmt(x.extracted)} BU`; sp.textContent = C.MORNING.divisionLine(fum ? Object.assign({}, x, { staff: crew.filter((w) => w.div === x.id).length }) : x).replace(/^[^·]+· /, ''); el.append(b, st, document.createElement('br'), sp); dv.append(el); }
    const fm = news.fumigation; $('r-fum').hidden = !fm; if (fm) { $('r-fum-text').textContent = C.MORNING.restructure(fm); $('r-fum-note').textContent = C.MORNING.restructureNote; }
    const sv = news.suspicion, sl = $('r-sus-list'); sl.innerHTML = '';
    const row = (label, v, cls) => { const li = document.createElement('li'), i = document.createElement('i'); if (cls) li.className = cls; li.textContent = label; i.textContent = v; li.append(i); sl.append(li); };
    if (sv) {
      row('Yesterday', `${Math.round(sv.before)}%`);
      for (const p of sv.parts) if (p.v >= 0.5) row(C.MORNING.susLabel(p), `+${Math.round(p.v)}`);
      row(C.MORNING.susForget, `−${Math.round(sv.forget)}`, 'minus');
      row(fm ? 'After the restructuring' : 'Today', `${Math.round(save.campaign.suspicion)}%`, 'total');
    }
    const nc = save.campaign.newCounter, bk = save.campaign.booking;
    $('r-sus').textContent = news.cancelled ? C.MORNING.cancelled : nc ? C.MORNING.bought(sv ? sv.raw : 0, nc) : C.MORNING.susStatus({ booking: bk !== null, nightsLeft: bk !== null ? bk - r.night + 0 : 0, cancelBelow: C.ECON.cancelBelow, next: K.nextCounter(save.campaign) });
    $('r-sus').classList.toggle('alarm', !!nc || bk !== null);
    // what held us back: the most expensive causes first, each with what would fix it
    const hl = $('r-held-list'), held = C.MORNING.held(r); hl.innerHTML = '';
    if (!held.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = C.MORNING.heldNone; hl.append(li); }
    for (const h of held) { const li = document.createElement('li'), sp = document.createElement('span'); li.textContent = h.text; sp.textContent = h.fix; li.append(sp); hl.append(li); }
    const plan = $('r-plan'); plan.innerHTML = ''; (save.campaign.leaseEnded ? [C.NOTES.leaseOver] : K.plan(save.campaign)).forEach((t) => { const l = document.createElement('li'); l.textContent = t; plan.append(l); });
    $('again').textContent = save.campaign.leaseEnded ? 'READ THE ANNUAL REPORT' : 'START THE DAY'; $('hud').hidden = true;
    openModal('review'); $('review').setAttribute('data-ready', '');
  }

  // ---------- per-frame HUD ----------
  function clock(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
  const set = (id, v) => { if (G.shown[id] !== v) { G.shown[id] = v; $(id).textContent = v; } };
  const show = (id, on) => { const k = 'vis-' + id; if (G.shown[k] !== on) { G.shown[k] = on; $(id).hidden = !on; if (on) flash(id, 'arrive'); } };
  function coachText(S, now) {
    const f = S.founder, tut = S.tut, threat = sim.divs(S).find((D) => hazardAt(S, D)), scatter = threat && S.unlocked.includes('scatter');
    if (scatter && (threat.hev.tutorial || S.night <= 2 || (multi(S) && threat.id !== S.focus))) return [multi(S) ? `${C.DIVISIONS[threat.id].short}: ${threat.hev.kind}! SCATTER` : 'Press SCATTER!', 'alarm'];
    if (multi(S) && G.focusCoachAt !== undefined && now - G.focusCoachAt < 9) return [C.NOTES.focusCoach];
    if (G.flashCoach && now < G.flashCoach.until) return [G.flashCoach.text, 'warn'];
    if (G.placing) return null;
    if (S.phase === 'day') return S.night === 2 && now - G.dayAt < 9 ? ['No clock while he is at work. Build, then tap Nightfall.'] : null;
    if (f.st === 'drink' && f.belly >= C.ECON.bellyMl - 0.05) return ['Full. Let go to fly it home.', 'warn'];
    if (S.rhythm && S.state === 'playing') {
      if (S.depth < 0.35 && S.pace === 2) return ['Light sleep: ease off!', 'warn'];
      if (S.night === 2 && S.depth > 0.6 && S.pace !== 2) return ['Deep sleep. Push now.'];
      if (S.night === 2 && S.depth < 0.35) return ['Light sleep. Easing off keeps him under.'];
    }
    if (S.phase === 'day' && S.counters) { const a = C.ECON.counters.find((k) => S.counters[k.id] && !S.buildings.some((b) => b.type === k.answer)); if (a) return [`He bought a ${a.id === 'fan' ? 'fan' : 'repellent'}. Build ${C.BUILDINGS[a.answer].name} to answer it.`, 'warn']; }
    if (!tut) return null;
    const idle = f.st === 'home' && now - G.idleAt > 3.5;
    if (tut.step === 'bite') return f.st === 'drink' ? ['Keep holding. Watch her fill up.'] : ['Press and hold anywhere to bite'];
    if (tut.step === 'fill') return idle ? ['Hold to bite. Let go to bring it home.'] : null;
    if (tut.step === 'tank') return ['Storage is full. Tap Storage tank below.'];
    if (tut.step === 'pool') { const c = sim.costOf(S, 'pool'); return c <= S.bank ? ['Tap Breeding pool below. You need staff.'] : idle ? [`Bite until you have ${c} BU for a breeding pool.`] : null; }
    if (tut.step === 'eggs') return ['Eggs are hatching…'];
    if (tut.step === 'crew' && now - G.hireAt < 7) return ['Your first employee works on their own. Watch.'];
    return null;
  }
  function updateHud(dt, now) {
    const S = G.S, d = sim.derived(S), f = S.founder;
    if (f.st !== 'home' || S.hold) G.idleAt = now;
    G.bankShown = G.bankShown === undefined || Math.abs(S.bank - G.bankShown) < 0.6 ? S.bank : G.bankShown + (S.bank - G.bankShown) * Math.min(1, dt / (C.FEEL.counter_ease_ms / 1000) * 2.2);
    // before a refinery: what is stored / what the tanks hold. After: everything spendable, with the tanks' raw fill as a gauge
    const hasRef = S.buildings.some((b) => b.type === 'refinery'), rawNow = sim.raw(S), tanksFull = rawNow >= d.cap - 0.5;
    set('v-bank', fmt(Math.floor(G.bankShown))); set('v-cap', hasRef ? '' : `/${fmt(d.cap)}`);
    const rate = Math.round(S.rate / 5) * 5; show('v-rate', rate > 0); if (rate > 0) set('v-rate', `+${rate} BU/min`);
    $('p-bank').classList.toggle('full', tanksFull);
    if (S.phase === 'day') { set('l-clock', 'At work'); set('v-clock', `Day ${S.night - 1}`); }
    else { set('l-clock', 'Alarm in'); set('v-clock', clock(S.shiftLen - S.sleepLost - S.time)); $('p-clock').classList.toggle('cut', S.shiftLen - S.sleepLost - S.time < 20); }
    show('p-refined', hasRef); if (hasRef) { const w = Math.round((rawNow / Math.max(1, d.cap)) * 100); if (G.shown.rw !== w) { G.shown.rw = w; $('b-refined').style.width = w + '%'; $('p-refined').title = `Tanks ${Math.floor(rawNow)}/${d.cap} BU raw · ${Math.floor(S.refined)} BU refined`; } }
    show('p-staff', S.hires > 0 || S.workers.length > 0);
    if (multi(S)) {
      const mine = S.workers.filter((w) => (w.lent || w.div) === S.focus).length, other = sim.divs(S).find((D) => D.id !== S.focus);
      if (G.shown['l-staff'] !== S.focus) { G.shown['l-staff'] = S.focus; $('l-staff').innerHTML = `${C.DIVISIONS[S.focus].short}<i class="wide"> staff</i>`; } set('v-staff', String(mine)); set('v-housing', `/${d.divs[S.focus].crewCap}`);
      const ps = $('p-staff'); if (!ps.classList.contains('switch')) { ps.classList.add('switch'); ps.setAttribute('role', 'button'); ps.tabIndex = 0; }
      if (other && ps.dataset.to !== other.id) { ps.dataset.to = other.id; ps.setAttribute('aria-label', `On the ${C.DIVISIONS[S.focus].short.toLowerCase()} floor. Switch to the ${C.DIVISIONS[other.id].short.toLowerCase()}`); }
      ps.classList.toggle('alert', !!(other && hazardAt(S, other)));
    } else { if (G.shown['l-staff'] !== 'Staff') { G.shown['l-staff'] = 'Staff'; $('l-staff').textContent = 'Staff'; } set('v-staff', String(S.workers.length)); set('v-housing', `/${Math.min(d.housing, d.crewCap)}`); const ps = $('p-staff'); if (ps.classList.contains('switch')) { ps.classList.remove('switch', 'alert'); ps.removeAttribute('role'); ps.removeAttribute('tabindex'); ps.removeAttribute('aria-label'); delete ps.dataset.to; } }
    // one plate, two jobs: his sleep and itch at night; his suspicion (and when he next buys something) in the day
    const day = S.phase === 'day', sus = save.campaign.suspicion, nxt = K.nextCounter(save.campaign);
    show('p-irr', day ? S.night > 2 || sus > 0 : S.unlocked.includes('scatter'));
    const bk = save.campaign.booking, lab = day ? (bk !== null ? `Booked ${Math.max(0, bk - S.night + 1)}n` : 'Suspicion') : S.rhythm ? (S.depth < 0.35 ? 'Light' : S.depth > 0.6 ? 'Deep' : 'Sleep') : 'Itch'; set('l-irr', lab);
    $('p-irr').classList.toggle('light', !day && S.rhythm && S.depth < 0.35); $('p-irr').classList.toggle('deep', !day && S.rhythm && S.depth > 0.6);
    const ip = Math.round(day ? sus : S.irritation); if (G.shown.ip !== ip + (day ? 'd' : 'n')) { G.shown.ip = ip + (day ? 'd' : 'n'); $('b-irr').style.width = ip + '%'; $('p-irr').querySelector('u').style.left = `${day ? (nxt ? nxt.at : 100) : C.ECON.eventThreshold}%`; }
    show('pace', !day && S.unlocked.includes('push')); const pv = String(S.pace === 2); if (G.shown.pv !== pv) { G.shown.pv = pv; $('push').setAttribute('aria-pressed', pv); $('ease').setAttribute('aria-pressed', String(S.pace !== 2)); }
    // the lookout's state, under the Scatter button: ready, or how long the paperwork has left
    const lw = S.workers.find((w) => w.job === 'lookout'), ls = $('lookout-state'), lt = lw ? (S.lookoutCd > 0 ? `Form 7-B · ${Math.ceil(S.lookoutCd)}s` : 'Lookout ready') : '';
    if (G.shown.lt !== lt) { G.shown.lt = lt; ls.hidden = !lt; ls.textContent = lt; ls.classList.toggle('busy', S.lookoutCd > 0); }
    const rc = $('recall'), cd = S.recallCd > 0; rc.classList.toggle('cooling', cd); rc.style.setProperty('--cd', cd ? `${(S.recallCd / (C.FEEL.recall_cooldown_s * S.mods.recallCd)) * 100}%` : '0%');
    if (!sim.divs(S).some((D) => hazardAt(S, D))) rc.classList.remove('alarm');
    const ct = coachText(S, now), coach = $('coach'), txt = ct ? ct[0] : '';
    if (G.shown.coach !== txt) { G.shown.coach = txt; coach.hidden = !ct; if (ct) { coach.textContent = txt; coach.className = `coach ${ct[1] || ''}`; flash('coach', 'arrive'); } }
    const key = visibleCards(S).join(',') + '|' + (G.placing || '') + '|' + (G.selected || '');
    if (key !== G.cardsKey) renderPanel();
    if (now - G.uiAt > 0.2) { G.uiAt = now; if (!G.placing && !G.selected) updateCards(); const up = $('upgrade'); if (up && G.selected) { const b = S.buildings.find((x) => x.id === G.selected); if (b) up.classList.toggle('can', sim.upgradeCost(b) <= S.bank); } }
    if (f.st === 'drink' && f.belly < C.ECON.bellyMl - 0.05) audio.play('slurp', 0.3);
    // memos: Rhonda's sticky notes
    const m = $('memo');
    if (now >= G.memoUntil) { const e = G.memoQ.shift(); if (e) { m.hidden = false; $('memo-text').textContent = e.text; m.className = 'memo'; void m.offsetWidth; m.className = `memo fresh ${e.tone}`; G.memoUntil = now + (e.tone === 'idle' ? 4.5 : 5.5); } else if (!m.hidden) m.classList.add('old'); }
  }

  // ---------- camera: tight on the founder at first, opening up as the colony grows ----------
  function playCam(S) {
    if (G.placing || !S) return { f: [6.8, 6.2, 0.6], z: 1, k: 0 }; // placing: the whole floor, every pad
    const narrow = Math.max(0, Math.min(1, (760 - stageRect().width) / 340)), n = S.buildings.length - 1 + Math.min(S.workers.length, 6) * 0.25;
    let base;
    if (S.phase === 'day') base = { f: [6.8, 6.0, 1.2], z: 1.12 + 0.1 * narrow, k: 0.6 };
    // the first minutes: a phone needs the close-up to read one mosquito
    else if (n < 3) { const z = 1 + ((n < 0.5 ? 1.7 : n < 1.5 ? 1.42 : 1.2) - 1) * narrow; base = { f: [6.4, 5.3, 1.6], z, k: z > 1.01 ? 0.85 : 0 }; }
    // after that, close on the floor you are on: switching floors pans the camera across the bed
    else { const k = C.SITES[sim.div(S).site].skin; base = { f: [k[0] * 0.55 + 6.6 * 0.45, k[1] * 0.55 + 5.6 * 0.45, 2.0], z: 1.3 + 0.22 * narrow, k: 0.85 }; }
    // pinch, the wheel or +/- scale it; all the way out shows the whole room
    const z = Math.max(0.92, Math.min(3, base.z * G.zoom)), k = base.k * Math.max(0, Math.min(1, (z - 0.92) / 0.35));
    return { f: base.f, z, k };
  }
  function zoomBy(f) { G.zoom = Math.max(0.6, Math.min(2.2, G.zoom * f)); }
  function stageRect() {
    if (G.mode === 'title') return $('title-stage').getBoundingClientRect();
    if (G.mode === 'opening') return { left: 0, top: innerHeight * 0.08, width: innerWidth, height: innerHeight * 0.72 };
    return $('stage').getBoundingClientRect();
  }
  let lastView = null;
  function view() { return lastView || R.place(stageRect()); }
  function stepView(dt, now) {
    const r = stageRect(), b = R.place(r), a = 1 - Math.exp(-dt * 5);
    if (!G.base || dt === 0) G.base = b; else G.base = { s: G.base.s + (b.s - G.base.s) * a, cx: G.base.cx + (b.cx - G.base.cx) * a, cy: G.base.cy + (b.cy - G.base.cy) * a };
    let t = G.mode === 'opening' ? cineCam(G.cineT) : G.mode === 'play' ? playCam(G.S) : { f: [7, 6.5, 0], z: 1, k: 0 };
    if (G.punch && now < G.punch.until && G.mode === 'play') t = { f: G.punch.f, z: t.z + 0.3, k: 0.75 }; else G.punch = null;
    if (!G.cam) G.cam = { f: t.f.slice(), z: t.z, k: t.k };
    const c = G.cam, e = 1 - Math.exp(-dt * (G.mode === 'opening' ? 1.6 : 2.4));
    for (let i = 0; i < 3; i++) c.f[i] += (t.f[i] - c.f[i]) * e; c.z += (t.z - c.z) * e; c.k += (t.k - c.k) * e;
    lastView = R.camera(G.base, r, c.f, c.z, c.k);
    return lastView;
  }

  // ---------- frame loop ----------
  function stars(t) { ctx.fillStyle = 'rgba(223,229,255,.5)'; for (let i = 0; i < 40; i++) { const x = (i * 197.3) % innerWidth, y = (i * 89.7) % (innerHeight * 0.6); ctx.globalAlpha = R.fx.reduced ? 0.4 : 0.25 + 0.25 * Math.sin(t + i); ctx.fillRect(x, y, 1.5, 1.5); } ctx.globalAlpha = 1; }
  const STEP = 1 / 30;
  function frame(ms) {
    const now = ms / 1000, dt = Math.min(0.1, now - (G.last || now)); G.last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight); stars(now);
    if (G.mode === 'title') {
      const S = G.demo; G.acc += dt; while (G.acc >= STEP) { G.acc -= STEP; sim.step(S, STEP); S.time = Math.min(S.time, 20); S.irritation = 0; S.events.length = 0; }
      R.draw(ctx, stepView(dt, now), S, now, { demo: true });
    } else if (G.mode === 'opening') {
      G.cineT += dt; caption(G.cineT); if (G.cineT >= C.FEEL.opening_seconds) endOpening();
      if (G.mode === 'opening') R.draw(ctx, stepView(dt, now), G.S, now, { cine: { t: G.cineT } });
    } else if (G.S) {
      const S = G.S;
      if (!G.paused && !(G.modal && G.modal !== 'review')) {
        if (G.hitStop > 0) G.hitStop -= dt;
        else { const k = G.slow > 0 ? 0.35 : 1; G.slow = Math.max(0, G.slow - dt); G.acc += dt * k; let n = 0; while (G.acc >= STEP && n++ < 5) { G.acc -= STEP; sim.step(S, STEP); if (S.events.length) drainEvents(); if (G.hitStop > 0) break; } if (n >= 5) G.acc = 0; }
      }
      if (G.S) { const hint = S.tut && (S.tut.step === 'bite' || (S.tut.step === 'fill' && now - G.idleAt > 3.5)) && S.founder.st === 'home' ? 'hold' : null; R.draw(ctx, stepView(dt, now), S, now, { selected: G.selected, placing: G.placing, hint }); if (S.state === 'playing' && !$('hud').hidden) updateHud(dt, now); }
    }
    requestAnimationFrame(frame);
  }

  // ---------- measurement hooks (PLAYCRAFT, the shot list, the feature checks) ----------
  const fxName = (S) => (S && S.hev && S.hev.kind === 'swat' ? (S.hev.hit ? 'swat-impact' : 'swat-warning') : S && S.hev ? S.hev.kind : null);
  window.__game = {
    get state() { return G.mode === 'title' ? 'title' : G.mode === 'opening' ? 'opening' : G.S.state; }, get phase() { return G.S ? G.S.phase : save.campaign.phase; }, get refined() { return G.S ? Math.floor(G.S.refined) : 0; }, get depth() { return G.S ? G.S.depth : 1; }, get lookout() { const w = G.S && G.S.workers.find((x) => x.job === 'lookout'); return w ? (G.S.lookoutCd > 0 ? 'paperwork' : 'ready') : null; }, get pushing() { return !!(G.S && G.S.pace === 2); }, get suspicion() { return save.campaign.suspicion; }, get counters() { return Object.keys(save.campaign.counters); }, get zones() { return G.S ? G.S.zones : save.campaign.zones; }, get paused() { return G.paused; }, get score() { return G.S ? Math.round(G.S.extracted) : 0; }, get time() { return G.S ? G.S.time : 0; },
    get bank() { return G.S ? Math.floor(G.S.bank) : 0; }, get workers() { return G.S ? G.S.workers.length : 0; }, get buildings() { return G.S ? G.S.buildings.length - 1 : 0; }, get casualties() { return G.S ? G.S.lost.length : 0; }, get focus() { return G.S ? G.S.focus : null; }, get divisions() { return G.S ? G.S.divOrder.slice() : save.campaign.divisions.slice(); },
    get irritation() { return G.S ? G.S.irritation : 0; }, get night() { return G.S ? G.S.night : save.campaign.night; }, get founder() { return G.S ? G.S.founder.st : null; }, get belly() { return G.S ? G.S.founder.belly : 0; },
    get step() { return G.S && G.S.tut ? G.S.tut.step : null; }, get placing() { return G.placing; }, get unlocked() { return G.S ? G.S.unlocked.slice() : []; }, get sleepLeft() { return G.S ? G.S.shiftLen - G.S.sleepLost - G.S.time : 0; }, get fx() { return fxName(G.S); }, get cine() { return G.mode === 'opening' ? G.cineT : null; },
    debug: {
      hold(on) { if (G.S) sim.setHold(G.S, on); },
      bank(ml) { if (G.S) { G.S.bank = Math.min(ml, sim.derived(G.S).cap); } },
      placeBest() { if (G.S && G.placing) { const p = sim.padsByTrip(G.S)[0]; if (p) placeAt(p.pad); } },
      preset(name) {
        const S = G.S; if (!S || name !== 'mid') return;
        S.bank = 1e6; for (const t of ['tank', 'pool', 'tank', 'pool', 'rig']) { if (!S.unlocked.includes(t)) S.unlocked.push(t); const p = sim.padsByTrip(S)[0]; sim.build(S, t, p && p.pad); }
        while (S.workers.length < 6) sim.hire(S, true); S.hires = Math.max(S.hires, 6); if (!S.unlocked.includes('scatter')) S.unlocked.push('scatter'); if (S.tut) { S.tut.step = 'free'; S.tut.scratched = true; }
        S.buildings.forEach((b) => (b.born = -9)); S.bank = 184; S.events.length = 0; S.stats.idleNoteAt = 1e9; G.memoQ = [{ text: C.NOTES.idle[0], tone: 'idle' }]; G.memoUntil = 0; G.cardsKey = '';
      },
      select(what) { const S = G.S; if (!S) return; G.selected = what === 'lookout' ? (S.buildings.find((b) => b.type === 'lookout') || {}).id : what; G.cardsKey = ''; renderPanel(); },
      trigger(what, dv) { const S = G.S; if (!S || S.state !== 'playing') return; if (what === 'swat') { S.hev = null; S.eventCd = 1e9; for (let i = 0; i < 300 && !(i > 30 && S.biting >= 3); i++) { S.siteBlocked = 0; S.covered = 0; S.recallT = 0; S.irritation = Math.min(S.irritation, 20); sim.step(S, STEP); drainEvents(); } S.eventCd = 6; sim.startEvent(S, 'swat'); } else if (what === 'wake') sim.wake(S); else if (['scratch', 'roll', 'blanket', 'stir', 'rub', 'kick'].includes(what)) { const D = sim.div(S, dv); D.hev = null; sim.startEvent(S, what, null, D.id); } drainEvents(); },
    },
  };

  // the identity: palette tokens and the letterhead logo come from assets/brand
  fetch('assets/brand/palette.json').then((r) => (r.ok ? r.json() : null)).then((p) => {
    if (!p) return; const ok = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), root = document.documentElement.style;
    for (const [k, v] of [['background', '--bg'], ['surface', '--surface'], ['primary', '--primary'], ['accent', '--accent'], ['text', '--text']]) if (ok(p[k])) root.setProperty(v, p[k]);
  }).catch(() => {});
  fetch('assets/brand/logo.svg').then((r) => (r.ok ? r.text() : '')).then((txt) => {
    const svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement; if (!svg || svg.nodeName !== 'svg') return;
    svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove()); svg.removeAttribute('width'); svg.removeAttribute('height');
    document.querySelectorAll('.letterhead').forEach((el) => el.append(document.importNode(svg, true)));
  }).catch(() => {});

  applyMute(); titleStatus();
  const ready = () => { $('title').setAttribute('data-ready', ''); requestAnimationFrame(frame); };
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(ready); else ready();
})();
