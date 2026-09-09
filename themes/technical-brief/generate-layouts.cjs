// Generates this pack's layouts (themes/technical-brief/layouts/<id>/) from the compact spec below.
// Source: a hand-written 1280x720 technical brief (the author's own deck, no third-party template).
// Geometry is read off that deck rendered at 1920x1080 (its stage x1.5), so the eyebrow, its rule,
// the title and the lede land where they land there. Text sizes are the engine's floors (content
// 32px, chapter/pill/caption/cta 24px, chip/eyebrow/meta 20px, table 22px), which is why the ported
// pages carry less text per page than the hand-written original did.
// Edit the spec, then run: node themes/technical-brief/generate-layouts.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'layouts');

const t = (value) => ({ type: 'text', value });
const list = (items) => ({ type: 'list', items });
const metric = (value, label, delta) => (delta === undefined ? { type: 'metric', value, label } : { type: 'metric', value, label, delta });

// ── the page grid ──────────────────────────────────────────────────────────
const M = 108;              // inner-page left margin (the source deck's 72px x1.5)
const W = 1704;             // inner-page content width
const CM = 144;             // cover left margin (the source deck's 96px x1.5)
const CW = 1632;            // cover content width
const BODY_TOP = 348;       // where the body starts under the lede
const BODY_BOTTOM = 990;    // where the body must stop, above the footer rail

// The head: a monospace teal eyebrow with a hairline running off to the right margin, the title
// straight under it, the lede tight against the title — the source deck's own rhythm.
const kicker = () => ({ el: 'kicker', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: 'the section name alone in monospace capitals, up to 6 characters; filled automatically from the story chapter, empty when there is none', css: { left: M, top: 84, width: 168, height: 30, fontSize: 20, lineHeight: '30px' } });
const headrule = () => ({ el: 'headrule', role: 'divider', css: { left: 292, top: 98, width: 1520, height: 2 } });
const title = (fontSize = 50, height = 68) => ({ el: 'title', tag: 'h1', role: 'heading', slot: ['text'], required: true, hint: 'the claim of the slide in one sentence, one line of up to 30 characters; *keyword* turns teal', css: { left: M, top: 128, width: W, height, fontSize, lineHeight: 1.28, extra: 'text-wrap: balance;' } });
const lede = (hint = 'a lede that says why this slide matters, up to 2 lines and 40 characters per line') => ({ el: 'subtitle', tag: 'p', role: 'body', slot: ['text'], required: false, hint, fit: true, css: { left: M, top: 212, width: 1400, height: 104, fontSize: 32, lineHeight: 1.6 } });
const head = (withLede = true) => (withLede ? [kicker(), headrule(), title(), lede()] : [kicker(), headrule(), title()]);
// the generic `statement` calls its lede `body`; a core layout's slot names must match it
const bodyLede = () => ({ ...lede(), el: 'body' });

// The footer rail: a hairline over monospace small print, the page's source left, its number right.
const footrule = () => ({ el: 'footrule', role: 'divider', css: { left: M, top: 1006, width: W, height: 2 } });
const meta = (left = M, width = 1200) => ({ el: 'meta', tag: 'p', role: 'meta', slot: ['text'], required: false, hint: 'footer small print: where this page\'s facts come from, up to 10 characters; the scaffold fills it from the occasion, so overwrite it per page', css: { left, top: 1020, width, height: 32, fontSize: 20, lineHeight: '32px' } });
const page = () => ({ el: 'page', tag: 'p', role: 'meta', slot: ['text'], required: false, hint: 'page number, filled automatically ("01 / 16")', css: { left: 1512, top: 1020, width: 300, height: 32, fontSize: 20, lineHeight: '32px', textAlign: 'right' } });
const rail = () => [footrule(), meta(), page()];
const progress = () => ({ el: 'progress', role: 'progress', css: { left: 0, top: 0, width: 1920, height: 3 } });

// A caveat callout: amber left bar on an amber tint. The pack's only use of amber.
const TWO_LINE_CAVEAT = 'a caveat or a limit, up to 2 lines; amber is reserved for this';
const caveat = (top, height = 120, hint = 'a caveat or a limit, one line; amber is reserved for this') => ({ el: 'caveat', tag: 'p', role: 'alert', slot: ['text'], required: false, hint, fit: true, css: { left: M, top, width: W, height, fontSize: 32, lineHeight: 1.6, extra: 'padding: 22px 28px;' } });
const caption = (top, height = 56, hint = 'a one-line note') => ({ el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint, fit: true, css: { left: M, top, width: W, height, fontSize: 26, lineHeight: 1.6 } });
const arrow = (el, css) => ({ el, role: 'connector', css, svg: '<line x1="2" y1="12" x2="30" y2="12"></line><polygon points="28,4 40,12 28,20"></polygon>', shape: 'arrow', viewBox: '0 0 41 24' });

// Samples tell the story of the tidewatch website health-check tool (the examples/ fixture): two
// check paths, one report directory, scoring as a separate second pass.
const HEAD_SAMPLE = { kicker: t('DESIGN'), meta: t('docs/system-map.md'), page: t('11 / 16') };

