/**
 * Viewer runtime embedded into every rendered deck. Plain JavaScript kept as a
 * string so the output HTML stays dependency-free. Everything here is
 * renderer-owned chrome: it never touches slide geometry.
 *
 * Playback model: a "step" is the unit of build animation. Elements carrying
 * `data-step="n"` are pending until the n-th "next" press on that slide; the
 * URL hash records `page.step` (e.g. `#3.2`). `?static=1` (or
 * `<html data-static="true">`) shows every element and disables transitions —
 * QA and exports use that. `?presenter=1` opens the presenter view; `P` opens
 * it from the main window, and the two stay in sync through BroadcastChannel
 * plus window messaging (same browser only).
 *
 * Interactive slots (details, tabs, a chart's toggle legend, image hotspots) work only while
 * `html[data-interactive]` is present: static mode and the editor show their default state.
 */

export const VIEWER_CSS = `html, body { margin: 0; padding: 0; height: 100%; background: #111; overflow: hidden; }
.deck-viewport { position: fixed; inset: 0; overflow: hidden; }
.deck-stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }
.deck-stage > .slide { position: absolute; left: 0; top: 0; visibility: hidden; }
.deck-stage > .slide.is-active { visibility: visible; z-index: 2; }
/* page change: the page being left stays underneath, opaque, until the new one has covered it, so the viewport ground never shows through */
.deck-stage > .slide.is-leaving { visibility: visible; z-index: 1; }
.deck-stage > .slide [data-step] { transition: opacity var(--motion-duration, 350ms) ease-out, transform var(--motion-duration, 350ms) cubic-bezier(0.2, 0.7, 0.2, 1), clip-path var(--motion-duration, 350ms) ease-out; }
.deck-stage > .slide [data-step].is-pending { visibility: hidden; opacity: 0; transform: translateY(24px); }
.deck-stage > .slide [data-step][data-enter="fade"].is-pending { transform: none; }
.deck-stage > .slide [data-step][data-enter="scale-in"].is-pending { transform: scale(0.9); }
.deck-stage > .slide [data-step][data-enter="slide-left"].is-pending { transform: translateX(56px); }
.deck-stage > .slide [data-step][data-enter="slide-right"].is-pending { transform: translateX(-56px); }
.deck-stage > .slide [data-step][data-enter="wipe"] { clip-path: inset(0 0 0 0); }
.deck-stage > .slide [data-step][data-enter="wipe"].is-pending { opacity: 1; transform: none; clip-path: inset(0 100% 0 0); }
@media (prefers-reduced-motion: reduce) { .deck-stage > .slide, .deck-stage > .slide [data-step] { transition: none !important; animation: none !important; } }
.deck-stage[data-transition="fade"] > .slide.is-active { animation: deck-fade var(--motion-duration, 350ms) ease both; }
.deck-stage[data-transition="lift"] > .slide.is-active { animation: deck-lift calc(var(--motion-duration, 350ms) * 1.5) cubic-bezier(0.22, 1, 0.36, 1) both; }
.deck-stage[data-transition="push"] > .slide.is-active { animation: deck-push-in calc(var(--motion-duration, 350ms) * 2) cubic-bezier(0.77, 0, 0.175, 1) both; }
.deck-stage[data-transition="push"] > .slide.is-leaving { animation: deck-push-out calc(var(--motion-duration, 350ms) * 2) cubic-bezier(0.77, 0, 0.175, 1) both; }
.deck-stage[data-transition="push"][data-direction="back"] > .slide.is-active { animation-name: deck-push-in-back; }
.deck-stage[data-transition="push"][data-direction="back"] > .slide.is-leaving { animation-name: deck-push-out-back; }
/* while a page is on its way out the stage clips, so a pushed page never shows in the letterbox */
.deck-stage:has(> .slide.is-leaving) { overflow: hidden; }
@keyframes deck-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes deck-lift { from { opacity: 0; transform: translateY(30px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes deck-push-in { from { transform: translateX(100%); } to { transform: none; } }
@keyframes deck-push-out { from { transform: none; } to { transform: translateX(-100%); } }
@keyframes deck-push-in-back { from { transform: translateX(-100%); } to { transform: none; } }
@keyframes deck-push-out-back { from { transform: none; } to { transform: translateX(100%); } }
html[data-static="true"] .deck-stage > .slide, html[data-static="true"] .deck-stage > .slide [data-step] { transition: none; animation: none !important; }
body.deck-presenter .presenter-aside { position: fixed; top: 0; right: 0; bottom: 0; width: 34vw; box-sizing: border-box; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #1b1b1b; color: #eee; font: 16px system-ui, sans-serif; z-index: 2000; }
.presenter-label { font-size: 12px; letter-spacing: 0.12em; opacity: 0.7; }
.presenter-next-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #000; }
.presenter-next-stage > .slide { position: absolute; left: 0; top: 0; visibility: visible; transform-origin: 0 0; }
.presenter-notes { flex: 1; overflow: auto; white-space: pre-wrap; font-size: 20px; line-height: 1.6; }
.presenter-timer { font: 700 40px ui-monospace, Consolas, monospace; text-align: right; }
.presenter-position { font-size: 14px; opacity: 0.8; }
/* playback micro-interactions: everything hangs off html[data-interactive], which the runtime drops in static mode (?static=1, QA) and while the editor is active, so measurements and dragging never see a hover */
html[data-interactive] .deck-stage > .slide [data-el]:not([data-step]), html[data-interactive] .deck-stage > .slide .deck-details { transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease; }
html[data-interactive] .slide [data-el] > img { cursor: zoom-in; }
html[data-interactive] .slide a { cursor: pointer; }
html:not([data-interactive]) .slide a { pointer-events: none; }
.deck-lightbox { position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.88); cursor: zoom-out; }
.deck-lightbox img { max-width: 92vw; max-height: 92vh; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); }
.deck-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 8px 16px; border-radius: 999px; background: rgba(20, 20, 20, 0.86); color: #fff; font: 14px system-ui, sans-serif; white-space: nowrap; opacity: 0; transition: opacity 0.2s ease; pointer-events: none; z-index: 1600; }
.deck-toast.is-on { opacity: 1; }
@media (prefers-reduced-motion: reduce) { html[data-interactive] .deck-stage > .slide [data-el]:not([data-step]), html[data-interactive] .deck-stage > .slide .deck-details { transition: none; } }
`

