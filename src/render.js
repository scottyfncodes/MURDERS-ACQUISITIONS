// The isometric bedroom diorama: draws a shift's state. World point (7, 6.5, 0) lands on (view.cx, view.cy); view.s = px per tile.
(function (root) {
  const MA = (root.MA = root.MA || {});
  const C = MA.config, pal = C.PALETTE, { PADS, SITES, FEEL, NEST, ZONES } = C, LAB = [0.0, 2.3];
  const FONT_D = "'Alfa Slab One', Rockwell, serif", FONT_B = "Archivo, system-ui, sans-serif";

  const RANK_BAND = [null, '#1c2242', '#ee4455', '#ffd23f'];
  function mixHex(a, b, k) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), m = (sh) => Math.round(((x >> sh) & 255) * (1 - k) + ((y >> sh) & 255) * k);
    return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
  }
  function shade(hex, f) {
    let r, g, b; // a hex colour, or an rgb() this function made
    if (hex[0] === '#') { const n = parseInt(hex.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; } else [r, g, b] = (hex.match(/\d+/g) || [0, 0, 0]).map(Number);
    if (f < 1) { r *= f; g *= f; b *= f; } else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const fx = { parts: [], labels: [], shake: 0, flare: 0, flash: 0, reduced: false };
  function place(r) { const s = Math.min(r.width / 26, r.height / 20.5); return { s, cx: r.left + r.width / 2, cy: r.top + 13.5 * s + (r.height - 20.5 * s) / 2 }; }
  // the camera: zoom about a world point and slide it toward the middle of the stage (k = 0..1)
  function camera(v, r, focus, zoom, k) {
    if (!focus || (zoom === 1 && !k)) return v;
    const s = v.s * zoom, p = project(v, focus[0], focus[1], focus[2] || 0), mx = r.left + r.width / 2, my = r.top + r.height / 2;
    const tx = p[0] + (mx - p[0]) * k, ty = p[1] + (my - p[1]) * k;
    return { s, cx: tx - (focus[0] - focus[1] - 1) * s, cy: ty - ((focus[0] + focus[1] - 13) / 2 - (focus[2] || 0)) * s };
  }
  function project(v, x, y, z) { return [v.cx + (x - y - 1) * v.s, v.cy + ((x + y - 13) / 2 - (z || 0)) * v.s]; }

  function label(text, color, at, life, big) { fx.labels.push({ text, color, x: at[0], y: at[1], z: at[2], t: 0, life: life || 1.8, big }); }
  function onEvent(S, e) {
    if (e.type === 'build') { const c = e.b.type === 'rig' ? SITES[S.site].rig : MA.sim.padCenter(e.b); if (c) fx.parts.push({ kind: 'ring', x: c[0], y: c[1], z: 0, t: -FEEL.build_drop_ms / 1000, life: 0.5 }); }
    else if (e.type === 'deliver') {
      fx.parts.push({ kind: 'pop', x: e.at[0], y: e.at[1], z: e.at[2] - 0.4, t: 0, life: 0.35 });
      if (e.founder) label(`+${Math.round(e.ml)} BU`, pal.primary, [e.at[0], e.at[1], e.at[2] + 0.6], 1.1);
      else if (e.first) { label('AUTOMATED', pal.primary, [e.at[0], e.at[1], e.at[2] + 1.0], 2.4, true); fx.flare = Math.max(fx.flare, 0.6); }
    }
    else if (e.type === 'vetLost') label(`${e.name.split(' ')[0].toUpperCase()}, ${C.CAREER[e.rank].name.toUpperCase()}`, pal.accent, [e.at[0], e.at[1], e.at[2] + 1.2], 3.2, true);
    else if (e.type === 'impact') {
      if (e.kind === 'swat' || e.kind === 'scratch') {
        if (!fx.reduced) { fx.shake = e.kind === 'swat' ? FEEL.shake_px : FEEL.shake_px * 0.4; if (e.kind === 'swat') fx.flash = 1; }
        const at = e.at; e.dead.forEach((w, i) => fx.parts.push({ kind: 'hat', x: at[0], y: at[1] + 0.2, z: at[2] + (i % 3) * 0.4, vx: (i % 2 ? 1 : -1) * (0.6 + i * 0.25), vz: 3 + (i % 3), t: 0, life: 1.6 }));
        const top = [at[0], at[1], at[2] + 1.6];
        if (e.dead.length) label(`${e.dead.length} LOST`, pal.accent, top, 2.2, true);
        else if (e.nearMiss) label('NEAR MISS: 0 LOST', pal.primary, top, 2.2, true);
        else if (e.founder) label('RHONDA CLIPPED', pal.accent, top, 2.0, true);
        else label('NOBODY HOME', pal.text, top, 1.8, true);
      }
    } else if (e.type === 'quotaMet') fx.flare = 1;
    else if (e.type === 'wake') label('6:30 AM', pal.accent, [11.0, 0.5, 3.4], 2.6, true);
    else if (e.type === 'recall' && e.by === 'lookout') label('WHISTLE!', '#ff8a1f', [e.at[0], e.at[1], e.at[2] + 1.0], 1.4, true);
    else if (e.type === 'expand') { (ZONES[e.zone] || []).forEach((i, k) => { const p = PADS[i]; fx.parts.push({ kind: 'ring', x: p[0] + 1, y: p[1] + 0.9, z: 0, t: -k * 0.12, life: 0.7 }); }); }
    else if (e.type === 'hatch') {
      fx.parts.push({ kind: 'pop', x: e.at[0], y: e.at[1], z: 1.0, t: 0, life: 0.6, big: true });
      if (e.first) { label('EMPLOYEE #1', pal.primary, [e.at[0], e.at[1], 2.6], 2.8, true); label(e.w.name, pal.text, [e.at[0], e.at[1], 1.75], 2.8); fx.flare = 1; }
    }
  }

  function draw(ctx, v, S, t, opt) {
    opt = opt || {};
    const s = v.s, dt = Math.min(0.05, Math.max(0, t - (fx.last || t))); fx.last = t;
    fx.shake *= Math.pow(0.0005, dt); fx.flare = Math.max(0, fx.flare - dt * 0.8); fx.flash = Math.max(0, fx.flash - dt * 3.2);
    const sh = fx.shake > 0.3 ? [Math.sin(t * 90) * fx.shake, Math.cos(t * 70) * fx.shake * 0.6] : [0, 0];
    const P = (x, y, z) => [v.cx + sh[0] + (x - y - 1) * s, v.cy + sh[1] + ((x + y - 13) / 2 - (z || 0)) * s];
    const poly = (pts, fill, stroke, lw) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); } };
    const box = (x, y, z, w, d, h, c, f) => {
      f = f || [1, 0.8, 0.62];
      poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(c, f[1]));
      poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(c, f[2]));
      poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(c, f[0]));
    };
    const winL = (x0, x1, y, z0, z1, c) => poly([P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], c);
    const winR = (x, y0, y1, z0, z1, c) => poly([P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)], c);
    const ell = (p, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(p[0], p[1], Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 7); ctx.fillStyle = fill; ctx.fill(); };
    const cyl = (x, y, z, r, h, c, topc) => {
      const a = P(x, y, z), b = P(x, y, z + h), rx = r * s * 1.41, ry = rx / 2;
      const g = ctx.createLinearGradient(a[0] - rx, 0, a[0] + rx, 0); g.addColorStop(0, shade(c, 0.86)); g.addColorStop(0.45, shade(c, 1.12)); g.addColorStop(1, shade(c, 0.58));
      ctx.beginPath(); ctx.ellipse(a[0], a[1], rx, ry, 0, 0, Math.PI); ctx.lineTo(b[0] - rx, b[1]); ctx.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ell(b, rx, ry, topc || shade(c, 1.18)); return { a, b, rx, ry };
    };
    const glow = (p, r, c, a) => { const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r); ctx.restore(); };
    const pipe = (pts, flow) => {
      const q = pts.map((p) => P(p[0], p[1], p[2])); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
      path(); ctx.strokeStyle = shade(pal.pipe, 0.55); ctx.lineWidth = s * 0.24; ctx.stroke();
      path(); ctx.strokeStyle = pal.pipe; ctx.lineWidth = s * 0.14; ctx.stroke();
      if (flow > 0) { ctx.save(); ctx.setLineDash([s * 0.18, s * 0.5]); ctx.lineDashOffset = -t * s * 1.6; path(); ctx.strokeStyle = pal.blood; ctx.lineWidth = s * 0.09; ctx.stroke(); ctx.restore(); }
    };
    const mosq = (pos, k, o) => {
      o = o || {}; const p = P(pos[0], pos[1], pos[2]), u = s * 0.2 * (k || 1), f = Math.sin(t * 34 + pos[0] * 7 + (o.ph || 0)) > 0 ? 1 : 0.5;
      if (!o.grounded) ell(P(pos[0], pos[1], 0), u * 0.8, u * 0.36, 'rgba(0,0,0,.16)');
      ctx.save(); ctx.translate(p[0], p[1]); if (o.flip) ctx.scale(-1, 1);
      ctx.fillStyle = 'rgba(255,255,255,.74)'; ctx.beginPath(); ctx.ellipse(-u * 0.5, -u * 0.9, u * 0.95, u * 0.36 * f, -0.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(u * 0.1, -u * 1.0, u * 0.95, u * 0.36 * f, -1.0, 0, 7); ctx.fill();
      ctx.fillStyle = pal.bug; ctx.beginPath(); ctx.ellipse(-u * 0.5, u * 0.1, u * 0.9, u * 0.42, -0.25, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(u * 0.55, -u * 0.25, u * 0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = pal.bug; ctx.lineWidth = Math.max(1, u * 0.14); ctx.beginPath(); ctx.moveTo(u * 0.9, -u * 0.1); ctx.lineTo(u * 1.7, u * 0.5); ctx.stroke();
      if (o.belly) { ctx.fillStyle = pal.blood; ctx.beginPath(); ctx.ellipse(-u * 0.55, u * 0.12, u * (0.3 + 0.62 * o.belly), u * (0.16 + 0.36 * o.belly), -0.25, 0, 7); ctx.fill(); }
      if (o.tie) { ctx.fillStyle = pal.shirt; ctx.beginPath(); ctx.ellipse(-u * 0.35, u * 0.02, u * 0.6, u * 0.38, -0.25, 0, 7); ctx.fill(); ctx.fillStyle = pal.blood; ctx.beginPath(); ctx.moveTo(u * 0.1, -u * 0.15); ctx.lineTo(u * 0.28, -u * 0.15); ctx.lineTo(u * 0.22, u * 0.35); ctx.lineTo(u * 0.16, u * 0.35); ctx.closePath(); ctx.fill(); }
      if (o.vest) { ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.ellipse(-u * 0.35, u * 0.05, u * 0.62, u * 0.4, -0.25, 0, 7); ctx.fill(); ctx.fillStyle = '#f4f1ea'; ctx.fillRect(-u * 0.6, -u * 0.02, u * 0.5, u * 0.12); }
      if (o.mask) { ctx.fillStyle = '#eef0fa'; ctx.beginPath(); ctx.ellipse(u * 0.82, -u * 0.12, u * 0.26, u * 0.2, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#eef0fa'; ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.moveTo(u * 0.6, -u * 0.2); ctx.lineTo(u * 0.2, -u * 0.35); ctx.stroke(); }
      if (o.founder) { ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.ellipse(u * 0.5, -u * 0.62, u * 0.62, u * 0.26, -0.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(u * 0.62, -u * 0.86, u * 0.12, 0, 7); ctx.fill(); ctx.fillStyle = pal.primary; ctx.fillRect(u * 0.1, u * 0.05, u * 0.34, u * 0.42); }
      else { ctx.fillStyle = o.hat || pal.hat; ctx.beginPath(); ctx.arc(u * 0.55, -u * 0.42, u * 0.52, Math.PI, 0); ctx.fill(); ctx.fillRect(u * 0.0, -u * 0.5, u * 1.25, u * 0.16); if (o.band) { ctx.fillStyle = o.band; ctx.fillRect(u * 0.07, -u * 0.66, u * 0.96, u * 0.16); } }
      if (o.carry) { ctx.fillStyle = pal.blood; ctx.beginPath(); ctx.moveTo(-u * 0.5, u * 0.5); ctx.quadraticCurveTo(-u * 1.15, u * 1.5, -u * 0.5, u * 1.7); ctx.quadraticCurveTo(u * 0.15, u * 1.5, -u * 0.5, u * 0.5); ctx.fill(); }
      ctx.restore();
    };

    const cine = opt.cine ? opt.cine.t : null, phoneLit = cine === null ? 0 : clamp((6.2 - cine) / 1.6, 0, 1);
    const away = S.phase === 'day', waking = S.state === 'waking' || S.state === 'over', wk = waking ? clamp(S.wakeT / 3, 0, 1) : 0;
    // he deflates: paler and flatter as his condition falls (it carries between nights) and as tonight's blood comes out
    const drained = S.phase === 'day' ? 0 : clamp(0.8 * (1 - (Number.isFinite(S.vigor) ? S.vigor : 1)) + 0.35 * (S.taken || 0) / Math.max(1, S.baseSupply || S.supply || 1), 0, 1);
    const flesh = mixHex(pal.skin, '#c3c2b2', Math.min(1, drained * 1.1)), flat = 1 - 0.78 * drained, thin = 1 - 0.3 * drained;
    const breath = fx.reduced ? 0 : Math.sin(t * Math.PI / 2) * 0.05;
    const stirring = S.hev && (S.hev.kind === 'roll' || S.hev.kind === 'stir') ? Math.sin(S.hev.t * 9) * 0.08 : 0;
    const d = MA.sim.derived(S), activeGlow = away ? 0.35 : waking ? 1 - wk : 1;

    // floor
    box(0, 0, -0.5, 14, 12, 0.5, pal.floor);
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = shade(pal.floor, 0.5); ctx.lineWidth = 1;
    for (let y = 1; y < 12; y++) { const a = P(0, y, 0), b = P(14, y, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.restore();
    poly([P(10.6, 0.2, 0), P(13.8, 0.2, 0), P(13.8, 6.2, 0), P(10.6, 6.2, 0)], rgba(waking || away ? '#ffe2b0' : pal.moon, 0.13 + (away ? 0.32 : wk * 0.3) + (cine !== null && cine > 7.5 && cine < 14 ? 0.12 * Math.sin(((cine - 7.5) / 6.5) * Math.PI) : 0)));
    poly([P(12.1, 0.2, 0), P(12.3, 0.2, 0), P(12.3, 6.2, 0), P(12.1, 6.2, 0)], rgba(pal.floor, 0.6));
    poly([P(1, 1, 0), P(10.3, 1, 0), P(10.3, 6.4, 0), P(1, 6.4, 0)], rgba(pal.under, 0.62));
    // placement: every free pad, the shortest trips brightest; the best one says so
    if (opt.placing && S.state === 'playing') {
      const list = MA.sim.padsByTrip(S), lo = list.length ? list[0].trip : 1, hi = list.length ? list[list.length - 1].trip : 1;
      list.forEach((q, i) => {
        const p = PADS[q.pad], k = hi > lo ? 1 - (q.trip - lo) / (hi - lo) : 1, pulse = i === 0 && !fx.reduced ? 0.5 + 0.5 * Math.sin(t * 6) : 1;
        const pts = [P(p[0], p[1], 0), P(p[0] + 2, p[1], 0), P(p[0] + 2, p[1] + 1.7, 0), P(p[0], p[1] + 1.7, 0)];
        poly(pts, rgba(pal.primary, 0.08 + 0.22 * k * pulse), rgba(pal.primary, 0.35 + 0.55 * k), i === 0 ? 2.5 : 1.5);
      });
    }

    // nightstand and the alarm clock everyone is working against
    box(10.5, 0.15, 0, 1.15, 0.95, 1.7, pal.wood, [1.1, 0.8, 0.62]); winL(10.62, 11.53, 1.1, 0.9, 1.45, shade(pal.wood, 0.5));
    { const ring = waking && !fx.reduced ? Math.sin(t * 60) * 0.05 : 0, late = S.shiftLen - S.sleepLost - S.time < 30 && !waking;
      box(10.72 + ring, 0.4, 1.7, 0.72, 0.36, 0.5, pal.metalDark, [1.5, 1, 0.8]); winL(10.78 + ring, 11.38 + ring, 0.76, 1.8, 2.1, waking || (late && Math.sin(t * 8) > 0) ? pal.accent : shade(pal.accent, 0.55));
      if (waking && wk < 0.8) { const cp = P(11.08, 0.6, 2.5); ctx.strokeStyle = rgba(pal.accent, 0.9); ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const rr = s * (0.6 + i * 0.45 + ((t * 2) % 0.45)); ctx.beginPath(); ctx.arc(cp[0], cp[1], rr, -2.4, -0.7); ctx.stroke(); } glow(cp, s * 2.4, pal.accent, 0.35); } }
    box(0.55, 0.9, 0, 0.45, 5.2, 5.9, pal.wood);
    // HQ: a bottle cap under the bed, and the first light in the house
    { const n = [NEST[0], NEST[1]], cap = Math.max(1, d.cap), fill = clamp(MA.sim.raw(S) / cap, 0, 1), on = activeGlow * (cine === null ? 1 : clamp((cine - 11) / 2, 0.15, 1));
      ell(P(n[0], n[1], 0), s * 0.9, s * 0.42, 'rgba(0,0,0,.25)');
      const c = cyl(n[0], n[1], 0, 0.5, 0.32, '#c7463a', shade('#c7463a', 1.25));
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI; ctx.fillStyle = shade('#c7463a', 0.7); ctx.fillRect(c.a[0] - c.rx * Math.cos(a) - 1, c.a[1] + c.ry * Math.sin(a) - s * 0.3, 2, s * 0.3); }
      ell(c.b, c.rx * 0.8, c.ry * 0.8, shade(pal.metalDark, 1.2));
      if (MA.sim.raw(S) > 0.5 && d.counts.tank === 0) ell(c.b, c.rx * 0.8 * (0.35 + 0.65 * fill), c.ry * 0.8 * (0.35 + 0.65 * fill), pal.blood);
      else if (MA.sim.raw(S) > 0.5) ell(c.b, c.rx * 0.8, c.ry * 0.8, pal.blood);
      box(n[0] + 0.35, n[1] - 0.35, 0.3, 0.05, 0.05, 1.5, shade(pal.wood, 1.3)); box(n[0] + 0.38, n[1] - 0.35, 1.32, 0.05, 0.55, 0.4, pal.primary, [1.1, 0.95, 0.8]);
      glow(P(n[0], n[1], 0.6), s * 2.2, pal.glow, 0.32 * on);
      if (S.queued > 0 && d.counts.tank === 0) tag(c.b[0], c.b[1] - s * 1.6, 'STORAGE FULL', pal.accent);
    }
    [[1, 1], [9.6, 1], [1, 5.6], [9.6, 5.6]].forEach(([x, y]) => box(x, y, 0, 0.4, 0.4, 3, pal.wood));
    box(1, 1, 3, 9, 5, 0.45, pal.wood); box(1.05, 1.05, 3.45, 8.9, 4.9, 0.7, pal.mattress);
    // Saliva R&D: a lab tray along the top of the headboard. A flask per phase of research: green numbs, red thins
    { const labB = S.buildings.find((b) => b.type === 'lab');
      if (labB) { const kd = clamp((S.time - labB.born) / (FEEL.build_drop_ms / 1000), 0, 1), dz = 5.9 + (fx.reduced ? 0 : (1 - kd) * (1 - kd) * 4), num = MA.sim.research(S, 'numbing'), thin2 = MA.sim.research(S, 'thinner');
        box(0.57, 1.1, dz, 0.41, 4.8, 0.08, '#eef0fa', [1, 0.82, 0.66]);
        const flask = (y, c, lit) => { const k = cyl(0.78, y, dz + 0.08, 0.15, 0.5, '#dfe8ff', lit ? c : shade('#dfe8ff', 0.8)); if (lit) glow(k.b, s * 0.75, c, 0.32 + 0.14 * Math.sin(t * 3 + y * 2)); };
        for (let i = 0; i < 3; i++) flask(1.5 + i * 0.55, '#5fe08a', i < num);
        for (let i = 0; i < 3; i++) flask(3.75 + i * 0.55, pal.blood, i < thin2); } }
    box(1.4, 1.9, 4.15, 1.9, 3.2, 0.4, pal.pillow);
    // bedding: thrown back when the sleeper gets up
    const bx0 = 3.3 + wk * 3.2;
    box(bx0, 1.02, 4.15, 9.98 - bx0, 4.98, 0.3, pal.blanket);
    winL(bx0, 9.98, 6.0, 3.75, 4.15, shade(pal.blanket, 0.8)); winR(9.98, 1.02, 6.0, 3.75, 4.15, shade(pal.blanket, 0.62));
    const gone = wk > 0.7 || away;
    if (!gone) {
      const up = clamp(wk / 0.5, 0, 1);
      if (up < 1) {
        const bh = (0.5 + breath) * flat, top = 4.45 + bh;
        box(3.5 + stirring, 2.3 + 0.25 * drained, 4.45, 5.9, 2.5 - 0.5 * drained, bh, pal.blanket, [1.08, 0.86, 0.68]);
        box(3.6 + stirring, 2.5 + 0.2 * drained, top, 2.2, 2.1 - 0.4 * drained, 0.32 * flat, pal.blanket, [1.16, 0.9, 0.72]);
        box(8.5, 2.9 + stirring, top, 0.9, 1.3, 0.28 * flat, pal.blanket, [1.16, 0.9, 0.72]);
        ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = shade(pal.blanket, 1.6); ctx.lineWidth = 1; ctx.setLineDash([s * 0.12, s * 0.12]);
        for (let x = 4.4; x < 9.9; x += 1.1) { const a = P(x, 4.9, 4.45), b = P(x, 6, 4.45); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        ctx.restore();
      } else { // sitting up in striped pyjamas, shoulders down
        box(3.1, 2.5, 4.45, 1.5, 2.2, 1.75, '#9aa9d6', [1.05, 0.84, 0.68]);
        for (let i = 0; i < 4; i++) winL(3.15, 4.55, 4.7, 4.62 + i * 0.4, 4.74 + i * 0.4, '#6f80b8');
        box(3.3, 4.7, 4.45, 0.5, 0.42, 1.3, '#9aa9d6', [1.05, 0.84, 0.68]); box(3.3, 4.7, 4.3, 0.5, 0.46, 0.2, flesh);
        box(4.6, 2.9, 4.45, 2.6, 1.4, 0.45, pal.blanket, [1.08, 0.86, 0.68]); }
      const hz = 4.95 + up * 1.95 - (up >= 1 ? Math.abs(Math.sin(wk * 9)) * 0.08 : 0), hd = P(2.75 + up * 1.05, 3.5, hz), hr = s * 0.78 * (1 - 0.08 * drained); ell(hd, hr * (1 - 0.16 * drained), hr * 0.92, flesh);
      if (drained > 0.3 && !waking) { ctx.globalAlpha = Math.min(0.9, (drained - 0.3) * 1.5); ell([hd[0] + hr * 0.38, hd[1] + hr * 0.3], hr * 0.22, hr * 0.1, '#8a6a8e'); ell([hd[0] - hr * 0.1, hd[1] + hr * 0.48], hr * 0.22, hr * 0.1, '#8a6a8e'); ctx.globalAlpha = 1; } // the bags under his eyes
      ctx.fillStyle = pal.hair; ctx.beginPath(); ctx.ellipse(hd[0] - hr * 0.12, hd[1] - hr * 0.22, hr * 1.02, hr * 0.82, -0.3, Math.PI * 0.95, Math.PI * 1.95); ctx.fill();
      ctx.strokeStyle = shade(flesh, 0.5); ctx.lineWidth = Math.max(1, s * 0.06); ctx.lineCap = 'round';
      // the phone he fell asleep on: lit while he reads, dark on his chest after
      { const pz = 4.45 + (0.82 + breath) * flat; box(4.15, 2.95, pz, 0.5, 0.82, 0.06, '#232838', [1.3, 0.9, 0.7]);
        const lit = Math.max(phoneLit, waking ? 0.25 * (1 - wk) : 0);
        if (lit > 0) { poly([P(4.2, 3.0, pz + 0.07), P(4.6, 3.0, pz + 0.07), P(4.6, 3.72, pz + 0.07), P(4.2, 3.72, pz + 0.07)], rgba('#cfe0ff', 0.9 * lit)); glow(P(4.4, 3.35, pz + 0.3), s * 3.4, '#9fb8ff', 0.4 * lit); glow(hd, hr * 2.6, '#9fb8ff', 0.3 * lit); } }
      if (phoneLit >= 0.5) { ell([hd[0] + hr * 0.38, hd[1] + hr * 0.1], hr * 0.12, hr * 0.09, shade(flesh, 0.3)); ell([hd[0] - hr * 0.1, hd[1] + hr * 0.28], hr * 0.12, hr * 0.09, shade(flesh, 0.3)); }
      else if (!waking) { ctx.beginPath(); ctx.arc(hd[0] + hr * 0.38, hd[1] + hr * 0.12, hr * 0.16, 0.15, Math.PI - 0.15); ctx.stroke(); ctx.beginPath(); ctx.arc(hd[0] - hr * 0.1, hd[1] + hr * 0.3, hr * 0.16, 0.15, Math.PI - 0.15); ctx.stroke(); }
      else { ell([hd[0] + hr * 0.38, hd[1] + hr * 0.1], hr * 0.12, hr * 0.07, shade(flesh, 0.35)); ell([hd[0] - hr * 0.1, hd[1] + hr * 0.28], hr * 0.12, hr * 0.07, shade(flesh, 0.35)); ctx.beginPath(); ctx.moveTo(hd[0] + hr * 0.2, hd[1] + hr * 0.62); ctx.lineTo(hd[0] + hr * 0.5, hd[1] + hr * 0.5); ctx.stroke(); ctx.fillStyle = shade(flesh, 0.72); ctx.beginPath(); ctx.ellipse(hd[0] + hr * 0.4, hd[1] + hr * 0.28, hr * 0.2, hr * 0.07, -0.4, 0, 7); ctx.fill(); }
      if (!waking) { ctx.fillStyle = pal.zzz; ctx.textAlign = 'center'; [[0.9, 1.5, 0.5], [1.6, 2.4, 0.72], [2.5, 3.5, 1]].forEach(([dx, dz, k], i) => { const b = fx.reduced ? 0 : Math.sin(t * 1.6 + i) * s * 0.08; ctx.font = `${s * 0.72 * k}px ${FONT_D}`; ctx.globalAlpha = (0.5 + k * 0.5) * (S.irritation > 70 ? 0.45 : 1) * (cine === null ? 1 : clamp((cine - 5) / 1.5, 0, 1)) * (S.rhythm ? 0.25 + 0.75 * S.depth : 1); ctx.fillText('Z', hd[0] + dx * s * 0.8, hd[1] - dz * s * 0.62 + b); }); ctx.globalAlpha = 1; }
    }
    if (S.fumesUntil > S.time && !gone) { ctx.save(); ctx.globalAlpha = 0.18 * clamp((S.fumesUntil - S.time) / 8, 0.3, 1); ctx.fillStyle = '#8fd18a'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); const h = P(6, 3.5, 7.4); tag(h[0], h[1], `AIRING OUT · ${Math.ceil(S.fumesUntil - S.time)} s`, '#8fd18a'); }
    if (S.rhythm && !gone && !waking && S.state === 'playing' && S.depth < 0.35) { const h = P(2.75, 3.5, 6.9); tag(h[0], h[1] - s * 0.4, 'LIGHT SLEEP', Math.sin(t * 6) > 0 ? pal.accent : pal.primary); }
    // limbs: the arm off the near side, the foot off the far end after a roll
    const armOut = waking || away ? 0 : S.armOut, footOut = waking || away ? 0 : S.footOut;
    if (armOut > 0.02 && !gone) {
      const len = 3.04 * armOut, top = 4.79;
      box(4.6 + 0.36 * (1 - thin), 4.5, 4.45, 0.72 * thin, 1.55, 0.34, flesh);
      box(4.6 + 0.36 * (1 - thin), 6.0, top - len, 0.72 * thin, 0.42, len, flesh);
      box(4.5, 6.0, top - len - 0.7, 0.92, 0.5, 0.72, flesh, [1.04, 0.84, 0.66]);
      ctx.strokeStyle = shade(flesh, 0.55); ctx.lineWidth = Math.max(1, s * 0.035);
      [4.74, 4.96, 5.18].forEach((x) => { const a = P(x, 6.5, top - len - 0.7), b = P(x, 6.5, top - len - 0.25); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      if (armOut > 0.9) [[4.8, 3.6], [5.1, 2.9], [4.9, 2.2]].slice(0, clamp(Math.ceil(S.extracted / 300), 0, 3)).forEach(([x, z]) => ell(P(x, 6.42, z), s * 0.07, s * 0.07, pal.blood));
    }
    const FD = S.divisions && S.divisions.foot, fh = FD && FD.hev, kickOff = fh && fh.kind === 'kick' && !waking ? (fh.hit ? Math.max(0, 1 - (fh.t - fh.telegraph) / 0.5) * 0.9 : fx.reduced ? 0 : Math.sin(fh.t * 50) * 0.06) : 0;
    for (const D of MA.sim.divs(S)) if (D.covered > 0 && !waking && D.site === 'arm') { const k = clamp(Math.min(D.covered, 0.6) / 0.6, 0, 1); box(4.3, 6.0, 4.4 - 3.4 * k, 1.3, 0.56, 3.4 * k, pal.blanket, [1.1, 0.9, 0.7]); }

    // pipes on the floor, then everything standing on it in depth order
    const site = SITES[S.site], center = MA.sim.padCenter, siteOf = (b) => SITES[MA.sim.divOf(S, b).site];
    const tanks = S.buildings.filter((b) => b.type === 'tank'), pools = S.buildings.filter((b) => b.type === 'pool'), refs = S.buildings.filter((b) => b.type === 'refinery'), hats = S.buildings.filter((b) => b.type === 'hatchery');
    const flowing = (S.biting || 0) > 0 ? 1 : 0, refining = (S.refineRate || 0) > 0.05 ? 1 : 0;
    const L = (a, b, z, flow) => pipe([[a[0], a[1], z], [a[0], b[1], z], [b[0], b[1], z]], flow);
    tanks.forEach((b) => L(NEST, center(b), 0.14, flowing));
    const nearTank = (p) => { let best = null, bd = Infinity; for (const b of tanks) { const c = center(b), dd = Math.hypot(c[0] - p[0], c[1] - p[1]); if (dd < bd) { bd = dd; best = c; } } return best || NEST; };
    S.buildings.filter((b) => b.type === 'refinery').forEach((b) => { const c = center(b); L(nearTank(c), c, 0.22, refining); });
    const drip = S.buildings.find((b) => b.type === 'drip');
    if (drip) { const dp = MA.sim.storePoint(drip, S); L([dp[0], dp[1]], nearTank(dp), 0.3, flowing); }
    for (const rig of S.buildings.filter((b) => b.type === 'rig')) { const D = MA.sim.divOf(S, rig), rs = siteOf(rig); if (D.offline) continue; const st = MA.sim.storePoint(MA.sim.nearestStore(S, false, D), S), fl = D.biting > 0 ? 1 : 0; pipe([[rs.skin[0], rs.skin[1] + 0.3, 1.2], [rs.rig[0] + 1.2, rs.rig[1] + 0.9, 1.2], [rs.rig[0] + 1.2, rs.rig[1] + 0.9, 0.18], [rs.rig[0] + 1.2, st[1], 0.18], [st[0], st[1], 0.18]], fl); }
    S.buildings.filter((b) => b.type === 'plant').forEach((b) => { const pp = MA.sim.storePoint(b, S); L([pp[0], pp[1]], nearTank(pp), 0.26, refining); });

    if (fx.flare > 0 && !fx.reduced) { const c0 = P(6.5, 6.4, 1.2); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(c0[0], c0[1]); ctx.rotate(t * 0.5); for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); const g = ctx.createLinearGradient(0, 0, s * 13, 0); g.addColorStop(0, rgba(pal.primary, 0.3 * fx.flare)); g.addColorStop(1, rgba(pal.primary, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 13, -s * 1.2); ctx.lineTo(s * 13, s * 1.2); ctx.closePath(); ctx.fill(); } ctx.restore(); }
    const items = [];
    const drop = (b) => { const k = clamp((S.time - b.born) / (FEEL.build_drop_ms / 1000), 0, 1); return fx.reduced ? 0 : (1 - k) * (1 - k) * 4; };
    for (const b of S.buildings) {
      if (b.type === 'nest' || b.type === 'windbreak' || b.type === 'masks' || b.type === 'lookout' || b.type === 'seminar' || b.type === 'lab' || b.type === 'numbing' || b.type === 'thinner') continue; // drawn with the fan, on the staff, on the perch
      if (b.type === 'plant') {
        const pp = MA.sim.storePoint(b, S), lv = b.level;
        items.push({ d: pp[0] + pp[1] + 0.8, f: () => { const dz = drop(b), x = pp[0] - 0.6, y = pp[1] - 0.6, h = 1.0 + lv * 0.25; ell(P(pp[0], pp[1], 0), s * 1.1, s * 0.5, 'rgba(0,0,0,.2)'); box(x, y, dz, 1.2, 1.2, h, pal.metal); winL(x + 0.15, x + 1.05, y + 1.2, dz + 0.35, dz + h - 0.25, refining ? pal.glow : shade(pal.metalDark, 1.4)); box(x - 0.05, y - 0.05, dz + h, 1.3, 1.3, 0.1, pal.accent, [1.1, 0.9, 0.75]); const ch = cyl(x + 0.9, y + 0.3, dz + h + 0.1, 0.16, 0.5 + lv * 0.2, pal.metal); if (refining && !fx.reduced) { const q = (t * 0.35) % 1; ctx.globalAlpha = (1 - q) * 0.4; ell([ch.b[0], ch.b[1] - s * 0.2 - q * s * 1.4], s * (0.18 + q * 0.3), s * (0.15 + q * 0.25), pal.steam); ctx.globalAlpha = 1; } if (opt.selected === b.id) sel(x, y, 1.2, 1.2); } });
        continue;
      }
      if (b.type === 'drip') {
        const dp = MA.sim.storePoint(b, S);
        items.push({ d: dp[0] + dp[1] + 0.5, f: () => { const dz = drop(b); box(dp[0] - 0.08, dp[1] - 0.08, dz, 0.16, 0.16, dp[2] - 0.35, pal.metal); cyl(dp[0], dp[1], dz + dp[2] - 0.4, 0.42, 0.45, pal.pipe, flowing ? pal.blood : shade(pal.pipe, 0.6)); if (flowing && !fx.reduced) glow(P(dp[0], dp[1], dp[2]), s * 0.9, pal.blood, 0.25); if (opt.selected === b.id) sel(dp[0] - 0.6, dp[1] - 0.6, 1.2, 1.2); } });
        continue;
      }
      if (b.type === 'rig') {
        const rs = siteOf(b); if (MA.sim.divOf(S, b).offline) continue;
        items.push({ d: rs.rig[0] + rs.rig[1], f: () => { const [x, y] = rs.rig, dz = drop(b), h = 1.3 + b.level * 0.22, w = 1.0 + b.level * 0.1; [[0, 0], [w, 0], [0, 0.9], [w, 0.9]].forEach(([ox, oy]) => box(x + ox, y + oy, dz, 0.14, 0.14, h, pal.metal)); box(x - 0.1, y - 0.1, dz + h, w + 0.34, 1.14, 0.12, pal.metal, [1.3, 1, 0.8]); for (let i = 0; i < b.level; i++) box(x + 0.1 + i * 0.3, y + 0.2, dz + h + 0.12, 0.2, 0.2, 0.26, pal.primary); if (opt.selected === b.id) sel(x, y, w + 0.3, 1.1); } });
        continue;
      }
      const p = PADS[b.pad], x = p[0], y = p[1];
      items.push({ d: x + y + 1.8, f: () => {
        const dz = drop(b), lv = b.level;
        ell(P(x + 1, y + 0.9, 0), s * 1.7, s * 0.8, 'rgba(0,0,0,.2)');
        if (b.type === 'tank') {
          const r = 0.74 + lv * 0.06, h = 1.7 + Math.min(lv, 3) * 0.45 + Math.max(0, lv - 3) * 0.22, c = cyl(x + 1, y + 0.9, dz, r, h, pal.metal), fill = clamp(MA.sim.raw(S) / Math.max(1, d.cap), 0, 1);
          const w = c.rx * 0.5, hh = h * s * 0.66, x0 = c.a[0] - w * 0.2, y0 = c.a[1] - h * s * 0.18 - hh;
          ctx.fillStyle = shade(pal.metalDark, 0.8); ctx.fillRect(x0, y0, w, hh); ctx.fillStyle = pal.blood; ctx.fillRect(x0, y0 + hh * (1 - fill), w, hh * fill); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x0 + w * 0.12, y0 + hh * 0.06, w * 0.16, hh * 0.88);
          glow([x0 + w / 2, y0 + hh * 0.7], s * 1.1, pal.blood, 0.12 + fill * 0.2);
          for (let k = 3; k < lv; k++) { const hp = P(x + 1, y + 0.9, dz + h * (0.3 + (k - 3) * 0.22)); ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = Math.max(1.5, s * 0.09); ctx.beginPath(); ctx.ellipse(hp[0], hp[1], c.rx * 1.02, c.ry * 1.02, 0, 0, Math.PI); ctx.stroke(); } // premium levels: gold hoops
          if (S.queued > 0 && b === MA.sim.nearestStore(S)) { const q = 0.5 + 0.5 * Math.sin(t * 8); ctx.strokeStyle = rgba(pal.accent, 0.5 + q * 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.b[0], c.b[1], c.rx, c.ry, 0, 0, 7); ctx.stroke(); tag(c.b[0], c.b[1] - s * 0.9, 'STORAGE FULL', pal.accent); }
        } else if (b.type === 'refinery') {
          const h = 1.5 + lv * 0.3;
          box(x, y, dz, 2.0, 1.7, h, pal.metal);
          for (let i = 0; i < 3; i++) winL(x + 0.2 + i * 0.6, x + 0.65 + i * 0.6, y + 1.7, dz + 0.55, dz + h - 0.4, refining ? pal.glow : shade(pal.metalDark, 1.4));
          winR(x + 2.0, y + 0.25, y + 1.45, dz + 0.55, dz + h - 0.4, refining ? shade(pal.glow, 0.82) : shade(pal.metalDark, 1.2));
          if (refining) glow(P(x + 1, y + 1.7, 0.9), s * (2 + fx.flare), pal.glow, 0.28 + fx.flare * 0.4);
          box(x - 0.1, y - 0.1, dz + h, 2.2, 1.9, 0.14, pal.primary);
          // output conveyor: crates of product roll out while the refinery runs, and stop when it does
          box(x - 0.35, y + 1.78, dz, 2.7, 0.42, 0.2, pal.metalDark, [1.6, 1.05, 0.8]);
          for (let i = 0; i < 3; i++) { const q = ((refining && !fx.reduced ? t * 0.45 : 0) + i / 3 + b.id * 0.13) % 1; box(x - 0.3 + q * 2.3, y + 1.83, dz + 0.2, 0.32, 0.32, 0.28, pal.blood, [1.15, 0.9, 0.7]); }
          for (let k = 0; k < lv; k++) { const row = k < 3 ? 0 : 1, ch = cyl(x + 1.55 - (k % 3) * 0.5, y + 0.5 + row * 0.75, dz + h + 0.14, 0.24, 1.1 + k * 0.2, row ? '#c9a640' : pal.metal); if (refining && !fx.reduced) for (let i = 0; i < 3; i++) { const q = (t * 0.3 + i / 3 + k * 0.2) % 1; ctx.globalAlpha = (1 - q) * 0.45; ell([ch.b[0] + Math.sin(q * 5 + i) * s * 0.25, ch.b[1] - s * 0.2 - q * s * 1.8], s * (0.22 + q * 0.4), s * (0.18 + q * 0.3), pal.steam); } ctx.globalAlpha = 1; }
        } else if (b.type === 'hatchery') {
          box(x, y, dz, 2.0, 1.7, 0.8, pal.metal); winL(x + 0.2, x + 1.8, y + 1.7, dz + 0.26, dz + 0.56, pal.glow); glow(P(x + 1, y + 1.7, 0.4), s * 1.3, pal.glow, 0.24);
          const n = 2 + lv * 2; for (let i = 0; i < n; i++) { const ex = x + 0.45 + (i % 3) * 0.55, ey = y + 0.45 + Math.floor(i / 3) * 0.6, p2 = P(ex, ey, dz + 0.8), wob = S.hatching && i === 0 ? Math.sin(t * 20) * s * 0.04 : 0; ctx.fillStyle = pal.egg; ctx.beginPath(); ctx.ellipse(p2[0] + wob, p2[1], s * 0.3, s * 0.17, 0, 0, Math.PI); ctx.ellipse(p2[0] + wob, p2[1], s * 0.3, s * 0.38, 0, Math.PI, 0); ctx.fill(); ell([p2[0] - s * 0.08, p2[1] - s * 0.17], s * 0.07, s * 0.1, 'rgba(255,255,255,.6)'); }
        } else if (b.type === 'pool') {
          cyl(x + 1, y + 0.9, dz, 0.95 + lv * 0.07, 0.24 + lv * 0.06, pal.pillow, pal.water);
          for (let i = 0; i < 3 + lv * 2; i++) ell(P(x + 0.5 + ((i * 0.37) % 1), y + 0.5 + ((i * 0.61) % 0.9), dz + 0.3 + lv * 0.06), s * 0.1, s * 0.06, 'rgba(255,255,255,.85)');
          if (S.hatching && b === pools[0] && S.state === 'playing') {
            const k = clamp(S.hatchProgress, 0, 1), e = P(x + 1, y + 0.9, dz + 0.32 + lv * 0.06), wob = !fx.reduced && k > 0.6 ? Math.sin(t * 24) * s * 0.05 * k : 0, r = s * (0.18 + 0.2 * k);
            ctx.fillStyle = pal.egg; ctx.beginPath(); ctx.ellipse(e[0] + wob, e[1], r, r * 0.55, 0, 0, Math.PI); ctx.ellipse(e[0] + wob, e[1], r, r * 1.25, 0, Math.PI, 0); ctx.fill(); ell([e[0] - r * 0.3 + wob, e[1] - r * 0.6], r * 0.22, r * 0.3, 'rgba(255,255,255,.6)');
            if (k >= 1 && S.bank < S.hatchCost) tag(e[0], e[1] - s * 1.3, `${Math.ceil(S.hatchCost)} BU TO HATCH`, pal.primary);
          }
        }
        if (opt.selected === b.id) sel(x, y, 2.0, 1.7);
        if (lv > 1) for (let i = 0; i < lv; i++) ell(P(x + 0.3 + i * 0.3, y + 1.85, 0.05), s * 0.1, s * 0.05, pal.primary);
      } });
    }
    function sel(x, y, w, dd) { ctx.save(); ctx.setLineDash([]); poly([P(x - 0.15, y - 0.15, 0), P(x + w + 0.15, y - 0.15, 0), P(x + w + 0.15, y + dd + 0.15, 0), P(x - 0.15, y + dd + 0.15, 0)], null, pal.primary, 2.5); ctx.restore(); }
    function tag(px, py, text, color) { ctx.font = `700 ${Math.max(10, s * 0.62)}px ${FONT_B}`; const w = ctx.measureText(text).width + 12, h = Math.max(16, s * 1.0); ctx.fillStyle = 'rgba(11,15,34,.92)'; ctx.fillRect(px - w / 2, py - h / 2, w, h); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, px, py + 1); ctx.textBaseline = 'alphabetic'; }
    // what he bought: the fan by the window, the windbreak against it, the plug-in by the bed
    const C2 = S.counters || {};
    if (C2.fan) items.push({ d: 12.9 + 3.0 + 0.6, f: () => {
      box(12.65, 2.7, 0, 0.6, 0.6, 0.14, '#e3e6f2', [1.1, 0.85, 0.7]); box(12.9, 2.95, 0.14, 0.1, 0.1, 1.55, '#c9cde0');
      const c = P(12.85, 3.0, 2.05), rx = s * 0.62, ry = s * 0.82, on = !away && S.state === 'playing';
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(-0.5); ctx.fillStyle = 'rgba(227,230,242,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#e3e6f2'; ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.stroke();
      const spin = on && !fx.reduced ? t * 18 : 0.4; ctx.fillStyle = 'rgba(207,212,234,.75)'; for (let i = 0; i < 3; i++) { const a = spin + (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * rx * 0.45, Math.sin(a) * ry * 0.45, rx * 0.4, ry * 0.16, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#8a90ad'; ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, 7); ctx.fill(); ctx.restore();
    } });
    if (S.buildings.some((b) => b.type === 'windbreak')) items.push({ d: 11.7 + 3.2 + 0.4, f: () => {
      box(11.6, 2.0, 0, 0.16, 2.3, 1.9, '#c99a5a', [1.05, 0.85, 0.7]); winR(11.76, 2.25, 4.05, 1.05, 1.5, '#e04a3a'); winR(11.76, 2.6, 3.7, 0.45, 0.8, '#f4d35e');
    } });
    if (C2.repellent) items.push({ d: 2.6 + 5.4 + 0.3, f: () => {
      box(2.3, 5.2, 0, 0.7, 0.32, 0.2, '#eef0fa', [1.05, 0.85, 0.7]); box(2.55, 5.25, 0.2, 0.3, 0.22, 0.3, '#eef0fa', [1.05, 0.85, 0.7]);
      const l = P(2.7, 5.47, 0.4); ell(l, s * 0.07, s * 0.07, away ? '#5a6b5e' : '#7be38f'); if (!away) glow(l, s * 0.6, '#7be38f', 0.4);
    } });

    // the foot: an ankle out from under the blanket at the end of the bed, heel on the mattress, toes to the ceiling.
    // It slides out as he rolls; kicks jerk it, rubs bring the other foot over, socks (the blanket) cover it
    const footD = S.divisions && Object.values(S.divisions).find((D) => D.site === 'foot');
    if (footOut > 0.02 && !gone) items.push({ d: 10.4 + 3.4 + 3, f: () => {
      const x0 = 8.9 + 1.15 * footOut, kx = kickOff * 0.6, kz = kickOff * 0.5;
      box(9.0, 2.98, 4.45, x0 - 9.0 + kx, 0.86, 0.6, flesh);                                       // the ankle
      box(x0 + kx, 2.86, 4.4 + kz, 0.42, 1.06, 1.3, flesh, [1.04, 0.84, 0.66]);                   // the sole, upright
      [0, 1, 2, 3, 4].forEach((i) => box(x0 + kx + 0.03, 2.9 + i * 0.2, 5.7 + kz - i * 0.06, 0.3, 0.18, 0.26 - i * 0.02, flesh, [1.12, 0.9, 0.72])); // toes
      const cov = footD && footD.covered > 0 && !waking ? clamp(Math.min(footD.covered, 0.6) / 0.6, 0, 1) : 0;
      if (cov > 0) box(8.9, 2.75, 4.45, 1.7 * cov, 1.3, 1.35, pal.blanket, [1.1, 0.9, 0.7]);
      if (fh && !waking && fh.kind === 'rub') { // the other foot: under the blanket, then over for a rub
        const p = clamp(fh.t / fh.telegraph, 0, 1), yy = fh.hit ? 2.05 + Math.sin((fh.t - fh.telegraph) * 18) * 0.22 : 1.15 + p * 0.85;
        box(9.0, yy, 4.45, 1.0, 0.7, 0.48, flesh, [0.94, 0.76, 0.6]); box(10.0, yy - 0.05, 4.4, 0.32, 0.8, 0.98, flesh, [0.96, 0.78, 0.6]);
      }
    } });
    // Occupational Health & Safety: a perch on the bed rail above the bite, with a sign
    for (const lb of away ? [] : S.buildings.filter((b) => b.type === 'lookout')) { const lp = MA.sim.lookoutPoint(S, MA.sim.divOf(S, lb)), lvl = lb.level;
      items.push({ d: lp[0] + lp[1] + 4, f: () => {
        box(lp[0] - 0.25, lp[1] - 0.2, lp[2] - 0.15, 0.5, 0.4, 0.1, shade(pal.wood, 1.25), [1.1, 0.85, 0.7]);
        box(lp[0] + 0.3, lp[1] - 0.15, lp[2] - 0.15, 0.05, 0.05, 0.9, pal.metal); box(lp[0] + 0.33, lp[1] - 0.15, lp[2] + 0.45, 0.04, 0.5, 0.3, lvl >= 2 ? '#54c08a' : '#ff8a1f', [1.1, 0.95, 0.8]);
      } }); }
    // each General Manager's podium on the bed rail
    for (const w of away ? [] : S.workers.filter((x) => x.job === 'gm')) { const gp = MA.sim.gmPoint(S, MA.sim.divOf(S, w)); items.push({ d: gp[0] + gp[1] + 4, f: () => { box(gp[0] - 0.22, gp[1] - 0.2, gp[2] - 0.45, 0.44, 0.4, 0.32, pal.primary, [1.1, 0.9, 0.75]); } }); }

    // the gate sign and the plant manager on his crate
    if (S.corp) items.push({ d: 0.4 + 11.3 + 2, f: () => { box(0.5, 11.3, 0, 0.1, 0.1, 1.2, pal.metal); box(2.5, 11.3, 0, 0.1, 0.1, 1.2, pal.metal); box(0.4, 11.25, 1.0, 2.3, 0.14, 1.0, pal.primary); const a = P(1.55, 11.39, 1.48); ctx.save(); ctx.translate(a[0], a[1]); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.fillStyle = pal.metalDark; ctx.font = `${s * 0.74}px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M&A', 0, 0); ctx.restore(); ctx.textBaseline = 'alphabetic'; } });
    if (S.corp) items.push({ d: 3.3 + 10.9 + 1.2, f: () => {
      box(3.3, 10.8, 0, 0.9, 0.9, 0.35, pal.primary);
      const m = P(3.75, 11.25, 0.35), u = s * 0.72, worried = S.hev && (S.hev.kind === 'swat' || S.hev.kind === 'scratch'); ctx.save(); ctx.translate(m[0], m[1]);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-u * 0.75, -u * 2.2, u * 1.0, u * 0.36, -0.9, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(u * 0.75, -u * 2.2, u * 1.0, u * 0.36, 0.9, 0, 7); ctx.fill();
      ctx.strokeStyle = pal.bug; ctx.lineWidth = u * 0.12; ctx.beginPath(); ctx.moveTo(-u * 0.25, -u * 0.9); ctx.lineTo(-u * 0.3, 0); ctx.moveTo(u * 0.25, -u * 0.9); ctx.lineTo(u * 0.3, 0); ctx.stroke();
      ctx.fillStyle = pal.shirt; ctx.beginPath(); ctx.roundRect(-u * 0.55, -u * 2.05, u * 1.1, u * 1.3, u * 0.3); ctx.fill();
      ctx.fillStyle = pal.blood; ctx.beginPath(); ctx.moveTo(-u * 0.13, -u * 2.0); ctx.lineTo(u * 0.13, -u * 2.0); ctx.lineTo(u * 0.2, -u * 1.25); ctx.lineTo(0, -u * 1.0); ctx.lineTo(-u * 0.2, -u * 1.25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.bug; ctx.beginPath(); ctx.arc(0, -u * 2.6, u * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-u * 0.24, -u * 2.66, u * 0.2, 0, 7); ctx.arc(u * 0.24, -u * 2.66, u * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = pal.bug; if (!worried) ctx.fillRect(-u * 0.46, -u * 2.9, u * 0.92, u * 0.22); ctx.beginPath(); ctx.arc(-u * 0.24, -u * 2.6, u * 0.08, 0, 7); ctx.arc(u * 0.24, -u * 2.6, u * 0.08, 0, 7); ctx.fill();
      ctx.strokeStyle = pal.bug; ctx.lineWidth = u * 0.1; ctx.beginPath(); ctx.moveTo(0, -u * 2.3); ctx.lineTo(u * 0.1, -u * 1.5); ctx.stroke();
      ctx.fillStyle = shade(pal.wood, 1.3); ctx.fillRect(u * 0.5, -u * 1.7, u * 0.62, u * 0.8); ctx.fillStyle = '#fff'; ctx.fillRect(u * 0.57, -u * 1.6, u * 0.48, u * 0.62);
      ctx.restore();
    } });
    items.sort((a, b) => a.d - b.d).forEach((it) => it.f());

    // staff
    const masked = S.buildings.some((b) => b.type === 'masks');
    const ws = S.workers.slice().sort((a, b) => a.pos[0] + a.pos[1] - b.pos[0] - b.pos[1]);
    for (const w of ws) {
      const bob = fx.reduced ? 0 : Math.sin(t * 5 + w.id) * 0.06, station = w.job !== 'extract', rk = MA.sim.rankOf(S, w);
      const flip = w.to && w.from ? (w.to[0] - w.to[1]) < (w.from[0] - w.from[1]) : w.st === 'bite' ? MA.sim.divOf(S, w).site === 'arm' : w.id % 2 === 0;
      mosq([w.pos[0], w.pos[1], w.pos[2] + bob], clamp(40 / s, 1.4, 2.1), { carry: w.carry > 0 || (w.job === 'refine' && refining && Math.sin(t * 3 + w.id) > 0.2), flip, ph: w.id, vest: w.job === 'lookout', tie: w.job === 'gm', mask: masked, grounded: w.st === 'bite', hat: w.job === 'gm' ? pal.metalDark : w.job === 'lookout' ? '#ff8a1f' : w.job === 'hatch' ? '#f4f1ea' : w.job === 'refine' ? '#ff9d4d' : rk === 3 ? '#2a2f52' : pal.hat, band: w.job !== 'extract' ? null : RANK_BAND[rk] });
    }
    // Rhonda: the beret, the lanyard, and a belly that fills while you hold
    { const f = S.founder, fp = cine !== null ? cinePath(cine) : f.pos;
      if (fp) {
        const bob = fx.reduced || f.st === 'drink' ? 0 : Math.sin(t * 5) * 0.06, flip = cine !== null ? cine < 12.5 : f.to && f.from ? (f.to[0] - f.to[1]) < (f.from[0] - f.from[1]) : f.st === 'drink' ? S.site === 'arm' : false;
        glow(P(fp[0], fp[1], fp[2]), s * 1.3, pal.glow, 0.22);
        mosq([fp[0], fp[1], fp[2] + bob], clamp(60 / s, 2.2, 3.2), { founder: true, belly: cine !== null ? 0 : clamp(f.belly / C.ECON.bellyMl, 0, 1), flip, ph: 0, grounded: f.st === 'drink' });
        if (cine === null && f.st === 'drink' && S.state === 'playing') {
          const c = P(fp[0], fp[1], fp[2] + 2.3), k = clamp(f.belly / C.ECON.bellyMl, 0, 1), full = k >= 0.999, r = Math.max(12, s * 0.55);
          ctx.lineWidth = Math.max(3, s * 0.18); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(11,15,34,.75)'; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.stroke();
          ctx.strokeStyle = full ? (Math.sin(t * 18) > 0 ? pal.accent : pal.primary) : pal.blood; ctx.beginPath(); ctx.arc(c[0], c[1], r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
          if (full && f.greed > 0.15) tag(c[0], c[1] - r - Math.max(12, s * 0.8), 'LET GO', pal.accent);
        }
      }
    }
    if (opt.hint === 'hold' && S.state === 'playing') { const k = MA.sim.skinPoint(S), c = P(k[0], k[1] + 0.3, k[2]), q = fx.reduced ? 0.5 : (t * 1.1) % 1; ctx.lineWidth = 3; for (const d of [0, 0.5]) { const qq = (q + d) % 1; ctx.strokeStyle = rgba(pal.primary, 1 - qq); ctx.beginPath(); ctx.ellipse(c[0], c[1], s * (0.4 + qq * 1.3), s * (0.25 + qq * 0.75), 0, 0, 7); ctx.stroke(); } }

    if (C2.fan && !away && S.state === 'playing' && !fx.reduced) {
      const stop = S.buildings.some((b) => b.type === 'windbreak') ? 11.4 : 1.5; ctx.strokeStyle = 'rgba(223,229,255,.28)'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) { const q = (t * 0.55 + i * 0.37) % 1, x = 12.2 - q * (12.2 - stop), y = 1.6 + ((i * 1.37) % 1) * 7.5, z = 1.2 + ((i * 0.71) % 1) * 2.4; if (x < stop + 0.2) continue; const a = P(x, y, z), b = P(x + 0.9, y, z); ctx.globalAlpha = Math.sin(q * Math.PI); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (C2.repellent && !away && S.state === 'playing') { const k = sitePos(S).skin, c = P(k[0], k[1], k[2] - 0.6); glow(c, s * 2.8, '#7be38f', 0.22 + (fx.reduced ? 0 : 0.06 * Math.sin(t * 1.5))); }

    for (const lw of away || S.state !== 'playing' ? [] : S.workers.filter((w) => w.job === 'lookout')) { const D = MA.sim.divOf(S, lw); if (D.lookoutCd <= 0) continue; const p = P(lw.pos[0] + 0.35, lw.pos[1], lw.pos[2] + 1.1), u = Math.max(5, s * 0.32); ctx.fillStyle = '#c99a5a'; ctx.fillRect(p[0] - u * 0.7, p[1] - u, u * 1.4, u * 1.8); ctx.fillStyle = pal.pillow; ctx.fillRect(p[0] - u * 0.55, p[1] - u * 0.75, u * 1.1, u * 1.4); ctx.fillStyle = pal.metal; ctx.fillRect(p[0] - u * 0.3, p[1] - u * 1.1, u * 0.6, u * 0.3); ctx.fillStyle = pal.metalDark; for (let i = 0; i < 3; i++) ctx.fillRect(p[0] - u * 0.4, p[1] - u * 0.4 + i * u * 0.35, u * (i === 2 ? 0.45 : 0.8), u * 0.08); }
    // the hand, at whichever division it threatens
    for (const HD of MA.sim.divs(S)) if (HD.hev && (HD.hev.kind === 'swat' || HD.hev.kind === 'scratch') && !waking) {
      const e = HD.hev, big = e.kind === 'swat', p = clamp(e.t / e.telegraph, 0, 1), sk = SITES[HD.site].skin, after = e.t - e.telegraph;
      const sp = P(sk[0], sk[1] + 0.6, 0.02); ell(sp, s * (0.6 + p * (big ? 1.8 : 1.0)), s * (0.3 + p * (big ? 0.9 : 0.5)), `rgba(0,0,0,${0.12 + p * 0.3})`);
      const fall = p < 0.82 ? 0 : (p - 0.82) / 0.18, lift = e.hit ? clamp((after - e.hold * 0.45) / (e.hold * 0.55), 0, 1) : 0;
      const hz = e.hit ? sk[2] - 1.4 + lift * 9 : sk[2] + 7.2 - fall * fall * 8.6 + (fx.reduced ? 0 : Math.sin(e.t * 26) * 0.12 * (1 - fall)), w = big ? 2.4 : 1.4, wig = e.hit && !big ? Math.sin(after * 22) * 0.25 : 0;
      const fl = big ? 1.1 : 0.7, ph = big ? 1.7 : 1.0, fw = w / 4, hs = [1.05, 0.88, 0.7], crease = shade(flesh, 0.6);
      if (HD.site === 'arm') {
        const x0 = sk[0] - w / 2 + wig;
        box(x0, 6.42, hz + fl, w, 0.55, ph, flesh, hs); box(x0 + w, 6.5, hz + fl + ph * 0.3, 0.45, 0.4, ph * 0.5, flesh, hs);
        for (let i = 0; i < 4; i++) box(x0 + i * fw + 0.03, 6.42, hz + (i === 0 || i === 3 ? 0.18 : 0), fw - 0.06, 0.55, fl - (i === 0 || i === 3 ? 0.18 : 0), flesh, hs);
        box(x0 + 0.3, 6.44, hz + fl + ph, w - 0.6, 0.5, 9, flesh, hs);
        ctx.strokeStyle = crease; ctx.lineWidth = Math.max(1, s * 0.05); const a1 = P(x0 + 0.2, 6.97, hz + fl + ph * 0.45), b1 = P(x0 + w - 0.2, 6.97, hz + fl + ph * 0.6); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
      } else {
        const y0 = sk[1] - w / 2 + wig;
        box(10.42, y0, hz + fl, 0.55, w, ph, flesh, hs);
        for (let i = 0; i < 4; i++) box(10.42, y0 + i * fw + 0.03, hz + (i === 0 || i === 3 ? 0.18 : 0), 0.55, fw - 0.06, fl - (i === 0 || i === 3 ? 0.18 : 0), flesh, hs);
        box(10.44, y0 + 0.3, hz + fl + ph, 0.5, w - 0.6, 9, flesh, hs);
      }
      if (!e.hit) { const q = 0.5 + 0.5 * Math.sin(e.t * 20); const wp = P(sk[0], sk[1], sk[2] + 2.4); tag(wp[0], wp[1], big ? 'SWAT INCOMING' : 'SCRATCH INCOMING', q > 0.5 ? pal.primary : pal.text); }
      else if (after < 0.25 && big && !fx.reduced) { const ip = P(sk[0], sk[1] + 0.5, sk[2]); ctx.strokeStyle = rgba(pal.text, 1 - after * 4); ctx.lineWidth = 3; for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283, r0 = s * (1.6 + after * 6), r1 = r0 + s * 0.9; ctx.beginPath(); ctx.moveTo(ip[0] + Math.cos(a) * r0, ip[1] + Math.sin(a) * r0 * 0.7); ctx.lineTo(ip[0] + Math.cos(a) * r1, ip[1] + Math.sin(a) * r1 * 0.7); ctx.stroke(); } }
    }

    // the foot's hazards: the other foot comes over for a rub; a kick jerks the foot
    if (fh && !waking && (fh.kind === 'rub' || fh.kind === 'kick')) {
      const sk = SITES.foot.skin;
      if (!fh.hit) { const q = 0.5 + 0.5 * Math.sin(fh.t * 20), wp = P(sk[0], sk[1], sk[2] + 3.4); tag(wp[0], wp[1], fh.kind === 'kick' ? 'KICK INCOMING' : 'RUB INCOMING', q > 0.5 ? pal.primary : pal.text); }
    }
    // particles and floating labels
    fx.parts = fx.parts.filter((q) => (q.t += dt) < q.life);
    for (const q of fx.parts) {
      if (q.t < 0) continue; const k = q.t / q.life;
      if (q.kind === 'ring') { const p = P(q.x, q.y, 0); ctx.strokeStyle = rgba(pal.text, (1 - k) * 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p[0], p[1], s * (1.2 + k * 1.6), s * (0.6 + k * 0.8), 0, 0, 7); ctx.stroke(); }
      else if (q.kind === 'pop') { const p = P(q.x, q.y, q.z + k * 0.4); ell(p, s * (q.big ? 0.5 : 0.22) * (1 - k * 0.5), s * (q.big ? 0.5 : 0.22) * (1 - k * 0.5), rgba(q.big ? pal.egg : pal.blood, 1 - k)); }
      else if (q.kind === 'hat') { const z = Math.max(0.05, q.z + q.vz * q.t - 6 * q.t * q.t), p = P(q.x + q.vx * q.t, q.y + 0.4, z), u = s * 0.26; ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(z > 0.06 ? q.t * 9 * (q.vx > 0 ? 1 : -1) : 0.3); ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3; ctx.fillStyle = pal.hat; ctx.beginPath(); ctx.arc(0, 0, u, Math.PI, 0); ctx.fill(); ctx.fillRect(-u * 1.2, -u * 0.1, u * 2.4, u * 0.3); ctx.restore(); }
    }
    fx.labels = fx.labels.filter((q) => (q.t += dt) < q.life);
    for (const q of fx.labels) { const k = q.t / q.life, p = P(q.x, q.y, q.z + k * 0.8); ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1; ctx.font = `${q.big ? Math.max(16, s * 1.1) : Math.max(13, s * 0.72)}px ${FONT_D}`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = pal.under; ctx.strokeText(q.text, p[0], p[1]); ctx.fillStyle = q.color; ctx.fillText(q.text, p[0], p[1]); ctx.globalAlpha = 1; }

    if (cine !== null) { const dark = 0.62 * clamp((10 - cine) / 3.5, 0, 1); if (dark > 0) { const h = P(3.4, 3.4, 5.2), g = ctx.createRadialGradient(h[0], h[1], s * 1.5, h[0], h[1], s * (5 + 6 * clamp((cine - 4) / 6, 0, 1))); g.addColorStop(0, `rgba(5,8,20,${dark * 0.25})`); g.addColorStop(1, `rgba(5,8,20,${dark})`); ctx.fillStyle = g; ctx.fillRect(-9999, -9999, 99999, 99999); } }
    if (fx.flash > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.5})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); const g = ctx.createRadialGradient(ctx.canvas.width / 2, ctx.canvas.height / 2, ctx.canvas.height * 0.25, ctx.canvas.width / 2, ctx.canvas.height / 2, ctx.canvas.height * 0.75); g.addColorStop(0, rgba(pal.accent, 0)); g.addColorStop(1, rgba(pal.accent, 0.5 * fx.flash)); ctx.fillStyle = g; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
    if (waking || away) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,214,160,${away ? 0.13 : wk * 0.16})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
  }

  // the opening flight: in through the window, a pass over the sleeper, down to the bottle cap
  function cinePath(c) {
    if (c < 8.2) return null;
    const home = [NEST[0] + 0.3, NEST[1] + 0.2, 0.9], a = [14.2, 2.0, 6.2], m = [6.0, 3.6, 8.2];
    if (c >= 12.6) return home;
    const k = (c - 8.2) / 4.4, e = k * k * (3 - 2 * k), u = 1 - e;
    return [u * u * a[0] + 2 * u * e * m[0] + e * e * home[0], u * u * a[1] + 2 * u * e * m[1] + e * e * home[1], u * u * a[2] + 2 * u * e * m[2] + e * e * home[2] + Math.sin(k * 9) * 0.25 * u];
  }
  // which free pad is under a pointer? generous: the nearest pad centre within reach
  function pickPad(v, S, px, py) {
    let best = -1, bd = Math.max(40, v.s * 2.0);
    for (const i of MA.sim.freePads(S)) { const c = MA.sim.padCenter({ pad: i }), p = project(v, c[0], c[1], 0); const dd = Math.hypot(p[0] - px, p[1] - py); if (dd < bd) { bd = dd; best = i; } }
    return best;
  }
  // which building is under a pointer (screen px)? nearest pad centre within reach
  function sitePos(S) { return SITES[S.site]; }
  function pick(v, S, px, py) {
    let best = null, bd = Math.max(30, v.s * 2.2);
    for (const b of S.buildings) { if (b.type === 'nest' || b.type === 'windbreak' || b.type === 'masks') continue; const c = b.type === 'seminar' ? null : b.type === 'lookout' ? MA.sim.lookoutPoint(S, MA.sim.divOf(S, b)) : b.type === 'plant' ? MA.sim.storePoint(b, S) : b.type === 'rig' ? [SITES[MA.sim.divOf(S, b).site].rig[0] + 0.6, SITES[MA.sim.divOf(S, b).site].rig[1] + 0.5] : b.type === 'drip' ? MA.sim.storePoint(b, S) : MA.sim.padCenter(b); if (!c) continue; const p = project(v, c[0], c[1], 0.9); const dd = Math.hypot(p[0] - px, p[1] - py); if (dd < bd) { bd = dd; best = b; } }
    // General Managers on their podiums
    for (const w of S.workers.filter((x) => x.job === 'gm')) { const D = MA.sim.divOf(S, w), c = MA.sim.gmPoint(S, D), p = project(v, c[0], c[1], c[2] - 0.3), dd = Math.hypot(p[0] - px, p[1] - py); if (dd < bd) { bd = dd; best = { id: `gm@${D.id}`, type: 'gm', div: D.id }; } }
    return best;
  }

  MA.render = { draw, place, camera, project, pick, pickPad, onEvent, fx };
})(typeof window !== 'undefined' ? window : globalThis);
