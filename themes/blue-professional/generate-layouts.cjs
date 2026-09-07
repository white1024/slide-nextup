// Generates this pack's layouts (themes/blue-professional/layouts/<id>/) from the compact spec below.
// Source: beautiful-html-templates/blue-professional (Zara Zhang, MIT). Its vw/vh/rem values are
// resolved at 1920×1080 (1vw = 19.2px, 1vh = 10.8px, 1rem = 16px) and the type is scaled up for
// projection (content ≥ 32px, furniture ≥ 20px). Edit the spec, then run:
//   node themes/blue-professional/generate-layouts.cjs
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'themes', 'blue-professional', 'layouts');

const t = (value) => ({ type: 'text', value });
const list = (items) => ({ type: 'list', items });
const metric = (value, label, delta) => (delta === undefined ? { type: 'metric', value, label } : { type: 'metric', value, label, delta });

const M = 77; // 4vw side padding
const W = 1766; // 1920 − 2 × 4vw

// ---- furniture shared by the inner pages: eyebrow top-left, tag pill top-right, counter bottom-left, progress bar along the bottom edge ----
const kicker = () => ({ el: 'kicker', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: 'chapter label top left, e.g. "01 — Why"; numbered automatically by the scaffold when the slides in the story carry a chapter, otherwise left empty', css: { left: M, top: 62, width: 1100, height: 36, fontSize: 24, lineHeight: '36px' } });
const chip = () => ({ el: 'meta', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: 'rounded tag top right: audience, phase or occasion, up to 10 characters, filled automatically from the first clause of occasion; leave empty when not needed', css: { left: 1563, top: 58, width: 280, height: 44, fontSize: 22, lineHeight: '44px', textAlign: 'center', extra: 'padding: 0 24px;' } });
const heading = () => ({ el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: "the slide's claim in one sentence, up to 2 lines and 26 characters; *keyword* marks an emphasis (blue)", css: { left: M, top: 128, width: W, height: 140, fontSize: 56, lineHeight: 1.2, extra: 'text-wrap: balance;' } });
const head = () => [kicker(), chip(), heading()];
const lede = (top = 292, height = 56, hint = 'a one-line lede, up to 50 characters') => ({ el: 'subtitle', tag: 'p', role: 'subtitle', slot: ['text'], required: false, hint, fit: true, css: { left: M, top, width: W, height, fontSize: 32, lineHeight: 1.6 } });
const note = (top, height = 60, id = 'caption', hint = 'a one-line note or reminder') => ({ el: id, tag: 'p', role: 'caption', slot: ['text'], required: false, hint, fit: true, css: { left: M, top, width: W, height, fontSize: 26, lineHeight: 1.6 } });
const pageNo = () => ({ el: 'page', tag: 'p', role: 'meta', slot: ['text'], required: false, hint: 'page number, filled automatically ("01 / 08")', css: { left: 58, top: 1029, width: 200, height: 24, fontSize: 20, lineHeight: '24px' } });
// the template's fixed progress bar: the theme fills index/count of this box from the section's --page-index / --page-count
const progress = () => ({ el: 'progress', role: 'progress', css: { left: 0, top: 1077, width: 1920, height: 3 } });
// the 60×4 cobalt rule
const rule = (el, left, top) => ({ el, role: 'backdrop', css: { left, top, width: 60, height: 4 } });

const HEAD_SAMPLE = { kicker: t('02 — Where we stand'), meta: t('Quarterly review'), page: t('03 / 10') };
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%279%27%3E%3Crect width=%2716%27 height=%279%27 fill=%27%23ebe9e9%27/%3E%3C/svg%3E';

