// The isometric bedroom diorama: draws a shift's state. World point (7, 6.5, 0) lands on (view.cx, view.cy); view.s = px per tile.
(function (root) {
  const MA = (root.MA = root.MA || {});
  const C = MA.config, pal = C.PALETTE, { PADS, SITES, FEEL } = C;
  const FONT_D = "'Alfa Slab One', Rockwell, serif", FONT_B = "Archivo, system-ui, sans-serif";

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; } else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const fx = { parts: [], labels: [], shake: 0, flare: 0, reduced: false };
  function place(r) { const s = Math.min(r.width / 26, r.height / 20.5); return { s, cx: r.left + r.width / 2, cy: r.top + 13.5 * s + (r.height - 20.5 * s) / 2 }; }
  function project(v, x, y, z) { return [v.cx + (x - y - 1) * v.s, v.cy + ((x + y - 13) / 2 - (z || 0)) * v.s]; }

  function onEvent(S, e) {
    if (e.type === 'build') { const c = MA.sim.padCenter(e.b) || SITES[S.site].rig; fx.parts.push({ kind: 'ring', x: c[0], y: c[1], z: 0, t: -FEEL.build_drop_ms / 1000, life: 0.5 }); }
    else if (e.type === 'deliver') fx.parts.push({ kind: 'pop', x: e.at[0], y: e.at[1], z: e.at[2] - 0.4, t: 0, life: 0.35 });
    else if (e.type === 'impact') {
      if (e.kind === 'swat' || e.kind === 'scratch') {
        if (!fx.reduced) fx.shake = e.kind === 'swat' ? FEEL.shake_px : FEEL.shake_px * 0.4;
        const at = e.at; e.dead.forEach((w, i) => fx.parts.push({ kind: 'hat', x: at[0], y: at[1] + 0.2, z: at[2] + (i % 3) * 0.4, vx: (i % 2 ? 1 : -1) * (0.6 + i * 0.25), vz: 3 + (i % 3), t: 0, life: 1.6 }));
        if (e.dead.length) fx.labels.push({ text: `${e.dead.length} LOST`, color: pal.accent, x: at[0], y: at[1], z: at[2] + 1.6, t: 0, life: 2.2 });
        else if (e.nearMiss) fx.labels.push({ text: 'NEAR MISS: 0 LOST', color: pal.primary, x: at[0], y: at[1], z: at[2] + 1.6, t: 0, life: 2.2 });
      }
    } else if (e.type === 'quotaMet') fx.flare = 1;
    else if (e.type === 'hatch') { const b = S.buildings.find((x) => x.type === 'hatchery'); if (b) { const c = MA.sim.padCenter(b); fx.parts.push({ kind: 'pop', x: c[0], y: c[1], z: 1.4, t: 0, life: 0.5, big: true }); } }
  }

  function draw(ctx, v, S, t, opt) {
    opt = opt || {};
    const s = v.s, dt = Math.min(0.05, Math.max(0, t - (fx.last || t))); fx.last = t;
    fx.shake *= Math.pow(0.0005, dt); fx.flare = Math.max(0, fx.flare - dt * 0.8);
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
      ctx.fillStyle = o.hat || pal.hat; ctx.beginPath(); ctx.arc(u * 0.55, -u * 0.42, u * 0.52, Math.PI, 0); ctx.fill(); ctx.fillRect(u * 0.0, -u * 0.5, u * 1.25, u * 0.16);
      if (o.carry) { ctx.fillStyle = pal.blood; ctx.beginPath(); ctx.moveTo(-u * 0.5, u * 0.5); ctx.quadraticCurveTo(-u * 1.15, u * 1.5, -u * 0.5, u * 1.7); ctx.quadraticCurveTo(u * 0.15, u * 1.5, -u * 0.5, u * 0.5); ctx.fill(); }
      ctx.restore();
    };

    const waking = S.state === 'waking' || S.state === 'over', wk = waking ? clamp(S.wakeT / 3, 0, 1) : 0;
    const breath = fx.reduced ? 0 : Math.sin(t * Math.PI / 2) * 0.05;
    const stirring = S.hev && (S.hev.kind === 'roll' || S.hev.kind === 'stir') ? Math.sin(S.hev.t * 9) * 0.08 : 0;
    const d = MA.sim.derived(S), activeGlow = waking ? 1 - wk : 1;

    // floor
    box(0, 0, -0.5, 14, 12, 0.5, pal.floor);
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = shade(pal.floor, 0.5); ctx.lineWidth = 1;
    for (let y = 1; y < 12; y++) { const a = P(0, y, 0), b = P(14, y, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.restore();
    poly([P(10.6, 0.2, 0), P(13.8, 0.2, 0), P(13.8, 6.2, 0), P(10.6, 6.2, 0)], rgba(waking ? '#ffe2b0' : pal.moon, 0.13 + wk * 0.3));
    poly([P(12.1, 0.2, 0), P(12.3, 0.2, 0), P(12.3, 6.2, 0), P(12.1, 6.2, 0)], rgba(pal.floor, 0.6));
    poly([P(1, 1, 0), P(10.3, 1, 0), P(10.3, 6.4, 0), P(1, 6.4, 0)], rgba(pal.under, 0.62));
    // free pads: where the plant can still grow
    if (S.state === 'playing' && !opt.demo) { const used = new Set(S.buildings.map((b) => b.pad)); ctx.save(); ctx.setLineDash([s * 0.2, s * 0.2]); PADS.forEach((p, i) => { if (!used.has(i)) poly([P(p[0], p[1], 0), P(p[0] + 2, p[1], 0), P(p[0] + 2, p[1] + 1.7, 0), P(p[0], p[1] + 1.7, 0)], null, rgba(pal.text, 0.14), 1); }); ctx.restore(); }

    box(0.55, 0.9, 0, 0.45, 5.2, 5.9, pal.wood);
    // head office under the bed: more windows light up as headcount grows
    const litN = clamp(Math.ceil(S.workers.length / 4), 1, 8); let wi = 0;
    const lit = (x, y, w, dd, h, n) => {
      box(x, y, 0, w, dd, h, pal.metalDark, [1.25, 1, 0.8]);
      for (let i = 0; i < n; i++) { const on = wi++ < litN && activeGlow > 0.3; const x0 = x + 0.18 + (i * (w - 0.3)) / n; winL(x0, x0 + (w - 0.3) / n - 0.14, y + dd, h * 0.42, h * 0.78, on ? pal.glow : shade(pal.metalDark, 1.5)); }
      winR(x + w, y + 0.2, y + dd - 0.2, h * 0.42, h * 0.78, shade(pal.glow, 0.82 * activeGlow + 0.1));
      glow(P(x + w / 2, y + dd, h * 0.5), s * (1.6 + fx.flare), pal.glow, (0.3 + fx.flare * 0.4) * activeGlow);
    };
    lit(1.6, 3.6, 2.2, 1.8, 2.0, 3); lit(6.2, 3.2, 2.6, 2.2, 2.4, 4);
    cyl(4.9, 4.9, 0, 0.55, 2.2, pal.metalDark, shade(pal.metalDark, 1.3)); lit(8.9, 1.6, 1.0, 3.8, 1.6, 1);
    [[1, 1], [9.6, 1], [1, 5.6], [9.6, 5.6]].forEach(([x, y]) => box(x, y, 0, 0.4, 0.4, 3, pal.wood));
    box(1, 1, 3, 9, 5, 0.45, pal.wood); box(1.05, 1.05, 3.45, 8.9, 4.9, 0.7, pal.mattress);
    box(1.4, 1.9, 4.15, 1.9, 3.2, 0.4, pal.pillow);
    // bedding: thrown back when the sleeper gets up
    const bx0 = 3.3 + wk * 3.2;
    box(bx0, 1.02, 4.15, 9.98 - bx0, 4.98, 0.3, pal.blanket);
    winL(bx0, 9.98, 6.0, 3.75, 4.15, shade(pal.blanket, 0.8)); winR(9.98, 1.02, 6.0, 3.75, 4.15, shade(pal.blanket, 0.62));
    const gone = wk > 0.7;
    if (!gone) {
      const up = clamp(wk / 0.5, 0, 1);
      if (up < 1) {
        box(3.5 + stirring, 2.3, 4.45, 5.9, 2.5, 0.5 + breath, pal.blanket, [1.08, 0.86, 0.68]);
        box(3.6 + stirring, 2.5, 4.95 + breath, 2.2, 2.1, 0.32, pal.blanket, [1.16, 0.9, 0.72]);
        box(8.5, 2.9 + stirring, 4.95 + breath, 0.9, 1.3, 0.28, pal.blanket, [1.16, 0.9, 0.72]);
        ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = shade(pal.blanket, 1.6); ctx.lineWidth = 1; ctx.setLineDash([s * 0.12, s * 0.12]);
        for (let x = 4.4; x < 9.9; x += 1.1) { const a = P(x, 4.9, 4.45), b = P(x, 6, 4.45); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        ctx.restore();
      } else box(3.2, 2.6, 4.45, 1.6, 2.0, 1.9, '#8fa0c8', [1.05, 0.86, 0.7]); // sitting up, in pyjamas
      const hz = 4.95 + up * 2.0, hd = P(2.75 + up * 1.0, 3.5, hz), hr = s * 0.78; ell(hd, hr, hr * 0.92, pal.skin);
      ctx.fillStyle = pal.hair; ctx.beginPath(); ctx.ellipse(hd[0] - hr * 0.12, hd[1] - hr * 0.22, hr * 1.02, hr * 0.82, -0.3, Math.PI * 0.95, Math.PI * 1.95); ctx.fill();
      ctx.strokeStyle = shade(pal.skin, 0.5); ctx.lineWidth = Math.max(1, s * 0.06); ctx.lineCap = 'round';
      if (!waking) { ctx.beginPath(); ctx.arc(hd[0] + hr * 0.38, hd[1] + hr * 0.12, hr * 0.16, 0.15, Math.PI - 0.15); ctx.stroke(); ctx.beginPath(); ctx.arc(hd[0] - hr * 0.1, hd[1] + hr * 0.3, hr * 0.16, 0.15, Math.PI - 0.15); ctx.stroke(); }
      else { ell([hd[0] + hr * 0.38, hd[1] + hr * 0.1], hr * 0.1, hr * 0.06, shade(pal.skin, 0.4)); ell([hd[0] - hr * 0.1, hd[1] + hr * 0.28], hr * 0.1, hr * 0.06, shade(pal.skin, 0.4)); }
      if (!waking) { ctx.fillStyle = pal.zzz; ctx.textAlign = 'center'; [[0.9, 1.5, 0.5], [1.6, 2.4, 0.72], [2.5, 3.5, 1]].forEach(([dx, dz, k], i) => { const b = fx.reduced ? 0 : Math.sin(t * 1.6 + i) * s * 0.08; ctx.font = `${s * 0.72 * k}px ${FONT_D}`; ctx.globalAlpha = (0.5 + k * 0.5) * (S.irritation > 70 ? 0.45 : 1); ctx.fillText('Z', hd[0] + dx * s * 0.8, hd[1] - dz * s * 0.62 + b); }); ctx.globalAlpha = 1; }
    }
    // limbs: the arm off the near side, the foot off the far end after a roll
    const armOut = waking ? 0 : S.armOut, footOut = waking ? 0 : S.footOut;
    if (armOut > 0.02 && !gone) {
      const len = 3.04 * armOut, top = 4.79;
      box(4.6, 4.5, 4.45, 0.72, 1.55, 0.34, pal.skin);
      box(4.6, 6.0, top - len, 0.72, 0.42, len, pal.skin);
      box(4.5, 6.0, top - len - 0.7, 0.92, 0.5, 0.72, pal.skin, [1.04, 0.84, 0.66]);
      ctx.strokeStyle = shade(pal.skin, 0.55); ctx.lineWidth = Math.max(1, s * 0.035);
      [4.74, 4.96, 5.18].forEach((x) => { const a = P(x, 6.5, top - len - 0.7), b = P(x, 6.5, top - len - 0.25); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      if (armOut > 0.9) [[4.8, 3.6], [5.1, 2.9], [4.9, 2.2]].slice(0, clamp(Math.ceil(S.extracted / 300), 0, 3)).forEach(([x, z]) => ell(P(x, 6.42, z), s * 0.07, s * 0.07, pal.blood));
    }
    if (footOut > 0.02 && !gone) {
      const len = 2.7 * footOut, top = 4.5;
      box(10.0, 3.0, top - len, 0.42, 0.72, len, pal.skin);
      box(10.0, 2.9, top - len - 0.5, 0.95, 0.92, 0.5, pal.skin, [1.04, 0.84, 0.66]);
    }
    if (S.covered > 0 && !waking) { const k = clamp(Math.min(S.covered, 0.6) / 0.6, 0, 1); if (S.site === 'arm') box(4.3, 6.0, 4.4 - 3.4 * k, 1.3, 0.56, 3.4 * k, pal.blanket, [1.1, 0.9, 0.7]); else box(10.0, 2.7, 4.4 - 3.2 * k, 0.56, 1.3, 3.2 * k, pal.blanket, [1.1, 0.9, 0.7]); }

    // pipes on the floor, then everything standing on it in depth order
    const site = SITES[S.site], rig = S.buildings.find((b) => b.type === 'rig'), center = MA.sim.padCenter;
    const tanks = S.buildings.filter((b) => b.type === 'tank'), refs = S.buildings.filter((b) => b.type === 'refinery'), hats = S.buildings.filter((b) => b.type === 'hatchery');
    const flowing = (S.biting || 0) > 0 ? 1 : 0, refining = (S.refineRate || 0) > 0.05 ? 1 : 0;
    const L = (a, b, z, flow) => pipe([[a[0], a[1], z], [a[0], b[1], z], [b[0], b[1], z]], flow);
    if (tanks[0]) { const tc = center(tanks[0]); pipe([[site.skin[0], site.skin[1] + 0.3, 1.2], [site.rig[0] + 1.2, site.rig[1] + 0.9, 1.2], [site.rig[0] + 1.2, site.rig[1] + 0.9, 0.18], [site.rig[0] + 1.2, tc[1], 0.18], [tc[0], tc[1], 0.18]], flowing); }
    tanks.slice(1).forEach((b, i) => L(center(tanks[i]), center(b), 0.14, flowing));
    refs.forEach((b, i) => L(center(tanks[Math.min(i, tanks.length - 1)]), center(b), 0.22, refining));
    hats.forEach((b, i) => refs[0] && L(center(refs[Math.min(i, refs.length - 1)]), center(b), 0.1, S.hatching ? 1 : 0));

    const items = [];
    const drop = (b) => { const k = clamp((S.time - b.born) / (FEEL.build_drop_ms / 1000), 0, 1); return fx.reduced ? 0 : (1 - k) * (1 - k) * 4; };
    for (const b of S.buildings) {
      if (b.type === 'rig') {
        items.push({ d: site.rig[0] + site.rig[1], f: () => { const [x, y] = site.rig, dz = drop(b), h = 1.3 + b.level * 0.22, w = 1.0 + b.level * 0.1; [[0, 0], [w, 0], [0, 0.9], [w, 0.9]].forEach(([ox, oy]) => box(x + ox, y + oy, dz, 0.14, 0.14, h, pal.metal)); box(x - 0.1, y - 0.1, dz + h, w + 0.34, 1.14, 0.12, pal.metal, [1.3, 1, 0.8]); for (let i = 0; i < b.level; i++) box(x + 0.1 + i * 0.3, y + 0.2, dz + h + 0.12, 0.2, 0.2, 0.26, pal.primary); if (opt.selected === b.id) sel(x, y, w + 0.3, 1.1); } });
        continue;
      }
      const p = PADS[b.pad], x = p[0], y = p[1];
      items.push({ d: x + y + 1.8, f: () => {
        const dz = drop(b), lv = b.level;
        ell(P(x + 1, y + 0.9, 0), s * 1.7, s * 0.8, 'rgba(0,0,0,.2)');
        if (b.type === 'tank') {
          const r = 0.74 + lv * 0.06, h = 1.7 + lv * 0.45, c = cyl(x + 1, y + 0.9, dz, r, h, pal.metal), fill = clamp(S.raw / Math.max(1, d.cap), 0, 1);
          const w = c.rx * 0.5, hh = h * s * 0.66, x0 = c.a[0] - w * 0.2, y0 = c.a[1] - h * s * 0.18 - hh;
          ctx.fillStyle = shade(pal.metalDark, 0.8); ctx.fillRect(x0, y0, w, hh); ctx.fillStyle = pal.blood; ctx.fillRect(x0, y0 + hh * (1 - fill), w, hh * fill); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x0 + w * 0.12, y0 + hh * 0.06, w * 0.16, hh * 0.88);
          glow([x0 + w / 2, y0 + hh * 0.7], s * 1.1, pal.blood, 0.12 + fill * 0.2);
          if (S.queued > 0 && b === tanks[0]) { const q = 0.5 + 0.5 * Math.sin(t * 8); ctx.strokeStyle = rgba(pal.accent, 0.5 + q * 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.b[0], c.b[1], c.rx, c.ry, 0, 0, 7); ctx.stroke(); tag(c.b[0], c.b[1] - s * 0.9, 'STORAGE FULL', pal.accent); }
        } else if (b.type === 'refinery') {
          const h = 1.5 + lv * 0.3;
          box(x, y, dz, 2.0, 1.7, h, pal.metal);
          for (let i = 0; i < 3; i++) winL(x + 0.2 + i * 0.6, x + 0.65 + i * 0.6, y + 1.7, dz + 0.55, dz + h - 0.4, refining ? pal.glow : shade(pal.metalDark, 1.4));
          winR(x + 2.0, y + 0.25, y + 1.45, dz + 0.55, dz + h - 0.4, refining ? shade(pal.glow, 0.82) : shade(pal.metalDark, 1.2));
          if (refining) glow(P(x + 1, y + 1.7, 0.9), s * (2 + fx.flare), pal.glow, 0.28 + fx.flare * 0.4);
          box(x - 0.1, y - 0.1, dz + h, 2.2, 1.9, 0.14, pal.primary);
          for (let k = 0; k < lv; k++) { const ch = cyl(x + 1.55 - k * 0.5, y + 0.5, dz + h + 0.14, 0.24, 1.1 + k * 0.2, pal.metal); if (refining && !fx.reduced) for (let i = 0; i < 3; i++) { const q = (t * 0.3 + i / 3 + k * 0.2) % 1; ctx.globalAlpha = (1 - q) * 0.45; ell([ch.b[0] + Math.sin(q * 5 + i) * s * 0.25, ch.b[1] - s * 0.2 - q * s * 1.8], s * (0.22 + q * 0.4), s * (0.18 + q * 0.3), pal.steam); } ctx.globalAlpha = 1; }
        } else if (b.type === 'hatchery') {
          box(x, y, dz, 2.0, 1.7, 0.8, pal.metal); winL(x + 0.2, x + 1.8, y + 1.7, dz + 0.26, dz + 0.56, pal.glow); glow(P(x + 1, y + 1.7, 0.4), s * 1.3, pal.glow, 0.24);
          const n = 2 + lv * 2; for (let i = 0; i < n; i++) { const ex = x + 0.45 + (i % 3) * 0.55, ey = y + 0.45 + Math.floor(i / 3) * 0.6, p2 = P(ex, ey, dz + 0.8), wob = S.hatching && i === 0 ? Math.sin(t * 20) * s * 0.04 : 0; ctx.fillStyle = pal.egg; ctx.beginPath(); ctx.ellipse(p2[0] + wob, p2[1], s * 0.3, s * 0.17, 0, 0, Math.PI); ctx.ellipse(p2[0] + wob, p2[1], s * 0.3, s * 0.38, 0, Math.PI, 0); ctx.fill(); ell([p2[0] - s * 0.08, p2[1] - s * 0.17], s * 0.07, s * 0.1, 'rgba(255,255,255,.6)'); }
        } else if (b.type === 'pool') {
          cyl(x + 1, y + 0.9, dz, 0.95 + lv * 0.07, 0.24 + lv * 0.06, pal.pillow, pal.water);
          for (let i = 0; i < 3 + lv * 2; i++) ell(P(x + 0.5 + ((i * 0.37) % 1), y + 0.5 + ((i * 0.61) % 0.9), dz + 0.3 + lv * 0.06), s * 0.1, s * 0.06, 'rgba(255,255,255,.85)');
        }
        if (opt.selected === b.id) sel(x, y, 2.0, 1.7);
        if (lv > 1) for (let i = 0; i < lv; i++) ell(P(x + 0.3 + i * 0.3, y + 1.85, 0.05), s * 0.1, s * 0.05, pal.primary);
      } });
    }
    function sel(x, y, w, dd) { ctx.save(); ctx.setLineDash([]); poly([P(x - 0.15, y - 0.15, 0), P(x + w + 0.15, y - 0.15, 0), P(x + w + 0.15, y + dd + 0.15, 0), P(x - 0.15, y + dd + 0.15, 0)], null, pal.primary, 2.5); ctx.restore(); }
    function tag(px, py, text, color) { ctx.font = `700 ${Math.max(10, s * 0.62)}px ${FONT_B}`; const w = ctx.measureText(text).width + 12, h = Math.max(16, s * 1.0); ctx.fillStyle = 'rgba(11,15,34,.92)'; ctx.fillRect(px - w / 2, py - h / 2, w, h); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, px, py + 1); ctx.textBaseline = 'alphabetic'; }
    // the gate sign and the plant manager on his crate
    items.push({ d: 0.4 + 11.3 + 2, f: () => { box(0.5, 11.3, 0, 0.1, 0.1, 1.2, pal.metal); box(2.5, 11.3, 0, 0.1, 0.1, 1.2, pal.metal); box(0.4, 11.25, 1.0, 2.3, 0.14, 1.0, pal.primary); const a = P(1.55, 11.39, 1.48); ctx.save(); ctx.translate(a[0], a[1]); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.fillStyle = pal.metalDark; ctx.font = `${s * 0.74}px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M&A', 0, 0); ctx.restore(); ctx.textBaseline = 'alphabetic'; } });
    items.push({ d: 3.3 + 10.9 + 1.2, f: () => {
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
    const ws = S.workers.slice().sort((a, b) => a.pos[0] + a.pos[1] - b.pos[0] - b.pos[1]);
    for (const w of ws) {
      const bob = fx.reduced ? 0 : Math.sin(t * 5 + w.id) * 0.06, station = w.job !== 'extract';
      const flip = w.to && w.from ? (w.to[0] - w.to[1]) < (w.from[0] - w.from[1]) : w.st === 'bite' ? S.site === 'arm' : w.id % 2 === 0;
      mosq([w.pos[0], w.pos[1], w.pos[2] + bob], clamp(24 / s, 1.2, 1.7), { carry: w.carry > 0 || (w.job === 'refine' && refining && Math.sin(t * 3 + w.id) > 0.2), flip, ph: w.id, grounded: w.st === 'bite', hat: w.job === 'hatch' ? '#f4f1ea' : w.job === 'refine' ? '#ff9d4d' : pal.hat });
    }

    // the hand
    if (S.hev && (S.hev.kind === 'swat' || S.hev.kind === 'scratch') && !waking) {
      const e = S.hev, big = e.kind === 'swat', p = clamp(e.t / e.telegraph, 0, 1), sk = site.skin, after = e.t - e.telegraph;
      const sp = P(sk[0], sk[1] + 0.6, 0.02); ell(sp, s * (0.6 + p * (big ? 1.8 : 1.0)), s * (0.3 + p * (big ? 0.9 : 0.5)), `rgba(0,0,0,${0.12 + p * 0.3})`);
      const fall = p < 0.82 ? 0 : (p - 0.82) / 0.18, lift = e.hit ? clamp((after - e.hold * 0.45) / (e.hold * 0.55), 0, 1) : 0;
      const hz = e.hit ? sk[2] - 0.6 + lift * 9 : sk[2] + 8 - fall * fall * 8.6 + (fx.reduced ? 0 : Math.sin(e.t * 26) * 0.12 * (1 - fall)), w = big ? 2.4 : 1.4, wig = e.hit && !big ? Math.sin(after * 22) * 0.25 : 0;
      if (S.site === 'arm') { box(sk[0] - w / 2 + wig, 6.42, hz, w, 0.5, big ? 2.6 : 1.6, pal.skin, [1.05, 0.9, 0.7]); ctx.strokeStyle = shade(pal.skin, 0.55); ctx.lineWidth = Math.max(1, s * 0.05); for (let i = 1; i < 4; i++) { const a = P(sk[0] - w / 2 + wig + (w * i) / 4, 6.92, hz), b = P(sk[0] - w / 2 + wig + (w * i) / 4, 6.92, hz + 1.0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
      else box(10.42, sk[1] - w / 2 + wig, hz, 0.5, w, big ? 2.6 : 1.6, pal.skin, [1.05, 0.9, 0.7]);
      if (!e.hit) { const q = 0.5 + 0.5 * Math.sin(e.t * 20); const wp = P(sk[0], sk[1], sk[2] + 2.4); tag(wp[0], wp[1], big ? 'SWAT INCOMING' : 'SCRATCH INCOMING', q > 0.5 ? pal.primary : pal.text); }
      else if (after < 0.25 && big && !fx.reduced) { const ip = P(sk[0], sk[1] + 0.5, sk[2]); ctx.strokeStyle = rgba(pal.text, 1 - after * 4); ctx.lineWidth = 3; for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283, r0 = s * (1.6 + after * 6), r1 = r0 + s * 0.9; ctx.beginPath(); ctx.moveTo(ip[0] + Math.cos(a) * r0, ip[1] + Math.sin(a) * r0 * 0.7); ctx.lineTo(ip[0] + Math.cos(a) * r1, ip[1] + Math.sin(a) * r1 * 0.7); ctx.stroke(); } }
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
    for (const q of fx.labels) { const k = q.t / q.life, p = P(q.x, q.y, q.z + k * 0.8); ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1; ctx.font = `${Math.max(15, s * 1.15)}px ${FONT_D}`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = pal.under; ctx.strokeText(q.text, p[0], p[1]); ctx.fillStyle = q.color; ctx.fillText(q.text, p[0], p[1]); ctx.globalAlpha = 1; }

    if (waking) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,214,160,${wk * 0.16})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
  }

  // which building is under a pointer (screen px)? nearest pad centre within reach
  function pick(v, S, px, py) {
    let best = null, bd = Math.max(30, v.s * 2.2);
    for (const b of S.buildings) { const c = b.type === 'rig' ? [SITES[S.site].rig[0] + 0.6, SITES[S.site].rig[1] + 0.5] : MA.sim.padCenter(b); const p = project(v, c[0], c[1], 0.9); const dd = Math.hypot(p[0] - px, p[1] - py); if (dd < bd) { bd = dd; best = b; } }
    return best;
  }

  MA.render = { draw, place, project, pick, onEvent, fx };
})(typeof window !== 'undefined' ? window : globalThis);