// ── cards: n panels in a row, each one metric (label / title / one explanation) ──
function cardsLayout(id, n, name, desc, opts = {}) {
  const gap = n === 4 ? 20 : 24;
  const w = Math.floor((W - gap * (n - 1)) / n);
  const top = BODY_TOP;
  const h = opts.height ?? 380;
  const pad = n === 4 ? '26px 28px' : '30px 32px';
  const els = [...head()];
  for (let i = 0; i < n; i++) {
    els.push({
      el: `card-${i + 1}`, tag: 'div', role: 'card', slot: ['text', 'metric'], required: i < Math.min(2, n),
      hint: i === 0
        ? 'card: a metric whose value is the short monospace label (up to 6 characters), label the card title (up to 12 characters) and delta the explanation; or a short paragraph; may carry details (the full text that expands when the card is clicked during playback)'
        : 'same as above',
      css: { left: M + i * (w + gap), top, width: w, height: h, fontSize: 32, lineHeight: 1.6, extra: `padding: ${pad};` },
    });
  }
  if (opts.caveat) els.push(caveat(top + h + 24, 146, TWO_LINE_CAVEAT));
  els.push(...rail());
  const sample = n === 4
    ? { ...HEAD_SAMPLE, title: t('One batch is a matrix of four axes'), subtitle: t('Every cell is one browser, one concurrency step and one page depth.') }
    : { ...HEAD_SAMPLE, title: t('Three deliberate design principles'), subtitle: t('If only three sentences survive the meeting, make it paths, contract and scoring.') };
  const cards = n === 4
    ? [metric('5', 'Browsers', 'declared in the config, expanded by the tool'), metric('3', 'Concurrency steps', 'c1 · c2 · c5: how many visitors at once'), metric('15', 'Cells per batch', '5 browsers × 3 concurrency steps'), metric('6', 'Depths per cell', '0 · 1 · 2 · 4 · 8 · 16 links deep')]
    : [
        { ...metric('PATHS', 'Never merged', 'The browser path includes loading and rendering and is the primary source; the crawler path only cross-checks.'), details: list(['Browser path: the primary external data source', 'Crawler path: an independent cross-check', 'Loading time is never compared across the two']) },
        metric('CONTRACT', 'One report directory', 'Both runners share create_run, RunState and cooldown; per-page state is written atomically, so any run resumes.'),
        metric('SCORING', 'A second pass', 'Rescoring is free and rechecking takes a night; an incomplete page stays an empty cell with its reason.'),
        metric('PATHS', 'The fourth card', 'With four columns every card carries less text.'),
      ];
  for (let i = 0; i < n; i++) sample[`card-${i + 1}`] = cards[i];
  if (opts.caveat) sample.caveat = t('⚠️ Two of the three axes are already columns or rules; the concurrency step is so far only a note on the report\'s scope.');
  const valueSize = n === 4 ? 56 : 28;
  const labelSize = n === 4 ? 30 : 34;
  return {
    id, name, description: desc,
    content_relations: n === 2 ? ['comparison', 'list', 'hierarchy'] : ['list', 'hierarchy', 'evidence'],
    scene_roles: ['map', 'evidence', 'relationship'],
    density: { max_chars: 110 * n + 90, max_elements: els.length + 1 },
    elements: els,
    extraCss: `[data-layout="${id}"] [data-role="card"] .metric { justify-content: flex-start; }
[data-layout="${id}"] [data-role="card"] .metric-value { font-size: ${valueSize}px; line-height: 1.1; }
[data-layout="${id}"] [data-role="card"] .metric-label { font-size: ${labelSize}px; line-height: 1.35; margin-top: 14px; }
[data-layout="${id}"] [data-role="card"] .metric-delta { font-size: 28px; line-height: 1.6; margin-top: 14px; }
[data-layout="${id}"] [data-role="card"] li { padding-left: 22px; margin-bottom: 12px; }`,
    sample,
  };
}

// ── cards-list: the pack's signature card — pip label, bold claim, dash points ──
function cardsListLayout() {
  const gap = 24;
  const w = Math.floor((W - gap * 2) / 3);
  const top = BODY_TOP;
  const top0 = BODY_TOP;   // the lede box ends at 316, so the cards start just under it
  const h = 584;   // 192 head + 360 for 3 points x 2 lines (each carries a 16px bottom margin) + 32 padding
  const els = [...head()];
  for (let i = 0; i < 3; i++) {
    const x = M + i * (w + gap);
    els.push({ el: `card-${i + 1}`, role: 'card', css: { left: x, top: top0, width: w, height: h } });
    els.push({ el: `card-${i + 1}-label`, tag: 'p', role: 'eyebrow-accent', tone: ['', 'second', 'third'][i], slot: ['text'], required: false, hint: i === 0 ? 'the card\'s pip label in monospace capitals, up to 4 characters' : 'same as above', css: { left: x + 32, top: top0 + 30, width: w - 64, height: 30, fontSize: 22, lineHeight: '30px', extra: 'padding-left: 24px;' } });
    els.push({ el: `card-${i + 1}-title`, tag: 'p', role: 'label', slot: ['text'], required: true, hint: i === 0 ? 'the card\'s claim, up to 2 lines and 14 characters per line' : 'same as above', css: { left: x + 32, top: top0 + 80, width: w - 64, height: 96, fontSize: 34, lineHeight: 1.35 } });
    els.push({ el: `card-${i + 1}-items`, tag: 'div', role: 'list', slot: ['list', 'text'], required: true, hint: i === 0 ? '2 to 3 supporting points, up to 2 lines each' : 'same as above', css: { left: x + 32, top: top0 + 192, width: w - 64, height: 360, fontSize: 32, lineHeight: 1.6 } });
  }
  els.push(...rail());
  return {
    id: 'cards-list', name: 'Three cards with lists: Technical Brief',
    description: 'The pack\'s signature card: a coloured pip over a faint monospace label, the card\'s claim in one bold line, then two or three dash points. Cards holding one paragraph each (`cards`) would lose the parallel reading down the three columns.',
    content_relations: ['list', 'hierarchy', 'comparison'], scene_roles: ['evidence', 'relationship', 'map'],
    density: { max_chars: 620, max_elements: els.length + 1 },
    elements: els,
    extraCss: `[data-layout="cards-list"] [data-role="list"] li { padding-left: 24px; margin-bottom: 16px; }`,
    sample: {
      ...HEAD_SAMPLE, title: t('Three deliberate design principles'), subtitle: t('If only three sentences survive the meeting, make it these three.'),
      'card-1-label': t('PATHS'), 'card-1-title': t('The two paths are never merged'),
      'card-1-items': list(['Browser path: loading and rendering included', 'Crawler path: no browser, cross-check only', 'Response times match, so only those are joined']),
      'card-2-label': t('CONTRACT'), 'card-2-title': t('The report directory is a shared contract'),
      'card-2-items': list(['The runner and the scorer are siblings, not forks', 'One create_run, one RunState, one cooldown', 'Per-page state is written atomically; any run resumes']),
      'card-3-label': t('SCORING'), 'card-3-title': t('Scoring is a separate second pass'),
      'card-3-items': list(['Aggregate and export read the raw page output', 'Rescoring is free; rechecking takes a night', 'An incomplete page stays an empty cell, with its reason']),
    },
  };
}