function cardsLayout(id, n, name, desc) {
  const gap = 36;
  const w = Math.floor((W - gap * (n - 1)) / n);
  const els = [...head(), lede()];
  for (let i = 0; i < n; i++) {
    els.push({ el: `card-${i + 1}`, tag: 'div', role: 'card', slot: ['text', 'metric'], required: i < Math.min(2, n), hint: i === 0 ? "card: the metric's value is the big number, label the heading, delta the note; or a short paragraph; may carry details (the full content that expands when the card is clicked during playback)" : 'same as above', css: { left: M + i * (w + gap), top: 380, width: w, height: 480, fontSize: 32, lineHeight: 1.6, extra: `padding: ${n === 4 ? '32px 28px' : '40px 36px'};` } });
  }
  els.push(pageNo());
  const sample = { ...HEAD_SAMPLE, title: t("Three numbers that tell the quarter's story"), subtitle: t('Fewer slow pages and silent forms than last quarter; issues still bounce back to the backlog.') };
  const cards = [
    { ...metric('−38%', 'Fewer slow pages', 'Home and list pages load in under three seconds again'), details: list(['Mobile home: 4.1 s → 2.6 s', 'List page: 3.8 s → 2.4 s', 'Lazy-loading images made the difference']) },
    metric('12', 'Forms now give feedback', 'Each has a waiting state and a success message after submit'),
    metric('3 times', 'Back to the backlog', 'The same issue was assigned three times; the process still has no owner'),
    metric('2 weeks', 'Average time to fix', 'Median from report to release'),
  ];
  for (let i = 0; i < n; i++) sample[`card-${i + 1}`] = cards[i];
  return {
    id, name, description: desc, content_relations: ['list', 'evidence', 'hierarchy'], scene_roles: ['map', 'evidence'],
    density: { max_chars: 90 * n + 100 }, elements: els,
    extraCss: `[data-layout="${id}"] [data-role="card"] .metric { justify-content: flex-start; }
[data-layout="${id}"] [data-role="card"] .metric-value { font-size: ${n === 4 ? 64 : 84}px; line-height: 1; }
[data-layout="${id}"] [data-role="card"] .metric-label { font-size: 32px; line-height: 1.3; margin-top: 20px; }
[data-layout="${id}"] [data-role="card"] .metric-delta { font-size: 28px; line-height: 1.5; margin-top: 14px; }`,
    sample,
  };
}

