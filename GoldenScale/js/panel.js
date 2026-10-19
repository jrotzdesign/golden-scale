/* Golden Scale — panel logic (runs in CEP's Chromium; talks to jsx/host.jsx) */
(function () {
  'use strict';

  const PHI = 1.6180339887498949;
  const PT_PER = { px: 1, pt: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };
  const FIB = (function () { const a = [1, 2]; while (a[a.length - 1] < 2000) a.push(a[a.length - 1] + a[a.length - 2]); return a; })();
  // FIB = 1 2 3 5 8 13 21 34 55 89 144 233 377 610 987 1597 2584

  const cs = (typeof CSInterface !== 'undefined') ? new CSInterface() : null;
  const $ = (id) => document.getElementById(id);

  /* ---------------- state (persisted) ---------------- */
  const DEFAULTS = {
    ref: 4, axis: 'w', base: 1, unit: 'px', constrain: true,
    goldOrient: 'land', goldKeep: 'w',
    seqCount: 4, seqDir: 'grow', seqLayout: 'concentric', seqGap: 0, seqKeep: true,
    dup: false, strokes: true, visible: false, live: true
  };
  let S = Object.assign({}, DEFAULTS);
  try { Object.assign(S, JSON.parse(localStorage.getItem('goldenScale.v1') || '{}')); } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem('goldenScale.v1', JSON.stringify(S)); } catch (e) { /* ignore */ } }

  let info = { count: 0, w: 0, h: 0, hasDoc: false };

  /* ---------------- host bridge ---------------- */
  function host(code) {
    return new Promise((resolve) => {
      if (!cs) { resolve({ ok: false, error: 'Not running inside Illustrator.' }); return; }
      cs.evalScript(code, (res) => {
        if (res === 'EvalScript error.' || res === undefined || res === null || res === '') {
          resolve({ ok: false, error: 'Illustrator could not run the script. Is a document open?' });
          return;
        }
        try { resolve(JSON.parse(res)); } catch (e) { resolve({ ok: false, error: String(res) }); }
      });
    });
  }
  const arg = (o) => JSON.stringify(o);

  /* ---------------- units ---------------- */
  const toPt = (v) => v * PT_PER[S.unit] * S.base;      // "fib units" → points
  const fromPt = (pt) => pt / (PT_PER[S.unit] * S.base);  // points → "fib units"
  function fmt(pt) {
    const v = pt / PT_PER[S.unit];
    const r = Math.round(v * 1000) / 1000;
    return (Math.abs(r - Math.round(r)) < 1e-9) ? String(Math.round(r)) : String(r);
  }

  function axisLength(w, h, axis) {
    if (axis === 'w') return w;
    if (axis === 'h') return h;
    if (axis === 'long') return Math.max(w, h);
    return Math.min(w, h);
  }
  function nearestFibIndex(v) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < FIB.length; i++) { const d = Math.abs(FIB[i] - v); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function nextFib(v) { for (let i = 0; i < FIB.length; i++) if (FIB[i] > v * 1.001) return FIB[i]; return null; }
  function prevFib(v) { for (let i = FIB.length - 1; i >= 0; i--) if (FIB[i] < v * 0.999) return FIB[i]; return null; }

  /* ---------------- UI wiring ---------------- */
  function seg(id, key, onChange) {
    const el = $(id);
    const paint = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(S[key])));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S[key] = b.dataset.v; save(); paint(); if (onChange) onChange();
    });
    paint();
  }
  function check(id, key, onChange) {
    const el = $(id); el.checked = !!S[key];
    el.addEventListener('change', () => { S[key] = el.checked; save(); if (onChange) onChange(); });
  }

  // reference proxy
  const proxy = $('proxy');
  function paintProxy() { proxy.querySelectorAll('.pt').forEach(b => b.classList.toggle('on', Number(b.dataset.ref) === S.ref)); }
  proxy.addEventListener('click', (e) => { const b = e.target.closest('.pt'); if (!b) return; S.ref = Number(b.dataset.ref); save(); paintProxy(); });
  paintProxy();

  seg('axis', 'axis', render);
  seg('gold-orient', 'goldOrient');
  seg('gold-keep', 'goldKeep');
  seg('seqDir', 'seqDir', renderSeqHint);
  seg('seqLayout', 'seqLayout', () => { $('gapField').style.visibility = S.seqLayout === 'concentric' ? 'hidden' : 'visible'; });
  $('gapField').style.visibility = S.seqLayout === 'concentric' ? 'hidden' : 'visible';

  check('seqKeep', 'seqKeep');
  check('optDup', 'dup');
  check('optStrokes', 'strokes');
  check('optVisible', 'visible', refresh);
  check('optLive', 'live', startPolling);

  const baseEl = $('base'), unitEl = $('unit');
  baseEl.value = S.base; unitEl.value = S.unit;
  baseEl.addEventListener('change', () => { const v = parseFloat(baseEl.value); S.base = (v > 0) ? v : 1; baseEl.value = S.base; save(); render(); });
  unitEl.addEventListener('change', () => { S.unit = unitEl.value; save(); render(); });

  const lock = $('constrain');
  const paintLock = () => lock.classList.toggle('on', S.constrain);
  lock.addEventListener('click', () => { S.constrain = !S.constrain; save(); paintLock(); });
  paintLock();

  $('seqCount').value = S.seqCount; $('seqGap').value = S.seqGap;
  $('seqCount').addEventListener('change', () => { S.seqCount = Math.max(1, Math.min(14, parseInt($('seqCount').value, 10) || 1)); $('seqCount').value = S.seqCount; save(); renderSeqHint(); });
  $('seqGap').addEventListener('change', () => { S.seqGap = parseFloat($('seqGap').value) || 0; save(); });

  // chips
  const chips = $('chips');
  FIB.forEach((n) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.n = n;
    b.innerHTML = '<span>' + n + '</span><small></small>';
    b.title = 'Set ' + n + ' units  (⌥ click: duplicate first)';
    chips.appendChild(b);
  });
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    setSize(Number(b.dataset.n), e.altKey);
  });

  // step / phi
  $('nextFib').addEventListener('click', (e) => {
    const v = fromPt(axisLength(info.w, info.h, S.axis)); const n = nextFib(v);
    if (n === null) return toast('Already at the top of the sequence.'); setSize(n, e.altKey);
  });
  $('prevFib').addEventListener('click', (e) => {
    const v = fromPt(axisLength(info.w, info.h, S.axis)); const n = prevFib(v);
    if (n === null) return toast('Already at 1.'); setSize(n, e.altKey);
  });
  $('mulPhi').addEventListener('click', (e) => scaleBy(PHI, e.altKey));
  $('divPhi').addEventListener('click', (e) => scaleBy(1 / PHI, e.altKey));
  $('mulPhi2').addEventListener('click', (e) => scaleBy(PHI * PHI, e.altKey));
  $('divPhi2').addEventListener('click', (e) => scaleBy(1 / (PHI * PHI), e.altKey));

  // golden rectangle
  $('goldApply').addEventListener('click', (e) => {
    if (!info.count) return toast('Nothing selected.');
    const land = S.goldOrient === 'land';
    let axis, target;
    if (S.goldKeep === 'w') { axis = 'h'; target = land ? info.w / PHI : info.w * PHI; }
    else { axis = 'w'; target = land ? info.h * PHI : info.h / PHI; }
    run({ mode: 'size', target: target, axis: axis, constrain: false, ref: S.ref, useVisible: S.visible, scaleStrokes: S.strokes, duplicate: S.dup || e.altKey });
  });

  // sequence
  $('seqBuild').addEventListener('click', () => {
    if (!info.count) return toast('Nothing selected.');
    const sizes = seqSizes();
    if (!sizes.length) return toast('Nowhere to go in that direction.');
    const code = 'GS.sequence(' + arg({
      sizes: sizes.map(toPt), axis: S.axis, layout: S.seqLayout, gap: S.seqGap * PT_PER[S.unit],
      ref: S.ref, useVisible: S.visible, scaleStrokes: S.strokes, keepOriginal: S.seqKeep
    }) + ')';
    host(code).then((r) => { if (!r.ok) return toast(r.error); toast('Built ' + r.made + ' copies', true); refresh(); });
  });

  function seqSizes() {
    const cur = fromPt(axisLength(info.w, info.h, S.axis));
    let i = nearestFibIndex(cur);
    const out = [];
    for (let k = 0; k < S.seqCount; k++) {
      i += (S.seqDir === 'grow') ? 1 : -1;
      if (i < 0 || i >= FIB.length) break;
      out.push(FIB[i]);
    }
    return out;
  }

  /* ---------------- actions ---------------- */
  function setSize(n, dupOverride) {
    if (!info.count) return toast('Nothing selected.');
    run({ mode: 'size', target: toPt(n), axis: S.axis, constrain: S.constrain, ref: S.ref,
          useVisible: S.visible, scaleStrokes: S.strokes, duplicate: S.dup || !!dupOverride });
  }
  function scaleBy(f, dupOverride) {
    if (!info.count) return toast('Nothing selected.');
    run({ mode: 'factor', sx: f, sy: f, ref: S.ref, useVisible: S.visible, scaleStrokes: S.strokes, duplicate: S.dup || !!dupOverride });
  }
  function run(opts) {
    host('GS.scale(' + arg(opts) + ')').then((r) => {
      if (!r.ok) return toast(r.error);
      flash();
      refresh();
    });
  }

  /* ---------------- readout ---------------- */
  function refresh() {
    return host('GS.info(' + (S.visible ? 'true' : 'false') + ')').then((r) => {
      if (!r.ok) { info = { count: 0, hasDoc: false }; render(); return; }
      info = r; render();
    });
  }

  function render() {
    $('runit').textContent = S.unit + (S.base !== 1 ? ' · unit=' + S.base : '');
    const sub = $('rsub');
    if (!info.hasDoc) { $('rw').textContent = '—'; $('rh').textContent = '—'; sub.textContent = 'Open a document'; paintChips(null); return; }
    if (!info.count) { $('rw').textContent = '—'; $('rh').textContent = '—'; sub.textContent = 'Select something in Illustrator'; paintChips(null); return; }

    $('rw').textContent = fmt(info.w); $('rh').textContent = fmt(info.h);
    const v = fromPt(axisLength(info.w, info.h, S.axis));
    const idx = nearestFibIndex(v), near = FIB[idx];
    const exact = Math.abs(v - near) / near < 0.005;
    const ratio = info.h ? (info.w / info.h) : 0;
    const isGolden = ratio && (Math.abs(ratio - PHI) < 0.01 || Math.abs(ratio - 1 / PHI) < 0.004);
    let txt = (info.count > 1 ? info.count + ' objects · ' : '') + S.axis.toUpperCase() + ' = ' + (Math.round(v * 100) / 100) + ' units';
    txt += exact ? ' · <span class="fib">Fib ' + near + ' ✓</span>' : ' · nearest Fib <span class="fib">' + near + '</span>';
    if (isGolden) txt += ' · φ ✓';
    sub.innerHTML = txt;
    paintChips(exact ? near : null, near);

    const nx = nextFib(v), pv = prevFib(v);
    $('stepHint').textContent = (pv !== null ? pv : '·') + ' ◀ ' + (Math.round(v * 10) / 10) + ' ▶ ' + (nx !== null ? nx : '·');
    renderSeqHint();
  }

  function paintChips(current, near) {
    chips.querySelectorAll('.chip').forEach((b) => {
      const n = Number(b.dataset.n);
      b.classList.toggle('current', n === current);
      b.classList.toggle('near', near !== undefined && n === near && n !== current);
      b.querySelector('small').textContent = (S.base !== 1) ? fmt(toPt(n)) : '';
    });
  }
  function renderSeqHint() {
    if (!info.count) { $('seqHint').textContent = ''; return; }
    const s = seqSizes(); $('seqHint').textContent = s.length ? s.join(' · ') : '—';
  }

  function flash() { ['rw', 'rh'].forEach(id => { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }); }

  let toastTimer = null;
  function toast(msg, ok) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (ok ? ' ok' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ok ? 1400 : 2600);
  }

  /* ---------------- polling + theme ---------------- */
  let poll = null;
  function startPolling() {
    clearInterval(poll);
    if (S.live) poll = setInterval(() => { if (!document.hidden) refresh(); }, 700);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);

  function applyTheme() {
    if (!cs) return;
    try {
      const skin = cs.getHostEnvironment().appSkinInfo;
      const c = skin.panelBackgroundColor.color;
      const lum = (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue);
      document.body.classList.toggle('theme-light', lum > 128);
      document.body.classList.toggle('theme-dark', lum <= 128);
      document.documentElement.style.setProperty('--bg', 'rgb(' + Math.round(c.red) + ',' + Math.round(c.green) + ',' + Math.round(c.blue) + ')');
    } catch (e) { /* keep default dark */ }
  }
  if (cs) {
    applyTheme();
    cs.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, applyTheme);
    // default the unit picker to the document's ruler unit on first run
    if (!localStorage.getItem('goldenScale.v1')) {
      host('GS.docUnit()').then((r) => { if (r.ok && r.unit && PT_PER[r.unit]) { S.unit = r.unit; unitEl.value = r.unit; save(); render(); } });
    }
  }

  render();
  refresh();
  startPolling();

  // expose for the test harness
  window.__gs = { FIB, seqSizes, nearestFibIndex, nextFib, prevFib, setInfo: (i) => { info = i; render(); }, state: S };
})();