const layouts = [
  // ── cover ────────────────────────────────────────────────────────────────
  (() => {
    const cols = 5;
    const colW = 300;
    const step = Math.floor((CW - colW) / (cols - 1));
    const els = [
      { el: 'dot', role: 'badge', css: { left: CM, top: 286, width: 14, height: 14 } },
      { el: 'kicker', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: 'the project in monospace capitals, up to 14 characters; filled automatically from the occasion', css: { left: CM + 28, top: 278, width: 900, height: 32, fontSize: 24, lineHeight: '32px' } },
      { el: 'title', tag: 'h1', role: 'heading', slot: ['text'], required: true, hint: 'deck title, one line of up to 16 characters, two at most', css: { left: CM, top: 336, width: CW, height: 116, fontSize: 84, lineHeight: 1.14, extra: 'text-wrap: balance;' } },
      { el: 'subtitle', tag: 'p', role: 'subtitle', slot: ['text'], required: true, hint: 'what the deck is, one line of up to 26 characters', fit: true, css: { left: CM, top: 462, width: 1500, height: 60, fontSize: 34, lineHeight: 1.5 } },
      { el: 'rule', role: 'divider', css: { left: CM, top: 566, width: CW, height: 2 } },
    ];
    for (let i = 0; i < cols; i++) {
      const x = CM + i * step + (i ? 26 : 0);
      if (i) els.push({ el: `sep-${i}`, role: 'divider', css: { left: CM + i * step, top: 592, width: 2, height: 70 } });
      els.push({ el: `grid-label-${i + 1}`, tag: 'p', role: 'meta', slot: ['text'], required: i < 3, hint: i === 0 ? 'meta column heading, up to 5 characters (the platform, the engine, the contract)' : 'same as above', css: { left: x, top: 596, width: colW, height: 28, fontSize: 20, lineHeight: '28px' } });
      els.push({ el: `grid-value-${i + 1}`, tag: 'p', role: 'meta', slot: ['text'], required: i < 3, hint: i === 0 ? 'the value in monospace, up to 11 characters' : 'same as above', fit: true, css: { left: x, top: 628, width: colW, height: 34, fontSize: 22, lineHeight: '34px' } });
    }
    els.push({ el: 'caveat', tag: 'p', role: 'alert', slot: ['text'], required: false, hint: 'the framing caveat: what this deck does not cover, up to 2 lines; amber is reserved for this', fit: true, css: { left: CM, top: 700, width: CW, height: 168, fontSize: 32, lineHeight: 1.6, extra: 'padding: 24px 30px;' } });
    els.push(meta(CM, 1200), page());
    return {
      id: 'cover', name: 'Cover: Technical Brief',
      description: 'A filled teal dot and a monospace eyebrow, the title big and tight with its subtitle under it, then a hairline over a five-column meta grid divided by vertical rules, and an amber callout for what the deck does not cover. A plain title card would lose the meta grid, which is where a technical deck states the machine it is talking about.',
      content_relations: ['statement'], scene_roles: ['hero'], density: { max_chars: 420, max_elements: els.length + 1 },
      elements: els,
      extraCss: `[data-layout="cover"] [data-el="footrule"] { display: none; }`,
      sample: {
        kicker: t('TIDEWATCH · HEALTH CHECK'), meta: t('Architecture only'), page: t('2026-09'),
        title: t('Tidewatch health-check tool'),
        subtitle: t('How the tool is put together'),
        'grid-label-1': t('Platform'), 'grid-value-1': t('Windows, macOS, Linux'),
        'grid-label-2': t('Engine'), 'grid-value-2': t('Chromium 128 headless'),
        'grid-label-3': t('Contract'), 'grid-value-3': t('Result Schema v1.0.0'),
        'grid-label-4': t('Bundle'), 'grid-value-4': t('tidewatch-0.1.0.zip'),
        'grid-label-5': t('Check'), 'grid-value-5': t('six fixed steps'),
        caveat: t('This deck covers the tool and its architecture only: no figures from past checks, no progress, milestones or dates. The engine and the browser build are still moving, so every run records the machine state itself.'),
      },
    };
  })(),
  // ── section ──────────────────────────────────────────────────────────────
  {
    id: 'section', name: 'Section: Technical Brief', description: 'A chapter break: a huge dim teal numeral, a short teal bar, the chapter title and one line of what it has to establish. A plain title slide would lose the beat that tells the audience a new chapter has started.',
    content_relations: ['statement', 'list'], scene_roles: ['map', 'pause'], density: { max_chars: 140, max_elements: 8 },
    elements: [
      { el: 'meta-chip', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: 'tag top right, up to 10 characters', css: { left: 1560, top: 80, width: 252, height: 44, fontSize: 20, lineHeight: '42px', textAlign: 'center' } },
      { el: 'number', tag: 'p', role: 'number', slot: ['text'], required: true, hint: 'chapter number, two digits', css: { left: M, top: 300, width: 700, height: 240, fontSize: 200, lineHeight: 1 } },
      { el: 'rule', role: 'backdrop', css: { left: M, top: 572, width: 120, height: 6 } },
      { el: 'title', tag: 'h1', role: 'heading', slot: ['text'], required: true, hint: 'chapter title, 1 to 2 lines, up to 14 characters', css: { left: M, top: 614, width: 1500, height: 190, fontSize: 76, lineHeight: 1.16, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'what this chapter has to make the audience believe, up to 40 characters', fit: true, css: { left: M, top: 820, width: 1300, height: 110, fontSize: 32, lineHeight: 1.6 } },
      ...rail(),
    ],
    sample: { 'meta-chip': t('DESIGN'), number: t('03'), title: t('Architecture'), body: t('What each check path measures, and why scoring is a separate second pass.'), meta: t('docs/system-map.md'), page: t('06 / 16') },
  },
  // ── statement ────────────────────────────────────────────────────────────
  {
    id: 'statement', name: 'Statement: Technical Brief', description: 'One claim, then a single panel holding the supporting points as a dash list, with room for a caveat below. Three cards would break one argument into three unrelated ones.',
    content_relations: ['statement', 'evidence', 'sequence', 'list'], scene_roles: ['evidence', 'relationship', 'pause'], density: { max_chars: 420, max_elements: 11 },
    elements: [
      ...head(false), bodyLede(),
      { el: 'slab', role: 'card', css: { left: M, top: BODY_TOP, width: W, height: 470 } },
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: false, hint: '3 supporting points, up to 2 lines each', css: { left: M + 40, top: BODY_TOP + 40, width: W - 80, height: 390, fontSize: 32, lineHeight: 1.6 } },
      caveat(BODY_TOP + 494, 116),
      ...rail(),
    ],
    extraCss: `[data-layout="statement"] [data-el="evidence"] li { padding-left: 24px; margin-bottom: 22px; }`,
    sample: { ...HEAD_SAMPLE, title: t('View three: scoring is a separate second pass'), body: t('Rescoring is free and rechecking takes a whole night; that asymmetry decides where the architecture is cut.'), evidence: list(['Scoring reads the raw page output and writes back into the same report directory; aggregate and export never rerun a check', 'The verdict policy can change without touching the numbers: rescoring a run takes seconds', 'Baselines across runs are joined by a comparability key; the viewer only ever looks at one run']), caveat: t('⚠️ An incomplete page stays an empty cell with its reason; it is never filled from a neighbour.') },
  },
  // ── cards ────────────────────────────────────────────────────────────────
  cardsListLayout(),
  cardsLayout('cards', 3, 'Three cards: Technical Brief', 'Three panels, each a monospace teal label over a title and one explanation. Use `cards-list` when each card carries several points instead.'),
  cardsLayout('cards-2', 2, 'Two cards: Technical Brief', 'Two wide panels for two concepts side by side. Do not force a third in; use cards for that.'),
  cardsLayout('cards-4', 4, 'Four axis tiles: Technical Brief', 'Four narrow tiles, each a monospace key over a large teal number and its value — the axes of a matrix, or four counts that belong together. Four cards of prose would bury the numbers.', { height: 296, caveat: true }),
  // ── comparison ───────────────────────────────────────────────────────────
  {
    id: 'comparison', name: 'Two columns: Technical Brief', description: 'Two panels of equal weight, each a title over a dash list, with room for a caveat below. Deliberately symmetrical: built for two boundaries of equal standing, where making one side heavier would be a claim about which one is right.',
    content_relations: ['comparison'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 420, max_elements: 13 },
    elements: [
      ...head(),
      { el: 'left', role: 'card', css: { left: M, top: BODY_TOP, width: 828, height: 420 } },
      { el: 'left-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'left column title, up to 14 characters', css: { left: M + 36, top: BODY_TOP + 32, width: 756, height: 48, fontSize: 34, lineHeight: '48px' } },
      { el: 'left-items', tag: 'div', role: 'list', slot: ['list', 'text'], required: true, hint: 'left column, 2 to 3 items, one line each', css: { left: M + 36, top: BODY_TOP + 96, width: 756, height: 312, fontSize: 32, lineHeight: 1.6 } },
      { el: 'right', role: 'card', css: { left: 984, top: BODY_TOP, width: 828, height: 420 } },
      { el: 'right-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'right column title, up to 14 characters', css: { left: 1020, top: BODY_TOP + 32, width: 756, height: 48, fontSize: 34, lineHeight: '48px' } },
      { el: 'right-items', tag: 'div', role: 'list', slot: ['list', 'text'], required: true, hint: 'right column, 2 to 3 items, one line each', css: { left: 1020, top: BODY_TOP + 96, width: 756, height: 312, fontSize: 32, lineHeight: 1.6 } },
      caveat(BODY_TOP + 444, 166, TWO_LINE_CAVEAT),
      ...rail(),
    ],
    extraCss: `[data-layout="comparison"] [data-el="left-items"] li, [data-layout="comparison"] [data-el="right-items"] li { padding-left: 24px; margin-bottom: 18px; }`,
    sample: {
      ...HEAD_SAMPLE, title: t('Why the browser path reports two phases'), subtitle: t('Averaging two usage patterns into one number gets both of them wrong.'),
      'left-title': t('First visit'), 'left-items': list(['The whole page is fetched for the first time', 'A new session with a cold cache', 'A one-off cost']),
      'right-title': t('Return visit'), 'right-items': list(['The same page with the cache already warm', 'Where a visitor spends most of a session', 'The report lists it as its own table']),
      caveat: t('⚠️ Depth 0 has no earlier page to load, so it only has the return phase; the crawler path has one phase by construction.'),
    },
  },
  // ── process ──────────────────────────────────────────────────────────────
  {
    id: 'process', name: 'Process: Technical Brief', description: 'One horizontal run of monospace pills joined by arrows, with a caveat below. A numbered list would lose the effect of taking the whole sequence in at a glance.',
    content_relations: ['sequence'], scene_roles: ['relationship', 'map'], density: { max_chars: 300, max_elements: 21 },
    elements: (() => {
      const els = [...head()];
      const pillW = 244, gap = 48, step = pillW + gap;
      for (let i = 0; i < 6; i++) {
        els.push({ el: `step-${i + 1}`, tag: 'div', role: 'pill', slot: ['text', 'metric'], required: i < 4, hint: i === 0 ? 'step name, up to 7 characters per line, up to 2 lines' : 'same as above; leave empty when not needed', css: { left: M + i * step, top: 460, width: pillW, height: 104, fontSize: 26, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 14px 18px; display: flex; align-items: center; justify-content: center;' } });
        if (i < 5) els.push(arrow(`arrow-${i + 1}`, { left: M + pillW + i * step + 12, top: 500, width: 41, height: 24 }));
      }
      els.push(caveat(640, 166, TWO_LINE_CAVEAT));
      els.push(...rail());
      return els;
    })(),
    sample: { ...HEAD_SAMPLE, title: t('A full health check is six CLI steps'), subtitle: t('Resuming is a seventh subcommand, resume, which picks up where the last page stopped.'), 'step-1': t('preflight'), 'step-2': t('download'), 'step-3': t('plan'), 'step-4': t('run'), 'step-5': t('aggregate'), 'step-6': t('export'), caveat: t('⚠️ run does not produce the result file that gets handed over; step 6, export, does, which is why there is run --and-export.') },
  },
  // ── flow-3 ───────────────────────────────────────────────────────────────
  {
    id: 'flow-3', name: 'Three-party flow: Technical Brief', description: 'Three tall panels joined by two arrows, each a monospace role label over what that party does — a handover, not a list of three teams. Cards without arrows would lose the direction the contract flows in.',
    content_relations: ['sequence', 'comparison'], scene_roles: ['relationship', 'map'], density: { max_chars: 400, max_elements: 14 },
    elements: (() => {
      const nodeW = 530, gap = 56, step = nodeW + gap;
      const els = [...head()];
      for (let i = 0; i < 3; i++) {
        els.push({ el: `node-${i + 1}`, tag: 'div', role: 'node', slot: ['text', 'metric'], required: true, hint: i === 0 ? 'a party: a metric whose value is the role in monospace (up to 8 characters), label what they do (up to 12 characters) and delta the detail' : 'same as above', css: { left: M + i * step, top: BODY_TOP, width: nodeW, height: 360, fontSize: 32, lineHeight: 1.6, extra: 'padding: 28px 30px;' } });
        if (i < 2) els.push(arrow(`arrow-${i + 1}`, { left: M + nodeW + i * step + 8, top: BODY_TOP + 168, width: 41, height: 24 }));
      }
      els.push(caveat(BODY_TOP + 384, 166, TWO_LINE_CAVEAT));
      els.push(...rail());
      return els;
    })(),
    extraCss: `[data-layout="flow-3"] [data-role="node"] .metric { justify-content: flex-start; }
[data-layout="flow-3"] [data-role="node"] .metric-value { font-size: 28px; line-height: 1.1; }
[data-layout="flow-3"] [data-role="node"] .metric-label { font-size: 32px; line-height: 1.35; margin-top: 12px; }
[data-layout="flow-3"] [data-role="node"] .metric-delta { font-size: 28px; line-height: 1.6; margin-top: 14px; }`,
    sample: {
      ...HEAD_SAMPLE, title: t('Three kinds of user, so the format must be a contract'), subtitle: t('Three roles are held together by one contract and nothing else.'),
      'node-1': metric('THIS TEAM', 'Sets the rules, builds the tool', 'Decides what is checked and how, and which run conditions get recorded'),
      'node-2': metric('OPERATOR', 'Runs it from a config', 'Executes on the target machine without needing the domain details'),
      'node-3': metric('VIEWER', 'Reads the format only', 'Joins tables by string equality on the key, never by judging the check'),
      caveat: t('⚠️ The viewer must never guess: a key that differs by one character is a different measurement, not a typo.'),
    },
  },
  // ── photo ────────────────────────────────────────────────────────────────
  {
    id: 'photo', name: 'Diagram: Technical Brief', description: 'A full-width hairline frame holding a system diagram, with a legend line below. A diagram shrunk beside text would lose the detail that makes it worth showing at all.',
    content_relations: ['evidence', 'statement'], scene_roles: ['map', 'evidence', 'hero'], density: { max_chars: 200, max_elements: 9 },
    elements: [
      ...head(false),
      { el: 'photo', tag: 'div', role: 'photo', slot: ['image'], required: true, imageFit: 'contain', hint: 'the diagram, 1420 by 690 px or the same 2.06:1 ratio, shown whole (fit: contain); may carry hotspots (click-to-jump areas during playback, positioned in percent)', css: { left: 250, top: 250, width: 1420, height: 690 } },
      { ...caption(950, 44, 'what the diagram says in one line, or how to read it'), css: { left: 250, top: 950, width: 1420, height: 44, fontSize: 26, lineHeight: 1.6 } },
      ...rail(),
    ],
    sample: { ...HEAD_SAMPLE, title: t('The system at a glance'), photo: { type: 'image', src: 'data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%275%27%3E%3Crect width=%2716%27 height=%275%27 fill=%27%231b2726%27/%3E%3C/svg%3E', alt: 'System map', hotspots: [{ target: 'cards-list', x: 56, y: 30, w: 16, h: 40, label: 'Report directory: see the three principles' }] }, caption: t('teal interface · emerald core · violet storage · slate external tools · amber dashes mark a check boundary') },
  },
  // ── diagram-notes ────────────────────────────────────────────────────────
  {
    id: 'diagram-notes', name: 'Guided view: Technical Brief', description: 'The same system diagram on the left with one path lit, and a note column on the right: a teal bar down the lede, then what this view is for in teal dash points. Three separate slides of prose would lose that all three views are the same diagram read three ways.',
    content_relations: ['evidence', 'list', 'statement'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 420, max_elements: 11 },
    elements: [
      ...head(false),
      { el: 'photo', tag: 'div', role: 'photo', slot: ['image'], required: true, imageFit: 'contain', hint: 'the diagram with this view lit and the rest dimmed, 1000 by 486 px or the same ratio, shown whole (fit: contain)', css: { left: M, top: 300, width: 1000, height: 486 } },
      { el: 'ledebar', role: 'backdrop', css: { left: 1148, top: 290, width: 4, height: 165 } },
      { el: 'subtitle', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'what this view is for, up to 3 lines and 20 characters per line', fit: true, css: { left: 1172, top: 290, width: 640, height: 165, fontSize: 32, lineHeight: 1.6 } },
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: true, hint: '2 to 3 points about this view, up to 2 lines each', css: { left: 1148, top: 486, width: 664, height: 404, fontSize: 32, lineHeight: 1.6 } },
      caption(812, 44, 'a one-line note: what this view deliberately does not answer'),
      ...rail(),
    ],
    extraCss: `[data-layout="diagram-notes"] [data-el="evidence"] li { padding-left: 24px; margin-bottom: 20px; }
[data-layout="diagram-notes"] [data-el="caption"] { width: 1000px; }`,
    sample: {
      ...HEAD_SAMPLE, title: t('View one: the browser path, the primary source'),
      subtitle: t('It measures the route a real visitor takes, and it is the one quoted outside.'),
      photo: { type: 'image', src: 'data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%275%27 height=%273%27%3E%3Crect width=%275%27 height=%273%27 fill=%27%231b2726%27/%3E%3C/svg%3E', alt: 'System map with the browser path lit' },
      evidence: list([
        'A real browser: parsing, layout and scripts all count',
        'The browser restarts for every page, so no cache leaks into the next cell',
        'engine.py is the seam for other browsers; a swap touches only this layer',
      ]),
      caption: t('Telemetry is sampled in the background, not measured, so it is dimmed here.'),
    },
  },
  // ── chips-2 ──────────────────────────────────────────────────────────────
  {
    id: 'chips-2', name: 'Two chip sets: Technical Brief', description: 'Two panels, each a heading and one line of what decides membership, then the members themselves as monospace chips. A prose list of fifteen field names would be unreadable; chips make the count visible.',
    content_relations: ['list', 'comparison', 'hierarchy'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 400, max_elements: 13 },
    elements: [
      ...head(),
      { el: 'left', role: 'card', css: { left: M, top: BODY_TOP, width: 828, height: 420 } },
      { el: 'left-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'left set title, up to 16 characters', css: { left: M + 36, top: BODY_TOP + 30, width: 756, height: 48, fontSize: 34, lineHeight: '48px' } },
      { el: 'left-note', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'one line on what decides membership, up to 2 lines', fit: true, css: { left: M + 36, top: BODY_TOP + 88, width: 756, height: 108, fontSize: 32, lineHeight: 1.6 } },
      { el: 'left-items', tag: 'div', role: 'flow', slot: ['list'], required: true, hint: 'the members as chips, 4 to 9 items, up to 8 characters each', css: { left: M + 36, top: BODY_TOP + 208, width: 756, height: 200, fontSize: 24, lineHeight: 1.5 } },
      { el: 'right', role: 'card', css: { left: 984, top: BODY_TOP, width: 828, height: 420 } },
      { el: 'right-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'right set title, up to 16 characters', css: { left: 1020, top: BODY_TOP + 30, width: 756, height: 48, fontSize: 34, lineHeight: '48px' } },
      { el: 'right-note', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'one line on what decides membership, up to 2 lines', fit: true, css: { left: 1020, top: BODY_TOP + 88, width: 756, height: 108, fontSize: 32, lineHeight: 1.6 } },
      { el: 'right-items', tag: 'div', role: 'flow-accent', slot: ['list'], required: true, hint: 'the members as accent chips, 4 to 9 items, up to 8 characters each', css: { left: 1020, top: BODY_TOP + 208, width: 756, height: 200, fontSize: 24, lineHeight: 1.5 } },
      caveat(BODY_TOP + 444, 166, TWO_LINE_CAVEAT),
      ...rail(),
    ],
    extraCss: `[data-layout="chips-2"] [data-el="left-items"] li, [data-layout="chips-2"] [data-el="right-items"] li { display: inline-block; padding: 8px 16px; margin: 0 12px 12px 0; }`,
    sample: {
      ...HEAD_SAMPLE, title: t('The comparability key: "can these be joined" as one string'), subtitle: t('The key is fifteen parts joined together; if any one differs, a different thing was measured.'),
      'left-title': t('Nine for machine, engine and tool'), 'left-note': t('The 8 GB and 16 GB machines must stay apart, so machine_id is in the key.'),
      'left-items': list(['platform_id', 'machine_id', 'vendor', 'browser', 'engine', 'engine_version', 'check_path', 'driver', 'firmware']),
      'right-title': t('Six for the check setup'), 'right-note': t('The test is "would this flag change the numbers".'),
      'right-items': list(['spec_type', 'depth', 'javascript', 'viewport', 'throttle', 'cache']),
      caveat: t('⚠️ The key is not finished: "phase × concurrency" is still outside the contract, and a viewer built on the current docs will trip over it.'),
    },
  },
  // ── data-table ───────────────────────────────────────────────────────────
  {
    id: 'data-table', name: 'Table: Technical Brief', description: 'A table with a small uppercase header over hairline rows and tabular numbers, with a note below. A list of cards would lose the alignment that lets a reader compare down a column.',
    content_relations: ['comparison', 'evidence', 'list'], scene_roles: ['evidence'], density: { max_chars: 520, max_elements: 9 },
    elements: [
      ...head(),
      { el: 'table', tag: 'div', role: 'table', slot: ['table'], required: true, hint: 'table: one header row, 3 to 6 rows of data, one line per cell', css: { left: M, top: BODY_TOP, width: W, height: 470, fontSize: 28, lineHeight: 1.5 } },
      caption(BODY_TOP + 490, 56),
      ...rail(),
    ],
    extraCss: `[data-layout="data-table"] [data-el="table"] .table th, [data-layout="data-table"] [data-el="table"] .table td { padding: 18px 28px 18px 0; }
[data-layout="data-table"] [data-el="table"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: {
      ...HEAD_SAMPLE, title: t('Two output phases, two usage patterns'), subtitle: t('Two tables cost nothing; one averaged number is what costs.'),
      table: { type: 'table', header: ['Phase', 'What it measures', 'The visitor it stands for'], rows: [['First visit', 'The whole page fetched cold', 'A new session, a new document'], ['Return visit', 'The same page with a warm cache', 'Repeat visits within a session'], ['Crawler', 'One phase by construction', 'Not quoted outside; cross-check only']] },
      caption: t('Depth 0 has no earlier page to load, so it only has the return phase.'),
    },
  },
  // ── quote ────────────────────────────────────────────────────────────────
  {
    id: 'quote', name: 'Principle: Technical Brief', description: 'One principle on a teal tint, large and quiet, with its source below. An ordinary content slide would lose the pause that makes a principle land.',
    content_relations: ['statement'], scene_roles: ['pause', 'close', 'hero'], density: { max_chars: 140, max_elements: 8 },
    elements: [
      ...head(false),
      { el: 'box', role: 'tint', css: { left: M, top: 340, width: W, height: 340 } },
      { el: 'quote', tag: 'p', role: 'quote', slot: ['text'], required: true, hint: 'the principle itself, up to 3 lines and 24 characters per line; *keyword* turns teal', fit: true, css: { left: M + 56, top: 396, width: W - 112, height: 228, fontSize: 48, lineHeight: 1.5 } },
      caption(716, 56, 'where the principle comes from'),
      ...rail(),
    ],
    sample: { kicker: t('DESIGN'), meta: t('specs/'), page: t('11 / 16'), title: t('An empty cell is more honest than a filled one'), quote: t('A crashed or incomplete page stays an empty cell with its reason, and is *never* filled from a neighbour.'), caption: t('The scoring rule of the health check, written down in specs/') },
  },
  // ── closing ──────────────────────────────────────────────────────────────
  {
    id: 'closing', name: 'Closing: Technical Brief', description: 'A short teal bar, the closing claim, one line of scope, then where to go next as a dash list and the single next step as a teal button. A thank-you slide would waste the last thing the audience looks at.',
    content_relations: ['closing', 'statement'], scene_roles: ['close'], density: { max_chars: 420, max_elements: 9 },
    elements: [
      { el: 'bar', role: 'backdrop', css: { left: M, top: 176, width: 120, height: 6 } },
      { el: 'title', tag: 'h1', role: 'heading', slot: ['text'], required: true, hint: 'the closing claim, up to 2 lines and 20 characters per line', css: { left: M, top: 216, width: W, height: 180, fontSize: 58, lineHeight: 1.24, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'one line of scope: what this deck did and did not cover', fit: true, css: { left: M, top: 412, width: 1500, height: 104, fontSize: 32, lineHeight: 1.6 } },
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: false, hint: 'where to go next, 2 to 3 items, up to 2 lines each', css: { left: M, top: 528, width: 1560, height: 368, fontSize: 32, lineHeight: 1.6 } },
      { el: 'cta', tag: 'p', role: 'cta', slot: ['text'], required: true, hint: 'the single next step, up to 14 characters', fit: true, css: { left: M, top: 916, width: 620, height: 76, fontSize: 26, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 18px 30px; display: flex; align-items: center; justify-content: center;' } },
      ...rail(),
    ],
    extraCss: `[data-layout="closing"] [data-el="evidence"] li { padding-left: 24px; margin-bottom: 20px; }`,
    sample: {
      title: t('Three places to go deeper'), body: t('This deck covered the tool and its architecture; figures, progress, milestones and dates were out of scope.'),
      evidence: list([
        'The full map and the check boundaries: the interactive system map, with its three guided views',
        'Commands and file formats: the README and AGENTS.md of the tool',
        'Method and boundaries: specs/ holds the matrix and the scoring rules; memory/ keeps one fact per file',
      ]),
      cta: t('For numbers, ask for a run'), meta: t('Architecture only'), page: t('16 / 16'),
    },
  },
];

// ── emit ───────────────────────────────────────────────────────────────────
const SLOT_KIND = { text: 'text', list: 'text', metric: 'text', chart: 'text', table: 'text', code: 'text', icon: 'text', tabs: 'text', image: 'image' };

function cssRule(id, e) {
  const c = e.css;
  const lines = [`left: ${c.left}px;`, `top: ${c.top}px;`, `width: ${c.width}px;`, `height: ${c.height}px;`];
  if (c.fontSize) lines.push(`font-size: ${c.fontSize}px;`);
  if (c.lineHeight) lines.push(`line-height: ${c.lineHeight};`);
  if (c.textAlign) lines.push(`text-align: ${c.textAlign};`);
  if (c.extra) lines.push(c.extra);
  return `[data-layout="${id}"] [data-el="${e.el}"] {\n  ${lines.join('\n  ')}\n}`;
}

for (const L of layouts) {
  const dir = path.join(OUT, L.id);
  fs.mkdirSync(dir, { recursive: true });
  // the top-edge progress bar goes on every page, slipped in before the page number
  L.elements = L.elements.flatMap((e) => (e.el === 'page' ? [progress(), e] : [e]));
  L.density = { ...L.density, max_elements: Math.max(L.density.max_elements, L.elements.length) };
  const html = [`<section class="slide" data-layout="${L.id}">`];
  for (const e of L.elements) {
    if (e.svg) {
      html.push(`  <svg data-el="${e.el}" data-role="${e.role}" data-shape="${e.shape}" viewBox="${e.viewBox}" preserveAspectRatio="none" aria-hidden="true">${e.svg}</svg>`);
    } else if (e.slot) {
      html.push(`  <${e.tag} data-el="${e.el}" data-slot="${e.el}" data-role="${e.role}"${e.tone ? ` data-tone="${e.tone}"` : ''}${e.fit ? ' data-fit="true"' : ''}>{{${e.el}}}</${e.tag}>`);
    } else {
      html.push(`  <div data-el="${e.el}" data-role="${e.role}"${e.tone ? ` data-tone="${e.tone}"` : ''}></div>`);
    }
  }
  html.push('</section>', '');
  const css = [`/* technical-brief/${L.id} — geometry only, read off a 1280x720 source deck rendered at 1920x1080. */`];
  for (const e of L.elements) css.push(cssRule(L.id, e));
  if (L.extraCss) css.push(L.extraCss);
  css.push('');
  const slots = {};
  const elements = [];
  for (const e of L.elements) {
    if (e.slot) {
      slots[e.el] = { type: e.slot.length === 1 ? e.slot[0] : e.slot, required: !!e.required, hint: e.hint };
      if (e.imageFit) slots[e.el].fit = e.imageFit;
      elements.push({ id: e.el, kind: SLOT_KIND[e.slot[0]] });
    } else elements.push({ id: e.el, kind: 'shape' });
  }
  const json = { id: L.id, name: L.name, description: L.description, content_relations: L.content_relations, scene_roles: L.scene_roles, density: L.density, slots, elements, sample: L.sample };
  fs.writeFileSync(path.join(dir, 'layout.html'), html.join('\n'));
  fs.writeFileSync(path.join(dir, 'layout.css'), css.join('\n\n'));
  fs.writeFileSync(path.join(dir, 'layout.json'), `${JSON.stringify(json, null, 2)}\n`);
  console.log('wrote', L.id, '—', elements.length, 'elements,', Object.keys(slots).length, 'slots');
}