const layouts = [
  {
    id: 'cover', name: 'Cover: blue professional', description: 'A consulting-report cover: a slanted tinted panel on the right with a 3 by 3 dot grid in its corner; on the left the series name, a short blue rule, the title, a lede and one line of meta, with the page number bottom left and the progress bar along the bottom edge. A centred title page would lose the document-like left-aligned rhythm and the weight of the slanted panel.',
    content_relations: ['statement'], scene_roles: ['hero'], density: { max_chars: 200 },
    elements: [
      { el: 'panel', role: 'tint', css: { left: 1248, top: 0, width: 672, height: 1080, extra: 'clip-path: polygon(30% 0, 100% 0, 100% 100%, 0 100%);' } },
      { el: 'dots', role: 'dots', css: { left: 1718, top: 902, width: 48, height: 48 } },
      { el: 'brand', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: 'series or deck name, filled automatically from the part of the story title before the colon; leave empty when not needed', css: { left: 154, top: 262, width: 900, height: 36, fontSize: 24, lineHeight: '36px' } },
      rule('accent', 154, 323),
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: 'claim headline, 1 to 2 lines, up to 16 characters; *keyword* marks an emphasis (blue)', css: { left: 154, top: 351, width: 1056, height: 200, fontSize: 88, lineHeight: 1.05, extra: 'text-wrap: balance;' } },
      { el: 'subtitle', tag: 'p', role: 'subtitle', slot: ['text'], required: false, hint: 'a lede of 1 to 2 lines, up to 45 characters', fit: true, css: { left: 154, top: 565, width: 768, height: 104, fontSize: 32, lineHeight: 1.6 } },
      { el: 'meta', tag: 'p', role: 'meta', slot: ['text'], required: false, hint: 'occasion, date or confidentiality level, filled automatically from the first clause of occasion (up to 10 characters)', css: { left: 154, top: 713, width: 900, height: 32, fontSize: 20, lineHeight: '32px' } },
      pageNo(),
    ],
    sample: { brand: t('Quarterly operations review'), title: t('Fix *waiting* first, then features'), subtitle: t('Three months of data: users drop off at loading and forms, not the feature list.'), meta: t('Quarterly review · 2026-09 · Internal'), page: t('01 / 10') },
  },
  {
    id: 'agenda', name: 'Agenda: blue professional', description: 'A contents page: a short blue rule under the title, then six numbered entries in two columns of three, each a blue number, a heading and a one-sentence note, separated by hairlines. A single list would lose the scanning rhythm of six things each in its own cell.',
    content_relations: ['list', 'hierarchy', 'sequence'], scene_roles: ['map'], density: { max_chars: 320 },
    elements: (() => {
      const els = [...head(), rule('accent', M, 292)];
      for (let i = 0; i < 6; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        els.push({ el: `item-${i + 1}`, tag: 'div', role: 'entry', slot: ['text', 'metric'], required: i < 2, hint: i === 0 ? "agenda entry: the metric's value is the number (01), label the heading, delta a one-sentence note; or a short paragraph" : 'same as above; leave empty when not needed', css: { left: M + col * 907, top: 330 + row * 216, width: 859, height: 200, fontSize: 32, lineHeight: 1.4, extra: 'padding: 20px 24px;' } });
      }
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="agenda"] [data-role="entry"] .metric { display: grid; grid-template-columns: 96px 1fr; grid-template-rows: auto auto; column-gap: 24px; align-content: center; justify-items: start; }
[data-layout="agenda"] [data-role="entry"] .metric-value { grid-row: 1 / span 2; align-self: center; font-size: 48px; line-height: 1; }
[data-layout="agenda"] [data-role="entry"] .metric-label { font-size: 32px; line-height: 1.3; }
[data-layout="agenda"] [data-role="entry"] .metric-delta { font-size: 28px; line-height: 1.45; margin-top: 8px; }`,
    sample: { ...HEAD_SAMPLE, kicker: t('Contents'), meta: t('Overview'), title: t('The six things this review covers'), 'item-1': metric('01', 'Where we stand', 'How to read three months of health-check data'), 'item-2': metric('02', 'Ranking the risks', 'Which problems to fix first, which can wait'), 'item-3': metric('03', 'Where the effort goes', 'Where people and budget move to'), 'item-4': metric('04', 'Quarterly goals', 'The three things next quarter must deliver'), 'item-5': metric('05', 'Risks and opportunities', 'The trade-off between holding and pushing'), 'item-6': metric('06', 'Conclusions and next steps', 'Who does what after the meeting'), page: t('02 / 10') },
  },
  {
    id: 'section', name: 'Section: blue professional', description: 'A chapter opener: the series name and the tag top right, then a huge blue number on the left, a short blue rule, the chapter title and a lede. A plain title page would lose the turn-the-page rhythm the number gives.',
    content_relations: ['statement', 'list'], scene_roles: ['map', 'pause', 'relationship'], density: { max_chars: 140 },
    elements: [
      { el: 'brand', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: 'series or deck name, filled automatically; leave empty when not needed', css: { left: M, top: 62, width: 1100, height: 36, fontSize: 24, lineHeight: '36px' } },
      chip(),
      { el: 'number', tag: 'p', role: 'number', slot: ['text'], required: true, hint: 'chapter number, two digits', css: { left: M, top: 236, width: 900, height: 290, fontSize: 240, lineHeight: 1.1 } },
      rule('accent', M, 560),
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: 'chapter title, 1 to 2 lines, up to 14 characters', css: { left: M, top: 600, width: 1500, height: 180, fontSize: 72, lineHeight: 1.2, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'a lede of 1 to 2 lines, up to 60 characters', fit: true, css: { left: M, top: 800, width: 1300, height: 110, fontSize: 32, lineHeight: 1.65 } },
      pageNo(),
    ],
    sample: { brand: t('Quarterly operations review'), meta: t('Chapter 2'), number: t('02'), title: t('Where we stand: numbers first'), body: t('First the three months of measurements, then which to fix and which can wait.'), page: t('02 / 10') },
  },
  {
    id: 'statement', name: 'Statement: blue professional', description: 'One claim per slide: the left column is a blue-ruled list of supporting points; across a hairline, the right column holds the tinted claim box, three small stat cells and a supplement. A plain text page would lose the reading direction of evidence on the left, conclusion on the right.',
    content_relations: ['statement', 'evidence', 'sequence'], scene_roles: ['evidence', 'relationship', 'pause'], density: { max_chars: 360 },
    elements: [
      ...head(),
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: false, hint: '3 to 5 supporting points, up to 2 lines each', css: { left: M, top: 300, width: 880, height: 560, fontSize: 32, lineHeight: 1.55 } },
      { el: 'split', role: 'divider', css: { left: 981, top: 300, width: 2, height: 660 } },
      { el: 'body', tag: 'p', role: 'highlight', slot: ['text'], required: false, hint: 'the claim in one sentence, or a quote, up to 3 lines and 50 characters', fit: true, css: { left: 1013, top: 300, width: 830, height: 250, fontSize: 34, lineHeight: 1.45, extra: 'padding: 32px 36px;' } },
      ...[1, 2, 3].map((i) => ({ el: `stat-${i}`, tag: 'div', role: 'stat', slot: ['metric', 'text'], required: false, hint: i === 1 ? "small stat cell: the metric's value is the number, label its caption (up to 8 characters); leave empty when not needed" : 'same as above', css: { left: 1013 + (i - 1) * 283, top: 582, width: 263, height: 180, fontSize: 32, lineHeight: 1.3, extra: 'padding: 20px 22px;' } })),
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'supplement for the right column, up to 2 lines', fit: true, css: { left: 1013, top: 790, width: 830, height: 100, fontSize: 28, lineHeight: 1.6 } },
      pageNo(),
    ],
    extraCss: `[data-layout="statement"] [data-el="evidence"] li { padding-left: 24px; margin-bottom: 18px; }
[data-layout="statement"] [data-role="stat"] .metric { justify-content: flex-start; }
[data-layout="statement"] [data-role="stat"] .metric-value { font-size: 48px; line-height: 1; }
[data-layout="statement"] [data-role="stat"] .metric-label { font-size: 28px; line-height: 1.35; margin-top: 10px; }`,
    sample: { ...HEAD_SAMPLE, title: t('Fix the three that hit delivery; the rest can wait'), evidence: list(['A fifth of pages take over three seconds to load, mostly on mobile', 'Three in ten forms give no feedback after submit, so users submit again', 'Monitoring watches the servers, not the time users actually wait', 'No one owns the fix process; the same issue returns to the backlog three times']), body: t('"Not every problem is worth fixing now, but these three hit delivery directly."'), 'stat-1': metric('20%', 'Slow pages'), 'stat-2': metric('30%', 'Silent forms'), 'stat-3': metric('3 times', 'Bounced back'), caption: t('The other twelve are in the appendix, ranked by impact and cost, for next quarter.') },
  },
  cardsLayout('cards', 3, 'Three cards: blue professional', 'Under the title and lede, three rounded tinted cards, each with a big blue number, a bold heading and a one-sentence note. A bulleted list would lose the sense of cards standing side by side on their own.'),
  cardsLayout('cards-2', 2, 'Two cards: blue professional', 'Under the title and lede, two wide tinted cards. Use it for two ideas side by side; do not force in a third.'),
  cardsLayout('cards-4', 4, 'Four cards: blue professional', 'Under the title and lede, four narrow tinted cards. Use it for four small points side by side; keep the text short.'),
  {
    id: 'dashboard', name: 'Dashboard: blue professional', description: 'Six stat cells: under the title, a three-by-two grid of tinted cells, each with a blue number, the name of the metric and a hairline-separated context note. A table would lose the weight each number gets from its own frame.',
    content_relations: ['evidence', 'list', 'comparison'], scene_roles: ['evidence', 'map'], density: { max_chars: 360 },
    elements: (() => {
      const els = [...head()];
      for (let i = 0; i < 6; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        els.push({ el: `stat-${i + 1}`, tag: 'div', role: 'stat', slot: ['metric', 'text'], required: i < 3, hint: i === 0 ? "stat cell: the metric's value is the number, label the name of the metric (up to 15 characters), delta a one-line context note; may carry details" : 'same as above; leave empty when not needed', css: { left: M + col * 598, top: 300 + row * 354, width: 570, height: 330, fontSize: 32, lineHeight: 1.35, extra: 'padding: 32px 36px;' } });
      }
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="dashboard"] [data-role="stat"] .metric { justify-content: flex-start; }
[data-layout="dashboard"] [data-role="stat"] .metric-value { font-size: 64px; line-height: 1; }
[data-layout="dashboard"] [data-role="stat"] .metric-label { font-size: 32px; line-height: 1.35; margin-top: 14px; }
[data-layout="dashboard"] [data-role="stat"] .metric-delta { font-size: 28px; line-height: 1.45; margin-top: 16px; padding-top: 14px; }`,
    sample: { ...HEAD_SAMPLE, title: t("Six metrics on the quarter's health"), 'stat-1': metric('98.7%', 'Availability', 'Flat on last quarter; both outages were in maintenance'), 'stat-2': metric('2.6 s', 'Median home page load', '1.5 s faster than last quarter, mostly on mobile'), 'stat-3': metric('412', 'Issues reported', 'Six in ten were closed within two weeks'), 'stat-4': metric('61%', 'Closed within two weeks', '44% last quarter; better since each fix got an owner'), 'stat-5': metric('17', 'Open for over a month', 'Mostly items that need architectural changes'), 'stat-6': metric('4.6', 'Satisfaction (out of 5)', 'Survey of a sample of two hundred users') },
  },
  {
    id: 'chart-aside', name: 'Chart with aside: blue professional', description: 'Under the title, a chart on the left (ranked bars, progress, line or donut) and a tinted card on the right for an aside or a key number, with a note underneath. A plain table would lose the sense of proportion.',
    content_relations: ['evidence', 'comparison', 'sequence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 260 },
    elements: [
      ...head(),
      { el: 'chart', tag: 'div', role: 'chart', slot: ['chart'], required: true, hint: "chart: bar or progress is closest to the original's ranked bars; line and donut also work", css: { left: M, top: 300, width: 1140, height: 620, fontSize: 32, lineHeight: 1.4 } },
      { el: 'aside', tag: 'div', role: 'card', slot: ['metric', 'text', 'chart'], required: false, hint: 'aside: one key number or a short paragraph', css: { left: 1257, top: 300, width: 586, height: 620, fontSize: 32, lineHeight: 1.6, extra: 'padding: 40px 36px;' } },
      note(944, 48),
      pageNo(),
    ],
    extraCss: `[data-layout="chart-aside"] [data-el="aside"] .metric { justify-content: flex-start; }
[data-layout="chart-aside"] [data-el="aside"] .metric-value { font-size: 84px; line-height: 1; }
[data-layout="chart-aside"] [data-el="aside"] .metric-label { font-size: 32px; line-height: 1.4; margin-top: 18px; }
[data-layout="chart-aside"] [data-el="aside"] .metric-delta { font-size: 28px; line-height: 1.5; margin-top: 12px; }`,
    sample: { ...HEAD_SAMPLE, title: t('What users mind most is waiting, not features'), chart: { type: 'chart', kind: 'bar', series: [{ label: 'Slow page loads', value: 79 }, { label: 'Silent forms', value: 69 }, { label: 'Search misses', value: 39 }, { label: 'Mobile layout bugs', value: 37 }, { label: 'Too many alerts', value: 25 }], unit: '%', toggle: true }, aside: metric('79%', 'Put waiting first', 'Four in five respondents mention load time'), caption: t('Two hundred users sampled, multiple answers; in playback, click the legend to drop an item and compare again.') },
  },
  {
    id: 'process', name: 'Process: blue professional', description: 'One horizontal flow: six numbered blue circular nodes that fade towards the end, a short hairline between nodes, the step name and a one-sentence note under each, and a reminder at the bottom. A bulleted list would lose seeing the whole line at a glance.',
    content_relations: ['sequence'], scene_roles: ['relationship', 'map'], density: { max_chars: 300 },
    elements: (() => {
      const els = [...head(), lede()];
      for (let i = 0; i < 6; i++) {
        els.push({ el: `step-${i + 1}`, tag: 'div', role: 'step', tone: `s${i + 1}`, slot: ['text', 'metric'], required: i < 3, hint: i === 0 ? 'step: text is the step name (up to 8 characters per line); as a metric, value is the step name and label a one-sentence note' : 'same as above; leave empty when not needed (the node and its connector disappear together)', css: { left: M + i * 294, top: 400, width: 294, height: 440, fontSize: 32, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 100px 16px 0;' } });
      }
      els.push(note(880, 100, 'caption', 'a reminder for the process: the one or two things most easily missed'));
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="process"] [data-role="step"] .metric { justify-content: flex-start; }
[data-layout="process"] [data-role="step"] .metric-value { font-size: 32px; line-height: 1.3; }
[data-layout="process"] [data-role="step"] .metric-label { font-size: 28px; line-height: 1.5; margin-top: 12px; }`,
    sample: { ...HEAD_SAMPLE, title: t('Six fixed steps a quarter, stop and resume at will'), subtitle: t('Every step has an output; skip one and the next cannot start.'), 'step-1': metric('Inventory', 'List every report this quarter'), 'step-2': metric('Rank', 'Grade by impact and cost'), 'step-3': metric('Assign', 'One owner per item'), 'step-4': metric('Fix', 'Two-week cycles'), 'step-5': metric('Verify', 'Rerun the same measurements'), 'step-6': metric('Review', 'Write the results into next quarter'), caption: t('Verification is missed most often: a fix that is not re-measured is no fix.') },
  },
  {
    id: 'comparison', name: 'Comparison: blue professional', description: 'Two tinted cards side by side, each with a bold column name and a blue-ruled list; the right one has a blue border and is the side the conclusion lands on. Two stacked paragraphs would lose the tension of the side-by-side contrast.',
    content_relations: ['comparison'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 360 },
    elements: [
      ...head(),
      { el: 'left', role: 'card', css: { left: M, top: 300, width: 859, height: 660 } },
      { el: 'left-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'left column name, 2 to 8 characters', css: { left: M + 40, top: 340, width: 779, height: 52, fontSize: 36, lineHeight: '52px' } },
      { el: 'left-items', tag: 'div', role: 'list', slot: ['list'], required: true, hint: '3 to 5 items, up to 2 lines each', css: { left: M + 40, top: 412, width: 779, height: 520, fontSize: 32, lineHeight: 1.55 } },
      { el: 'right', role: 'card', tone: 'accent', css: { left: 984, top: 300, width: 859, height: 660 } },
      { el: 'right-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'right column name, 2 to 8 characters', css: { left: 1024, top: 340, width: 779, height: 52, fontSize: 36, lineHeight: '52px' } },
      { el: 'right-items', tag: 'div', role: 'list', slot: ['list'], required: true, hint: '3 to 5 items, up to 2 lines each', css: { left: 1024, top: 412, width: 779, height: 520, fontSize: 32, lineHeight: 1.55 } },
      pageNo(),
    ],
    extraCss: `[data-layout="comparison"] [data-el="left-items"] li, [data-layout="comparison"] [data-el="right-items"] li { padding-left: 24px; margin-bottom: 16px; }`,
    sample: { ...HEAD_SAMPLE, title: t('Protect delivery first, then new features'), 'left-title': t('Hold: fix first'), 'left-items': list(['Home and list page load times', 'Feedback after a form is submitted', 'Monitor the wait as users see it', 'Name an owner for each fix']), 'right-title': t('Push: later'), 'right-items': list(['Relevance of search results', 'Reworking the mobile layout', 'Notification frequency and grouping', 'Report export']) },
  },
  {
    id: 'photo', name: 'Photo: blue professional', description: 'Under the title, one full-width tinted frame for an image (a system diagram, a screenshot) with a caption beneath. A small image beside text would lose the weight of the image as the main act.',
    content_relations: ['evidence', 'statement'], scene_roles: ['hero', 'evidence', 'pause'], density: { max_chars: 120 },
    elements: [
      ...head(),
      { el: 'photo', tag: 'div', role: 'photo', slot: ['image'], required: true, hint: 'image, ideally 1766 by 620 or the same ratio, cropped to cover; may carry hotspots (click-to-jump areas during playback, positioned in percent)', css: { left: M, top: 300, width: W, height: 620 } },
      note(944, 48, 'caption', 'a one-line caption'),
      pageNo(),
    ],
    sample: { ...HEAD_SAMPLE, title: t("Measurement starts at the user's end"), photo: { type: 'image', src: PLACEHOLDER_IMAGE, alt: 'System diagram', hotspots: [{ target: 'cards', x: 56, y: 30, w: 16, h: 40, label: 'See the three numbers' }] }, caption: t('Browser-side wait times go into monitoring first, then get matched to the server logs.') },
  },
  {
    id: 'data-table', name: 'Data table: blue professional', description: 'Title and lede, then a tinted frame holding the table, whose header is small blue capitals over a blue underline, with a note beneath. A bulleted list would lose the alignment between columns.',
    content_relations: ['comparison', 'evidence', 'list'], scene_roles: ['evidence'], density: { max_chars: 400 },
    elements: [
      ...head(),
      lede(),
      { el: 'table', tag: 'div', role: 'table', slot: ['table'], required: true, hint: 'table: one header row, 3 to 6 data rows, 1 to 10 characters per cell', css: { left: M, top: 380, width: W, height: 500, fontSize: 28, lineHeight: 1.5, extra: 'padding: 8px 12px;' } },
      note(910, 60, 'caption', 'a one-line note or source'),
      pageNo(),
    ],
    extraCss: `[data-layout="data-table"] [data-el="table"] .table th, [data-layout="data-table"] [data-el="table"] .table td { padding: 16px 28px; }
[data-layout="data-table"] [data-el="table"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('Four metrics, last quarter beside this one'), subtitle: t('The change column is this quarter minus last; negative means faster or fewer.'), table: { type: 'table', header: ['Metric', 'Last quarter', 'This quarter', 'Change'], rows: [['Median home load', '4.1 s', '2.6 s', '−1.5 s'], ['Closed in two weeks', '44%', '61%', '+17 pts'], ['Open over a month', '23', '17', '−6'], ['Satisfaction (of 5)', '4.2', '4.6', '+0.4']] }, caption: t("Source: this quarter's measurements and survey; the survey sampled two hundred users.") },
  },
  {
    id: 'quote', name: 'Quote: blue professional', description: 'A centred quote: a pale blue quotation mark above, bold large type, the source beneath; a thin ring top left and a pale blue dot bottom right. A plain text page would lose the pause.',
    content_relations: ['statement'], scene_roles: ['pause', 'hero', 'close'], density: { max_chars: 120 },
    elements: [
      kicker(),
      chip(),
      { el: 'ring', role: 'ring', css: { left: 96, top: 108, width: 80, height: 80 } },
      { el: 'orb', role: 'orb', css: { left: 1728, top: 890, width: 60, height: 60 } },
      { el: 'mark', role: 'quote-mark', svg: '<path d="M3 3h8v7c0 4.4-2.6 7.2-7 8v-3.2c2-.5 3.1-1.8 3.3-3.8H3V3zm11 0h8v7c0 4.4-2.6 7.2-7 8v-3.2c2-.5 3.1-1.8 3.3-3.8H14V3z"/>', shape: 'quote', viewBox: '0 0 25 20', css: { left: 910, top: 268, width: 100, height: 80 } },
      { el: 'title', tag: 'h1', role: 'quote', slot: ['text'], required: true, hint: 'the quote itself, up to 3 lines and 60 characters; *keyword* turns blue', fit: true, css: { left: 335, top: 400, width: 1250, height: 240, fontSize: 56, lineHeight: 1.4, textAlign: 'center', extra: 'text-wrap: balance;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'source: who said it and where, one line', css: { left: 335, top: 680, width: 1250, height: 48, fontSize: 28, lineHeight: 1.6, textAlign: 'center' } },
      pageNo(),
    ],
    sample: { kicker: t('03 — Judgement'), meta: t('Principle'), title: t('Fix the *waiting* first, or the features go unused; no one tolerates slow for something new.'), caption: t('Product owner, at the quarterly review'), page: t('05 / 10') },
  },
  {
    id: 'closing', name: 'Closing: blue professional', description: 'A centred close: two concentric thin rings behind, a short blue rule, one closing headline, a short explanation, a solid blue pill button as the call to action, and contact details on the last line. A thank-you page would lose the act of handing the next step to the audience.',
    content_relations: ['closing', 'statement'], scene_roles: ['close'], density: { max_chars: 200 },
    elements: [
      { el: 'ring-big', role: 'ring', tone: 'faint', css: { left: 710, top: 290, width: 500, height: 500 } },
      { el: 'ring-small', role: 'ring', tone: 'faint', css: { left: 780, top: 360, width: 360, height: 360 } },
      rule('accent', 930, 330),
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: 'closing claim, one line, up to 16 characters', css: { left: 160, top: 370, width: 1600, height: 110, fontSize: 88, lineHeight: 1.1, textAlign: 'center' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'an explanation of 1 to 2 lines, up to 50 characters', fit: true, css: { left: 460, top: 520, width: 1000, height: 104, fontSize: 32, lineHeight: 1.6, textAlign: 'center' } },
      { el: 'cta', tag: 'p', role: 'cta', slot: ['text'], required: true, hint: 'the main call to action, a short phrase, up to 12 characters', fit: true, css: { left: 700, top: 680, width: 520, height: 84, fontSize: 28, lineHeight: '84px', textAlign: 'center', extra: 'padding: 0 40px;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'contact details or the next meeting time, one line', css: { left: 460, top: 820, width: 1000, height: 40, fontSize: 24, lineHeight: '40px', textAlign: 'center' } },
      pageNo(),
    ],
    sample: { title: t('Fix waiting, then features'), body: t('Fix the three delivery problems this quarter, and next quarter has room for new things.'), cta: t('Reply by next Wednesday'), caption: t('Data and appendix in the shared folder, updated an hour after the meeting'), page: t('10 / 10') },
  },
  {
    id: 'detail', name: 'Detail: blue professional', description: 'Four tinted blocks in two columns and two rows, each with a bold heading and two or three blue-ruled points. One long list would lose the grouping of four things each in its own set.',
    content_relations: ['list', 'hierarchy', 'evidence'], scene_roles: ['evidence', 'map'], density: { max_chars: 400 },
    elements: (() => {
      const els = [...head()];
      for (let i = 0; i < 4; i++) {
        const x = M + (i % 2) * 907;
        const y = 300 + Math.floor(i / 2) * 354;
        els.push({ el: `block-${i + 1}`, role: 'card', css: { left: x, top: y, width: 859, height: 330 } });
        els.push({ el: `head-${i + 1}`, tag: 'p', role: 'label', slot: ['text'], required: i < 2, hint: i === 0 ? 'block heading, up to 12 characters' : 'same as above; leave the whole block empty when not needed', css: { left: x + 32, top: y + 28, width: 795, height: 44, fontSize: 32, lineHeight: '44px' } });
        els.push({ el: `list-${i + 1}`, tag: 'div', role: 'list', slot: ['list', 'text'], required: i < 2, hint: i === 0 ? '2 to 3 items, one line each' : 'same as above', css: { left: x + 32, top: y + 88, width: 795, height: 220, fontSize: 32, lineHeight: 1.5 } });
      }
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="detail"] [data-role="list"] li { padding-left: 22px; margin-bottom: 10px; }`,
    sample: { ...HEAD_SAMPLE, title: t('Four changes in how we work'), 'head-1': t('Assume fixes cost more'), 'list-1': list(['Each fix is budgeted at two weeks or more', 'Small fixes no longer jump the queue', 'Measure first, so we fix the right thing']), 'head-2': t('A more cautious schedule'), 'list-2': list(['At most three items in progress at once', 'Every item has a stop-loss point', 'Anything open over a month is escalated']), 'head-3': t('Delivery first'), 'list-3': list(['Fix what hurts delivery first', 'Features come after the health targets', 'Commit to only three things a quarter']), 'head-4': t('Bottom-up reporting'), 'list-4': list(['The front line reports issues directly', 'A public ranking every two weeks', 'Data where everyone can see it']) },
  },
  {
    id: 'tabs', name: 'Tabs: blue professional', description: 'Title and lede, then a tinted frame holding a few tabs, each with its own panel (a list, a table or a paragraph); tabs switch on click during playback and only the first shows when static. Three separate slides would lose the contrast of switching within one frame.',
    content_relations: ['list', 'comparison', 'evidence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 320 },
    elements: [
      ...head(),
      lede(),
      { el: 'panels', tag: 'div', role: 'tabs', slot: ['tabs'], required: true, hint: '2 to 5 tabs, tab labels up to 6 characters; each panel holds 3 to 5 items or a small table; the first panel is what static output and QA see', css: { left: M, top: 380, width: W, height: 500, fontSize: 32, lineHeight: 1.6, extra: 'padding: 0 40px 28px;' } },
      note(910, 60),
      pageNo(),
    ],
    extraCss: `[data-layout="tabs"] [data-el="panels"] .tabs { gap: 0 8px; }
[data-layout="tabs"] [data-el="panels"] .tab { padding: 16px 26px; font-size: 28px; line-height: 1.3; }
[data-layout="tabs"] [data-el="panels"] .tab-panel { padding: 26px 8px 0; }
[data-layout="tabs"] [data-el="panels"] li { padding-left: 24px; margin-bottom: 14px; }
[data-layout="tabs"] [data-el="panels"] .table th, [data-layout="tabs"] [data-el="panels"] .table td { padding: 12px 24px; }
[data-layout="tabs"] [data-el="panels"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('Three audiences, each on their own tab'), subtitle: t('Managers see metrics, engineers the backlog, support the reporting flow; the data is the same.'), panels: { type: 'tabs', panels: [
      { label: 'Managers', content: list(['Six metrics, updated monthly', 'Red means behind target', 'Click a metric for its trend']) },
      { label: 'Engineers', content: list(['Backlog ranked by impact', 'Each item has an owner and a stop-loss point', 'Two-week cycles']) },
      { label: 'Support', content: { type: 'table', header: ['Situation', 'What to do'], rows: [['A user reports slowness', 'Send the link to the report form'], ['A form will not submit', 'Check the status page before replying']] } },
    ] }, caption: t('Click a tab to switch during playback; static mode shows only the first panel.') },
  },
];

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
  // every layout gets the progress bar right before its page counter
  L.elements = L.elements.flatMap((e) => (e.el === 'page' ? [progress(), e] : [e]));
  L.density = { ...L.density, max_elements: L.elements.length };
  const html = [`<section class="slide" data-layout="${L.id}">`];
  for (const e of L.elements) {
    const tone = e.tone ? ` data-tone="${e.tone}"` : '';
    if (e.svg) {
      html.push(`  <svg data-el="${e.el}" data-role="${e.role}"${tone} data-shape="${e.shape}" viewBox="${e.viewBox}" preserveAspectRatio="none" aria-hidden="true">${e.svg}</svg>`);
    } else if (e.slot) {
      html.push(`  <${e.tag} data-el="${e.el}" data-slot="${e.el}" data-role="${e.role}"${tone}${e.fit ? ' data-fit="true"' : ''}>{{${e.el}}}</${e.tag}>`);
    } else {
      html.push(`  <div data-el="${e.el}" data-role="${e.role}"${tone}></div>`);
    }
  }
  html.push('</section>', '');
  const css = [`/* blue-professional/${L.id} — geometry only. Ported from beautiful-html-templates/blue-professional (Zara Zhang, MIT); vw/vh/rem resolved at 1920×1080 and type scaled up for projection. */`];
  for (const e of L.elements) css.push(cssRule(L.id, e));
  if (L.extraCss) css.push(L.extraCss);
  css.push('');
  const slots = {};
  const elements = [];
  for (const e of L.elements) {
    if (e.slot) {
      slots[e.el] = { type: e.slot.length === 1 ? e.slot[0] : e.slot, required: !!e.required, hint: e.hint };
      elements.push({ id: e.el, kind: SLOT_KIND[e.slot[0]] });
    } else elements.push({ id: e.el, kind: 'shape' });
  }
  const json = { id: L.id, name: L.name, description: L.description, content_relations: L.content_relations, scene_roles: L.scene_roles, density: L.density, slots, elements, sample: L.sample };
  fs.writeFileSync(path.join(dir, 'layout.html'), html.join('\n'));
  fs.writeFileSync(path.join(dir, 'layout.css'), css.join('\n\n'));
  fs.writeFileSync(path.join(dir, 'layout.json'), `${JSON.stringify(json, null, 2)}\n`);
  console.log('wrote', L.id, elements.length, 'elements');
}
