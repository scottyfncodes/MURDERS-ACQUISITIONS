// Sound: the produced effects and music (assets/audio), with small synthesised cues for the events they do not cover.
// Everything starts on the first input (autoplay policy), and a missing or undecodable file falls back to a tone.
(function (root) {
  const MA = (root.MA = root.MA || {});
  const FILES = { click: 'assets/audio/click.ogg', coin: 'assets/audio/coin.ogg', thud: 'assets/audio/footstep.ogg', hit: 'assets/audio/hit.ogg', quota: 'assets/audio/magic.ogg', hatch: 'assets/audio/powerup.ogg', music: 'assets/audio/music.ogg' };
  const A = { ctx: null, master: null, buffers: {}, muted: false, started: false, musicNode: null, last: {} };

  // the produced Ogg files where the browser decodes them; the AAC copies in media/compat elsewhere (Safari)
  function url(path) {
    const probe = document.createElement('audio');
    const ogg = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"');
    return ogg ? path : path.replace('assets/audio/', 'media/compat/').replace('.ogg', '.m4a');
  }
  function start() {
    if (A.started) { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { A.ctx = new AC(); } catch (e) { return; }
    A.started = true; A.master = A.ctx.createGain(); A.master.gain.value = A.muted ? 0 : 1; A.master.connect(A.ctx.destination);
    for (const key of Object.keys(FILES)) load(key);
  }
  function load(key) {
    fetch(url(FILES[key])).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((buf) => new Promise((res, rej) => A.ctx.decodeAudioData(buf, res, rej)))
      .then((b) => { A.buffers[key] = b; if (key === 'music') music(true); })
      .catch(() => { A.buffers[key] = null; });
  }
  function music(on) {
    if (!A.ctx) return;
    if (!on) { if (A.musicNode) { try { A.musicNode.stop(); } catch (e) { /* already stopped */ } A.musicNode = null; } return; }
    if (A.musicNode || !A.buffers.music) return;
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = A.buffers.music; src.loop = true; g.gain.value = 0.28; src.connect(g).connect(A.master); src.start(); A.musicNode = src;
  }
  function tone(o) {
    const c = A.ctx, t0 = c.currentTime + (o.at || 0), osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t0); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.2, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g).connect(A.master); osc.start(t0); osc.stop(t0 + o.d + 0.05);
  }
  const SYNTH = {
    click: () => tone({ f: 660, d: 0.05, type: 'triangle', v: 0.12 }),
    coin: () => { tone({ f: 880, d: 0.08, type: 'triangle', v: 0.14 }); tone({ f: 1320, d: 0.12, type: 'triangle', v: 0.12, at: 0.06 }); },
    thud: () => tone({ f: 140, to: 50, d: 0.18, type: 'sine', v: 0.4 }),
    hit: () => tone({ f: 220, to: 40, d: 0.25, type: 'sawtooth', v: 0.4 }),
    quota: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, d: 0.25, type: 'triangle', v: 0.15, at: i * 0.08 })),
    hatch: () => { tone({ f: 520, to: 780, d: 0.12, type: 'sine', v: 0.14 }); },
    plip: () => tone({ f: 900, to: 1400, d: 0.06, type: 'sine', v: 0.05 }),
    deny: () => tone({ f: 160, d: 0.12, type: 'square', v: 0.1 }),
    warn: () => tone({ f: 300, to: 900, d: 1.2, type: 'sawtooth', v: 0.09 }),
    whistle: () => { tone({ f: 1800, to: 2400, d: 0.18, type: 'sine', v: 0.14 }); tone({ f: 2400, to: 1700, d: 0.22, type: 'sine', v: 0.14, at: 0.18 }); },
    alarm: () => { for (let i = 0; i < 6; i++) tone({ f: i % 2 ? 880 : 1100, d: 0.14, type: 'square', v: 0.09, at: i * 0.18 }); },
    stamp: () => tone({ f: 90, to: 45, d: 0.22, type: 'sine', v: 0.5 }),
  };
  function play(name, minGap) {
    if (!A.ctx || A.muted) return;
    const now = A.ctx.currentTime; if (minGap && now - (A.last[name] || -9) < minGap) return; A.last[name] = now;
    const b = A.buffers[name];
    if (b) { const src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = b; g.gain.value = name === 'hit' ? 0.9 : 0.6; src.connect(g).connect(A.master); src.start(); }
    else if (SYNTH[name]) SYNTH[name]();
  }
  function setMuted(m) { A.muted = !!m; if (A.master) A.master.gain.value = A.muted ? 0 : 1; }
  function hold(paused) { if (A.ctx) { if (paused) A.ctx.suspend(); else if (A.started) A.ctx.resume(); } }

  MA.audio = { start, play, music, setMuted, hold, state: A };
})(window);
