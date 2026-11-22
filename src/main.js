// Boot, the frame loop, input and the HUD. The rules live in sim.js, the picture in render.js.
(function () {
  'use strict';
  const MA = window.MA, C = MA.config, sim = MA.sim, R = MA.render, audio = MA.audio;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const errorBox = $('error');
  function fail(msg) { errorBox.textContent = `Something went wrong: ${msg}. Reload to restart the shift.`; errorBox.hidden = false; }
  window.addEventListener('error', (e) => fail(e.message || 'unknown error'));
  window.addEventListener('unhandledrejection', (e) => fail((e.reason && e.reason.message) || 'unknown error'));

  // ---------- saved progress (validated on the way in: storage is user-editable) ----------
  const SAVE_KEY = 'murders-acquisitions.v1';
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  function loadSave() {
    const base = { shifts: 0, best: null, reviews: [], muted: false, lastSleeper: -1, seenHint: false };
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!raw || typeof raw !== 'object') return base;
      const rev = (r) => r && typeof r === 'object' && typeof r.rating === 'string' ? { shiftNo: num(r.shiftNo, 1), sleeper: String(r.sleeper || '').slice(0, 60), rating: r.rating.slice(0, 40), score: num(r.score, 0), extracted: num(r.extracted, 0), pct: num(r.pct, 0), casualties: num(r.casualties, 0) } : null;
      return { shifts: num(raw.shifts, 0), best: rev(raw.best), reviews: Array.isArray(raw.reviews) ? raw.reviews.map(rev).filter(Boolean).slice(0, 8) : [], muted: raw.muted === true, lastSleeper: num(raw.lastSleeper, -1), seenHint: raw.seenHint === true };
    } catch (e) { return base; }
  }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode: play on without saving */ } }
  const save = loadSave();

  // ---------- state ----------
  const cv = $('game'), ctx = cv.getContext('2d');
  const G = { mode: 'title', S: null, demo: null, paused: false, selected: null, tab: 'build', hitStop: 0, acc: 0, last: 0, shown: {}, memoQ: [], memoUntil: 0, modal: null, rosterDirty: true, uiAt: 0, fxName: null };
  R.fx.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fit() { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', fit); fit();

  function preset(S, quiet) {
    S.bank = 1e6; ['tank', 'pool', 'hatchery', 'refinery', 'rig', 'pool', 'tank'].forEach((t) => sim.build(S, t));
    while (S.workers.length < 24) sim.hire(S, true);
    sim.setStaff(S, 'refine', 6); sim.setStaff(S, 'hatch', 2);
    S.time = 80; S.buildings.forEach((b) => (b.born = 0)); S.extracted = 620; S.taken = 620; S.refined = 560; S.quarter = 1; S.quotasMet = 1; S.policies = ['ergonomic']; S.mods.bite *= 0.75;
    S.flags.firstBuild = S.flags.swatMemo = true; S.stats.idleMemoAt = 1e9; S.eventCd = 1e9; S.schedule.forEach((e) => (e.done = true));
    for (let i = 0; i < 240; i++) { sim.step(S, 1 / 30); S.irritation = Math.min(S.irritation, 24); S.offer = null; }
    S.bank = quiet ? 0 : 184; S.raw = 96; S.irritation = 24; S.events.length = 0; S.eventCd = quiet ? 1e9 : 6; S.stats.idleMemoAt = S.time + 20; S.stats.queuedSeconds = 0;
    return S;
  }
  function makeDemo() { const S = sim.newShift({ seed: 11, sleeper: 0 }); S.demo = true; return preset(S, true); }
  G.demo = makeDemo();

  // ---------- shift lifecycle ----------
  function clockIn() {
    audio.start(); audio.play('click');
    let sl = 0; if (save.shifts > 0) { do { sl = (Math.random() * C.SLEEPERS.length) | 0; } while (sl === save.lastSleeper && C.SLEEPERS.length > 1); }
    G.S = sim.newShift({ sleeper: sl, shiftNo: save.shifts + 1 }); save.lastSleeper = sl;
    G.mode = 'play'; G.paused = false; G.selected = null; G.acc = 0; G.memoQ = []; G.memoUntil = 0; G.shown = {}; G.rosterDirty = true; R.fx.parts.length = 0; R.fx.labels.length = 0;
    document.body.classList.remove('is-title', 'morning'); $('hud').hidden = false; $('quota-stamp').hidden = true;
    closeModal(); setTab('build'); drainEvents(); if (!save.seenHint) G.memoQ.unshift({ text: 'Welcome aboard. Tap a card below to build. The crew does the rest.', tone: 'warn' });
  }
  function toTitle() { G.mode = 'title'; G.S = null; G.demo = makeDemo(); closeModal(); document.body.classList.add('is-title'); document.body.classList.remove('morning'); $('hud').hidden = true; $('quota-stamp').hidden = true; titleStatus(); }
  function titleStatus() { $('title-status').textContent = save.best ? `Shift ${save.shifts + 1} · Best review: ${save.best.rating}, ${fmt(save.best.extracted)} mL` : 'Shift 1 · Subject asleep since 11:42 PM'; }

  // ---------- modals ----------
  function openModal(id) { closeModal(true); G.modal = id; const el = $(id); el.hidden = false; const b = el.querySelector('button'); if (b) b.focus({ preventScroll: true }); if (id === 'handbook') el.setAttribute('data-open', ''); }
  function closeModal(keepPause) { if (!G.modal) return; const el = $(G.modal); el.hidden = true; el.removeAttribute('data-open'); el.removeAttribute('data-ready'); const was = G.modal; G.modal = null; if (!keepPause && (was === 'handbook') && G.paused && G.mode === 'play') openModal('pause-menu'); }
  function setPaused(p) { if (G.mode !== 'play' || !G.S || G.S.state !== 'playing') return; G.paused = p; audio.hold(p); if (p) openModal('pause-menu'); else if (G.modal === 'pause-menu') closeModal(true); }

  $('handbook-list').innerHTML = C.HANDBOOK.map(([h, t]) => `<li><b>${h}.</b> ${t}</li>`).join('');
  function showReviews() {
    $('reviews-sub').textContent = save.reviews.length ? `Best on file: ${save.best.rating}, ${fmt(save.best.extracted)} mL (${save.best.pct}% of supply).` : 'Your file is empty. Clock in to start one.';
    $('reviews-list').innerHTML = ''; for (const r of save.reviews) { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = `Shift ${r.shiftNo} · ${r.rating}`; const s = document.createElement('span'); s.textContent = `${r.sleeper} · ${fmt(r.extracted)} mL · ${r.pct}% · ${r.casualties} lost`; const i = document.createElement('i'); i.textContent = r.score; li.append(b, i, s); $('reviews-list').append(li); }
    openModal('reviews');
  }

  // ---------- HUD wiring ----------
  const set = (id, v) => { if (G.shown[id] !== v) { G.shown[id] = v; $(id).textContent = v; } };
  const cards = {};
  function buildCards() {
    const p = $('panel-build'); p.innerHTML = '';
    C.BUILD_ORDER.forEach((type, i) => { const def = C.BUILDINGS[type], b = document.createElement('button'); b.type = 'button'; b.className = 'card'; b.id = `build-${type}`; b.innerHTML = `<b>${def.name}</b><small></small><span></span>`; b.addEventListener('click', () => { audio.start(); if (G.S) sim.build(G.S, type); drainEvents(); }); b.title = `${def.blurb} (${i + 1})`; p.append(b); cards[type] = b; });
  }
  function updateCards() {
    const S = G.S, d = sim.derived(S);
    for (const type of C.BUILD_ORDER) {
      const def = C.BUILDINGS[type], cost = sim.costOf(S, type), el = cards[type]; if (!el.isConnected) return;
      const lvl = def.single ? S.buildings.find((b) => b.type === type).level : 0;
      const sub = def.single ? (cost === Infinity ? 'Fully built' : `Lv ${lvl} → ${lvl + 1}`) : d.counts[type] ? `${d.counts[type]} built` : 'None yet';
      const price = cost === Infinity ? (def.single ? 'Max' : 'No room') : `${fmt(cost)} mL`;
      if (el._sub !== sub) { el._sub = sub; el.children[1].textContent = sub; } if (el._price !== price) { el._price = price; el.children[2].textContent = price; }
      el.classList.toggle('can', cost <= S.bank);
    }
  }
  function showInspector() {
    const S = G.S, b = S && S.buildings.find((x) => x.id === G.selected), p = $('panel-build');
    if (!b) { G.selected = null; if (!cards.tank || !cards.tank.isConnected) buildCards(); return; }
    const def = C.BUILDINGS[b.type], cost = sim.upgradeCost(b);
    p.innerHTML = `<div class="inspector"><span><b>${def.name} · Lv ${b.level}</b><small>${def.effect(b.level)}. ${def.blurb}</small></span><button type="button" class="up" id="upgrade" ${cost === Infinity ? 'disabled' : ''}>${cost === Infinity ? 'Fully upgraded' : `Upgrade · ${fmt(cost)} mL`}</button><button type="button" class="x" id="deselect" aria-label="Close">×</button></div>`;
    $('upgrade').addEventListener('click', () => { sim.upgrade(S, b.id); drainEvents(); showInspector(); });
    $('deselect').addEventListener('click', () => { G.selected = null; buildCards(); updateCards(); });
  }
  function setTab(t) { G.tab = t; for (const k of ['build', 'staff', 'roster']) { $(`tab-${k}`).setAttribute('aria-selected', String(k === t)); $(`panel-${k}`).hidden = k !== t; } $(`tab-${t}`).classList.remove('nudge'); if (t === 'build') { if (G.selected) showInspector(); else buildCards(); if (G.S) updateCards(); } G.rosterDirty = true; }
  ['build', 'staff', 'roster'].forEach((k) => $(`tab-${k}`).addEventListener('click', () => { audio.play('click'); setTab(k); }));
  function stepStaff(job, dn) { const S = G.S; if (!S) return; const before = S.staff[job]; sim.setStaff(S, job, before + dn); audio.play(S.staff[job] === before ? 'deny' : 'click'); G.rosterDirty = true; }
  $('refine-less').addEventListener('click', () => stepStaff('refine', -1)); $('refine-more').addEventListener('click', () => stepStaff('refine', 1));
  $('hatch-less').addEventListener('click', () => stepStaff('hatch', -1)); $('hatch-more').addEventListener('click', () => stepStaff('hatch', 1));
  $('hiring').addEventListener('click', () => { if (!G.S) return; sim.setHiring(G.S, !G.S.hiring); audio.play('click'); drainEvents(); });
  [0, 1, 2].forEach((i) => $(`pace-${i}`).addEventListener('click', () => { if (!G.S) return; sim.setPace(G.S, i); audio.play('click'); }));
  $('recall').addEventListener('click', () => { if (G.S) { sim.recall(G.S); drainEvents(); } });
  $('pause').addEventListener('click', () => setPaused(true)); $('resume').addEventListener('click', () => setPaused(false));
  $('mute').addEventListener('click', () => { save.muted = !save.muted; applyMute(); store(); });
  function applyMute() { audio.setMuted(save.muted); $('mute').setAttribute('aria-pressed', String(save.muted)); $('mute').setAttribute('aria-label', save.muted ? 'Unmute sound' : 'Mute sound'); }
  $('clock-in').addEventListener('click', clockIn); $('again').addEventListener('click', clockIn); $('to-title').addEventListener('click', toTitle);
  $('open-handbook').addEventListener('click', () => { audio.start(); audio.play('click'); openModal('handbook'); }); $('pause-handbook').addEventListener('click', () => openModal('handbook'));
  $('close-handbook').addEventListener('click', () => closeModal()); $('open-reviews').addEventListener('click', () => { audio.start(); audio.play('click'); showReviews(); }); $('close-reviews').addEventListener('click', () => closeModal());
  $('clock-out').addEventListener('click', () => { G.paused = false; audio.hold(false); closeModal(true); sim.wake(G.S); drainEvents(); });

  cv.addEventListener('pointerdown', (e) => {
    audio.start(); if (G.mode !== 'play' || !G.S || G.S.state !== 'playing' || G.modal) return;
    const b = R.pick(view(), G.S, e.clientX, e.clientY); G.selected = b ? b.id : null; audio.play('click'); setTab('build');
  });
  addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return; const k = e.key.toLowerCase();
    if (k === 'm') { $('mute').click(); return; }
    if (k === 'escape') { if (G.modal === 'pause-menu') setPaused(false); else if (G.modal === 'handbook' || G.modal === 'reviews') closeModal(); else if (G.mode === 'play') setPaused(true); return; }
    if (G.modal) return;
    if (G.mode === 'title') { if ((k === ' ' || k === 'enter') && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); clockIn(); } return; }
    if (k === 'p') setPaused(!G.paused);
    else if (k === ' ') { e.preventDefault(); $('recall').click(); }
    else if (k >= '1' && k <= '5' && G.S) { sim.build(G.S, C.BUILD_ORDER[Number(k) - 1]); drainEvents(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play' && !G.paused) setPaused(true); });

  // ---------- events from the sim: every one answers on screen and in sound ----------
  function flash(id, cls) { const el = $(id); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function drainEvents() {
    const S = G.S; if (!S) return;
    for (const e of S.events) {
      R.onEvent(S, e);
      switch (e.type) {
        case 'memo': if (e.tone === 'idle' && G.memoQ.length) break; if (e.tone === 'loss' || e.tone === 'warn') G.memoUntil = 0; G.memoQ.push(e); break;
        case 'build': audio.play('coin'); setTimeout(() => audio.play('thud'), C.FEEL.build_drop_ms); flash('p-bank', 'pulse'); if (!save.seenHint) { save.seenHint = true; store(); } if (e.b.type === 'hatchery' && !e.upgrade) $('tab-staff').classList.add('nudge'); if (G.selected) showInspector(); G.rosterDirty = true; break;
        case 'deny': audio.play('deny'); if (e.what === 'recall') flash('recall', 'deny'); else { flash('p-bank', 'deny'); const c = cards[e.what]; if (c && c.isConnected) { c.classList.remove('deny'); void c.offsetWidth; c.classList.add('deny'); } } break;
        case 'deliver': audio.play('plip', 0.09); break;
        case 'telegraph': if (e.kind === 'swat' || e.kind === 'scratch') { audio.play('warn'); $('recall').classList.add('alarm'); } break;
        case 'impact': $('recall').classList.remove('alarm'); if (e.kind === 'swat' || e.kind === 'scratch') { audio.play('hit'); if (e.kind === 'swat' && !R.fx.reduced) G.hitStop = C.FEEL.hit_stop_ms / 1000; flash('p-clock', 'pulse'); if (e.dead.length) { flash('p-lost', 'pulse'); $('p-lost').classList.add('hit'); } G.rosterDirty = true; } break;
        case 'recall': audio.play('whistle'); break;
        case 'hatch': audio.play('hatch', 0.5); flash('p-staff', 'pulse'); G.rosterDirty = true; break;
        case 'quotaMet': audio.play('quota'); audio.play('stamp'); showStamp(e.quarter); break;
        case 'quotaMissed': audio.play('deny'); flash('p-quota', 'deny'); break;
        case 'policy': audio.play('hatch'); G.rosterDirty = true; break;
        case 'wake': audio.play('alarm'); audio.music(false); document.body.classList.add('morning'); $('quota-stamp').hidden = true; if (G.modal) closeModal(true); break;
        case 'over': finish(); break;
      }
    }
    S.events.length = 0;
  }
  function showStamp(q) {
    const st = $('quota-stamp'); $('stamp-sub').textContent = `Q${q} · corporate is pleased`; st.hidden = false; st.setAttribute('data-show', ''); st.style.animation = 'none'; void st.offsetWidth; st.style.animation = '';
    setTimeout(() => { if (G.S && G.S.offer) showPolicies(); }, R.fx.reduced ? 300 : 900);
  }
  function showPolicies() {
    const S = G.S, box = $('policy-cards'); box.innerHTML = '';
    for (const id of S.offer) { const p = C.POLICIES.find((x) => x.id === id), b = document.createElement('button'); b.type = 'button'; b.className = 'policy'; b.id = `policy-${id}`; const n = document.createElement('b'); n.textContent = p.name; const t = document.createElement('span'); t.textContent = p.text; b.append(n, t); b.addEventListener('click', () => { sim.pickPolicy(S, id); $('quota-stamp').hidden = true; $('quota-stamp').removeAttribute('data-show'); closeModal(true); drainEvents(); }); box.append(b); }
    openModal('policy');
  }
  function finish() {
    const r = sim.review(G.S); save.shifts++;
    const slim = { shiftNo: r.shiftNo, sleeper: r.sleeper, rating: r.rating, score: r.score, extracted: r.extracted, pct: r.pct, casualties: r.casualties };
    const newBest = !save.best || r.score > save.best.score || (r.score === save.best.score && r.extracted > save.best.extracted); const prev = save.best; if (newBest) save.best = slim;
    save.reviews.unshift(slim); save.reviews = save.reviews.slice(0, 8); store();
    $('review-eyebrow').textContent = `Shift ${r.shiftNo} · ${r.sleeper}`; $('review-h').textContent = r.rating; $('review-remark').textContent = r.remark;
    $('r-extracted').textContent = `${fmt(r.extracted)} mL`; $('r-pct').textContent = `${r.pct}%`; $('r-eff').textContent = `${r.efficiency}%`; $('r-lost').textContent = String(r.casualties); $('r-quotas').textContent = `${r.quotasMet} of 4`; $('r-score').textContent = `${r.score}/100`;
    $('r-best').textContent = newBest ? (prev ? `New best on file. Previous best: ${prev.rating}, ${fmt(prev.extracted)} mL.` : 'First review on file. Corporate has opened a folder with your name on it.') : `Best on file: ${save.best.rating}, ${fmt(save.best.extracted)} mL.`;
    const list = $('r-lost-list'); list.innerHTML = ''; for (const w of r.lost) { const li = document.createElement('li'); li.textContent = `${w.name} `; const s = document.createElement('span'); s.textContent = `· ${w.trait} · supported ${w.larvae} larvae`; li.append(s); list.append(li); }
    $('r-memoriam').hidden = r.lost.length === 0; $('hud').hidden = true;
    openModal('review'); $('review').setAttribute('data-ready', '');
  }

  // ---------- per-frame HUD ----------
  function clock(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
  function updateHud(dt, now) {
    const S = G.S, d = sim.derived(S);
    G.bankShown = G.bankShown === undefined || Math.abs(S.bank - G.bankShown) < 0.6 ? S.bank : G.bankShown + (S.bank - G.bankShown) * Math.min(1, dt / (C.FEEL.counter_ease_ms / 1000) * 2.2);
    set('v-bank', fmt(Math.floor(G.bankShown))); set('v-staff', String(S.workers.length)); set('v-housing', `/${d.housing}`); set('v-lost', String(S.lost.length));
    set('v-clock', clock(S.shiftLen - S.sleepLost - S.time)); $('p-clock').classList.toggle('cut', S.shiftLen - S.sleepLost - S.time < 30);
    const q = Math.min(S.quarter, 3), allDone = S.quarter >= 4, prev = q > 0 ? S.quotas[q - 1] : 0;
    set('l-quota', allDone ? `Extracted ${fmt(S.extracted)}` : `Q${q + 1} · ${fmt(Math.min(S.extracted, S.quotas[q]))}/${fmt(S.quotas[q])}`);
    const qp = allDone ? 100 : Math.max(0, Math.min(100, ((S.extracted - prev) / (S.quotas[q] - prev)) * 100)); if (G.shown.qp !== (qp | 0)) { G.shown.qp = qp | 0; $('b-quota').style.width = qp + '%'; }
    const ip = S.irritation | 0; if (G.shown.ip !== ip) { G.shown.ip = ip; $('b-irr').style.width = ip + '%'; }
    const rc = $('recall'), cd = S.recallCd > 0; rc.classList.toggle('cooling', cd); rc.style.setProperty('--cd', cd ? `${(S.recallCd / (C.FEEL.recall_cooldown_s * S.mods.recallCd)) * 100}%` : '0%');
    if (!(S.hev && !S.hev.hit && (S.hev.kind === 'swat' || S.hev.kind === 'scratch'))) rc.classList.remove('alarm');
    for (let i = 0; i < 3; i++) { const v = String(S.pace === i); if (G.shown['pace' + i] !== v) { G.shown['pace' + i] = v; $(`pace-${i}`).setAttribute('aria-pressed', v); } }
    if (now - G.uiAt > 0.2) {
      G.uiAt = now;
      if (G.tab === 'build' && !G.selected) updateCards();
      if (G.tab === 'build' && G.selected) { const b = S.buildings.find((x) => x.id === G.selected), up = $('upgrade'); if (b && up) up.classList.toggle('can', sim.upgradeCost(b) <= S.bank); }
      if (G.tab === 'staff') {
        const nR = S.workers.filter((w) => w.job === 'refine').length, nH = S.workers.filter((w) => w.job === 'hatch').length, nE = S.workers.length - nR - nH;
        set('s-refine', String(nR)); set('s-hatch', String(nH));
        set('s-refine-cap', `${Math.min(nR, d.stations)} of ${d.stations} stations${nR > d.stations ? ' · overstaffed' : ''}`); $('s-refine-cap').classList.toggle('over', nR > d.stations);
        set('s-hatch-cap', d.nurseStations ? `${Math.min(nH, d.nurseStations)} of ${d.nurseStations} stations · hire ${fmt(S.hireCost || 0)} mL` : 'No hatchery yet'); $('s-hatch-cap').classList.toggle('over', nH > d.nurseStations);
        set('s-extract', `${nE} staff · ${d.slots} bite stations`); set('s-morale', `${Math.round(S.morale)}%`);
        const h = S.hiring ? (S.workers.length >= d.housing ? 'Hiring: on · housing full' : 'Hiring: on') : 'Hiring: frozen'; set('hiring', h); if (G.shown.hp !== S.hiring) { G.shown.hp = S.hiring; $('hiring').setAttribute('aria-pressed', String(S.hiring)); }
      }
      if (G.tab === 'roster' && G.rosterDirty) {
        G.rosterDirty = false; const ul = $('roster'); ul.innerHTML = '';
        const row = (name, right, gone) => { const li = document.createElement('li'); if (gone) li.className = 'gone'; li.textContent = name; const s = document.createElement('span'); s.textContent = right; li.append(s); ul.append(li); };
        S.workers.forEach((w) => row(`${w.name} · ${w.trait}`, `${C.JOB_NAMES[w.job]} · ${w.loads} loads`));
        S.lost.slice().reverse().forEach((w) => row(w.name, `lost to a ${w.cause} · ${w.larvae} larvae`, true));
      }
    }
    // memo toasts
    const m = $('memo');
    if (now >= G.memoUntil) { const e = G.memoQ.shift(); if (e) { $('memo-text').textContent = e.text; m.className = 'memo'; void m.offsetWidth; m.className = `memo fresh ${e.tone}`; G.memoUntil = now + (e.tone === 'idle' ? 4.5 : 5.5); } else m.classList.add('old'); }
  }

  // ---------- frame loop ----------
  function view() { const el = $(G.mode === 'title' ? 'title-stage' : 'stage'); return R.place(el.getBoundingClientRect()); }
  function stars(t) { ctx.fillStyle = 'rgba(223,229,255,.5)'; for (let i = 0; i < 40; i++) { const x = (i * 197.3) % innerWidth, y = (i * 89.7) % (innerHeight * 0.6); ctx.globalAlpha = R.fx.reduced ? 0.4 : 0.25 + 0.25 * Math.sin(t + i); ctx.fillRect(x, y, 1.5, 1.5); } ctx.globalAlpha = 1; }
  const STEP = 1 / 30;
  function frame(ms) {
    const now = ms / 1000, dt = Math.min(0.1, now - (G.last || now)); G.last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight); stars(now);
    if (G.mode === 'title') {
      const S = G.demo; G.acc += dt; while (G.acc >= STEP) { G.acc -= STEP; sim.step(S, STEP); S.time = 80; S.irritation = 0; S.bank = Math.min(S.bank, 5); S.events.length = 0; }
      R.draw(ctx, view(), S, now, { demo: true });
    } else if (G.S) {
      const S = G.S;
      if (!G.paused && !(G.modal && G.modal !== 'review')) {
        if (G.hitStop > 0) G.hitStop -= dt; else { G.acc += dt; let n = 0; while (G.acc >= STEP && n++ < 5) { G.acc -= STEP; sim.step(S, STEP); if (S.events.length) drainEvents(); if (G.hitStop > 0) break; } if (n >= 5) G.acc = 0; }
      }
      if (G.S) { R.draw(ctx, view(), S, now, { selected: G.selected }); if (S.state === 'playing' && !$('hud').hidden) updateHud(dt, now); }
    }
    requestAnimationFrame(frame);
  }

  // ---------- measurement hooks (PLAYCRAFT, the shot list) ----------
  const fxName = (S) => (S && S.hev && S.hev.kind === 'swat' ? (S.hev.hit ? 'swat-impact' : 'swat-warning') : S && S.hev ? S.hev.kind : null);
  window.__game = {
    get state() { return G.mode === 'title' ? 'title' : G.S.state; }, get paused() { return G.paused; }, get score() { return G.S ? Math.round(G.S.extracted) : 0; }, get time() { return G.S ? G.S.time : 0; },
    get bank() { return G.S ? Math.floor(G.S.bank) : 0; }, get workers() { return G.S ? G.S.workers.length : 0; }, get buildings() { return G.S ? G.S.buildings.length : 0; }, get casualties() { return G.S ? G.S.lost.length : 0; },
    get irritation() { return G.S ? G.S.irritation : 0; }, get quotasMet() { return G.S ? G.S.quotasMet : 0; }, get sleepLeft() { return G.S ? G.S.shiftLen - G.S.sleepLost - G.S.time : 0; }, get fx() { return fxName(G.S); }, get best() { return save.best ? save.best.score : 0; },
    debug: {
      preset(name) { if (G.S && name === 'mid') { preset(G.S, false); G.rosterDirty = true; G.memoQ = []; } },
      trigger(what) { const S = G.S; if (!S || S.state !== 'playing') return; if (what === 'swat') { S.hev = null; S.siteBlocked = 0; S.covered = 0; S.recallT = 0; for (let i = 0; i < 90; i++) sim.step(S, STEP); S.hev = null; S.events.length = 0; sim.startEvent(S, 'swat'); } else if (what === 'quota') { S.extracted = Math.max(S.extracted, S.quotas[Math.min(3, S.quarter)]); } else if (what === 'wake') sim.wake(S); else if (['scratch', 'roll', 'blanket', 'stir'].includes(what)) { S.hev = null; sim.startEvent(S, what); } drainEvents(); },
    },
  };

  buildCards(); applyMute(); titleStatus();
  const ready = () => { $('title').setAttribute('data-ready', ''); requestAnimationFrame(frame); };
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(ready); else ready();
})();