/**
 * Auto-fit: text elements carrying `data-fit` shrink their font-size (after
 * fonts are ready) until the content no longer overflows the box, never below
 * the role's minimum (32px, 20px for page furniture). Embedded in decks and in
 * preview documents; QA and tests wait for `window.__fit.ready`.
 */
export const FIT_JS = `(() => {
  const MIN = { default: 32, meta: 20, chip: 20, eyebrow: 20, 'eyebrow-accent': 20, chapter: 24, pill: 24, caption: 24, cta: 24, kicker: 24, flow: 24, 'flow-accent': 24, table: 22 };
  function fitOne(el) {
    if (el.dataset.fitLock === 'true') return;
    const min = MIN[el.dataset.role] || MIN.default;
    el.style.fontSize = '';
    let size = Number.parseFloat(getComputedStyle(el).fontSize);
    let guard = 0;
    const overflowing = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    while (overflowing() && size > min && guard++ < 80) {
      size = Math.max(min, size - 2);
      el.style.fontSize = size + 'px';
    }
    if (el.style.fontSize) el.dataset.fitSize = el.style.fontSize; else delete el.dataset.fitSize;
  }
  function fitAll() {
    for (const el of document.querySelectorAll('section.slide [data-el][data-fit]')) fitOne(el);
    document.documentElement.dataset.fitDone = 'true';
  }
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  window.__fit = { fitAll, fitOne, ready: ready.then(fitAll) };
})();
`

