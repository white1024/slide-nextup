import { MIN_FONT_BY_ROLE } from '../qa/font-floors.ts'

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
 * plus window messaging (same browser only). `F` fills the screen with the
 * deck in any of these windows. In static mode and in the editor every step is
 * already shown, so there a press turns the page instead of counting steps.
 *
 * Interactive slots (details, tabs, a chart's toggle legend, image hotspots) work only while
 * `html[data-interactive]` is present: static mode and the editor show their default state.
 */

export const VIEWER_CSS = `html, body { margin: 0; padding: 0; height: 100%; background: #111; overflow: hidden; }
.deck-viewport { position: fixed; inset: 0; overflow: hidden; }
.deck-stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }
.deck-stage > .slide { position: absolute; left: 0; top: 0; visibility: hidden; }
.deck-stage > .slide.is-active { visibility: visible; z-index: 2; }
/* page change: the page being left keeps .is-leaving underneath while the new page comes in on top. Each family is an exit on the old page (ease-in) and an entrance on the new one (ease-out, delayed so the two overlap): 140–280ms, never more than 12px of travel or 3% of scale, opacity always part of it. breath is the one exception, a full exit, a beat, then the entrance, for section breaks; fade keeps the old page still and crossfades over it */
.deck-stage > .slide.is-leaving { visibility: visible; z-index: 1; }
.deck-stage { --deck-ease-in: cubic-bezier(0.4, 0, 1, 1); --deck-ease-out: cubic-bezier(0, 0, 0.2, 1); }
/* element entrances: an element waiting for its step is hidden; the press that reveals it adds .is-entering and it plays one keyframe run (fill both, so it holds the first frame through its stagger delay) that ends on the element's resting state, which is exactly what static mode shows. Elements already revealed when a page comes up (a hash jump, going back) do not replay, and a page on its way out (.is-leaving) never replays. The pace comes from the theme: --motion-duration, --motion-stagger and --motion-ease (its family); pop keeps its own overshoot curve. Every run stays within 150–800ms and 64px of travel */
.deck-stage > .slide [data-step].is-pending { visibility: hidden; opacity: 0; }
.deck-stage > .slide.is-active [data-step].is-entering { animation: deck-enter-fade-up var(--motion-duration, 350ms) var(--motion-ease, cubic-bezier(0.2, 0.7, 0.2, 1)) var(--enter-delay, 0ms) both; }
.deck-stage > .slide.is-active [data-step][data-enter="fade"].is-entering { animation-name: deck-enter-fade; }
.deck-stage > .slide.is-active [data-step][data-enter="scale-in"].is-entering { animation-name: deck-enter-scale-in; }
.deck-stage > .slide.is-active [data-step][data-enter="slide-left"].is-entering { animation-name: deck-enter-slide-left; }
.deck-stage > .slide.is-active [data-step][data-enter="slide-right"].is-entering { animation-name: deck-enter-slide-right; }
.deck-stage > .slide.is-active [data-step][data-enter="wipe"].is-entering { animation-name: deck-enter-wipe; }
.deck-stage > .slide.is-active [data-step][data-enter="pop"].is-entering { animation-name: deck-enter-pop; animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); }
.deck-stage > .slide.is-active [data-step][data-enter="blur"].is-entering { animation-name: deck-enter-blur; }
/* cascade: the element itself just appears and its items fade up one after another, 50ms apart: its direct children, or the children of its only child (a list's entries, a metric's parts). The runtime adds .is-cascading only when there are at least two items; otherwise the element plays fade-up */
.deck-stage > .slide.is-active [data-step].is-entering.is-cascading { animation: none; }
.deck-stage > .slide.is-active [data-step].is-entering.is-cascading > :not(:only-child), .deck-stage > .slide.is-active [data-step].is-entering.is-cascading > :only-child > * { animation: deck-enter-fade-up var(--motion-duration, 350ms) var(--motion-ease, cubic-bezier(0.2, 0.7, 0.2, 1)) calc(var(--enter-delay, 0ms) + var(--cascade-i, 0) * 50ms) both; }
${Array.from({ length: 11 }, (_, i) => `.is-cascading > :nth-child(${i + 2}), .is-cascading > :only-child > :nth-child(${i + 2}) { --cascade-i: ${i + 1}; }`).join('\n')}
/* data-driven chart entrances: the element shows at once and its parts play from the data. grow and draw are one rule, so a theme may name either for every chart kind: a bar or progress fill scales from its left end to its real width, a ring segment's dash runs from 0 to its real share (--share), a line draws itself along its real points (pathLength 1) with each point popping as the line reaches it (--t) and the area filling in behind. count fades the element in while the runtime runs its number up to the real value */
.deck-stage > .slide.is-active [data-step].is-entering:is([data-enter="grow"], [data-enter="draw"]) { animation: none; }
.deck-stage > .slide.is-active [data-step].is-entering:is([data-enter="grow"], [data-enter="draw"]) .chart-fill { transform-box: fill-box; transform-origin: left center; animation: deck-enter-grow-x var(--motion-duration, 350ms) var(--motion-ease, cubic-bezier(0.2, 0.7, 0.2, 1)) var(--enter-delay, 0ms) both; }
.deck-stage > .slide.is-active [data-step].is-entering:is([data-enter="grow"], [data-enter="draw"]) .chart-ring-fill { animation: deck-enter-grow-ring var(--motion-duration, 350ms) var(--motion-ease, cubic-bezier(0.2, 0.7, 0.2, 1)) var(--enter-delay, 0ms) both; }
.deck-stage > .slide.is-active [data-step].is-entering:is([data-enter="grow"], [data-enter="draw"]) .chart-line { animation: deck-enter-draw-line var(--motion-duration, 350ms) var(--motion-ease, cubic-bezier(0.2, 0.7, 0.2, 1)) var(--enter-delay, 0ms) both; }
.deck-stage > .slide.is-active [data-step].is-entering:is([data-enter="grow"], [data-enter="draw"]) .chart-area { animation: deck-enter-fade var(--motion-duration, 350ms) var(--motion-ease, cubic-bezier(0.2, 0.7, 0.2, 1)) calc(var(--enter-delay, 0ms) + var(--motion-duration, 350ms) / 2) both; }
.deck-stage > .slide.is-active [data-step].is-entering:is([data-enter="grow"], [data-enter="draw"]) .chart-point { transform-box: fill-box; transform-origin: center; animation: deck-enter-pop calc(var(--motion-duration, 350ms) / 2) cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--enter-delay, 0ms) + var(--t, 0) * var(--motion-duration, 350ms)) both; }
.deck-stage > .slide.is-active [data-step][data-enter="count"].is-entering { animation-name: deck-enter-fade; }
/* the page being left never replays an entrance (open-slide's pitfall: the old layer animating under the new page) */
.deck-stage > .slide.is-leaving [data-step], .deck-stage > .slide.is-leaving [data-step] * { animation: none !important; }
@media (prefers-reduced-motion: reduce) { .deck-stage > .slide, .deck-stage > .slide [data-step], .deck-stage > .slide [data-step] * { transition: none !important; animation: none !important; } }
@keyframes deck-enter-fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes deck-enter-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes deck-enter-scale-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: none; } }
@keyframes deck-enter-slide-left { from { opacity: 0; transform: translateX(56px); } to { opacity: 1; transform: none; } }
@keyframes deck-enter-slide-right { from { opacity: 0; transform: translateX(-56px); } to { opacity: 1; transform: none; } }
@keyframes deck-enter-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes deck-enter-pop { from { opacity: 0; transform: scale(0.62); } 40% { opacity: 1; } to { opacity: 1; transform: none; } }
@keyframes deck-enter-blur { from { opacity: 0; filter: blur(18px); transform: translateY(8px); } to { opacity: 1; filter: none; transform: none; } }
@keyframes deck-enter-grow-x { from { transform: scaleX(0); } to { transform: none; } }
@keyframes deck-enter-grow-ring { from { stroke-dasharray: 0 1; } to { stroke-dasharray: var(--share, 1) 1; } }
@keyframes deck-enter-draw-line { from { stroke-dasharray: 1; stroke-dashoffset: 1; } to { stroke-dasharray: 1; stroke-dashoffset: 0; } }
.deck-stage[data-transition="fade"] > .slide.is-active { animation: deck-fade 240ms var(--deck-ease-out) both; }
.deck-stage[data-transition="rise"] > .slide.is-active { animation: deck-rise-in 200ms var(--deck-ease-out) 80ms both; }
.deck-stage[data-transition="rise"] > .slide.is-leaving { animation: deck-rise-out 140ms var(--deck-ease-in) both; }
.deck-stage[data-transition="settle"] > .slide.is-active { animation: deck-settle-in 280ms var(--deck-ease-out) 100ms both; }
.deck-stage[data-transition="settle"] > .slide.is-leaving { animation: deck-settle-out 160ms var(--deck-ease-in) both; }
.deck-stage[data-transition="dissolve"] > .slide.is-active { animation: deck-dissolve-in 240ms var(--deck-ease-out) 40ms both; }
.deck-stage[data-transition="dissolve"] > .slide.is-leaving { animation: deck-dissolve-out 200ms var(--deck-ease-in) both; }
.deck-stage[data-transition="breath"] > .slide.is-active { animation: deck-breath-in 240ms var(--deck-ease-out) 300ms both; }
.deck-stage[data-transition="breath"] > .slide.is-leaving { animation: deck-breath-out 180ms var(--deck-ease-in) both; }
.deck-stage[data-transition="push"] > .slide.is-active { animation: deck-push-in 200ms var(--deck-ease-out) 80ms both; }
.deck-stage[data-transition="push"] > .slide.is-leaving { animation: deck-push-out 140ms var(--deck-ease-in) both; }
.deck-stage[data-transition="push"][data-direction="back"] > .slide.is-active { animation-name: deck-push-in-back; }
.deck-stage[data-transition="push"][data-direction="back"] > .slide.is-leaving { animation-name: deck-push-out-back; }
.deck-stage[data-transition="lift"] > .slide.is-active { animation: deck-lift-in 240ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both; }
.deck-stage[data-transition="lift"] > .slide.is-leaving { animation: deck-lift-out 140ms var(--deck-ease-in) both; }
/* while a page is on its way out the stage clips, so a moving page never shows in the letterbox, and carries the paper behind both pages (the runtime swaps in the leaving page's own background), so the beat between the exit and the entrance never shows the viewport ground */
.deck-stage:has(> .slide.is-leaving) { overflow: hidden; background: var(--color-paper, #fff); }
@keyframes deck-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes deck-rise-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes deck-rise-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-4px); } }
@keyframes deck-settle-in { from { opacity: 0; transform: translateY(12px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes deck-settle-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-6px); } }
@keyframes deck-dissolve-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes deck-dissolve-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes deck-breath-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes deck-breath-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes deck-push-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
@keyframes deck-push-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-8px); } }
@keyframes deck-push-in-back { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
@keyframes deck-push-out-back { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(8px); } }
@keyframes deck-lift-in { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: none; } }
@keyframes deck-lift-out { from { opacity: 1; } to { opacity: 0; } }
html[data-static="true"] .deck-stage > .slide, html[data-static="true"] .deck-stage > .slide [data-step], html[data-static="true"] .deck-stage > .slide [data-step] * { transition: none; animation: none !important; }
body.deck-presenter .presenter-aside { position: fixed; top: 0; right: 0; bottom: 0; width: 34vw; box-sizing: border-box; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #1b1b1b; color: #eee; font: 16px system-ui, sans-serif; z-index: 2000; }
.presenter-label { font-size: 12px; letter-spacing: 0.12em; opacity: 0.7; }
.presenter-next-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #000; }
.presenter-next-stage > .slide { position: absolute; left: 0; top: 0; visibility: visible; transform-origin: 0 0; }
.presenter-notes { flex: 1; overflow: auto; white-space: pre-wrap; font-size: 20px; line-height: 1.6; }
/* the talk's cues (decks/<id>/talk.md, embedded at render): page cues stay lit, a cue pinned to a step waits dimmed until its press and is highlighted at that step */
.presenter-cues { max-height: 40%; overflow: auto; display: flex; flex-direction: column; gap: 4px; font-size: 20px; line-height: 1.5; }
.presenter-cue { padding: 6px 10px; border-left: 3px solid rgba(255, 255, 255, 0.25); border-radius: 0 6px 6px 0; }
.presenter-cue[data-tag="must"] { border-left-color: #fff; }
.presenter-cue[data-step] { opacity: 0.38; }
.presenter-cue[data-step].is-due { opacity: 0.8; }
.presenter-cue.is-current { opacity: 1; background: rgba(255, 255, 255, 0.14); }
.presenter-cue-tag { display: inline-block; min-width: 3.2em; margin-right: 8px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; }
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
 * the role's minimum (the one table in qa/font-floors.ts, serialised here so the
 * player and QA cannot drift apart). Embedded in decks and in preview documents;
 * QA and tests wait for `window.__fit.ready`.
 */
export const FIT_JS = `(() => {
  const MIN = ${JSON.stringify(MIN_FONT_BY_ROLE)};
  function floorFor(role) {
    let r = role || '';
    while (r) {
      if (r !== 'default' && MIN[r] !== undefined) return MIN[r];
      const cut = r.lastIndexOf('-');
      if (cut === -1) break;
      r = r.slice(0, cut);
    }
    return MIN.default;
  }
  function fitOne(el) {
    if (el.dataset.fitLock === 'true') return;
    const min = floorFor(el.dataset.role);
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
    entering = false;
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
  let current = -1, step = 0;
  // the deck's family; a page that carries its own data-transition (deck.json slides[].transition)
  // plays that one when it comes in, so the stage attribute is settled again at every page change
  let deckFamily = stage.dataset.transition || 'none';
  function applyFamily(index) {
    const own = slides[index] && slides[index].dataset.transition;
    const v = own ? FAMILY[own] || own : deckFamily;
    if (v === 'none') delete stage.dataset.transition; else stage.dataset.transition = v;
  }
  function setTransition(value) {
    deckFamily = FAMILY[value] || value || stage.dataset.transitionDefault || 'fade';
    if (current !== -1) applyFamily(current);
  }
  // the editor: one page's own family by slide id ('' = follow the deck)
  function setPageTransition(id, value) {
    const s = sectionById.get(id);
    if (!s) return;
    if (value) s.dataset.transition = FAMILY[value] || value; else delete s.dataset.transition;
    if (s === slides[current]) applyFamily(current);
  }

  // the page being left keeps .is-leaving (visible, underneath) while the new page animates in; for
  // that long the stage carries the leaving page's own background, so the beat where the old page has
  // faded and the new one has not yet arrived shows this deck's paper, never the viewport ground
  let leaving = null, leaveTimer = 0;
  function settleLeaving() {
    clearTimeout(leaveTimer);
    if (leaving) { leaving.classList.remove('is-leaving'); leaving = null; }
    stage.style.removeProperty('background');
  }
  // how long a page's animation runs in ms: its delay plus its duration (0 when it has none)
  function animationSpan(el) {
    const cs = getComputedStyle(el);
    return ((Number.parseFloat(cs.animationDelay) || 0) + (Number.parseFloat(cs.animationDuration) || 0)) * 1000;
  }
  function leave(from) {
    settleLeaving();
    if (!from || !stage.dataset.transition || staticNow()) return;
    from.classList.add('is-leaving');
    // each family runs its own exit and entrance, the entrance delayed so the two overlap: hold the old
    // page until the longer of the two has finished; both at 0 (prefers-reduced-motion) is a cut
    const ms = Math.max(animationSpan(slides[current]), animationSpan(from));
    if (ms === 0) { from.classList.remove('is-leaving'); return; }
    leaving = from;
    const backdrop = getComputedStyle(from).backgroundColor;
    if (backdrop && backdrop !== 'rgba(0, 0, 0, 0)' && backdrop !== 'transparent') stage.style.background = backdrop;
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

  // true right after a press advanced this page's step: the elements of that step play their
  // entrance. A page change, a hash jump or a step back never replays one
  let entering = false;
  // cascade animates the element's items: its direct children, or the children of its only child
  // (a list's entries, a metric's parts); fewer than two items and the element plays fade-up instead
  function cascadeItems(el) {
    const host = el.children.length === 1 ? el.children[0] : el;
    return host.children.length;
  }
  // count: a number runs from 0 to its real value while its element enters. The runtime writes the
  // text frame by frame and puts the exact original back at the end, or the moment anything else
  // happens (another press, a page change, edit mode), so the DOM at rest, static mode, QA and the
  // editor only ever see the real number. The hook is data-count (a metric's value) or, for an
  // element that is nothing but a number (a section number), its own text; the format (thousands
  // separators, decimals, leading zeros, prefix and suffix) is read off the text itself
  // the pattern is the slot renderer's (one source), read when a count starts: that script is embedded after this one
  const countable = () => (window.__slotRender && window.__slotRender.COUNTABLE) || null;
  const counting = new Map();
  function stopCounts() {
    for (const [node, c] of counting) { cancelAnimationFrame(c.raf); node.textContent = c.text; }
    counting.clear();
  }
  function countTargets(el) {
    const hooks = el.querySelectorAll('[data-count]');
    if (hooks.length) return Array.from(hooks);
    const re = countable();
    return re && el.children.length === 0 && re.test(el.textContent || '') ? [el] : [];
  }
  function group(digits) {
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
      out += digits[i];
    }
    return out;
  }
  function startCount(node, delay, duration) {
    const text = node.textContent || '';
    const re = countable();
    const m = re && re.exec(text.replace(/[*]/g, ''));
    if (!m) return;
    const target = Number.parseFloat(m[2].replace(/,/g, ''));
    if (!Number.isFinite(target)) return;
    const dot = m[2].indexOf('.');
    const decimals = dot === -1 ? 0 : m[2].length - dot - 1;
    const grouped = m[2].includes(',');
    const whole = (dot === -1 ? m[2] : m[2].slice(0, dot)).replace(/[-,]/g, '');
    const pad = whole.length > 1 && whole[0] === '0' ? whole.length : 0;
    const format = (v) => {
      const parts = Math.abs(v).toFixed(decimals).split('.');
      let int = parts[0];
      if (pad) int = int.padStart(pad, '0');
      if (grouped) int = group(int);
      return text.replace(m[2], (v < 0 ? '-' : '') + int + (parts[1] ? '.' + parts[1] : ''));
    };
    const c = { text, raf: 0 };
    counting.set(node, c);
    node.textContent = format(0);
    const start = performance.now() + delay;
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - p) * (1 - p) * (1 - p);
      node.textContent = p >= 1 ? text : format(target * eased);
      if (p >= 1) counting.delete(node); else c.raf = requestAnimationFrame(tick);
    };
    c.raf = requestAnimationFrame(tick);
  }
  function applySteps() {
    const s = slides[current];
    if (!s) return;
    stopCounts();
    s.dataset.stepCurrent = String(step);
    const reveal = staticNow() || motionOff;
    const stagger = reveal ? 0 : Number.parseFloat(getComputedStyle(stage).getPropertyValue('--motion-stagger')) || 0;
    const duration = Number.parseFloat(getComputedStyle(stage).getPropertyValue('--motion-duration')) || 350;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let revealed = 0;
    for (const el of s.querySelectorAll('[data-step]')) {
      const n = Number(el.dataset.step) || 0;
      const pending = !reveal && n > step;
      el.classList.toggle('is-pending', pending);
      // the elements this press reveals enter one after another (--enter-delay is their stagger); everything else is simply at rest
      const enters = entering && !reveal && !pending && n === step;
      el.classList.toggle('is-entering', enters);
      el.classList.toggle('is-cascading', enters && el.dataset.enter === 'cascade' && cascadeItems(el) >= 2);
      if (!enters) { el.style.removeProperty('--enter-delay'); continue; }
      const delay = revealed++ * stagger;
      el.style.setProperty('--enter-delay', delay + 'ms');
      if (el.dataset.enter === 'count' && !reduced) for (const node of countTargets(el)) startCount(node, delay, duration);
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
    entering = !slideChanged && st > step;
    current = next;
    step = st;
    if (slideChanged) {
      closeDetails();
      // push reverses when going back; the first page shown counts as forward
      stage.dataset.direction = fromIndex === -1 || next > fromIndex ? 'forward' : 'back';
      // the incoming page's own family, else the deck's
      applyFamily(current);
      slides.forEach((s, i) => s.classList.toggle('is-active', i === current));
      leave(from);
    }
    applySteps();
    const hash = hashFor();
    if (location.hash !== hash) history.replaceState(null, '', hash);
    document.dispatchEvent(new CustomEvent('deck:change', { detail: { index: current, id: ids[current], step, reason } }));
    if (reason !== 'remote') broadcast();
  }
  // static mode and the editor show every step at once, so there a press turns the page; the
  // landing step is the one a page turn lands on in playback (0 forward, the last step back)
  function next(reason) {
    if (!staticNow() && step < stepsOf(current)) show(current, step + 1, reason);
    else show(current + 1, 0, reason);
  }
  function prev(reason) {
    if (!staticNow() && step > 0) show(current, step - 1, reason);
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

  // fullscreen: F (or the editor's Fullscreen button) fills the screen with this window and the
  // stage refits on the resize that follows; F or Esc leaves. Safari's prefixed pair is the one
  // vendor form still worth carrying. on = true/false forces a direction, no argument toggles.
  const fullscreenNow = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  function fullscreen(on) {
    const want = on == null ? !fullscreenNow() : Boolean(on);
    if (want === fullscreenNow()) return Promise.resolve();
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (want && !request) { toast('Fullscreen is not available in this browser'); return Promise.resolve(); }
    const refused = () => { if (want) toast('The browser refused fullscreen'); };
    try {
      const p = want ? request.call(root) : exit ? exit.call(document) : null;
      return Promise.resolve(p).then(() => undefined, refused);
    } catch (_) { refused(); return Promise.resolve(); }
  }
  document.addEventListener('fullscreenchange', fit);
  document.addEventListener('webkitfullscreenchange', fit);

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
    aside.innerHTML = '<div class="presenter-label">Next</div><div class="presenter-next-stage"></div><div class="presenter-position"></div><div class="presenter-label presenter-cues-label">Cues</div><div class="presenter-cues"></div><div class="presenter-label">Notes</div><div class="presenter-notes"></div><div class="presenter-timer">00:00</div>';
    document.body.appendChild(aside);
    const nextStage = aside.querySelector('.presenter-next-stage');
    const notes = aside.querySelector('.presenter-notes');
    const cuesLabel = aside.querySelector('.presenter-cues-label');
    const cuesEl = aside.querySelector('.presenter-cues');
    // the talk's cues per slide, embedded beside the model when the deck was rendered with a talk.md
    let talk = null;
    try { const el = document.getElementById('deck-talk'); talk = el ? JSON.parse(el.textContent || 'null') : null; } catch (_) { talk = null; }
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
      notes.textContent = (slide && slide.notes) || '(No notes for this slide)';
      // page cues always on; a cue pinned to a step is due once that press has happened and current at that step
      const cues = (talk && talk[ids[current]]) || [];
      cuesLabel.hidden = cues.length === 0;
      cuesEl.hidden = cues.length === 0;
      cuesEl.textContent = '';
      for (const c of cues) {
        const row = document.createElement('div');
        row.className = 'presenter-cue';
        row.dataset.tag = c.tag;
        if (c.step) {
          row.dataset.step = String(c.step);
          row.classList.toggle('is-due', step >= c.step);
          row.classList.toggle('is-current', step === c.step);
        }
        const tag = document.createElement('span');
        tag.className = 'presenter-cue-tag';
        tag.textContent = c.tag + (c.step ? ' @' + c.step : '');
        row.appendChild(tag);
        row.appendChild(document.createTextNode(c.text));
        cuesEl.appendChild(row);
      }
      position.textContent = (current + 1) + ' / ' + slides.length + (stepsOf(current) ? ' · step ' + step + ' / ' + stepsOf(current) : '');
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
    // a number half-way through its count goes back to the real text the moment playback ends
    if (staticNow()) stopCounts();
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
      case 'f': case 'F': e.preventDefault(); fullscreen(); return;
      case 'm': case 'M':
        if (staticNow()) return;
        e.preventDefault();
        setMotion(motionOff, true);
        toast(motionOff ? 'Element motion: off (press M to restore)' : 'Element motion: on');
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
    // the deck's page transition family ('none' when switching instantly); '' in setTransition = the theme default
    get transition() { return deckFamily; },
    setTransition,
    // a page's own family by slide id ('' when it follows the deck); no id = the current page
    pageTransition: (id) => { const s = id == null ? slides[current] : sectionById.get(id); return (s && s.dataset.transition) || ''; },
    setPageTransition,
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
    // fill the screen with this window (true/false forces a direction, no argument toggles)
    fullscreen,
    get isFullscreen() { return fullscreenNow(); },
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
