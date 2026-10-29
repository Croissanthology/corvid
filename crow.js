/* Evil Crow — havoc engine.
 * Injected as a content script (isolated world). Everything it does is visual:
 * it never clicks, submits, or deletes anything for real. Reload the page (or
 * use "Repair the page") and it's all back. */
(() => {
  'use strict';
  if (window.__evilCrow) return;
  if (typeof EVIL_CROW_SPRITES === 'undefined') return;
  const SPR = EVIL_CROW_SPRITES;

  const HAS_STORAGE = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const IS_BSKY = /(^|\.)bsky\.app$/.test(location.hostname);
  const S = 3; // pixel scale
  const MAX_CROWS = 12;

  const settings = { sound: true };
  if (HAS_STORAGE) {
    try {
      chrome.storage.local.get({ sound: true }, (v) => { settings.sound = !!v.sound; });
      chrome.storage.onChanged.addListener((ch) => { if (ch.sound) settings.sound = !!ch.sound.newValue; });
    } catch (e) { /* extension reloaded */ }
  }

  // ---------------------------------------------------------------- utils
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;
  const now = () => performance.now();
  const INTERRUPT = { interrupt: true };
  const ABORT = { abort: true };

  function weighted(items) { // [[value, weight], ...]
    const tot = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let r = Math.random() * tot;
    for (const [v, w] of items) { r -= Math.max(0, w); if (r <= 0) return v; }
    return items.length ? items[items.length - 1][0] : null;
  }

  // ---------------------------------------------------------------- lines
  const L = {
    greet: ['CAW.', "hello. i'm here to ruin things.", 'nice website. shame if', 'CLAIM!', 'CAW. hi.'],
    perch: ['CLAIM!', 'this one.', 'hm.', 'mine.', '*tap tap*', "don't need this."],
    shatter: ['CAW!', 'KRAA!', 'oops.', 'heh.', 'gone.', "ratio'd."],
    steal: ['CLAIM!', 'CLAIM!', 'CLAIM!', 'shiny.', 'mine now.', 'yoink.'],
    nest: ['heh.', 'the hoard grows.', 'CLAIM!', 'mine mine mine'],
    knock: ['oops.', 'bye.', '*boop*', 'whoops.', 'gravity check.'],
    eat: ['*crunch*', '*burp*', 'tasty words.', 'needed salt.'],
    cawify: ['CAW.', 'let me fix that.', 'edited.', 'CAW CAW.'],
    tilt: ['*sits*', 'crooked now.', 'heavy bird.', 'there.'],
    idle: ['CAW.', 'kraa.', 'hehehe', '...', 'i am the algorithm now', 'CLAIM!', 'CAW CAW'],
    rage: ['CAW!!', 'RUDE.', 'HOW DARE', 'i will remember this.', 'CLAIM!!'],
    leave: ['fine.', "i'll be back.", 'CAW (rude)', 'the nest stays.'],
    murder: ['MURDER!', 'reinforcements.', 'CAW CAW CAW'],
    repaired: ['CAW?!', 'hey.', 'who fixed that', 'oh, so we\'re doing this again'],
  };
  const LAW = 'there is no law.\nthere is only the caw.';
  L.greet.push(LAW);
  L.idle.push(LAW, LAW);
  L.shatter.push(LAW);
  L.rage.push(LAW);
  if (IS_BSKY) {
    L.greet.push('bisks? CLAIM!', 'CAW. (this is a bisk)');
    L.shatter.push('unbisked.', 'bisk deleted.', 'blocked.');
    L.idle.push('bisking through it');
    L.idle.push('posting through it', 'touch grass? no. touch glass. break glass.');
  }

  // ---------------------------------------------------------------- sprites
  function spriteCanvas(rows, scale) {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        g.fillStyle = SPR.palette[ch] || '#f0f';
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }
  let FRAMES = null;
  function frames() {
    if (!FRAMES) {
      FRAMES = {};
      for (const [k, rows] of Object.entries(SPR.crow.frames)) FRAMES[k] = spriteCanvas(rows, S);
    }
    return FRAMES;
  }
  const CW = SPR.crow.w * S, CH = SPR.crow.h * S;
  const AX = SPR.crow.anchor[0] * S, AY = SPR.crow.anchor[1] * S;

  // ---------------------------------------------------------------- ticker
  const tickers = new Set();
  let ticking = false, lastT = 0;
  function addTicker(fn) {
    tickers.add(fn);
    if (!ticking) { ticking = true; lastT = now(); requestAnimationFrame(loop); }
    return () => tickers.delete(fn);
  }
  function loop(t) {
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    for (const fn of Array.from(tickers)) {
      let keep;
      try { keep = fn(dt, t); } catch (e) { keep = false; console.debug('[evil crow]', e); }
      if (keep === false) tickers.delete(fn);
    }
    if (tickers.size) requestAnimationFrame(loop); else ticking = false;
  }

  // ---------------------------------------------------------------- stage
  const CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; overflow: visible; z-index: 2147483647; contain: layout style; }
    .crow { position: absolute; left: 0; top: 0; width: ${CW}px; height: ${CH}px; pointer-events: auto; cursor: pointer;
            image-rendering: pixelated; transform-origin: 50% 50%; will-change: transform;
            filter: drop-shadow(0 0 1px rgba(255,255,255,.55)) drop-shadow(0 3px 2px rgba(0,0,0,.35)); }
    .crow.rage { filter: drop-shadow(0 0 2px #ff1f3a) drop-shadow(0 0 7px rgba(255,31,58,.75)); }
    .bubble { position: absolute; left: 0; top: 0; pointer-events: none; white-space: pre; text-align: center;
              font: 800 13px/1.15 ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace; letter-spacing: .3px;
              color: #111; background: #fff; border: 2px solid #111; border-radius: 7px; padding: 4px 8px;
              box-shadow: 3px 3px 0 rgba(0,0,0,.35); }
    .bubble::after { content: ""; position: absolute; left: 50%; bottom: -8px; margin-left: -5px; width: 8px; height: 8px;
              background: inherit; border-right: 2px solid #111; border-bottom: 2px solid #111; transform: rotate(45deg); }
    .bubble.claim { background: #ffd93b; font-size: 17px; letter-spacing: 1px; padding: 5px 10px; }
    .bubble.rage { background: #ff3048; color: #fff; }
    .p { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; }
    .glint { width: 3px; height: 3px; background: #fff; box-shadow: 0 0 2px rgba(255,255,255,.9); }
    .crumb { font-weight: 700; white-space: pre; }
    .pix { image-rendering: pixelated; }
    .crack { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
    .nest { position: absolute; right: 22px; bottom: 6px; width: ${34 * S}px; height: ${10 * S + 36}px; pointer-events: auto; cursor: help; }
    .nest canvas { position: absolute; left: 0; bottom: 0; image-rendering: pixelated; z-index: 2; }
    .nest .loot { position: absolute; z-index: 1; object-fit: cover; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.4); background: #ddd; }
    .nest .count { position: absolute; z-index: 3; left: 50%; bottom: -2px; transform: translateX(-50%); font: 800 10px/1 ui-monospace, Menlo, monospace;
              color: #fff; background: rgba(20,14,10,.8); border-radius: 6px; padding: 2px 5px; }
    .carry { position: absolute; left: 0; top: 0; object-fit: cover; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,.45); background: #ddd; will-change: transform; }
  `;

  const Stage = {
    host: null, root: null, layer: null, debris: null, debrisOff: { x: 0, y: 0 },
    ensure() {
      if (!this.host || !this.host.isConnected) {
        const host = document.createElement('div');
        host.setAttribute('data-evil-crow', 'stage');
        const st = host.style;
        st.setProperty('position', 'fixed', 'important');
        st.setProperty('left', '0', 'important');
        st.setProperty('top', '0', 'important');
        st.setProperty('width', '0', 'important');
        st.setProperty('height', '0', 'important');
        st.setProperty('z-index', '2147483647', 'important');
        st.setProperty('pointer-events', 'none', 'important');
        const root = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = CSS;
        root.appendChild(style);
        try { // belt and braces in case a page CSP strips <style>
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(CSS);
          root.adoptedStyleSheets = [sheet];
        } catch (e) { /* fine */ }
        const layer = document.createElement('div');
        layer.className = 'layer';
        root.appendChild(layer);
        (document.documentElement || document.body).appendChild(host);
        this.host = host; this.root = root; this.layer = layer;
      }
      if (!this.debris || !this.debris.isConnected) {
        // Light-DOM layer so cloned page elements keep the page's own styles.
        const d = document.createElement('div');
        d.setAttribute('data-evil-crow', 'debris');
        d.inert = true;
        const st = d.style;
        st.setProperty('position', 'fixed', 'important');
        st.setProperty('left', '0', 'important');
        st.setProperty('top', '0', 'important');
        st.setProperty('width', '0', 'important');
        st.setProperty('height', '0', 'important');
        st.setProperty('overflow', 'visible', 'important');
        st.setProperty('z-index', '2147483646', 'important');
        st.setProperty('pointer-events', 'none', 'important');
        (document.body || document.documentElement).appendChild(d);
        this.debris = d;
      }
      return this;
    },
    debrisOffset() {
      const r = this.debris.getBoundingClientRect();
      return { x: r.left, y: r.top };
    },
  };

  function isOurs(el) {
    return !!(el && el.closest && el.closest('[data-evil-crow]'));
  }

  // ---------------------------------------------------------------- sound
  const Sound = {
    ctx: null, master: null, nbuf: null, armed: false,
    arm() {
      if (this.armed) return;
      this.armed = true;
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
      window.addEventListener('keydown', unlock, { capture: true, passive: true });
      this.unlock();
    },
    unlock() {
      if (!settings.sound) return;
      try {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.5;
          this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (e) { /* no audio, no problem */ }
    },
    get() {
      if (!settings.sound || !this.ctx) return null;
      if (this.ctx.state !== 'running') { this.ctx.resume().catch(() => {}); return null; }
      return this.ctx;
    },
    noiseBuffer(ctx) {
      if (!this.nbuf) {
        const n = ctx.sampleRate;
        this.nbuf = ctx.createBuffer(1, n, n);
        const d = this.nbuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      return this.nbuf;
    },
    env(ctx, t, dur, vol, attack = 0.005) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.master);
      return g;
    },
    noise(t, dur, { type = 'bandpass', f = 2000, f2 = null, q = 1, vol = 0.3, attack = 0.004 } = {}) {
      const ctx = this.get(); if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      const fl = ctx.createBiquadFilter();
      fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(f, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
      src.connect(fl).connect(this.env(ctx, t, dur, vol, attack));
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    },
    tone(t, dur, { type = 'sine', f = 440, f2 = null, vol = 0.2, attack = 0.004 } = {}) {
      const ctx = this.get(); if (!ctx) return;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      o.connect(this.env(ctx, t, dur, vol, attack));
      o.start(t); o.stop(t + dur + 0.05);
    },
    // A raspy crow caw: detuned saws, chopped by a square LFO, through vocal-ish formants.
    caw({ pitch = 1, dur = 0.3, vol = 0.32, delay = 0 } = {}) {
      const ctx = this.get(); if (!ctx) return;
      const t = ctx.currentTime + 0.01 + delay;
      const f0 = 520 * pitch;
      const mix = ctx.createGain(); mix.gain.value = 1;
      const chop = ctx.createGain(); chop.gain.value = 0.55;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 62 + Math.random() * 14;
      const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.45;
      lfo.connect(lfoAmt).connect(chop.gain);
      const oscs = [0, 14, -9].map((cents) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = cents;
        o.frequency.setValueAtTime(f0 * 1.12, t);
        o.frequency.linearRampToValueAtTime(f0 * 1.22, t + 0.045);
        o.frequency.linearRampToValueAtTime(f0 * 0.82, t + dur);
        o.connect(mix);
        return o;
      });
      mix.connect(chop);
      const out = this.env(ctx, t, dur, vol, 0.018);
      for (const [f, q, g] of [[1150, 3.5, 1.0], [2250, 4.5, 0.7], [3300, 5, 0.35]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (0.95 + pitch * 0.05); bp.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = g * 2.2;
        chop.connect(bp).connect(gg).connect(out);
      }
      for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
      lfo.start(t); lfo.stop(t + dur + 0.05);
      this.noise(t, dur * 0.9, { f: 2600, q: 1.3, vol: vol * 0.35, attack: 0.02 });
    },
    cawSeries(n = 1, pitch = 1, gap = 0.36) {
      for (let i = 0; i < n; i++) this.caw({ pitch: pitch * rand(0.95, 1.05), delay: i * gap, dur: rand(0.24, 0.34) });
    },
    claim() { // "cla-AIM!"
      this.caw({ pitch: 1.05, dur: 0.11, vol: 0.28 });
      this.caw({ pitch: 1.35, dur: 0.3, vol: 0.34, delay: 0.12 });
    },
    peck() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.noise(t, 0.03, { f: 2900, q: 2.5, vol: 0.45 });
      this.tone(t, 0.04, { f: 900, f2: 280, vol: 0.18 });
    },
    crunch() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      for (let i = 0; i < 3; i++) this.noise(t + i * rand(0.04, 0.07), 0.035, { type: 'lowpass', f: rand(1400, 2400), vol: 0.35 });
    },
    shatter() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.noise(t, 0.4, { f: 5200, f2: 1100, q: 0.9, vol: 0.5 });
      this.tone(t, 0.16, { f: 150, f2: 55, vol: 0.4 });
      for (let i = 0; i < 8; i++) this.tone(t + rand(0, 0.22), rand(0.06, 0.25), { f: rand(2600, 6800), vol: rand(0.04, 0.1) });
    },
    whoosh() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.noise(t, 0.38, { f: 450, f2: 1700, q: 1.6, vol: 0.22, attack: 0.12 });
    },
    kick() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.tone(t, 0.08, { type: 'square', f: 190, f2: 70, vol: 0.16 });
      this.noise(t, 0.03, { f: 1800, vol: 0.3 });
    },
    thump() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.tone(t, 0.16, { f: 130, f2: 48, vol: 0.5 });
      this.noise(t, 0.06, { type: 'lowpass', f: 500, vol: 0.3 });
    },
    splat() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.noise(t, 0.1, { type: 'lowpass', f: 900, vol: 0.45 });
      this.tone(t, 0.09, { f: 240, f2: 90, vol: 0.25 });
    },
    gulp() {
      const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime + 0.005;
      this.tone(t, 0.11, { f: 380, f2: 140, vol: 0.28 });
    },
  };

  // ---------------------------------------------------------------- repair log
  const Repair = {
    hidden: new Map(),     // el -> [value, priority]
    text: new Map(),       // text node -> original string
    anims: new Set(),      // Animation objects left running with fill: forwards
    extras: new Set(),     // our own nodes to remove (splats, cracks, ...)
    hide(el) {
      if (!this.hidden.has(el)) this.hidden.set(el, [el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')]);
      el.style.setProperty('visibility', 'hidden', 'important');
    },
    isHidden(el) {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (this.hidden.has(n)) return true;
      return false;
    },
    saveText(node) { if (!this.text.has(node)) this.text.set(node, node.nodeValue); },
    restoreAll() {
      for (const [el, [v, p]] of this.hidden) {
        if (v) el.style.setProperty('visibility', v, p); else el.style.removeProperty('visibility');
      }
      this.hidden.clear();
      for (const [node, s] of this.text) { try { node.nodeValue = s; } catch (e) { /* gone */ } }
      this.text.clear();
      for (const a of this.anims) { try { a.cancel(); } catch (e) { /* gone */ } }
      this.anims.clear();
      for (const n of this.extras) n.remove();
      this.extras.clear();
      if (Stage.debris) Stage.debris.replaceChildren();
      Nest.reset();
    },
  };

  // ---------------------------------------------------------------- page helpers
  function animate(el, frames, opts) {
    try { return el.animate(frames, Object.assign({ composite: 'add' }, opts)); } catch (e) {
      try { return el.animate(frames, opts); } catch (e2) { return null; }
    }
  }
  function shake(el, amt = 3, dur = 220) {
    const k = [];
    for (let i = 0; i < 6; i++) k.push({ transform: `translate(${rand(-amt, amt).toFixed(1)}px, ${rand(-amt, amt).toFixed(1)}px)` });
    k.push({ transform: 'translate(0,0)' });
    animate(el, k, { duration: dur, easing: 'linear' });
  }
  function nearestBg(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c && c.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        if (parts.length < 4 || parts[3] > 0.6) return c;
      }
    }
    return document.documentElement && getComputedStyle(document.documentElement).colorScheme === 'dark' ? '#111' : '#fff';
  }
  const INHERIT = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height',
    'letter-spacing', 'word-spacing', 'text-transform', 'text-align', 'white-space', 'direction', 'text-rendering',
    '-webkit-font-smoothing', 'font-feature-settings'];
  function makeClone(el, r) {
    const c = el.cloneNode(true);
    const all = [c, ...c.querySelectorAll('*')];
    for (const n of all) {
      n.removeAttribute('id');
      n.removeAttribute('data-testid');
      n.removeAttribute('autofocus');
      if (n.tabIndex !== undefined) n.tabIndex = -1;
    }
    for (const f of c.querySelectorAll('iframe, embed, object')) {
      const d = document.createElement('div');
      d.style.width = (f.offsetWidth || f.getAttribute('width') || 200) + 'px';
      d.style.height = (f.offsetHeight || f.getAttribute('height') || 120) + 'px';
      d.style.background = '#222';
      f.replaceWith(d);
    }
    for (const v of c.querySelectorAll('video, audio')) {
      v.muted = true; v.autoplay = false; v.removeAttribute('autoplay');
      try { v.pause(); } catch (e) { /* fine */ }
    }
    const oc = el.tagName === 'CANVAS' ? [el] : Array.from(el.querySelectorAll('canvas'));
    const cc = c.tagName === 'CANVAS' ? [c] : Array.from(c.querySelectorAll('canvas'));
    oc.forEach((o, i) => { try { cc[i].getContext('2d').drawImage(o, 0, 0); } catch (e) { /* tainted or webgl */ } });
    const cs = getComputedStyle(el);
    const set = (k, v) => c.style.setProperty(k, v, 'important');
    set('position', 'absolute'); set('left', '0'); set('top', '0'); set('right', 'auto'); set('bottom', 'auto');
    set('margin', '0'); set('width', r.width + 'px'); set('height', r.height + 'px'); set('box-sizing', 'border-box');
    set('max-width', 'none'); set('max-height', 'none'); set('min-width', '0'); set('min-height', '0');
    set('transform', 'none'); set('translate', 'none'); set('rotate', 'none'); set('scale', 'none');
    set('visibility', 'visible'); set('pointer-events', 'none'); set('transition', 'none'); set('animation', 'none');
    if (cs.display === 'inline' || cs.display === 'contents') set('display', 'inline-block');
    return c;
  }
  function inheritInto(wrap, el) {
    const cs = getComputedStyle(el);
    for (const p of INHERIT) {
      const v = cs.getPropertyValue(p);
      if (v) wrap.style.setProperty(p, v);
    }
  }
  function debrisBox(r) {
    Stage.ensure();
    const off = Stage.debrisOffset();
    const box = document.createElement('div');
    const st = box.style;
    st.position = 'absolute';
    st.left = (r.left - off.x) + 'px';
    st.top = (r.top - off.y) + 'px';
    st.width = r.width + 'px';
    st.height = r.height + 'px';
    st.margin = '0';
    st.pointerEvents = 'none';
    st.willChange = 'transform';
    return box;
  }

  // Physics for anything that should fall off the screen.
  function fling(node, { vx = 0, vy = 0, vr = 0, g = 2100, ox = 0, oy = 0, delay = 0, life = 4, fade = 0, removeAt = null, onDone = null }) {
    let x = 0, y = 0, a = 0, t = -delay;
    node.style.transformOrigin = `${ox}px ${oy}px`;
    addTicker((dt) => {
      if (!node.isConnected) return false;
      t += dt;
      if (t < 0) return true;
      vy += g * dt; x += vx * dt; y += vy * dt; a += vr * dt;
      node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${a.toFixed(1)}deg)`;
      if (fade && t > life - fade) node.style.opacity = String(clamp((life - t) / fade, 0, 1));
      const r = removeAt ? removeAt() : null;
      if (t > life || (r !== null && y > r)) { node.remove(); if (onDone) onDone(); return false; }
      return true;
    });
  }

  // Shatter a page element into falling clipped clones.
  function shatter(el, cx, cy) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { Repair.hide(el); return; }
    const lx = clamp(cx - r.left, r.width * 0.12, r.width * 0.88);
    const ly = clamp(cy - r.top, r.height * 0.15, r.height * 0.85);
    const heavy = el.getElementsByTagName('*').length > 400;
    const polys = shardPolys(r.width, r.height, lx, ly, heavy ? 4 : randi(5, 7), !heavy);
    const bg = nearestBg(el);
    const clone = makeClone(el, r);
    polys.forEach((poly, i) => {
      const box = debrisBox(r);
      box.style.filter = 'drop-shadow(0 3px 4px rgba(0,0,0,.35))';
      const inner = document.createElement('div');
      const ist = inner.style;
      ist.position = 'absolute'; ist.left = '0'; ist.top = '0'; ist.width = '100%'; ist.height = '100%';
      ist.overflow = 'hidden';
      ist.background = bg;
      ist.clipPath = `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
      inheritInto(inner, el);
      inner.appendChild(i === 0 ? clone : clone.cloneNode(true));
      box.appendChild(inner);
      Stage.debris.appendChild(box);
      const c = centroid(poly);
      let dx = c[0] - lx, dy = c[1] - ly;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const sp = rand(140, 420);
      fling(box, {
        vx: dx * sp + rand(-40, 40), vy: dy * sp * 0.6 - rand(120, 320), vr: rand(-260, 260),
        ox: c[0], oy: c[1], delay: rand(0.04, 0.16), life: 3.5, removeAt: () => vh() + 200 - r.top,
      });
    });
    Repair.hide(el);
    glints(cx, cy, 12);
    Sound.shatter();
  }
  function centroid(poly) {
    let x = 0, y = 0;
    for (const p of poly) { x += p[0]; y += p[1]; }
    return [x / poly.length, y / poly.length];
  }
  // Wedges radiating from the impact point; big wedges get split once more.
  function shardPolys(w, h, cx, cy, n, split) {
    const off = Math.random() * Math.PI * 2;
    const angs = [];
    for (let i = 0; i < n; i++) angs.push(off + (i + rand(-0.3, 0.3)) * (Math.PI * 2 / n));
    angs.sort((a, b) => a - b);
    const corners = [[0, 0], [w, 0], [w, h], [0, h]].map((p) => [p, Math.atan2(p[1] - cy, p[0] - cx)]);
    const hit = (a) => {
      const dx = Math.cos(a), dy = Math.sin(a);
      let t = Infinity;
      if (dx > 1e-9) t = Math.min(t, (w - cx) / dx);
      if (dx < -1e-9) t = Math.min(t, -cx / dx);
      if (dy > 1e-9) t = Math.min(t, (h - cy) / dy);
      if (dy < -1e-9) t = Math.min(t, -cy / dy);
      return [cx + dx * t, cy + dy * t];
    };
    const norm = (a) => { while (a < 0) a += Math.PI * 2; while (a >= Math.PI * 2) a -= Math.PI * 2; return a; };
    const out = [];
    for (let i = 0; i < n; i++) {
      const a0 = angs[i], a1 = i + 1 < n ? angs[i + 1] : angs[0] + Math.PI * 2;
      const span = a1 - a0;
      const mids = corners
        .map(([p, a]) => [p, norm(a - a0)])
        .filter(([, da]) => da > 0 && da < span)
        .sort((u, v) => u[1] - v[1])
        .map(([p]) => p);
      const A = hit(a0), B = hit(a1);
      const outer = [A, ...mids, B];
      if (split && (outer.length > 2 || Math.hypot(A[0] - cx, A[1] - cy) > 140)) {
        const t = rand(0.35, 0.6);
        const A2 = [cx + (A[0] - cx) * t, cy + (A[1] - cy) * t];
        const B2 = [cx + (B[0] - cx) * t * rand(0.85, 1.15), cy + (B[1] - cy) * t * rand(0.85, 1.15)];
        out.push([[cx, cy], A2, B2]);
        out.push([A2, ...outer, B2]);
      } else {
        out.push([[cx, cy], ...outer]);
      }
    }
    return out;
  }

  function throwClone(el, { vx, vy, vr }) {
    const r = el.getBoundingClientRect();
    const box = debrisBox(r);
    inheritInto(box, el);
    box.appendChild(makeClone(el, r));
    Stage.debris.appendChild(box);
    Repair.hide(el);
    fling(box, { vx, vy, vr, ox: r.width / 2, oy: r.height / 2, g: 1900, life: 4, removeAt: () => vh() + 200 - r.top });
  }

  // Little particles that live in the shadow layer.
  function particle(node, x, y, opts) {
    node.classList.add('p');
    Stage.layer.appendChild(node);
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    fling(node, Object.assign({ life: 1.4, fade: 0.5 }, opts));
  }
  function glints(x, y, n) {
    for (let i = 0; i < n; i++) {
      const g = document.createElement('div');
      g.className = 'glint';
      if (chance(0.4)) { g.style.width = '2px'; g.style.height = '5px'; }
      const a = rand(0, Math.PI * 2), sp = rand(120, 420);
      particle(g, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, vr: rand(-720, 720), g: 1500, life: rand(0.6, 1.2), fade: 0.4 });
    }
  }
  function feathers(x, y, n) {
    for (let i = 0; i < n; i++) {
      const f = spriteCanvas(SPR.feather, S);
      f.classList.add('pix');
      Stage.layer.appendChild(f);
      f.classList.add('p');
      let px = x + rand(-12, 12), py = y + rand(-12, 6), t = 0;
      const sway = rand(1.5, 3), amp = rand(18, 34), vy = rand(28, 55), ph = rand(0, 6);
      addTicker((dt) => {
        if (!f.isConnected) return false;
        t += dt;
        const xx = px + Math.sin(t * sway + ph) * amp;
        py += vy * dt;
        f.style.transform = `translate3d(${xx.toFixed(1)}px, ${py.toFixed(1)}px, 0) rotate(${(Math.cos(t * sway + ph) * 35).toFixed(1)}deg)`;
        if (t > 2.4) f.style.opacity = String(clamp((3.2 - t) / 0.8, 0, 1));
        if (t > 3.2) { f.remove(); return false; }
        return true;
      });
    }
  }

  // Cracks that grow with each peck, pinned to the element.
  class Cracks {
    constructor(el) {
      this.el = el;
      const r = el.getBoundingClientRect();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'crack');
      svg.setAttribute('width', String(Math.ceil(r.width)));
      svg.setAttribute('height', String(Math.ceil(r.height)));
      svg.setAttribute('viewBox', `0 0 ${Math.ceil(r.width)} ${Math.ceil(r.height)}`);
      this.svg = svg; this.w = r.width; this.h = r.height;
      Stage.layer.appendChild(svg);
      Repair.extras.add(svg);
      this.untick = addTicker(() => {
        if (!svg.isConnected || !el.isConnected) { svg.remove(); return false; }
        const rr = el.getBoundingClientRect();
        svg.style.transform = `translate3d(${rr.left}px, ${rr.top}px, 0)`;
        return true;
      });
    }
    hit(lx, ly, k) {
      const paths = [];
      const n = randi(3, 5);
      for (let i = 0; i < n; i++) {
        let a = rand(0, Math.PI * 2), x = lx, y = ly;
        const len = rand(18, 50) + k * rand(50, 140);
        let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
        let s = 0;
        while (s < len) {
          const step = rand(6, 16);
          a += rand(-0.6, 0.6);
          x += Math.cos(a) * step; y += Math.sin(a) * step; s += step;
          d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          if (chance(0.18)) {
            const b = a + rand(-1.2, 1.2) * (chance(0.5) ? 1 : -1);
            const bx = x + Math.cos(b) * rand(8, 24), by = y + Math.sin(b) * rand(8, 24);
            paths.push(`M${x.toFixed(1)} ${y.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`);
          }
        }
        paths.push(d);
      }
      const ring = [];
      const rr = 5 + k * 6;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ring.push(`${(lx + Math.cos(a) * rr * rand(0.7, 1.3)).toFixed(1)},${(ly + Math.sin(a) * rr * rand(0.7, 1.3)).toFixed(1)}`);
      }
      const add = (d, stroke, width, dx = 0) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', stroke);
        p.setAttribute('stroke-width', String(width));
        p.setAttribute('stroke-linejoin', 'round');
        p.setAttribute('stroke-linecap', 'round');
        if (dx) p.setAttribute('transform', `translate(${dx} ${dx})`);
        this.svg.appendChild(p);
      };
      for (const d of paths) { add(d, 'rgba(255,255,255,.65)', 1.2, 1); add(d, 'rgba(10,8,14,.85)', 2); }
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', ring.join(' '));
      poly.setAttribute('fill', 'rgba(10,8,14,.25)');
      poly.setAttribute('stroke', 'rgba(10,8,14,.8)');
      poly.setAttribute('stroke-width', '1.5');
      this.svg.appendChild(poly);
    }
    remove() { this.svg.remove(); Repair.extras.delete(this.svg); }
  }

  // ---------------------------------------------------------------- the nest
  const Nest = {
    el: null, box: null, countEl: null, items: 0,
    ensure() {
      Stage.ensure();
      if (this.el && this.el.isConnected) return this;
      const el = document.createElement('div');
      el.className = 'nest';
      const c = spriteCanvas(SPR.nest, S);
      el.appendChild(c);
      const count = document.createElement('div');
      count.className = 'count';
      el.appendChild(count);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        Sound.unlock();
        const crow = Array.from(crows).find((k) => !k.leaving);
        if (crow) { crow.say(pick(['MINE.', 'CLAIM!', 'hands off.', 'that is the hoard.']), { claim: true }); Sound.claim(); }
      });
      Stage.layer.appendChild(el);
      this.el = el; this.countEl = count;
      this.items = 0;
      this.update();
      el.animate([{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      return this;
    },
    update() {
      if (!this.el) return;
      this.countEl.textContent = `hoard: ${this.items}`;
      this.countEl.style.display = this.items ? '' : 'none';
      this.el.title = `the crow's hoard (${this.items} shiny thing${this.items === 1 ? '' : 's'})`;
    },
    perchPoint(fx = 0.5) {
      const r = this.ensure().el.getBoundingClientRect();
      return { x: r.left + r.width * fx, y: r.bottom - 10 * S + 4 };
    },
    dropIn(img, fromX, fromY) {
      this.ensure();
      const r = this.el.getBoundingClientRect();
      const size = parseFloat(img.style.width) || 40;
      const lx = rand(8, r.width - size - 8);
      const ly = r.height - 10 * S - size * 0.55 - rand(0, 10);
      img.className = 'loot';
      img.style.transform = '';
      img.style.left = lx + 'px';
      img.style.top = ly + 'px';
      img.style.rotate = rand(-25, 25).toFixed(0) + 'deg';
      this.el.appendChild(img);
      img.animate([{ translate: `${fromX - (r.left + lx)}px ${fromY - (r.top + ly)}px` }, { translate: '0 0' }],
        { duration: 380, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      this.items++;
      this.update();
      // keep the pile from growing forever
      const loots = this.el.querySelectorAll('.loot');
      if (loots.length > 9) loots[0].remove();
    },
    reset() { if (this.el) this.el.remove(); this.el = null; this.items = 0; },
  };

  // ---------------------------------------------------------------- targeting
  const claimed = new WeakSet();
  function usable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.body || el === document.documentElement || el === document.head) return false;
    if (isOurs(el) || claimed.has(el) || Repair.isHidden(el)) return false;
    const tag = el.tagName;
    if (tag === 'HTML' || tag === 'BODY' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META') return false;
    return true;
  }
  function visibleish(el) {
    const cs = getComputedStyle(el);
    return cs.visibility === 'visible' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.15;
  }
  function samplePoints(n) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([rand(vw() * 0.03, vw() * 0.97), rand(70, vh() - 30)]);
    return pts;
  }
  function stackAt(x, y) {
    try { return document.elementsFromPoint(x, y).filter((e) => !isOurs(e)); } catch (e) { return []; }
  }
  function perchTopOK(r) { return r.top >= 56 && r.top <= vh() - 80 && r.right > 30 && r.left < vw() - 30; }
  function queryVisible(sel, ok) {
    try {
      return Array.from(document.querySelectorAll(sel)).filter((el) => usable(el) && ok(el.getBoundingClientRect(), el) && visibleish(el));
    } catch (e) { return []; }
  }

  const BSKY = {
    big: '[data-testid^="feedItem-by-"], [data-testid^="postThreadItem-by-"], [data-testid="contentHider-post"]',
    text: '[data-testid="postText"]',
    small: '[data-testid="likeBtn"], [data-testid="repostBtn"], [data-testid="replyBtn"], [data-testid="postDropdownBtn"], [data-testid="userAvatarImage"]',
  };

  function bigOK(r, maxH = 0.72) {
    const a = r.width * r.height;
    return r.width >= 40 && r.height >= 22 && a >= 2500 && r.width <= vw() * 0.94 && r.height <= vh() * maxH && a <= vw() * vh() * 0.42 && perchTopOK(r);
  }
  function smallOK(r) {
    const a = r.width * r.height;
    return r.width >= 12 && r.height >= 12 && r.width <= 280 && r.height <= 130 && a >= 180 && a <= 20000 &&
      r.bottom >= 110 && r.bottom <= vh() - 8 && r.left > 50 && r.right < vw() - 50;
  }

  function pickBig() {
    if (IS_BSKY && chance(0.75)) {
      const c = queryVisible(BSKY.big, (r) => bigOK(r, 0.92));
      if (c.length) return pick(c);
    }
    const cands = new Map();
    for (const [x, y] of samplePoints(30)) {
      for (const el of stackAt(x, y)) {
        if (cands.has(el)) continue;
        const r = el.getBoundingClientRect();
        if (usable(el) && bigOK(r)) cands.set(el, Math.sqrt(r.width * r.height) * (el.childElementCount ? 1.5 : 1));
      }
    }
    const list = Array.from(cands).filter(([el]) => visibleish(el));
    return list.length ? weighted(list) : null;
  }
  const INTERACTIVE = /^(A|BUTTON|IMG|SVG|INPUT|SELECT|TEXTAREA|LABEL|VIDEO|PICTURE|svg)$/;
  function pickSmall() {
    if (IS_BSKY && chance(0.7)) {
      const c = queryVisible(BSKY.small, smallOK);
      if (c.length) return pick(c);
    }
    const cands = new Map();
    for (const [x, y] of samplePoints(36)) {
      for (const el of stackAt(x, y)) {
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 20000) break; // stacks go inner -> outer
        if (!cands.has(el) && usable(el) && smallOK(r)) {
          const w = INTERACTIVE.test(el.tagName) || el.getAttribute('role') === 'button' ? 3 : 1;
          cands.set(el, w);
          break;
        }
      }
    }
    const list = Array.from(cands).filter(([el]) => visibleish(el));
    return list.length ? weighted(list) : null;
  }
  const WORD = /\S+/g;
  function wordCount(s) { const m = s.match(WORD); return m ? m.length : 0; }
  function textNodes(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function textOK(el, r) {
    if (!(r.width >= 80 && r.height >= 14 && r.height <= vh() * 0.6 && r.width * r.height <= vw() * vh() * 0.35 && perchTopOK(r))) return false;
    if (el.isContentEditable || el.closest('input, textarea, [contenteditable="true"]')) return false;
    return wordCount(el.textContent || '') >= 5;
  }
  function pickText() {
    if (IS_BSKY && chance(0.8)) {
      const c = queryVisible(BSKY.text, (r, el) => textOK(el, r));
      if (c.length) return pick(c);
    }
    const cands = new Set();
    for (const [x, y] of samplePoints(30)) {
      for (const el of stackAt(x, y)) {
        if (!usable(el)) continue;
        const disp = getComputedStyle(el).display;
        if (disp === 'inline' || disp === 'contents') continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height > vw() * vh() * 0.35) break;
        if (textOK(el, r)) { cands.add(el); break; }
      }
    }
    const list = Array.from(cands).filter(visibleish);
    return list.length ? pick(list) : null;
  }
  function pickShiny() {
    const imgs = Array.from(document.images).filter((im) => {
      if (!usable(im) || !im.complete || !im.naturalWidth) return false;
      const r = im.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      return r.width >= 18 && r.height >= 18 && r.width <= vw() * 0.9 && cy >= 70 && cy <= vh() - 40 &&
        r.left + r.width / 2 > 20 && r.left + r.width / 2 < vw() - 20 && visibleish(im);
    });
    return imgs.length ? pick(imgs) : null;
  }

  // ---------------------------------------------------------------- word mangling
  function cawWord(tok) {
    const m = tok.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’\-]*)?(.*)$/su);
    if (!m || !m[2]) return tok;
    const [, pre, core, post] = m;
    if (/https?:|www\.|\.[a-z]{2,}\//i.test(tok)) return pre + 'caw.caw/caw' + (post && !/[\/.]/.test(post) ? post : '');
    const n = core.length;
    let w;
    if (chance(0.025)) return pre + 'CLAIM' + post;
    if (chance(0.08)) w = 'kraa';
    else if (n <= 2) w = 'aw';
    else if (n <= 4) w = 'caw';
    else w = 'c' + 'a'.repeat(Math.min(n - 2, 7)) + 'w';
    const letters = core.replace(/[^\p{L}]/gu, '');
    if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) w = w.toUpperCase();
    else if (core[0] && core[0] !== core[0].toLowerCase()) w = w[0].toUpperCase() + w.slice(1);
    return pre + w + post;
  }

  // ---------------------------------------------------------------- the crow
  const crows = new Set();
  let crowSerial = 0;

  class Crow {
    constructor({ x, y } = {}) {
      Stage.ensure();
      this.id = ++crowSerial;
      const fromLeft = chance(0.5);
      this.x = x !== undefined ? x : (fromLeft ? -80 : vw() + 80);
      this.y = y !== undefined ? y : rand(90, vh() * 0.45);
      this.facing = fromLeft ? 1 : -1;
      this.vx = 0; this.vy = 0;
      this.yOff = 0;
      this.frame = null;
      this.anchor = null;
      this.anchorLost = false;
      this.motion = null;
      this.tok = 0;
      this.pending = new Set();
      this.leaving = false;
      this.rageUntil = 0;
      this.pokes = 0;
      this.carry = null;
      this.bubble = null;
      this.bubbleUntil = 0;
      this.firstLanding = true;

      const c = document.createElement('canvas');
      c.width = CW; c.height = CH;
      c.className = 'crow';
      c.title = 'an evil crow (click at your own risk)';
      this.canvas = c; this.g = c.getContext('2d');
      this.g.imageSmoothingEnabled = false;
      Stage.layer.appendChild(c);
      c.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.poked(); });
      c.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      this.setFrame('fly_up');
      this.untick = addTicker((dt, t) => this.tick(dt, t));
      this.render();
      this.life();
    }

    // ---- low-level
    setFrame(f) {
      if (f === this.frame) return;
      this.frame = f;
      this.g.clearRect(0, 0, CW, CH);
      this.g.drawImage(frames()[f], 0, 0);
    }
    get raging() { return now() < this.rageUntil; }
    beak() {
      const [bx, by] = SPR.crow.beak[this.frame] || SPR.crow.beak.stand;
      return { x: this.x + this.facing * (bx * S - AX), y: this.y + (by * S - AY) + this.yOff };
    }
    head() { return { x: this.x + this.facing * (7 * S), y: this.y - 20 * S + this.yOff }; }
    anchorPoint(a) {
      if (!a.el.isConnected) return null;
      const r = a.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: r.left + a.fx * r.width + (a.ox || 0), y: (a.bottom ? r.bottom : r.top) + (a.oy || 0) };
    }
    tick(dt, t) {
      if (!this.canvas.isConnected) return false;
      if (this.anchor) {
        const p = this.anchorPoint(this.anchor);
        if (p) { this.x = p.x; this.y = p.y; } else { this.anchor = null; this.anchorLost = true; }
      }
      if (this.motion) this.motion(dt, t);
      this.render();
      return true;
    }
    render() {
      const left = this.x - (this.facing > 0 ? AX : CW - AX);
      const top = this.y - AY + this.yOff;
      this.canvas.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) scaleX(${this.facing})`;
      this.canvas.classList.toggle('rage', this.raging);
      if (this.carry) {
        const c = this.carry;
        c.t = Math.min(1, c.t + 1 / 18);
        const w = c.w0 + (c.w1 - c.w0) * c.t, h = c.h0 + (c.h1 - c.h0) * c.t;
        const cx = c.x0 + (this.x - c.x0) * c.t, cy = c.y0 + (this.y + 2 - c.y0) * c.t;
        c.el.style.width = w + 'px'; c.el.style.height = h + 'px';
        c.el.style.transform = `translate3d(${(cx - w / 2).toFixed(1)}px, ${cy.toFixed(1)}px, 0) rotate(${(Math.sin(now() / 140) * 6).toFixed(1)}deg)`;
      }
      if (this.bubble) {
        if (now() > this.bubbleUntil) { this.bubble.remove(); this.bubble = null; } else {
          const h = this.head();
          const bw = this.bubble.offsetWidth || 60;
          const bx = clamp(h.x, bw / 2 + 6, vw() - bw / 2 - 6);
          const by = Math.max(h.y - 8, (this.bubble.offsetHeight || 24) + 8);
          this.bubble.style.transform = `translate3d(${(bx - bw / 2).toFixed(1)}px, ${(by - (this.bubble.offsetHeight || 24)).toFixed(1)}px, 0)`;
        }
      }
    }

    // ---- async plumbing: everything awaits through step() so banish can cut it short
    track(p, resolve) {
      const entry = resolve;
      this.pending.add(entry);
      return p.finally(() => this.pending.delete(entry));
    }
    async step(p) {
      const tok = this.tok;
      await p;
      if (tok !== this.tok || this.leaving) throw INTERRUPT;
      if (this.anchorLost) { this.anchorLost = false; throw ABORT; }
    }
    interrupt() {
      this.tok++;
      this.motion = null;
      for (const r of Array.from(this.pending)) r();
      this.pending.clear();
    }
    sleep(ms) {
      let res;
      const p = new Promise((r) => { res = r; setTimeout(r, ms); });
      return this.track(p, res);
    }
    flyTo(getTarget, { speed = 560, lift = 220 } = {}) {
      this.anchor = null;
      this.anchorLost = false;
      let res;
      const p = new Promise((r) => { res = r; });
      let flap = 0, up = true;
      if (Math.hypot(this.vx, this.vy) < 50) this.vy = -lift;
      const start = { x: this.x, y: this.y };
      let dropped = false;
      const splatAt = chance(0.16) ? rand(0.3, 0.7) : -1;
      this.motion = (dt) => {
        const tg = getTarget();
        if (!tg) { this.motion = null; this.anchorLost = true; res(); return; }
        flap += dt;
        if (flap > (this.raging ? 0.06 : 0.085)) { flap = 0; up = !up; this.setFrame(up ? 'fly_up' : 'fly_down'); }
        const dx = tg.x - this.x, dy = tg.y - this.y, d = Math.hypot(dx, dy);
        const sp = speed * (this.raging ? 1.45 : 1);
        if (d < 70) {
          const k = Math.min(1, dt * 11);
          this.x += dx * k; this.y += dy * k;
          this.vx *= 0.8; this.vy *= 0.8;
          if (d < 1.5) { this.x = tg.x; this.y = tg.y; this.vx = 0; this.vy = 0; this.motion = null; this.setFrame('stand'); res(); return; }
        } else {
          const dvx = dx / d * sp, dvy = dy / d * sp;
          const k = Math.min(1, dt * 3.2);
          this.vx += (dvx - this.vx) * k; this.vy += (dvy - this.vy) * k;
          this.x += this.vx * dt; this.y += this.vy * dt;
        }
        if (Math.abs(this.vx) > 25) this.facing = this.vx > 0 ? 1 : -1;
        else if (Math.abs(dx) > 6) this.facing = dx > 0 ? 1 : -1;
        if (!dropped && splatAt > 0) {
          const total = Math.hypot(tg.x - start.x, tg.y - start.y);
          if (total > 260 && 1 - d / total > splatAt) { dropped = true; dropSplat(this.x - this.facing * 12, this.y + 4); }
        }
      };
      return this.track(p, res);
    }
    flyToEl(el, fx, { bottom = false, ox = 0, oy = 0 } = {}) {
      return this.flyTo(() => {
        if (!el.isConnected) return null;
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh() + 200) return null;
        return { x: r.left + fx * r.width + ox, y: (bottom ? r.bottom : r.top) + oy };
      });
    }
    perch(el, fx, opts = {}) {
      this.anchor = Object.assign({ el, fx }, opts);
      this.anchorLost = false;
      this.vx = 0; this.vy = 0;
      this.setFrame('stand');
    }
    hop(dist = 0, ms = 200) { // hop along the current anchor (or in place)
      let res;
      const p = new Promise((r) => { res = r; });
      const a = this.anchor;
      const ox0 = a ? (a.ox || 0) : 0;
      const x0 = this.x;
      let t = 0;
      this.motion = (dt) => {
        t += dt * 1000;
        const k = Math.min(1, t / ms);
        this.yOff = -Math.sin(k * Math.PI) * 11;
        if (a) a.ox = ox0 + dist * k; else this.x = x0 + dist * k;
        if (k >= 1) { this.yOff = 0; this.motion = null; res(); }
      };
      if (dist) this.facing = dist > 0 ? 1 : -1;
      return this.track(p, res);
    }
    async flutterUp(h = 40) {
      this.anchor = null;
      let res;
      const p = new Promise((r) => { res = r; });
      let t = 0, flap = 0, up = true;
      this.vy = -h * 4;
      this.motion = (dt) => {
        t += dt; flap += dt;
        if (flap > 0.07) { flap = 0; up = !up; this.setFrame(up ? 'fly_up' : 'fly_down'); }
        this.vy += 500 * dt; this.y += this.vy * dt;
        if (t > 0.45) { this.motion = null; res(); }
      };
      return this.track(p, res);
    }
    async peck(times = 1) {
      for (let i = 0; i < times; i++) {
        this.setFrame('peck');
        Sound.peck();
        await this.step(this.sleep(this.raging ? 70 : 105));
        this.setFrame('stand');
        await this.step(this.sleep(this.raging ? rand(60, 120) : rand(110, 240)));
      }
    }
    say(text, { claim = false, rage = false, ms = 1700 } = {}) {
      if (!text) return;
      if (/CLAIM/.test(text)) claim = true;
      if (this.bubble) this.bubble.remove();
      const b = document.createElement('div');
      b.className = 'bubble' + (claim ? ' claim' : '') + (rage ? ' rage' : '');
      b.textContent = text;
      Stage.layer.appendChild(b);
      this.bubble = b;
      this.bubbleUntil = now() + ms + text.length * 25;
      this.render();
      b.animate([{ scale: '0.3', opacity: 0 }, { scale: '1.12', opacity: 1, offset: 0.6 }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
      if (claim) b.animate([{ rotate: '-4deg' }, { rotate: '4deg' }, { rotate: '-3deg' }, { rotate: '0deg' }], { duration: 360, delay: 200 });
    }
    async caw(text, { n = 1, pitch = 1 } = {}) {
      const claim = text && /CLAIM/.test(text);
      const law = text === LAW;
      this.setFrame('caw');
      if (claim) Sound.claim();
      else if (law) Sound.cawSeries(2, 0.72, 0.5); // slow, low, ominous
      else Sound.cawSeries(n, pitch);
      if (text) this.say(text, { claim, ms: law ? 3200 : 1700 });
      await this.step(this.sleep(claim ? 420 : law ? 1400 : 260 + (n - 1) * 360));
      this.setFrame('stand');
    }

    // ---- interaction
    poked() {
      Sound.unlock();
      this.pokes++;
      this.rageUntil = now() + 7000;
      feathers(this.x, this.y - 30, randi(1, 3));
      this.say(pick(L.rage), { rage: true });
      this.setFrame('caw');
      Sound.caw({ pitch: 1.2, dur: 0.35, vol: 0.4 });
      setTimeout(() => { if (this.frame === 'caw') this.setFrame(this.motion ? 'fly_up' : 'stand'); }, 280);
      if (document.body) shake(document.body, 5, 380);
      if (this.pokes % 5 === 0 && crows.size < MAX_CROWS) {
        setTimeout(() => {
          this.say(pick(L.murder), { rage: true });
          Sound.cawSeries(3, 1.1, 0.22);
          spawn(1);
        }, 600);
      }
    }
    banish() {
      if (this.leaving) return;
      this.leaving = true;
      this.interrupt();
      this.leave();
    }
    async leave() {
      this.anchor = null;
      if (this.carry) { // drop the loot
        const el = this.carry.el; this.carry = null;
        const w = parseFloat(el.style.width) || 30;
        el.style.transform = '';
        particle(el, this.x - w / 2, this.y, { vy: 0, vr: rand(-200, 200), g: 1400, life: 2, fade: 0.4 });
      }
      this.setFrame('caw');
      Sound.cawSeries(randi(1, 3), 0.95, 0.3);
      this.say(pick(L.leave));
      await new Promise((r) => setTimeout(r, 700));
      const toLeft = this.x < vw() / 2;
      let res;
      const p = new Promise((r) => { res = r; });
      const tx = toLeft ? -140 : vw() + 140, ty = rand(-80, vh() * 0.3);
      let flap = 0, up = true;
      this.vy = -260;
      this.motion = (dt) => {
        flap += dt;
        if (flap > 0.08) { flap = 0; up = !up; this.setFrame(up ? 'fly_up' : 'fly_down'); }
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        this.vx += (dx / d * 700 - this.vx) * Math.min(1, dt * 3);
        this.vy += (dy / d * 700 - this.vy) * Math.min(1, dt * 3);
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.facing = this.vx >= 0 ? 1 : -1;
        if (d < 40 || this.x < -130 || this.x > vw() + 130) { this.motion = null; res(); }
      };
      await p;
      this.destroy();
    }
    destroy() {
      this.motion = null;
      this.canvas.remove();
      if (this.bubble) this.bubble.remove();
      if (this.carry) this.carry.el.remove();
      this.untick();
      crows.delete(this);
    }
    huh() {
      if (this.leaving) return;
      this.say(pick(L.repaired));
      Sound.caw({ pitch: 1.25, dur: 0.2 });
    }

    // ---- brain
    async life() {
      await new Promise((r) => setTimeout(r, 50));
      let fails = 0;
      while (!this.leaving && this.canvas.isConnected) {
        try {
          const did = await this.act();
          if (!did) {
            fails++;
            if (fails > 5) { // nothing left to wreck on screen
              fails = 0;
              await this.wander();
              await this.step(this.sleep(1500));
            } else {
              await this.step(this.sleep(80));
            }
            continue;
          }
          fails = 0;
          await this.idle();
        } catch (e) {
          if (e === INTERRUPT) { if (this.leaving) return; continue; }
          if (e === ABORT) { this.anchor = null; continue; }
          console.debug('[evil crow]', e);
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
    async act() {
      const rage = this.raging;
      const kind = weighted([
        ['shatter', rage ? 7 : 3.2],
        ['text', rage ? 1.5 : 2.6],
        ['steal', 2.2],
        ['knock', rage ? 3 : 2.0],
        ['tilt', 0.9],
      ]);
      let target = null;
      if (kind === 'shatter' || kind === 'tilt') target = pickBig();
      else if (kind === 'text') target = pickText();
      else if (kind === 'steal') target = pickShiny();
      else if (kind === 'knock') target = pickSmall();
      if (!target) return false;
      claimed.add(target);
      try {
        if (kind === 'shatter') await this.doShatter(target);
        else if (kind === 'tilt') await this.doTilt(target);
        else if (kind === 'text') await (chance(0.55) ? this.doCawify(target) : this.doEat(target));
        else if (kind === 'steal') await this.doSteal(target);
        else if (kind === 'knock') await this.doKnock(target);
      } finally {
        claimed.delete(target);
      }
      return true;
    }
    async greetIfFirst() {
      if (!this.firstLanding) return;
      this.firstLanding = false;
      await this.caw(pick(L.greet));
      await this.step(this.sleep(500));
    }
    async idle() {
      const rage = this.raging;
      const ms = rage ? rand(150, 450) : rand(600, 1900);
      const end = now() + ms;
      while (now() < end) {
        const r = Math.random();
        if (r < 0.35) { this.facing *= -1; await this.step(this.sleep(rand(250, 500))); }
        else if (r < 0.55 && this.anchor) { await this.step(this.hop(rand(-24, 24))); }
        else if (r < 0.63 && !rage) { await this.caw(chance(0.5) ? pick(L.idle) : null, { n: randi(1, 2) }); }
        else await this.step(this.sleep(rand(200, 450)));
      }
    }
    async wander() {
      const tx = rand(80, vw() - 80), ty = rand(120, vh() - 120);
      await this.step(this.flyTo(() => ({ x: tx, y: ty })));
      await this.caw(pick(['CAW?', 'hm.', 'nothing to break here', 'scroll. i dare you.']));
    }
    perchFx(el) {
      const r = el.getBoundingClientRect();
      if (r.width < 100) return 0.5;
      const m = Math.min(0.45, 40 / r.width);
      return rand(m, 1 - m);
    }

    // ---- havoc
    async doShatter(el) {
      const fx = this.perchFx(el);
      await this.step(this.flyToEl(el, fx));
      this.perch(el, fx);
      await this.greetIfFirst();
      if (chance(0.4)) await this.caw(pick(L.perch));
      const cracks = new Cracks(el);
      const n = this.raging ? randi(2, 3) : randi(3, 5);
      let impact = null;
      try {
        for (let i = 0; i < n; i++) {
          await this.peck();
          const r = el.getBoundingClientRect();
          const b = this.beak();
          impact = { x: clamp(b.x, r.left + 10, r.right - 10), y: r.top + clamp(r.height * 0.2, 12, 46) + rand(-4, 8) };
          cracks.hit(impact.x - r.left, impact.y - r.top, (i + 1) / n);
          shake(el, 1.5 + i * 1.2);
        }
      } finally {
        cracks.remove();
      }
      if (this.leaving) throw INTERRUPT;
      shatter(el, impact.x, impact.y);
      await this.step(this.flutterUp(36));
      await this.caw(pick(L.shatter), { n: randi(1, 2) });
    }
    async doTilt(el) {
      const r0 = el.getBoundingClientRect();
      const left = chance(0.5);
      const fx = r0.width < 140 ? 0.5 : (left ? 0.12 : 0.88);
      await this.step(this.flyToEl(el, fx));
      this.perch(el, fx);
      await this.greetIfFirst();
      Sound.thump();
      const deg = (left ? -1 : 1) * rand(2.5, 6.5) * (r0.width > 500 ? 0.7 : 1);
      try {
        const o = el.animate([{ transformOrigin: left ? '100% 100%' : '0% 100%' }], { duration: 1, fill: 'forwards' });
        if (o) Repair.anims.add(o);
      } catch (e) { /* fine */ }
      const a = animate(el, [
        { transform: 'rotate(0deg)' },
        { transform: `rotate(${(deg * 1.7).toFixed(2)}deg)`, offset: 0.35 },
        { transform: `rotate(${(deg * 0.75).toFixed(2)}deg)`, offset: 0.65 },
        { transform: `rotate(${deg.toFixed(2)}deg)` },
      ], { duration: 750, fill: 'forwards', easing: 'ease-out' });
      if (a) Repair.anims.add(a);
      await this.step(this.sleep(800));
      await this.caw(pick(L.tilt));
      await this.step(this.hop(0));
    }
    async doSteal(img) {
      await this.step(this.flyTo(() => {
        if (!img.isConnected) return null;
        const r = img.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + Math.min(r.height * 0.45, 40) };
      }, { speed: 640 }));
      // hover-grab
      let flap = 0, up = true;
      this.motion = (dt) => { flap += dt; if (flap > 0.07) { flap = 0; up = !up; this.setFrame(up ? 'fly_up' : 'fly_down'); } };
      await this.step(this.sleep(280));
      this.motion = null;
      await this.greetIfFirst();
      const r = img.getBoundingClientRect();
      const loot = new Image();
      loot.decoding = 'async';
      loot.referrerPolicy = 'no-referrer';
      loot.src = img.currentSrc || img.src;
      loot.className = 'carry';
      loot.alt = '';
      Stage.layer.appendChild(loot);
      const k = Math.min(1, 46 / Math.max(r.width, r.height));
      this.carry = { el: loot, w0: r.width, h0: r.height, w1: Math.max(14, r.width * k), h1: Math.max(14, r.height * k), x0: r.left + r.width / 2, y0: r.top, t: 0 };
      Repair.hide(img);
      Sound.whoosh();
      this.setFrame('caw');
      const line = pick(L.steal);
      if (/CLAIM/.test(line)) Sound.claim(); else Sound.cawSeries(1, 1.15);
      this.say(line);
      await this.step(this.sleep(380));
      const nfx = rand(0.35, 0.65);
      await this.step(this.flyTo(() => Nest.perchPoint(nfx), { speed: 520, lift: 160 }));
      const c = this.carry;
      this.carry = null;
      if (c) {
        const st = c.el.style;
        st.width = c.w1 + 'px'; st.height = c.h1 + 'px';
        Nest.dropIn(c.el, this.x - c.w1 / 2, this.y);
      }
      this.setFrame('stand');
      await this.step(this.sleep(300));
      await this.caw(pick(L.nest), { n: 2 });
      await this.step(this.sleep(500));
    }
    async doKnock(el) {
      const r = el.getBoundingClientRect();
      const side = r.left + r.width / 2 > vw() / 2 ? -1 : 1; // stand on the side with more room, facing the thing
      const ox = side > 0 ? -(16 * S) + 6 : (16 * S) - 6;
      const fx = side > 0 ? 0 : 1;
      await this.step(this.flyToEl(el, fx, { bottom: true, ox }));
      this.perch(el, fx, { bottom: true, ox });
      this.facing = side;
      await this.greetIfFirst();
      await this.step(this.sleep(rand(250, 500)));
      await this.peck(randi(1, 2));
      await this.step(this.sleep(220));
      const tid = el.getAttribute('data-testid') || (el.closest('[data-testid]') || {}).getAttribute?.('data-testid') || '';
      let line = pick(L.knock);
      if (/like/i.test(tid)) line = pick(['unliked.', 'no likes for you.', '♡ → ✗']);
      else if (/repost/i.test(tid)) line = pick(['no reposts.', 'repost THIS']);
      else if (/reply/i.test(tid)) line = pick(['replies off.', 'no thoughts.']);
      else if (/avatar/i.test(tid)) line = pick(['nice face. bye.', 'CLAIM!']);
      this.setFrame('peck');
      Sound.kick();
      throwClone(el, { vx: side * rand(260, 460), vy: -rand(420, 640), vr: side * rand(300, 720) });
      await this.step(this.sleep(120));
      this.setFrame('stand');
      await this.caw(line);
    }
    async doCawify(el) {
      const fx = this.perchFx(el) * 0.4 + 0.05;
      await this.step(this.flyToEl(el, fx));
      this.perch(el, fx);
      await this.greetIfFirst();
      await this.caw(pick(L.cawify));
      const nodes = textNodes(el);
      const jobs = [];
      for (const n of nodes) {
        Repair.saveText(n);
        const toks = n.nodeValue.split(/(\s+)/);
        toks.forEach((t, i) => { if (t && /\S/.test(t)) jobs.push([n, toks, i]); });
      }
      const total = jobs.length;
      if (!total) return;
      const gap = clamp(3600 / total, 22, 85);
      let done = 0;
      const r = el.getBoundingClientRect();
      const fx1 = r.width > 160 ? rand(0.6, 0.9) : fx;
      for (const [n, toks, i] of jobs) {
        toks[i] = cawWord(toks[i]);
        try { n.nodeValue = toks.join(''); } catch (e) { /* node gone */ }
        done++;
        if (this.anchor) this.anchor.fx = fx + (fx1 - fx) * (done / total);
        this.facing = 1;
        if (done % 9 === 1) { this.setFrame('caw'); Sound.caw({ pitch: rand(1, 1.3), dur: 0.12, vol: 0.18 }); }
        else if (done % 9 === 3) this.setFrame('stand');
        await this.step(this.sleep(gap));
      }
      this.setFrame('stand');
      await this.caw('CAW.', { n: 1 });
    }
    async doEat(el) {
      const fx0 = 0.1;
      await this.step(this.flyToEl(el, fx0));
      this.perch(el, fx0);
      await this.greetIfFirst();
      const cs = getComputedStyle(el);
      const font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const color = cs.color;
      const bites = this.raging ? randi(3, 6) : randi(5, 12);
      let ate = 0;
      for (let b = 0; b < bites; b++) {
        // find the first remaining word
        let found = null;
        for (const n of textNodes(el)) {
          const m = /\S+/.exec(n.nodeValue);
          if (m) { found = [n, m.index, m[0]]; break; }
        }
        if (!found) break;
        const [n, idx, word] = found;
        let wr;
        try {
          const rg = document.createRange();
          rg.setStart(n, idx); rg.setEnd(n, idx + word.length);
          wr = rg.getBoundingClientRect();
        } catch (e) { break; }
        const er = el.getBoundingClientRect();
        if (!wr || wr.width === 0) break;
        // stand on the word's line, beak over the word
        const beakReach = (SPR.crow.beak.peck[0] * S - AX);
        const targetOx = wr.left + wr.width / 2 - beakReach - er.left - fx0 * er.width;
        const targetOy = wr.top - er.top;
        if (this.anchor) {
          const a = this.anchor;
          const dist = targetOx - (a.ox || 0);
          a.oy = targetOy;
          if (Math.abs(dist) > 2) await this.step(this.hop(dist, clamp(Math.abs(dist) * 3, 140, 380)));
        }
        this.facing = 1;
        this.setFrame('peck');
        Sound.crunch();
        Repair.saveText(n);
        try { n.nodeValue = n.nodeValue.slice(0, idx) + n.nodeValue.slice(idx + word.length).replace(/^\s+/, ''); } catch (e) { break; }
        const cw = wr.width / Math.max(1, word.length);
        Array.from(word).forEach((ch, i) => {
          const s = document.createElement('span');
          s.className = 'crumb';
          s.textContent = ch;
          s.style.font = font;
          s.style.color = color;
          particle(s, wr.left + i * cw, wr.top, { vx: rand(-90, 90), vy: rand(-260, -80), vr: rand(-540, 540), g: 1700, life: rand(0.9, 1.5), fade: 0.5 });
        });
        ate++;
        await this.step(this.sleep(this.raging ? 90 : 130));
        this.setFrame('stand');
        if (ate % 3 === 0) Sound.gulp();
        await this.step(this.sleep(this.raging ? 80 : rand(140, 280)));
      }
      if (ate) await this.caw(pick(L.eat));
    }
  }

  // ---------------------------------------------------------------- splats
  function dropSplat(x, y) {
    const drop = document.createElement('div');
    drop.className = 'p';
    const st = drop.style;
    st.width = '5px'; st.height = '7px'; st.borderRadius = '50% 50% 50% 50% / 60% 60% 40% 40%'; st.background = '#f4f2ea';
    st.boxShadow = '0 0 0 1px rgba(0,0,0,.25)';
    Stage.layer.appendChild(drop);
    st.left = x + 'px'; st.top = y + 'px';
    const fall = rand(70, 180);
    let t = 0, yy = 0, v = 120;
    addTicker((dt) => {
      if (!drop.isConnected) return false;
      t += dt; v += 1600 * dt; yy += v * dt;
      drop.style.transform = `translate3d(0, ${yy.toFixed(1)}px, 0)`;
      if (yy >= fall) { drop.remove(); landSplat(x, y + fall); return false; }
      return true;
    });
  }
  function landSplat(x, y) {
    const under = stackAt(x, y).find((el) => el !== document.documentElement && el !== document.body);
    const sp = spriteCanvas(SPR.splat, S);
    sp.className = 'p pix';
    Stage.layer.appendChild(sp);
    Repair.extras.add(sp);
    Sound.splat();
    const w = SPR.splat[0].length * S, h = SPR.splat.length * S;
    if (!under) {
      sp.style.transform = `translate3d(${x - w / 2}px, ${y - h / 2}px, 0)`;
      return;
    }
    const r0 = under.getBoundingClientRect();
    const dx = x - r0.left, dy = y - r0.top;
    addTicker(() => {
      if (!sp.isConnected) return false;
      if (!under.isConnected) { sp.remove(); return false; }
      const r = under.getBoundingClientRect();
      sp.style.transform = `translate3d(${(r.left + dx - w / 2).toFixed(1)}px, ${(r.top + dy - h / 2).toFixed(1)}px, 0)`;
      return true;
    });
    sp.animate([{ scale: '0.2' }, { scale: '1.25' }, { scale: '1' }], { duration: 180 });
  }

  // ---------------------------------------------------------------- api
  function spawn(n = 1) {
    if (!document.documentElement) return 0;
    Stage.ensure();
    Sound.arm();
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (crows.size + made >= MAX_CROWS) break;
      made++;
      setTimeout(() => { if (crows.size < MAX_CROWS) crows.add(new Crow()); }, i * 380);
    }
    return crows.size + made;
  }
  const API = {
    summon(n = 1) { return spawn(n); },
    banish() { for (const c of Array.from(crows)) c.banish(); return 0; },
    repair() { Repair.restoreAll(); for (const c of crows) c.huh(); return crows.size; },
    count() { return crows.size; },
  };
  window.__evilCrow = API;

  // Bluesky auto-summon (opt-in from the toolbar menu).
  if (IS_BSKY && HAS_STORAGE) {
    try {
      chrome.storage.local.get({ autoBsky: false }, (v) => {
        if (v.autoBsky) setTimeout(() => { if (!crows.size) spawn(1); }, rand(2500, 5000));
      });
    } catch (e) { /* fine */ }
  }
})();