export const RUNTIME_JS = `(() => {
  const W = 1920, H = 1080;
  const root = document.documentElement;
  const model = JSON.parse(document.getElementById('deck-model').textContent);
  const params = new URLSearchParams(location.search);
  if (params.get('static') === '1') root.dataset.static = 'true';
  const isPresenter = params.get('presenter') === '1';
  // element motion switch: off = every step revealed at once, no entrances (page transitions stay).
  // deck.json's motion: "off" arrives as html[data-motion="off"]; ?motion=0|1 wins for this load and
  // the M key remembers a choice for this browser (localStorage), so a talk can drop the reveals
  // without touching the file. The editor's toggle writes the file and clears the remembered choice.
  const motionKey = 'deck:' + (model.id || 'deck') + ':motion';
  let remembered = null;
  try { remembered = localStorage.getItem(motionKey); } catch (_) { remembered = null; }
  let motionOff = params.has('motion') ? params.get('motion') === '0' : remembered ? remembered === 'off' : root.dataset.motion === 'off';
  function applyMotion() { if (motionOff) root.dataset.motion = 'off'; else delete root.dataset.motion; }
  applyMotion();
  const stepsOf = (i) => (motionOff ? 0 : maxSteps[i] || 0);
  function setMotion(on, remember) {
    motionOff = !on;
    applyMotion();
    try { if (remember) localStorage.setItem(motionKey, on ? 'on' : 'off'); else localStorage.removeItem(motionKey); } catch (_) {}
    step = 0;
    applySteps();
    const h = hashFor();
    if (location.hash !== h) history.replaceState(null, '', h);
    document.dispatchEvent(new CustomEvent('deck:change', { detail: { index: current, id: ids[current], step, reason: 'motion' } }));
  }
  let toastEl = null, toastTimer = 0;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'deck-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 1400);
  }
  const stage = document.querySelector('.deck-stage');
  const sections = Array.from(stage.querySelectorAll(':scope > .slide'));
  const sectionById = new Map(sections.map((s) => [s.dataset.slide, s]));
  const storyIds = sections.map((s) => s.dataset.slide);
  let slides = sections, ids = storyIds;
  let maxSteps = [];
  const pad2 = (n) => String(n).padStart(2, '0');
  // page-level overrides (model.pages): playback order and hidden slides. Hidden sections stay in
  // the DOM (the editor lists them) but never activate.
  function applyPages() {
    const eff = window.__pages.effectiveOrder(storyIds, model.pages);
    for (const s of sections) {
      s.classList.remove('is-active', 'is-leaving');
      if (eff.hidden.includes(s.dataset.slide)) s.dataset.hiddenSlide = 'true';
      else delete s.dataset.hiddenSlide;
    }
    slides = eff.visible.map((id) => sectionById.get(id));
    ids = eff.visible.slice();
    renumber();
  }
  // the "01 / 08" chips the scaffold filled from the story order follow the playback order instead,
  // unless the user typed their own text into that chip
  function renumber() {
    slides.forEach((s, i) => {
      // furniture such as progress ticks reads the position from the section itself
      s.style.setProperty('--page-index', String(i + 1));
      s.style.setProperty('--page-count', String(slides.length));
      const id = s.dataset.slide;
      const slide = model.slides.find((x) => x.id === id);
      const slot = slide && slide.slots.page;
      const o = model.overrides[id + '/page'];
      if (!slot || slot.type !== 'text' || !/^[0-9]{1,3} [/] [0-9]{1,3}$/.test(slot.value) || (o && o.text != null)) return;
      const el = s.querySelector('[data-el="page"]');
      if (el) el.textContent = pad2(i + 1) + ' / ' + pad2(slides.length);
    });
  }
  function rescan() {
    maxSteps = slides.map((s) => Math.max(0, ...Array.from(s.querySelectorAll('[data-step]')).map((el) => Number(el.dataset.step) || 0)));
    applySteps();
  }
  // the stage arrives with data-transition resolved by the renderer (the deck's value, else the theme's
  // default, which it also carries as data-transition-default); the editor changes it live here
  const FAMILY = { 'slide-left': 'push' };
  function setTransition(value) {
    const v = FAMILY[value] || value || stage.dataset.transitionDefault || 'fade';
    if (v === 'none') delete stage.dataset.transition; else stage.dataset.transition = v;
  }
  let current = -1, step = 0;

  // the page being left keeps .is-leaving (visible, underneath) while the new page animates in
  let leaving = null, leaveTimer = 0;
  function settleLeaving() {
    clearTimeout(leaveTimer);
    if (leaving) { leaving.classList.remove('is-leaving'); leaving = null; }
  }
  function leave(from) {
    settleLeaving();
    if (!from || !stage.dataset.transition || staticNow()) return;
    from.classList.add('is-leaving');
    leaving = from;
    // each family runs its own length (push twice the entrance duration, lift 1.5×): read it off the new page
    const ms = (Number.parseFloat(getComputedStyle(slides[current]).animationDuration) || 0.35) * 1000;
    leaveTimer = setTimeout(settleLeaving, ms + 60);
  }

  const staticNow = () => root.dataset.static === 'true' || document.body.classList.contains('ed-active');

  function parseHash() {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (!raw) return { index: 0, step: 0 };
    const dot = raw.lastIndexOf('.');
    const pagePart = dot === -1 ? raw : raw.slice(0, dot);
    const stepPart = dot === -1 ? '' : raw.slice(dot + 1);
    let index = ids.indexOf(pagePart);
    if (index === -1) {
      const n = Number.parseInt(pagePart, 10);
      index = Number.isFinite(n) && n >= 1 && n <= slides.length ? n - 1 : 0;
    }
    const st = Number.parseInt(stepPart, 10);
    return { index, step: Number.isFinite(st) && st > 0 ? st : 0 };
  }

  function applySteps() {
    const s = slides[current];
    if (!s) return;
    s.dataset.stepCurrent = String(step);
    const reveal = staticNow() || motionOff;
    const stagger = reveal ? 0 : Number.parseFloat(getComputedStyle(stage).getPropertyValue('--motion-stagger')) || 0;
    let revealed = 0;
    for (const el of s.querySelectorAll('[data-step]')) {
      const n = Number(el.dataset.step) || 0;
      const pending = !reveal && n > step;
      el.classList.toggle('is-pending', pending);
      // the elements this press reveals enter one after another; everything else moves at once
      el.style.transitionDelay = !reveal && !pending && n === step ? (revealed++ * stagger) + 'ms' : '';
    }
  }

  const hashFor = () => '#' + (current + 1) + (step > 0 ? '.' + step : '');

  function show(index, nextStep, reason) {
    const next = Math.max(0, Math.min(slides.length - 1, index));
    const max = stepsOf(next);
    const st = Math.max(0, Math.min(max, nextStep == null ? 0 : nextStep));
    if (next === current && st === step) return;
    const slideChanged = next !== current;
    const from = slides[current];
    const fromIndex = current;
    current = next;
    step = st;
    if (slideChanged) {
      closeDetails();
      // push reverses when going back; the first page shown counts as forward
      stage.dataset.direction = fromIndex === -1 || next > fromIndex ? 'forward' : 'back';
      slides.forEach((s, i) => s.classList.toggle('is-active', i === current));
      leave(from);
    }
    applySteps();
    const hash = hashFor();
    if (location.hash !== hash) history.replaceState(null, '', hash);
    document.dispatchEvent(new CustomEvent('deck:change', { detail: { index: current, id: ids[current], step, reason } }));
    if (reason !== 'remote') broadcast();
  }
  function next(reason) {
    if (step < stepsOf(current)) show(current, step + 1, reason);
    else show(current + 1, 0, reason);
  }
  function prev(reason) {
    if (step > 0) show(current, step - 1, reason);
    else if (current > 0) show(current - 1, stepsOf(current - 1), reason);
  }

  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  function fit() {
    const vw = Math.max(1, window.innerWidth - insets.left - insets.right);
    const vh = Math.max(1, window.innerHeight - insets.top - insets.bottom);
    const s = Math.min(vw / W, vh / H);
    const x = insets.left + (vw - W * s) / 2, y = insets.top + (vh - H * s) / 2;
    stage.style.transform = 'translate(' + x + 'px, ' + y + 'px) scale(' + s + ')';
    stage.dataset.scale = String(s);
  }

  // ---- sync between the main window and the presenter window --------------
  const channelName = 'deck:' + (model.id || 'deck');
  let channel = null;
  try { channel = new BroadcastChannel(channelName); } catch (_) { channel = null; }
  const peers = new Set();
  function broadcast() {
    const msg = { type: 'deck:sync', index: current, step };
    if (channel) { try { channel.postMessage(msg); } catch (_) {} }
    for (const w of peers) { try { if (!w.closed) w.postMessage(msg, '*'); } catch (_) {} }
    if (window.opener) { try { window.opener.postMessage(msg, '*'); } catch (_) {} }
  }
  function onMessage(msg) {
    if (!msg || msg.type !== 'deck:sync') return;
    show(msg.index, msg.step, 'remote');
  }
  if (channel) channel.onmessage = (e) => onMessage(e.data);
  window.addEventListener('message', (e) => onMessage(e.data));

  function openPresenter() {
    const url = new URL(location.href);
    url.searchParams.set('presenter', '1');
    url.hash = hashFor();
    const w = window.open(url.href, 'deck-presenter');
    if (w) peers.add(w);
    return w;
  }

  function buildPresenter() {
    document.body.classList.add('deck-presenter');
    const aside = document.createElement('aside');
    aside.className = 'presenter-aside';
    aside.innerHTML = '<div class="presenter-label">下一頁</div><div class="presenter-next-stage"></div><div class="presenter-position"></div><div class="presenter-label">講稿</div><div class="presenter-notes"></div><div class="presenter-timer">00:00</div>';
    document.body.appendChild(aside);
    const nextStage = aside.querySelector('.presenter-next-stage');
    const notes = aside.querySelector('.presenter-notes');
    const position = aside.querySelector('.presenter-position');
    const timerEl = aside.querySelector('.presenter-timer');
    const started = Date.now();
    setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      timerEl.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
    function refresh() {
      nextStage.textContent = '';
      const n = slides[current + 1];
      if (n) {
        const clone = n.cloneNode(true);
        clone.classList.add('is-active');
        clone.classList.remove('is-leaving');
        for (const el of clone.querySelectorAll('.is-pending')) el.classList.remove('is-pending');
        clone.style.transform = 'scale(' + nextStage.clientWidth / W + ')';
        nextStage.appendChild(clone);
      }
      const slide = model.slides[current];
      notes.textContent = (slide && slide.notes) || '（這一頁沒有講稿）';
      position.textContent = (current + 1) + ' / ' + slides.length + (stepsOf(current) ? '　步驟 ' + step + ' / ' + stepsOf(current) : '');
    }
    document.addEventListener('deck:change', refresh);
    window.addEventListener('resize', refresh);
    const applyInsets = () => { insets.right = aside.offsetWidth; fit(); };
    window.addEventListener('resize', applyInsets);
    applyInsets();
    refresh();
  }

  // ---- playback micro-interactions ------------------------------------------
  // html[data-interactive] gates every :hover rule a theme writes and the click effects below;
  // static mode (?static=1, QA) and edit mode (body.ed-active) drop it, so measurement and
  // dragging never meet a hover state.
  function syncInteractive() {
    if (staticNow()) delete root.dataset.interactive; else root.dataset.interactive = 'true';
    // leaving playback: every interactive slot goes back to its default state
    if (!interactive()) { closeDetails(); closeLightbox(); clearChartTip(); resetCharts(); }
    syncControls();
  }
  new MutationObserver(syncInteractive).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const interactive = () => root.dataset.interactive === 'true';

  // chart hover: dim the other rows and draw a tooltip inside the svg, in the theme's colours
  const CHART_PART = '.chart-row, .chart-point, .chart-ring-fill';
  let tipped = null;
  function clearChartTip() {
    if (!tipped) return;
    tipped.tip.remove();
    tipped.svg.classList.remove('has-hover');
    for (const p of tipped.svg.querySelectorAll('.is-hover')) p.classList.remove('is-hover');
    tipped = null;
  }
  function chartTip(target) {
    const part = target && target.closest ? target.closest(CHART_PART) : null;
    if (tipped && tipped.part !== part) clearChartTip();
    const svg = part ? part.closest('svg.chart') : null;
    if (!part || !svg || tipped) return;
    for (const p of svg.querySelectorAll(CHART_PART)) p.classList.toggle('is-hover', p === part);
    svg.classList.add('has-hover');
    const ns = 'http://www.w3.org/2000/svg';
    const tip = document.createElementNS(ns, 'g');
    tip.setAttribute('class', 'chart-tip');
    const rect = document.createElementNS(ns, 'rect');
    const text = document.createElementNS(ns, 'text');
    text.textContent = (part.dataset.label ? part.dataset.label + '  ' : '') + (part.dataset.text || '');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    tip.appendChild(rect);
    tip.appendChild(text);
    svg.appendChild(tip);
    const vb = svg.viewBox.baseVal;
    const box = part.getBBox();
    const w = Math.ceil(text.getBBox().width) + 40, h = 52;
    let x = box.x + box.width / 2 - w / 2, y = box.y - h - 12;
    x = Math.max(0, Math.min(vb.width - w, x));
    if (y < 0) y = Math.min(vb.height - h, box.y + box.height + 12);
    rect.setAttribute('x', x); rect.setAttribute('y', y); rect.setAttribute('width', w); rect.setAttribute('height', h); rect.setAttribute('rx', 8);
    text.setAttribute('x', x + w / 2); text.setAttribute('y', y + h / 2 + 1);
    tipped = { part, svg, tip };
  }
  stage.addEventListener('mouseover', (e) => { if (interactive()) chartTip(e.target); else clearChartTip(); });
  stage.addEventListener('mouseout', (e) => {
    if (!tipped) return;
    const to = e.relatedTarget;
    if (!to || !tipped.part.contains(to)) clearChartTip();
  });

  // image click: the same picture, large, inside the file; click or Esc closes
  let lightbox = null;
  function closeLightbox() { if (lightbox) { lightbox.remove(); lightbox = null; } }
  function openLightbox(img) {
    closeLightbox();
    lightbox = document.createElement('div');
    lightbox.className = 'deck-lightbox';
    const big = document.createElement('img');
    big.src = img.currentSrc || img.src;
    big.alt = img.alt || '';
    lightbox.appendChild(big);
    lightbox.addEventListener('click', closeLightbox);
    document.body.appendChild(lightbox);
  }
  // ---- interactive slots: details, tabs, chart legend, hotspots ----------------------
  // Their default state is what the static document shows; everything below only runs behind
  // html[data-interactive]. Controls are keyboard-reachable only while playing (tabindex).
  const CONTROLS = '[data-details], .tabs > .tab, .chart-key, a.hotspot';
  function syncControls() {
    const on = interactive();
    for (const el of stage.querySelectorAll(CONTROLS)) el.tabIndex = on ? 0 : -1;
  }

  // details: the element's summary plus its <template class="details"> content, in a panel laid over
  // the element (same box, same role, so the theme styles it like the source) that grows downward;
  // the source is faded out (is-open) while the panel is up, so a translucent theme surface shows nothing of it
  let details = null;
  function closeDetails() {
    if (!details) return;
    const src = details.source;
    details.panel.remove();
    // the source comes back at once (a stepped element would otherwise fade in behind the vanished panel)
    src.style.transition = 'none';
    src.classList.remove('is-open');
    src.setAttribute('aria-expanded', 'false');
    void src.offsetWidth;
    src.style.transition = '';
    details = null;
  }
  function openDetails(el) {
    closeDetails();
    const tpl = el.querySelector(':scope > template.details');
    const section = el.closest('section.slide');
    if (!tpl || !section) return;
    const panel = document.createElement('div');
    panel.className = 'deck-details';
    if (el.dataset.role) panel.dataset.role = el.dataset.role;
    const summary = document.createElement('div');
    summary.className = 'deck-details-summary';
    for (const n of el.childNodes) if (n.nodeType !== 1 || n.tagName !== 'TEMPLATE') summary.appendChild(n.cloneNode(true));
    const body = document.createElement('div');
    body.className = 'details';
    body.appendChild(tpl.content.cloneNode(true));
    panel.appendChild(summary);
    panel.appendChild(body);
    const cs = getComputedStyle(el);
    panel.style.left = el.offsetLeft + 'px';
    panel.style.top = el.offsetTop + 'px';
    panel.style.width = el.offsetWidth + 'px';
    panel.style.minHeight = el.offsetHeight + 'px';
    panel.style.padding = cs.padding;
    panel.style.fontSize = cs.fontSize;
    panel.style.lineHeight = cs.lineHeight;
    panel.style.textAlign = cs.textAlign;
    panel.tabIndex = -1;
    section.appendChild(panel);
    const room = H - 40;
    if (panel.offsetHeight > room - 40) { panel.style.height = (room - 40) + 'px'; panel.style.overflowY = 'auto'; }
    if (el.offsetTop + panel.offsetHeight > room) panel.style.top = Math.max(40, room - panel.offsetHeight) + 'px';
    el.classList.add('is-open');
    el.setAttribute('aria-expanded', 'true');
    details = { panel, source: el };
  }
  function toggleDetails(el) {
    if (details && details.source === el) closeDetails(); else openDetails(el);
  }

  // tabs: the strip and its panels are siblings inside the element
  function selectTab(tab) {
    const host = tab.closest('.tabs') && tab.closest('.tabs').parentElement;
    if (!host) return;
    const index = tab.dataset.tab;
    for (const t of host.querySelectorAll(':scope > .tabs > .tab')) {
      const on = t.dataset.tab === index;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    }
    for (const p of host.querySelectorAll(':scope > .tab-panel')) p.hidden = p.dataset.tab !== index;
  }

  // chart legend: switched-off items leave the scale; the svg is drawn again by the shared renderer
  const chartOff = new Map();
  function chartSlotOf(el) {
    const section = el.closest('section.slide');
    const slide = section && model.slides.find((s) => s.id === section.dataset.slide);
    const r = window.__slotRender;
    if (!slide || !r) return null;
    const slot = r.effectiveSlot(slide.slots[el.dataset.el], model.overrides[slide.id + '/' + el.dataset.el], 'text');
    return slot && slot.type === 'chart' ? slot : null;
  }
  function toggleChartItem(key) {
    const el = key.closest('[data-el]');
    const slot = el && chartSlotOf(el);
    if (!slot) return;
    const id = el.closest('section.slide').dataset.slide + '/' + el.dataset.el;
    const off = new Set(chartOff.get(id) || []);
    const i = Number(key.dataset.index);
    if (off.has(i)) off.delete(i);
    else if (off.size < slot.series.length - 1) off.add(i); // at least one item stays on
    chartOff.set(id, [...off]);
    clearChartTip();
    el.innerHTML = window.__slotRender.chartSvg(slot, { off: [...off] });
    syncControls();
    const again = el.querySelector('.chart-key[data-index="' + i + '"]');
    if (again) again.focus({ preventScroll: true });
  }
  function resetCharts() {
    if (!window.__slotRender) return;
    for (const id of chartOff.keys()) {
      const slash = id.indexOf('/');
      const el = stage.querySelector('[data-slide="' + id.slice(0, slash) + '"] [data-el="' + id.slice(slash + 1) + '"]');
      const slot = el && chartSlotOf(el);
      if (slot) el.innerHTML = window.__slotRender.chartSvg(slot);
    }
    chartOff.clear();
  }

  // hotspot: a region of an image that jumps to another slide (hidden targets are ignored)
  function jumpHotspot(a) {
    const idx = ids.indexOf(a.dataset.target);
    if (idx !== -1) show(idx, 0, 'hotspot');
  }

  stage.addEventListener('click', (e) => {
    if (!interactive()) return;
    const t = e.target;
    if (!t || !t.closest) return;
    // a click on the panel itself closes it; a link inside the panel keeps working
    if (details && details.panel.contains(t)) { if (!t.closest('a')) closeDetails(); return; }
    const hotspot = t.closest('a.hotspot');
    if (hotspot) { e.preventDefault(); e.stopPropagation(); closeDetails(); jumpHotspot(hotspot); return; }
    const tab = t.closest('.tabs > .tab');
    if (tab) { e.preventDefault(); selectTab(tab); return; }
    const key = t.closest('.chart-key, .chart-toggle .chart-row, .chart-toggle .chart-point, .chart-toggle .chart-ring-fill');
    if (key) { e.preventDefault(); toggleChartItem(key); return; }
    const card = t.closest('[data-details]');
    if (card) { e.preventDefault(); toggleDetails(card); return; }
    closeDetails();
    const img = t.closest('[data-el] > img');
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    openLightbox(img);
  });
  document.addEventListener('click', (e) => {
    if (details && !stage.contains(e.target)) closeDetails();
  });
  // keyboard on a focused control; stopPropagation keeps Enter and the arrows from turning pages
  stage.addEventListener('keydown', (e) => {
    if (!interactive()) return;
    const t = e.target;
    if (!t || !t.closest) return;
    const activate = e.key === 'Enter' || e.key === ' ';
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    const tab = t.closest('.tabs > .tab');
    if (tab) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const tabs = Array.from(tab.parentElement.querySelectorAll(':scope > .tab'));
        const n = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        handled(); selectTab(n); n.focus({ preventScroll: true });
      } else if (activate) { handled(); selectTab(tab); }
      return;
    }
    if (!activate) return;
    const key = t.closest('.chart-key');
    if (key) { handled(); toggleChartItem(key); return; }
    const hotspot = t.closest('a.hotspot');
    if (hotspot) { handled(); jumpHotspot(hotspot); return; }
    const card = t.closest('[data-details]');
    if (card) { handled(); toggleDetails(card); }
  });

  let digits = '', digitTimer = 0;
  function onKey(e) {
    if (e.key === 'Escape' && (lightbox || details)) { e.preventDefault(); closeLightbox(); closeDetails(); return; }
    if (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|A)$/.test(e.target.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); next('keyboard'); return;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); prev('keyboard'); return;
      case 'Home': e.preventDefault(); show(0, 0, 'keyboard'); return;
      case 'End': e.preventDefault(); show(slides.length - 1, 0, 'keyboard'); return;
      case 'p': case 'P': if (!isPresenter) { e.preventDefault(); openPresenter(); } return;
      case 'm': case 'M':
        if (staticNow()) return;
        e.preventDefault();
        setMotion(motionOff, true);
        toast(motionOff ? '元件動畫：關（按 M 恢復）' : '元件動畫：開');
        return;
    }
    if (/^[0-9]$/.test(e.key)) {
      digits += e.key;
      clearTimeout(digitTimer);
      digitTimer = setTimeout(() => {
        const n = Number.parseInt(digits, 10);
        digits = '';
        if (n >= 1) show(n - 1, 0, 'keyboard');
      }, 400);
    }
  }

  window.__deck = {
    model,
    get ids() { return ids; },
    storyIds: () => storyIds.slice(),
    pages: () => window.__pages.effectiveOrder(storyIds, model.pages),
    // re-sequence live (editor): keep the current slide when it is still visible
    setPages: (pages) => {
      const keep = ids[current];
      model.pages = pages || undefined;
      applyPages();
      rescan();
      const idx = ids.indexOf(keep);
      current = -1;
      show(idx === -1 ? Math.max(0, Math.min(slides.length - 1, keep === undefined ? 0 : storyIds.indexOf(keep))) : idx, 0, 'pages');
    },
    renumber,
    get count() { return slides.length; },
    get current() { return current; },
    get step() { return step; },
    steps: (i) => stepsOf(i == null ? current : i),
    // element motion: false while the deck, the url or this browser's remembered choice turned it off
    get motion() { return !motionOff; },
    // remember=true keeps the choice for this browser (what M does); false clears it (the editor, which writes the file)
    setMotion,
    // page transition family in effect ('none' when switching instantly); '' in setTransition = the theme default
    get transition() { return stage.dataset.transition || 'none'; },
    setTransition,
    go: (n, st) => show(typeof n === 'string' ? ids.indexOf(n) : n, st || 0, 'api'),
    next: () => next('api'),
    prev: () => prev('api'),
    rescan,
    refresh: applySteps,
    scale: () => Number(stage.dataset.scale || 1),
    setInsets: (nextInsets) => { Object.assign(insets, nextInsets || {}); fit(); },
    fit,
    openPresenter,
    isPresenter,
    interactive,
    syncInteractive,
    closeLightbox,
    clearChartTip,
    closeDetails,
    // the details panel currently open, as { slideId, elId }, or null
    get details() {
      if (!details) return null;
      return { slideId: details.source.closest('section.slide').dataset.slide, elId: details.source.dataset.el };
    },
    chartOff: (slideId, elId) => (chartOff.get(slideId + '/' + elId) || []).slice(),
  };

  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', () => { const h = parseHash(); show(h.index, h.step, 'hash'); });
  window.addEventListener('keydown', onKey);
  syncInteractive();
  applyPages();
  rescan();
  fit();
  const start = parseHash();
  show(start.index, start.step, 'init');
  if (isPresenter) buildPresenter();
})();
`
