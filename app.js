(() => {
  'use strict';

  /* ============================================================
     Helpers
     ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const TAU = Math.PI * 2;
  const mod = (a, n) => ((a % n) + n) % n;
  const LS_CUR = 'spinpick.current.v1';
  const LS_SAVED = 'spinpick.saved.v1';
  const MAX_ITEMS = 100;

  let uid = 0;
  const nid = () => 'i' + (++uid) + Math.random().toString(36).slice(2, 6);
  const clampW = w => {
    w = Math.round(Number(w));
    if (!isFinite(w) || w < 1) return 1;
    return Math.min(w, 100);
  };
  const mk = (label, weight = 1, out = false) => ({
    id: nid(),
    label: String(label).slice(0, 60),
    weight: clampW(weight),
    out: !!out
  });

  const PALETTES = {
    vibrant: ['#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#118ab2', '#7b5cd6', '#e76f51', '#2a9d8f'],
    pastel: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'],
    ocean: ['#03045e', '#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#0096c7', '#023e8a', '#5fa8d3'],
    sunset: ['#ff595e', '#ff924c', '#ffca3a', '#c5ca30', '#8ac926', '#52a675', '#1982c4', '#6a4c93'],
    mono: ['#2b2d42', '#8d99ae', '#4a4e69', '#adb5bd']
  };

  const nums = (n, prefix) => Array.from({ length: n }, (_, i) => (prefix ? prefix + ' ' : '') + (i + 1));

  const TEMPLATES = [
    { name: 'Class groups', note: 'Group 1–8, no repeats', title: 'Next group to present', items: nums(8, 'Group'), removeAfter: true },
    { name: 'Yes / No', note: '', title: 'Yes or no?', items: ['Yes', 'No'] },
    { name: 'Coin flip', note: '', title: 'Heads or tails?', items: ['Heads', 'Tails'] },
    { name: 'Dice (1–6)', note: '', title: 'Roll the dice', items: nums(6) },
    { name: 'Gift for a friend', note: 'Replace with real names', title: 'Who gets the gift?', items: ['Friend 1', 'Friend 2', 'Friend 3', 'Friend 4', 'Friend 5'] },
    { name: 'Where to eat', note: '', title: 'Where shall we eat?', items: ['Pizza', 'Burgers', 'Chicken', 'Rice & stew', 'Pasta', 'Fish', 'Salad'] },
    { name: 'Days of the week', note: '', title: 'Pick a day', items: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    { name: 'Truth or Dare', note: '', title: 'Truth or dare?', items: ['Truth', 'Dare'] },
    { name: 'Chores', note: 'No repeats', title: 'Who does what?', items: ['Dishes', 'Laundry', 'Sweeping', 'Cooking', 'Shopping', 'Trash'], removeAfter: true },
    { name: 'Raffle 1–20', note: 'No repeats', title: 'Raffle draw', items: nums(20), removeAfter: true },
    { name: 'Who pays?', note: '', title: 'Who pays the bill?', items: ['Person 1', 'Person 2', 'Person 3', 'Person 4'] },
    { name: 'Study / break', note: 'Weighted 3:1', title: 'Study or break?', items: ['Study', 'Break'], weights: [3, 1] }
  ];

  /* ============================================================
     State
     ============================================================ */
  function defaultSettings() {
    return { palette: 'vibrant', theme: 'auto', duration: 6, sound: true, confetti: true, removeAfter: true };
  }

  function defaultState() {
    return {
      title: 'Next group to present',
      items: nums(8, 'Group').map(l => mk(l)),
      settings: defaultSettings(),
      history: []
    };
  }

  function sanitize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const s = Object.assign(defaultSettings(), raw.settings || {});
    s.palette = PALETTES[s.palette] ? s.palette : 'vibrant';
    s.theme = ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto';
    s.duration = Math.min(15, Math.max(2, Number(s.duration) || 6));
    s.sound = !!s.sound;
    s.confetti = !!s.confetti;
    s.removeAfter = !!s.removeAfter;
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .slice(0, MAX_ITEMS)
      .filter(x => x && typeof x.label === 'string')
      .map(x => mk(x.label, x.weight, x.out));
    const history = (Array.isArray(raw.history) ? raw.history : [])
      .slice(-200)
      .filter(h => h && typeof h.label === 'string')
      .map(h => ({ label: h.label.slice(0, 60), time: Number(h.time) || Date.now() }));
    return { title: String(raw.title || 'My wheel').slice(0, 80), items, settings: s, history };
  }

  let state = defaultState();
  let fromShare = false;
  let spinning = false;
  let rot = 0;                 // current wheel rotation (radians)
  let winnerId = null;
  let celebUntil = 0;
  let pendingRemoval = null;
  let undoSnap = null;

  /* ============================================================
     Share links (whole wheel is stored in the URL hash)
     ============================================================ */
  function b64encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function toShare() {
    const s = state.settings;
    return {
      t: state.title,
      i: state.items.map(it => [it.label, it.weight, it.out ? 1 : 0]),
      s: { p: s.palette, d: s.duration, so: s.sound ? 1 : 0, c: s.confetti ? 1 : 0, r: s.removeAfter ? 1 : 0 }
    };
  }
  function fromShareObj(o) {
    const s = o.s || {};
    return sanitize({
      title: o.t,
      items: (o.i || []).map(a => ({ label: String(a[0]), weight: a[1], out: !!a[2] })),
      settings: { palette: s.p, duration: s.d, sound: !!s.so, confetti: !!s.c, removeAfter: !!s.r, theme: 'auto' }
    });
  }
  function shareUrl() {
    return location.href.split('#')[0] + '#w=' + b64encode(toShare());
  }
  function readHash() {
    const m = /[#&]w=([^&]+)/.exec(location.hash);
    if (!m) return null;
    try {
      const st = fromShareObj(b64decode(m[1]));
      return st.items.length ? st : null;
    } catch (e) {
      return null;
    }
  }

  /* ============================================================
     Persistence
     ============================================================ */
  let saveTimer;
  function persist() {
    if (fromShare) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_CUR, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 200);
  }
  function getSaved() {
    try { return JSON.parse(localStorage.getItem(LS_SAVED)) || []; } catch (e) { return []; }
  }
  function setSaved(arr) {
    try { localStorage.setItem(LS_SAVED, JSON.stringify(arr)); }
    catch (e) { toast('Could not save (browser storage is blocked or full)'); }
  }

  /* ============================================================
     Audio
     ============================================================ */
  let actx = null;
  function initAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function beep(freq, dur, type = 'square', vol = 0.06, when = 0) {
    if (!state.settings.sound || !actx) return;
    const t = actx.currentTime + when;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const tickSound = () => beep(850 + Math.random() * 80, 0.045, 'square', 0.045);
  function winSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(f, 0.28, 'triangle', 0.13, i * 0.11));
    beep(1318.5, 0.6, 'triangle', 0.13, 0.52);
  }

  /* ============================================================
     Wheel geometry + drawing
     ============================================================ */
  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  const wrap = $('#wheelWrap');
  const pointer = $('#pointer');
  let cssSize = 0;
  let dpr = 1;
  let geom = [];
  let labelCache = new Map();
  let colors = { rim: '#23253a', hub: '#fff', hubtext: '#23253a' };

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = {
      rim: cs.getPropertyValue('--rim').trim() || '#23253a',
      hub: cs.getPropertyValue('--hub').trim() || '#fff',
      hubtext: cs.getPropertyValue('--hubtext').trim() || '#23253a'
    };
  }

  function computeGeom() {
    const act = state.items.map((it, idx) => ({ it, idx })).filter(x => !x.it.out);
    const total = act.reduce((a, x) => a + x.it.weight, 0);
    const pal = PALETTES[state.settings.palette];
    let a = 0;
    geom = act.map(x => {
      const span = (x.it.weight / total) * TAU;
      const g = { item: x.it, idx: x.idx, start: a, span, color: pal[x.idx % pal.length] };
      a += span;
      return g;
    });
    for (let k = 1; k < geom.length; k++) {
      if (geom[k].color === geom[k - 1].color) geom[k].color = pal[(geom[k].idx + 1) % pal.length];
    }
    if (geom.length > 1 && geom[geom.length - 1].color === geom[0].color) {
      geom[geom.length - 1].color = pal[(geom[geom.length - 1].idx + 1) % pal.length];
    }
    labelCache.clear();
  }

  function textColorFor(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1c1e2e' : '#ffffff';
  }

  function fitLabel(text, font, maxW) {
    const key = font + '|' + maxW + '|' + text;
    if (labelCache.has(key)) return labelCache.get(key);
    ctx.font = font;
    let t = text;
    if (ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      t = t.trimEnd() + '…';
    }
    labelCache.set(key, t);
    return t;
  }

  function draw(now) {
    if (!cssSize) return;
    now = now || performance.now();
    const size = cssSize;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const R = size / 2 - 6;
    const r = R * 0.955;
    const hubR = r * 0.15;

    // rim
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = colors.rim;
    ctx.fill();

    if (!geom.length) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = 'rgba(128,132,160,0.25)';
      ctx.fill();
      ctx.fillStyle = colors.hubtext;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.max(14, r * 0.07)}px system-ui, sans-serif`;
      const msg = state.items.length ? 'Everyone has had a turn' : 'Add some options';
      ctx.fillText(msg, cx, cy - 12);
      ctx.font = `400 ${Math.max(12, r * 0.05)}px system-ui, sans-serif`;
      ctx.globalAlpha = 0.7;
      ctx.fillText(state.items.length ? 'Press Reset to start again' : 'to build your wheel', cx, cy + 14);
      ctx.globalAlpha = 1;
      return;
    }

    const pulsing = winnerId && now < celebUntil;
    const pulse = pulsing ? 1 + 0.03 * (0.5 + 0.5 * Math.sin(now / 90)) : 1;

    geom.forEach(g => {
      const isWin = winnerId === g.item.id;
      const dim = winnerId && !isWin && !spinning;
      const rr = isWin ? r * pulse : r;
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.beginPath();
      if (geom.length > 1) ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rr, rot + g.start, rot + g.start + g.span);
      ctx.closePath();
      ctx.fillStyle = g.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();

      // label
      const arcW = g.span * r * 0.6;
      if (geom.length === 1 || arcW > 9) {
        const fs = geom.length === 1 ? r * 0.085 : Math.max(10, Math.min(r * 0.085, arcW * 0.75));
        const font = `700 ${fs.toFixed(1)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        const maxW = r - hubR - 26;
        const txt = fitLabel(g.item.label || ' ', font, maxW);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot + g.start + g.span / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = font;
        ctx.fillStyle = textColorFor(g.color);
        ctx.fillText(txt, rr - 16, 0);
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;

    // rim lights
    const lights = 28;
    for (let k = 0; k < lights; k++) {
      const a = (k / lights) * TAU + rot * 0.0;
      const lr = (R + r) / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * lr, cy + Math.sin(a) * lr, Math.max(2, R * 0.012), 0, TAU);
      const on = spinning ? ((k + Math.floor(now / 90)) % 2 === 0) : true;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    // hub
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, TAU);
    ctx.fillStyle = colors.hub;
    ctx.fill();
    ctx.lineWidth = Math.max(3, hubR * 0.14);
    ctx.strokeStyle = colors.rim;
    ctx.stroke();
    ctx.fillStyle = colors.hubtext;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${(hubR * 0.46).toFixed(1)}px system-ui, sans-serif`;
    ctx.fillText('SPIN', cx, cy + 1);
  }

  function resize() {
    const w = Math.floor(wrap.clientWidth);
    if (!w) return;
    dpr = window.devicePixelRatio || 1;
    cssSize = w;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = w + 'px';
    labelCache.clear();
    draw();
  }

  /* ============================================================
     Spinning
     ============================================================ */
  function indexAt(r) {
    const a = mod(-Math.PI / 2 - r, TAU);
    for (let i = 0; i < geom.length; i++) {
      if (a >= geom[i].start && a < geom[i].start + geom[i].span) return i;
    }
    return geom.length - 1;
  }

  function bump() {
    if (!pointer.animate) return;
    pointer.animate(
      [
        { transform: 'translateX(-50%) rotate(0deg)' },
        { transform: 'translateX(-50%) rotate(-24deg)', offset: 0.4 },
        { transform: 'translateX(-50%) rotate(0deg)' }
      ],
      { duration: 90, easing: 'ease-out' }
    );
  }

  const spinBtn = $('#spinBtn');

  function setSpinning(v) {
    spinning = v;
    document.body.classList.toggle('spinning', v);
    spinBtn.disabled = v;
    spinBtn.textContent = v ? 'SPINNING…' : 'SPIN';
  }

  function spin() {
    if (spinning) return;
    if (!geom.length) {
      toast(state.items.length ? 'Everyone has had a turn. Press Reset.' : 'Add some options first.');
      return;
    }
    initAudio();
    winnerId = null;
    celebUntil = 0;
    setSpinning(true);

    // weighted random pick
    const total = geom.reduce((a, g) => a + g.item.weight, 0);
    let roll = Math.random() * total;
    let pick = geom.length - 1;
    for (let i = 0; i < geom.length; i++) {
      roll -= geom[i].item.weight;
      if (roll < 0) { pick = i; break; }
    }

    // land somewhere inside the chosen slice (not on the edge)
    const target = geom[pick].start + geom[pick].span * (0.12 + Math.random() * 0.76);
    const from = rot;
    const delta = mod(-Math.PI / 2 - target - from, TAU);
    const dur = state.settings.duration * 1000;
    const turns = 3 + Math.round(state.settings.duration * 0.7);
    const to = from + turns * TAU + delta;
    const t0 = performance.now();
    let last = indexAt(from);

    function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4); // ease-out quart: fast start, slow finish
      rot = from + (to - from) * e;
      const i = indexAt(rot);
      if (i !== last) { last = i; tickSound(); bump(); }
      draw(now);
      if (p < 1) requestAnimationFrame(frame);
      else finish(pick);
    }
    requestAnimationFrame(frame);
  }

  function finish(i) {
    const g = geom[i];
    const item = g.item;
    setSpinning(false);
    winnerId = item.id;
    celebUntil = performance.now() + 2600;
    state.history.push({ label: item.label, time: Date.now() });
    renderHistory();
    persist();
    $('#lastPick').innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = item.label;
    $('#lastPick').append('Last pick: ', strong);
    pendingRemoval = state.settings.removeAfter ? item.id : null;
    winSound();
    confetti();
    (function celebLoop() {
      draw(performance.now());
      if (performance.now() < celebUntil) requestAnimationFrame(celebLoop);
    })();
    setTimeout(() => showResult(item.label, geom.length - 1), 650);
  }

  /* ============================================================
     Dialogs
     ============================================================ */
  const resultDlg = $('#resultDlg');
  function showResult(label, remaining) {
    $('#resultText').textContent = label;
    let note = '';
    if (pendingRemoval) {
      note = remaining > 0 ? `Removed from the wheel. ${remaining} left.` : 'That was the last one!';
    }
    $('#resultNote').textContent = note;
    if (typeof resultDlg.showModal === 'function') resultDlg.showModal();
  }
  resultDlg.addEventListener('close', () => {
    if (pendingRemoval) {
      const it = state.items.find(x => x.id === pendingRemoval);
      pendingRemoval = null;
      if (it) {
        it.out = true;
        winnerId = null;
        renderOptions();
        changed();
        if (!geom.length) toast('Everyone has had a turn. Press Reset to start again.');
      }
    }
  });
  $('#resClose').addEventListener('click', () => resultDlg.close());
  $('#resAgain').addEventListener('click', () => {
    resultDlg.close();
    setTimeout(spin, 60);
  });

  const shareDlg = $('#shareDlg');
  function openShare() {
    const url = shareUrl();
    $('#shareUrl').value = url;
    $('#shareWarn').hidden = url.length < 1800;
    $('#shareNative').hidden = !navigator.share;
    shareDlg.showModal();
    $('#shareUrl').select();
  }
  $('#btnShare').addEventListener('click', openShare);
  $('#shareClose').addEventListener('click', () => shareDlg.close());
  $('#shareCopy').addEventListener('click', async () => {
    const url = $('#shareUrl').value;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied ✔');
    } catch (e) {
      $('#shareUrl').select();
      document.execCommand && document.execCommand('copy');
      toast('Link selected. Copy it manually if needed.');
    }
  });
  $('#shareNative').addEventListener('click', () => {
    navigator.share({ title: state.title, text: 'Spin this wheel: ' + state.title, url: $('#shareUrl').value }).catch(() => {});
  });
  [resultDlg, shareDlg].forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  /* ============================================================
     Toasts
     ============================================================ */
  function toast(msg, action) {
    const t = document.createElement('div');
    t.className = 'toast';
    const s = document.createElement('span');
    s.textContent = msg;
    t.append(s);
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.fn(); t.remove(); };
      t.append(b);
    }
    $('#toasts').append(t);
    setTimeout(() => t.remove(), action ? 6500 : 2600);
  }

  /* ============================================================
     Confetti
     ============================================================ */
  const conf = $('#confetti');
  const cctx = conf.getContext('2d');
  let parts = [];
  let confRunning = false;

  function confetti() {
    if (!state.settings.confetti) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    conf.width = innerWidth;
    conf.height = innerHeight;
    const rect = canvas.getBoundingClientRect();
    const ox = rect.left + rect.width / 2, oy = rect.top + rect.height / 2;
    const cols = PALETTES.vibrant.concat(['#ffffff', '#ffd166']);
    for (let i = 0; i < 170; i++) {
      parts.push({
        x: ox, y: oy,
        vx: (Math.random() - 0.5) * 18,
        vy: -Math.random() * 17 - 4,
        s: 5 + Math.random() * 7,
        c: cols[(Math.random() * cols.length) | 0],
        r: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 0.4,
        life: 0
      });
    }
    if (!confRunning) { confRunning = true; requestAnimationFrame(confStep); }
  }
  function confStep() {
    cctx.clearRect(0, 0, conf.width, conf.height);
    parts.forEach(p => {
      p.vy += 0.38; p.vx *= 0.992;
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate(p.r);
      cctx.fillStyle = p.c;
      cctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
      cctx.restore();
    });
    parts = parts.filter(p => p.y < conf.height + 30 && p.life < 280);
    if (parts.length) requestAnimationFrame(confStep);
    else { confRunning = false; cctx.clearRect(0, 0, conf.width, conf.height); }
  }

  /* ============================================================
     UI rendering
     ============================================================ */
  function changed() {
    computeGeom();
    renderMeta();
    draw();
    persist();
  }

  function renderMeta() {
    const inPlay = state.items.filter(i => !i.out).length;
    $('#optCount').textContent = state.items.length
      ? `${inPlay} of ${state.items.length} in play`
      : 'No options yet.';
  }

  function renderOptions() {
    const ul = $('#optList');
    ul.innerHTML = '';
    const pal = PALETTES[state.settings.palette];
    state.items.forEach((it, i) => {
      const li = document.createElement('li');
      li.dataset.id = it.id;
      if (it.out) li.classList.add('out');
      li.innerHTML =
        '<span class="dot"></span>' +
        '<input class="lbl" type="text" maxlength="60" aria-label="Option name">' +
        '<input class="wt" type="number" min="1" max="100" step="1" aria-label="Weight" title="Weight (bigger = more likely)">' +
        '<button type="button" class="icon tog"></button>' +
        '<button type="button" class="icon del" aria-label="Remove option" title="Remove">✕</button>';
      li.querySelector('.dot').style.background = pal[i % pal.length];
      li.querySelector('.lbl').value = it.label;
      li.querySelector('.wt').value = it.weight;
      const tog = li.querySelector('.tog');
      tog.textContent = it.out ? '↩' : '✓';
      tog.title = it.out ? 'Put back on the wheel' : 'Mark as done (take off the wheel)';
      tog.setAttribute('aria-label', tog.title);
      ul.append(li);
    });
    renderMeta();
  }

  const optList = $('#optList');
  optList.addEventListener('input', e => {
    if (spinning) return;
    const li = e.target.closest('li');
    if (!li) return;
    const it = state.items.find(x => x.id === li.dataset.id);
    if (!it) return;
    if (e.target.classList.contains('lbl')) it.label = e.target.value.slice(0, 60);
    if (e.target.classList.contains('wt')) {
      const v = Math.round(Number(e.target.value));
      if (!isFinite(v) || v < 1) return;
      it.weight = clampW(v);
    }
    changed();
  });
  optList.addEventListener('change', e => {
    if (e.target.classList.contains('wt')) {
      const li = e.target.closest('li');
      const it = state.items.find(x => x.id === li.dataset.id);
      if (it) e.target.value = it.weight;
    }
  });
  optList.addEventListener('click', e => {
    if (spinning) return;
    const btn = e.target.closest('button');
    if (!btn) return;
    const li = btn.closest('li');
    const idx = state.items.findIndex(x => x.id === li.dataset.id);
    if (idx < 0) return;
    if (btn.classList.contains('del')) {
      snapshot();
      state.items.splice(idx, 1);
      winnerId = null;
      renderOptions();
      changed();
      toast('Option removed', { label: 'Undo', fn: undo });
    } else if (btn.classList.contains('tog')) {
      state.items[idx].out = !state.items[idx].out;
      winnerId = null;
      renderOptions();
      changed();
    }
  });

  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    if (spinning) return;
    const inp = $('#addInput');
    const v = inp.value.trim();
    if (!v) return;
    if (state.items.length >= MAX_ITEMS) { toast(`Maximum ${MAX_ITEMS} options`); return; }
    state.items.push(mk(v));
    inp.value = '';
    winnerId = null;
    renderOptions();
    changed();
    optList.scrollTop = optList.scrollHeight;
    inp.focus();
  });

  /* ---------- undo ---------- */
  function snapshot() { undoSnap = JSON.stringify(state); }
  function undo() {
    if (!undoSnap) return;
    state = sanitize(JSON.parse(undoSnap));
    undoSnap = null;
    winnerId = null;
    fullRender();
    persist();
  }

  /* ---------- bulk / quick fill / import ---------- */
  function parseLines(text) {
    return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, MAX_ITEMS);
  }
  function replaceItems(labels, msg) {
    snapshot();
    state.items = labels.slice(0, MAX_ITEMS).map(l => mk(l));
    state.history = [];
    winnerId = null;
    fullRender();
    persist();
    toast(msg, { label: 'Undo', fn: undo });
  }
  $('#bulkAdd').addEventListener('click', () => {
    if (spinning) return;
    const lines = parseLines($('#bulkText').value);
    if (!lines.length) return;
    const room = MAX_ITEMS - state.items.length;
    lines.slice(0, room).forEach(l => state.items.push(mk(l)));
    $('#bulkText').value = '';
    winnerId = null;
    renderOptions();
    changed();
    toast(`Added ${Math.min(lines.length, room)} option(s)`);
  });
  $('#bulkReplace').addEventListener('click', () => {
    if (spinning) return;
    const lines = parseLines($('#bulkText').value);
    if (!lines.length) return;
    $('#bulkText').value = '';
    replaceItems(lines, `Wheel replaced with ${lines.length} option(s)`);
  });
  $('#fillBtn').addEventListener('click', () => {
    if (spinning) return;
    const n = Math.min(MAX_ITEMS, Math.max(1, parseInt($('#fillCount').value, 10) || 0));
    const p = $('#fillPrefix').value.trim();
    replaceItems(nums(n, p), `Created ${n} options`);
  });
  $('#fileInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result)
        .split(/\r?\n/)
        .map(l => l.split(',')[0].replace(/^"|"$/g, '').trim())
        .filter(Boolean);
      if (!lines.length) { toast('That file looks empty'); return; }
      replaceItems(lines, `Imported ${Math.min(lines.length, MAX_ITEMS)} option(s)`);
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  $('#btnReset').addEventListener('click', () => {
    if (spinning) return;
    snapshot();
    state.items.forEach(i => (i.out = false));
    state.history = [];
    winnerId = null;
    $('#lastPick').textContent = 'Wheel reset. Everyone is back in.';
    renderOptions(); renderHistory(); changed();
    toast('Wheel reset', { label: 'Undo', fn: undo });
  });
  $('#btnClear').addEventListener('click', () => {
    if (spinning) return;
    snapshot();
    state.items = [];
    state.history = [];
    winnerId = null;
    renderOptions(); renderHistory(); changed();
    toast('All options cleared', { label: 'Undo', fn: undo });
  });

  /* ---------- title ---------- */
  $('#titleInput').addEventListener('input', e => {
    state.title = e.target.value.slice(0, 80);
    document.title = (state.title ? state.title + ' – ' : '') + 'SpinPick';
    persist();
  });

  /* ---------- settings ---------- */
  function applySettings() {
    const s = state.settings;
    if (s.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', s.theme);
    readColors();
    $('#selPalette').value = s.palette;
    $('#selTheme').value = s.theme;
    $('#rngDuration').value = s.duration;
    $('#durOut').textContent = s.duration;
    $('#chkSound').checked = s.sound;
    $('#chkConfetti').checked = s.confetti;
    $('#chkRemove').checked = s.removeAfter;
    $('#btnSound').textContent = s.sound ? '🔊' : '🔇';
  }
  $('#selPalette').addEventListener('change', e => { state.settings.palette = e.target.value; renderOptions(); changed(); });
  $('#selTheme').addEventListener('change', e => { state.settings.theme = e.target.value; applySettings(); draw(); persist(); });
  $('#rngDuration').addEventListener('input', e => { state.settings.duration = Number(e.target.value); $('#durOut').textContent = e.target.value; persist(); });
  $('#chkSound').addEventListener('change', e => { state.settings.sound = e.target.checked; applySettings(); persist(); });
  $('#chkConfetti').addEventListener('change', e => { state.settings.confetti = e.target.checked; persist(); });
  $('#chkRemove').addEventListener('change', e => { state.settings.removeAfter = e.target.checked; persist(); });
  $('#btnSound').addEventListener('click', () => {
    state.settings.sound = !state.settings.sound;
    if (state.settings.sound) { initAudio(); beep(880, 0.1, 'triangle', 0.1); }
    applySettings(); persist();
  });
  $('#btnTheme').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    state.settings.theme = dark ? 'light' : 'dark';
    applySettings(); draw(); persist();
  });
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  }

  /* ---------- fullscreen ---------- */
  const rootEl = document.documentElement;
  if (!rootEl.requestFullscreen) $('#btnFull').hidden = true;
  $('#btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootEl.requestFullscreen().catch(() => toast('Fullscreen is not available here'));
  });
  $('#btnExitFull').addEventListener('click', () => document.fullscreenElement && document.exitFullscreen());
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));

  /* ---------- tabs ---------- */
  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
    $$('.pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
  }));

  /* ---------- templates ---------- */
  function renderTemplates() {
    const grid = $('#tplGrid');
    grid.innerHTML = '';
    TEMPLATES.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = t.name;
      if (t.note) {
        const sm = document.createElement('small');
        sm.textContent = t.note;
        b.append(sm);
      }
      b.addEventListener('click', () => applyTemplate(i));
      grid.append(b);
    });
  }
  function applyTemplate(i) {
    if (spinning) return;
    const t = TEMPLATES[i];
    snapshot();
    state.title = t.title;
    state.items = t.items.map((l, k) => mk(l, t.weights ? t.weights[k] : 1));
    state.settings.removeAfter = !!t.removeAfter;
    state.history = [];
    winnerId = null;
    fullRender();
    persist();
    toast(`Loaded "${t.name}"`, { label: 'Undo', fn: undo });
  }

  /* ---------- saved wheels ---------- */
  function renderSaved() {
    const ul = $('#savedList');
    ul.innerHTML = '';
    const arr = getSaved();
    if (!arr.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Nothing saved yet.';
      ul.append(li);
      return;
    }
    arr.forEach((w, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = w.name + ' ';
      const sm = document.createElement('small');
      sm.textContent = `(${(w.data.items || []).length})`;
      name.append(sm);
      const load = document.createElement('button');
      load.className = 'btn small';
      load.textContent = 'Load';
      load.onclick = () => {
        if (spinning) return;
        snapshot();
        state = sanitize(Object.assign({}, w.data, { history: [] }));
        winnerId = null;
        fullRender();
        persist();
        toast(`Loaded "${w.name}"`, { label: 'Undo', fn: undo });
      };
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Delete';
      del.onclick = () => {
        const a = getSaved();
        a.splice(i, 1);
        setSaved(a);
        renderSaved();
      };
      li.append(name, load, del);
      ul.append(li);
    });
  }
  $('#saveForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = ($('#saveName').value.trim() || state.title || 'My wheel').slice(0, 40);
    const arr = getSaved();
    const data = {
      title: state.title,
      items: state.items.map(i => ({ label: i.label, weight: i.weight, out: false })),
      settings: state.settings
    };
    const at = arr.findIndex(w => w.name.toLowerCase() === name.toLowerCase());
    if (at >= 0) arr[at] = { name, data }; else arr.push({ name, data });
    setSaved(arr);
    $('#saveName').value = '';
    renderSaved();
    toast(`Saved "${name}" ✔`);
  });

  /* ---------- history ---------- */
  function renderHistory() {
    const ol = $('#histList');
    ol.innerHTML = '';
    state.history.forEach(h => {
      const li = document.createElement('li');
      const s = document.createElement('span');
      s.textContent = h.label;
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      li.append(s, t);
      ol.append(li);
    });
    $('#histEmpty').hidden = state.history.length > 0;
  }
  $('#btnClearHist').addEventListener('click', () => {
    state.history = [];
    renderHistory();
    persist();
  });
  $('#btnCopyHist').addEventListener('click', async () => {
    if (!state.history.length) { toast('Nothing to copy yet'); return; }
    const text = state.history.map((h, i) => `${i + 1}. ${h.label}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Copied ✔'); }
    catch (e) { toast('Could not copy automatically'); }
  });

  /* ---------- shared-link banner ---------- */
  $('#btnKeep').addEventListener('click', () => {
    fromShare = false;
    history.replaceState(null, '', location.pathname + location.search);
    $('#sharedBanner').hidden = true;
    persist();
    toast('Saved as your current wheel ✔');
  });

  /* ---------- spin triggers ---------- */
  spinBtn.addEventListener('click', spin);
  canvas.addEventListener('click', spin);
  addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag)) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    spin();
  });

  /* ============================================================
     Boot
     ============================================================ */
  function fullRender() {
    applySettings();
    $('#titleInput').value = state.title;
    document.title = (state.title ? state.title + ' – ' : '') + 'SpinPick';
    renderOptions();
    renderHistory();
    renderSaved();
    $('#lastPick').textContent = state.history.length
      ? 'Last pick: ' + state.history[state.history.length - 1].label
      : 'Tap the wheel, press the button, or hit Space.';
    changed();
  }

  function load() {
    const shared = readHash();
    if (shared) {
      state = shared;
      fromShare = true;
      $('#sharedBanner').hidden = false;
      return;
    }
    fromShare = false;
    $('#sharedBanner').hidden = true;
    try {
      const raw = JSON.parse(localStorage.getItem(LS_CUR));
      if (raw) {
        const st = sanitize(raw);
        if (st.items.length || raw.items) state = st;
      }
    } catch (e) { /* use default */ }
  }

  addEventListener('hashchange', () => {
    if (/[#&]w=/.test(location.hash)) {
      const shared = readHash();
      if (shared) {
        state = shared;
        fromShare = true;
        $('#sharedBanner').hidden = false;
        winnerId = null;
        fullRender();
      }
    }
  });

  renderTemplates();
  load();
  readColors();
  fullRender();
  new ResizeObserver(resize).observe(wrap);
  resize();
})();
