// Generates this pack's inner layouts (themes/warm-keynote/layouts/<id>/) from the compact spec below.
// Geometry = the source deck's 1600×900 values × 1.2. Edit the spec, then run: node themes/warm-keynote/generate-layouts.cjs
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'themes', 'warm-keynote', 'layouts');

const t = (value) => ({ type: 'text', value });
const list = (items) => ({ type: 'list', items });
const metric = (value, label, delta) => (delta === undefined ? { type: 'metric', value, label } : { type: 'metric', value, label, delta });

function chapterHead(withTitle = true) {
  const els = [
    { el: 'kicker', tag: 'p', role: 'chapter', slot: ['text'], required: false, hint: 'chapter label, e.g. "01 — Why"; numbered automatically by the scaffold when the slides in the story carry a chapter, otherwise left empty (an empty label takes the vertical bar with it)', css: { left: 101, top: 77, width: 1120, height: 41, fontSize: 28, lineHeight: '41px', extra: 'padding-left: 20px;' } },
    { el: 'meta', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: 'pill tag top right: audience, phase or occasion, up to 10 characters, filled automatically from the first clause of occasion; leave empty when not needed', css: { left: 1558, top: 72, width: 261, height: 50, fontSize: 24, lineHeight: '48px', textAlign: 'center' } },
  ];
  if (withTitle) els.push({ el: 'title', tag: 'h1', role: 'heading', slot: ['text'], required: true, hint: 'the claim of the slide in one sentence, up to 2 lines and 24 characters; *keyword* marks an emphasis', css: { left: 101, top: 140, width: 1718, height: 150, fontSize: 55, lineHeight: 1.28, extra: 'text-wrap: balance;' } });
  return els;
}
const pageChip = () => ({ el: 'page', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: 'page number pill, filled automatically ("01 / 08")', css: { left: 1739, top: 1016, width: 150, height: 40, fontSize: 20, lineHeight: '38px', textAlign: 'center' } });
// the progress ticks at the bottom left: one tick per page, the current one lit. The theme draws
// them from the section's --page-index / --page-count (renderer + player), so every layout carries
// the same shape; the loop below slips it in before the page chip.
const progress = () => ({ el: 'progress', role: 'progress', css: { left: 31, top: 1050, width: 260, height: 6 } });
const lede = (top = 318, height = 60, hint = 'a one-line lede, up to 50 characters') => ({ el: 'subtitle', tag: 'p', role: 'body', slot: ['text'], required: false, hint, fit: true, css: { left: 101, top, width: 1718, height, fontSize: 32, lineHeight: 1.6 } });
const note = (top, height = 110, id = 'caption', hint = 'a closing supplement or reminder, 1 to 2 lines') => ({ el: id, tag: 'p', role: 'caption', slot: ['text'], required: false, hint, fit: true, css: { left: 101, top, width: 1718, height, fontSize: 28, lineHeight: 1.6 } });
const arrow = (el, css) => ({ el, role: 'connector', css, svg: '<line x1="2" y1="12" x2="30" y2="12"></line><polygon points="28,4 40,12 28,20"></polygon>', shape: 'arrow', viewBox: '0 0 41 24' });

const HEAD_SAMPLE = { kicker: t('01 — Why'), meta: t('Team leads'), page: t('03 / 08') };

function cardsLayout(id, n, name, desc) {
  const gap = 29;
  const w = Math.floor((1718 - gap * (n - 1)) / n);
  const h = 340;
  const pad = n === 4 ? '32px 28px' : '40px 36px';
  const fs = 32; // content floor is 32px, four narrow cards included
  const els = [...chapterHead(), lede()];
  for (let i = 0; i < n; i++) {
    els.push({ el: `card-${i + 1}`, tag: 'div', role: 'card', slot: ['text', 'metric'], required: i < Math.min(2, n), hint: i === 0 ? 'card: a metric whose value is a number or letter, label the title and delta the explanation; or a short paragraph; may carry details (the full content that expands when the card is clicked during playback)' : 'same as above', css: { left: 101 + i * (w + gap), top: 410, width: w, height: h, fontSize: fs, lineHeight: 1.6, extra: `padding: ${pad};` } });
  }
  els.push(pageChip());
  const sample = { ...HEAD_SAMPLE, title: t('No single update is long; the trouble is they arrive one after another'), subtitle: t('Four small waits add up to an hour a week.') };
  const cards = [
    { ...metric('A', 'Who is waiting on me?', 'Nobody knows until their turn comes'), details: list(['Blockers surface late', 'Handoffs wait for the next meeting', 'Two people report the same item']) },
    metric('B', 'What changed since last week?', 'The deck is written the night before'),
    metric('C', 'What was decided?', 'The notes come out days later, if at all'),
    metric('D', 'Do I need to be here?', 'Half the room waits for one item'),
  ];
  for (let i = 0; i < n; i++) sample[`card-${i + 1}`] = cards[i];
  return {
    id, name, description: desc, content_relations: ['list', 'evidence', 'hierarchy'], scene_roles: ['map', 'evidence'],
    density: { max_chars: 90 * n + 80, max_elements: els.length }, elements: els,
    extraCss: `[data-layout="${id}"] [data-role="card"] .metric { justify-content: flex-start; }
[data-layout="${id}"] [data-role="card"] .metric-value { font-size: ${n === 4 ? 40 : 48}px; line-height: 1; }
[data-layout="${id}"] [data-role="card"] .metric-label { font-size: ${fs}px; line-height: 1.3; margin-top: 16px; }
[data-layout="${id}"] [data-role="card"] .metric-delta { font-size: 28px; line-height: 1.55; margin-top: 12px; }`,
    sample,
  };
}

const layouts = [
  {
    id: 'section', name: 'Section: Warm Keynote', description: 'Chapter opener: a pill tag top right, a huge pale teal number on the left, a short teal rule, the heading and a lede. A plain title slide would lose the turn-to-the-next-chapter rhythm the number gives.',
    content_relations: ['statement', 'list'], scene_roles: ['map', 'pause', 'relationship'], density: { max_chars: 120, max_elements: 6 },
    elements: [
      { el: 'meta', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: 'pill tag top right', css: { left: 1558, top: 72, width: 261, height: 50, fontSize: 24, lineHeight: '48px', textAlign: 'center' } },
      { el: 'number', tag: 'p', role: 'number', slot: ['text'], required: true, hint: 'chapter number, two digits', css: { left: 101, top: 290, width: 700, height: 220, fontSize: 200, lineHeight: 1 } },
      { el: 'rule', role: 'backdrop', css: { left: 101, top: 548, width: 82, height: 6 } },
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: 'chapter title, 1 to 2 lines, up to 14 characters', css: { left: 101, top: 590, width: 1500, height: 200, fontSize: 76, lineHeight: 1.15, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'a short lede, up to 50 characters', fit: true, css: { left: 101, top: 810, width: 1300, height: 110, fontSize: 32, lineHeight: 1.65 } },
      pageChip(),
    ],
    sample: { meta: t('Chapter 1'), number: t('01'), title: t('Where the hour goes'), body: t('Hear how the team describes the meeting first, then look at the minutes.'), page: t('02 / 08') },
  },
  {
    id: 'statement', name: 'Statement: Warm Keynote', description: 'One claim per slide: the chapter head, a lede, and a glass card below holding the supporting list. A text-only slide would lose the weight the card adds by framing the argument.',
    content_relations: ['statement', 'evidence', 'sequence'], scene_roles: ['evidence', 'relationship', 'pause'], density: { max_chars: 320, max_elements: 8 },
    elements: [
      ...chapterHead(),
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'a lede, 1 to 2 lines', fit: true, css: { left: 101, top: 318, width: 1718, height: 110, fontSize: 32, lineHeight: 1.65 } },
      { el: 'slab', role: 'card', css: { left: 101, top: 452, width: 1718, height: 530 } },
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: false, hint: '3 to 5 supporting points, one line each', css: { left: 141, top: 492, width: 1638, height: 450, fontSize: 32, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="statement"] [data-el="evidence"] li { padding-left: 34px; margin-bottom: 18px; }`,
    sample: { ...HEAD_SAMPLE, title: t('The status hour goes on reading aloud'), body: t('Last month four weekly meetings averaged 62 minutes; 40 of them were updates read from the deck.'), evidence: list(['First half: updates read aloud', 'Second half: questions the notes had already answered', 'Decisions: pushed to next week']) },
  },
  cardsLayout('cards', 3, 'Three cards: Warm Keynote', 'Chapter head and lede, then three glass cards each holding a number, a title and one explanatory sentence. A bulleted list would lose the sense of three things standing side by side on their own.'),
  cardsLayout('cards-2', 2, 'Two cards: Warm Keynote', 'Chapter head and lede, then two wide glass cards. Use it for two concepts side by side; do not force a third card in.'),
  cardsLayout('cards-4', 4, 'Four cards: Warm Keynote', 'Chapter head and lede, then four narrow glass cards. Use it for four small points side by side; keep the text short.'),
  {
    id: 'process', name: 'Process: Warm Keynote', description: 'One horizontal flow: six pill nodes and five arrows, a lede above and a reminder below. A bulleted list would lose the effect of taking in the whole line at a glance.',
    content_relations: ['sequence'], scene_roles: ['relationship', 'map'], density: { max_chars: 260, max_elements: 18 },
    elements: (() => {
      const els = [...chapterHead(), lede()];
      for (let i = 0; i < 6; i++) {
        els.push({ el: `step-${i + 1}`, tag: 'div', role: 'pill', slot: ['text', 'metric'], required: i < 3, hint: i === 0 ? 'step name, up to 7 characters per line, up to 2 lines' : 'same as above; leave empty when not needed', css: { left: 101 + i * 297, top: 430, width: 232, height: 96, fontSize: 26, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 14px 16px; display: flex; align-items: center; justify-content: center;' } });
        if (i < 5) els.push(arrow(`arrow-${i + 1}`, { left: 101 + 232 + i * 297 + 12, top: 466, width: 41, height: 24 }));
      }
      els.push(note(560, 120, 'caption', 'a reminder for the process: what is most easily missed'));
      els.push(pageChip());
      return els;
    })(),
    sample: { ...HEAD_SAMPLE, title: t('A fixed six-step weekly loop'), subtitle: t('The update follows the same six steps every week; any step can be picked up where it stopped.'), 'step-1': t('collect'), 'step-2': t('draft'), 'step-3': t('review'), 'step-4': t('publish'), 'step-5': t('comment'), 'step-6': t('decide'), caption: t('comment is the step most often skipped; without it, decide has nothing to weigh and the call grows back.') },
  },
  {
    id: 'comparison', name: 'Cause and consequence: Warm Keynote', description: 'A glass card on the left holds the cause, an orange-red card on the right the consequence, with a round orange-red arrow between them. The consequence card is deliberately heavier. Two symmetrical columns would lose the direction of cause and effect.',
    content_relations: ['comparison'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 320, max_elements: 14 },
    elements: [
      ...chapterHead(),
      { el: 'left', role: 'card', css: { left: 101, top: 318, width: 760, height: 650 } },
      { el: 'left-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: 'left column title, e.g. "The lead\'s Friday loop"', css: { left: 141, top: 358, width: 680, height: 50, fontSize: 32, lineHeight: '50px' } },
      { el: 'left-items', tag: 'div', role: 'list', slot: ['list'], required: true, hint: 'left column, 3 to 4 items', css: { left: 141, top: 428, width: 680, height: 520, fontSize: 32, lineHeight: 1.6 } },
      { el: 'link', role: 'divider', css: { left: 881, top: 642, width: 178, height: 2 } },
      { el: 'badge', role: 'badge', css: { left: 938, top: 610, width: 65, height: 65 } },
      arrow('badge-arrow', { left: 954, top: 631, width: 33, height: 22 }),
      { el: 'right', role: 'alert', css: { left: 1059, top: 318, width: 760, height: 650 } },
      { el: 'right-title', tag: 'p', role: 'label-alert', slot: ['text'], required: true, hint: 'right column title, e.g. "The cost of a late update"', css: { left: 1099, top: 358, width: 680, height: 50, fontSize: 32, lineHeight: '50px' } },
      { el: 'right-items', tag: 'div', role: 'list-alert', slot: ['list'], required: true, hint: 'right column, 3 to 4 items', css: { left: 1099, top: 428, width: 680, height: 520, fontSize: 32, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="comparison"] [data-el="left-items"] li, [data-layout="comparison"] [data-el="right-items"] li { padding-left: 34px; margin-bottom: 16px; }`,
    sample: { ...HEAD_SAMPLE, title: t('Updates slip; the lead carries the cost'), 'left-title': t('The lead\'s Friday loop'), 'left-items': list(['Collect updates: chase every thread by hand', 'Rebuild the deck: the same slides with new numbers', 'Repeat the context: the same questions in every call']), 'right-title': t('The cost of a late update'), 'right-items': list(['Late decisions: a week lost each time', 'Wrong priorities: work goes on for a closed item', 'Time sink: chasing and rewriting eat the Friday']) },
  },
  {
    id: 'before-after', name: 'Before and after: Warm Keynote', description: 'A sunken card on the left holds the before steps as pills, a glass card on the right the after steps as teal pills, with a reminder below. Two bulleted lists would lose the visual contrast of fewer steps.',
    content_relations: ['comparison', 'sequence'], scene_roles: ['relationship', 'evidence'], density: { max_chars: 240, max_elements: 12 },
    elements: [
      ...chapterHead(),
      { el: 'before-box', role: 'sunk', css: { left: 101, top: 318, width: 844, height: 330 } },
      { el: 'before-label', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: 'left column eyebrow, e.g. "BEFORE - 5 steps"', css: { left: 141, top: 350, width: 764, height: 30, fontSize: 20, lineHeight: '30px' } },
      { el: 'before', tag: 'div', role: 'flow', slot: ['list', 'text'], required: true, hint: 'the steps before, a pill for every step', css: { left: 141, top: 400, width: 764, height: 220, fontSize: 26, lineHeight: 1.5 } },
      { el: 'after-box', role: 'card', css: { left: 975, top: 318, width: 844, height: 330 } },
      { el: 'after-label', tag: 'p', role: 'eyebrow-accent', slot: ['text'], required: false, hint: 'right column eyebrow, e.g. "AFTER - 3 steps"', css: { left: 1015, top: 350, width: 764, height: 30, fontSize: 20, lineHeight: '30px' } },
      { el: 'after', tag: 'div', role: 'flow-accent', slot: ['list', 'text'], required: true, hint: 'the steps after, a pill for every step', css: { left: 1015, top: 400, width: 764, height: 220, fontSize: 26, lineHeight: 1.5 } },
      note(680, 110),
      pageChip(),
    ],
    extraCss: `[data-layout="before-after"] [data-el="before"] li, [data-layout="before-after"] [data-el="after"] li { display: inline-block; padding: 10px 22px; margin: 0 36px 14px 0; }`,
    sample: { ...HEAD_SAMPLE, title: t('Not a new meeting: put the update next to the work'), 'before-label': t('BEFORE - 5 steps'), before: list(['Book the room', 'Collect the numbers', 'Build the deck', 'Present', 'Send the notes']), 'after-label': t('AFTER - 3 steps'), after: list(['Write the update', 'Read and comment', 'Decide in a short call']), caption: t('The two steps that vanish are exactly where the hour went.') },
  },
  {
    id: 'photo', name: 'Photo: Warm Keynote', description: 'A full-width glass frame under the chapter head holding an image (a system diagram, a screenshot), with a caption below. A small image beside text would lose the weight of the image as the lead.',
    content_relations: ['evidence', 'statement'], scene_roles: ['hero', 'evidence', 'pause'], density: { max_chars: 120, max_elements: 8 },
    elements: [
      ...chapterHead(),
      { el: 'frame', role: 'card', css: { left: 101, top: 318, width: 1718, height: 600 } },
      { el: 'photo', tag: 'div', role: 'photo', slot: ['image'], required: true, hint: 'image, 1678 by 560 px or the same ratio recommended; may carry hotspots (click-to-jump areas during playback, positioned in percent)', css: { left: 121, top: 338, width: 1678, height: 560 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'a one-line caption', fit: true, css: { left: 101, top: 934, width: 1718, height: 50, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    sample: { ...HEAD_SAMPLE, title: t('The weekly loop on one page'), photo: { type: 'image', src: 'data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271678%27 height=%27560%27%3E%3Crect width=%271678%27 height=%27560%27 fill=%27%23e6dcc4%27/%3E%3C/svg%3E', alt: 'weekly loop diagram', hotspots: [{ target: 'cards', x: 56, y: 30, w: 16, h: 40, label: 'comment step: see the four waits' }] }, caption: t('Updates come in from three teams, take one path, and land on the same page.') },
  },
  {
    id: 'data-table', name: 'Table: Warm Keynote', description: 'Chapter head and lede, then a glass container holding the table, its header in small monospace capitals, with a note below. A bulleted list would lose the alignment between columns.',
    content_relations: ['comparison', 'evidence', 'list'], scene_roles: ['evidence'], density: { max_chars: 400, max_elements: 8 },
    elements: [
      ...chapterHead(),
      lede(),
      { el: 'table', tag: 'div', role: 'table', slot: ['table'], required: true, hint: 'table: one header row, 3 to 6 rows of data, one line per cell', css: { left: 101, top: 400, width: 1718, height: 450, fontSize: 26, lineHeight: 1.5, extra: 'padding: 0;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'a one-line note', fit: true, css: { left: 101, top: 920, width: 1718, height: 70, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="data-table"] [data-el="table"] .table th, [data-layout="data-table"] [data-el="table"] .table td { padding: 16px 28px; }
[data-layout="data-table"] [data-el="table"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('What the update can carry ends where its template ends'), subtitle: t('Every section needs a template row of its own.'), table: { type: 'table', header: ['Section', 'Purpose', 'Written by', 'Read by'], rows: [['Progress', 'What moved this week', 'each lead', 'everyone'], ['Blockers', 'What is waiting on whom', 'the person blocked', 'the owner'], ['Decisions', 'What still needs a call', 'anyone', 'the leads']] }, caption: t('Written by and read by are only the minimum.') },
  },
  {
    id: 'quote', name: 'Quote: Warm Keynote', description: 'Under the chapter label, one block of pale teal holding the quote in large bold type, with the source below. A plain text slide would lose the pause.',
    content_relations: ['statement'], scene_roles: ['pause', 'hero', 'close'], density: { max_chars: 100, max_elements: 7 },
    elements: [
      ...chapterHead(false),
      { el: 'box', role: 'tint', css: { left: 101, top: 180, width: 1718, height: 320 } },
      { el: 'title', tag: 'h1', role: 'quote', slot: ['text'], required: true, hint: 'the quote itself, up to 3 lines and 60 characters; *keyword* turns teal', fit: true, css: { left: 161, top: 230, width: 1598, height: 220, fontSize: 46, lineHeight: 1.55 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'source or explanation', css: { left: 101, top: 540, width: 1718, height: 60, fontSize: 28, lineHeight: 1.6 } },
      pageChip(),
    ],
    sample: { kicker: t('03 — How'), meta: t('Principle'), title: t('Can it wait a *week*? Then it goes in writing; only what cannot wait gets a call.'), caption: t('The one rule that keeps the written update from turning into a second meeting'), page: t('05 / 08') },
  },
  {
    id: 'closing', name: 'Closing: Warm Keynote', description: 'A short teal rule, one closing headline, a lede and a reminder, then a row of pills: the main call to action plus a few key points. A "thank you" slide would lose the gesture of handing the next step to the audience.',
    content_relations: ['closing', 'statement'], scene_roles: ['close'], density: { max_chars: 220, max_elements: 7 },
    elements: [
      { el: 'bar', role: 'backdrop', css: { left: 120, top: 300, width: 82, height: 6 } },
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: 'closing claim, up to 2 lines', css: { left: 120, top: 340, width: 1680, height: 250, fontSize: 58, lineHeight: 1.28, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: 'a one-line lede', fit: true, css: { left: 120, top: 620, width: 1680, height: 60, fontSize: 32, lineHeight: 1.65 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'a one-line reminder that introduces the pills', css: { left: 120, top: 700, width: 1680, height: 44, fontSize: 28, lineHeight: '44px' } },
      { el: 'cta', tag: 'p', role: 'cta', slot: ['text'], required: true, hint: 'the main call to action, one short phrase, up to 12 characters', fit: true, css: { left: 120, top: 770, width: 620, height: 96, fontSize: 26, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 14px 30px; display: flex; align-items: center; justify-content: center;' } },
      { el: 'evidence', tag: 'div', role: 'flow', slot: ['list', 'text'], required: false, hint: 'a few key points, a pill for every point', css: { left: 780, top: 770, width: 1020, height: 160, fontSize: 26, lineHeight: 1.5 } },
      pageChip(),
    ],
    extraCss: `[data-layout="closing"] [data-el="evidence"] li { display: inline-block; padding: 10px 22px; margin: 0 16px 14px 0; }`,
    sample: { title: t('Whenever you wonder "does this need a meeting?", write it down first.'), body: t('Whether you want a second pair of eyes on it or the template set up for you, you are welcome.'), caption: t('When you are ready to start, we will settle these four questions with you:'), cta: t('Try it for a month'), evidence: list(['Which sections to keep', 'Who writes what', 'When to comment', 'What still needs a call']), page: t('08 / 08') },
  },
  {
    id: 'fact', name: 'Big number: Warm Keynote', description: 'Under the chapter label, one huge teal number with its label and an explanation below. A table would lose the punch of one number saying it all.',
    content_relations: ['evidence', 'statement'], scene_roles: ['evidence', 'hero', 'pause'], density: { max_chars: 120, max_elements: 6 },
    elements: [
      ...chapterHead(false),
      { el: 'fact', tag: 'div', role: 'stat', slot: ['metric', 'text'], required: true, hint: 'metric: value is the number, label the unit or explanation', css: { left: 101, top: 300, width: 1718, height: 420, fontSize: 40, lineHeight: 1.2 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'an explanation, 1 to 2 lines', fit: true, css: { left: 101, top: 760, width: 1718, height: 120, fontSize: 32, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="fact"] [data-el="fact"] .metric { justify-content: flex-start; }
[data-layout="fact"] [data-el="fact"] .metric-value { font-size: 240px; line-height: 1; }
[data-layout="fact"] [data-el="fact"] .metric-label { font-size: 36px; line-height: 1.4; margin-top: 24px; }`,
    sample: { kicker: t('01 — Why'), meta: t('Team leads'), fact: metric('62 min', 'the average status meeting last month'), caption: t('Every week the same updates are read aloud to people who could have read them in five minutes.'), page: t('02 / 08') },
  },
  {
    id: 'chart-aside', name: 'Chart and aside: Warm Keynote', description: 'Under the chapter head, a chart on the left (bar, progress, line or donut) and a glass card on the right holding an aside or a key number, with a note below. A plain table would lose the sense of proportion.',
    content_relations: ['evidence', 'comparison', 'sequence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 260, max_elements: 8 },
    elements: [
      ...chapterHead(),
      { el: 'chart', tag: 'div', role: 'chart', slot: ['chart'], required: true, hint: 'chart; kind progress reads most like a ranked bar list', css: { left: 101, top: 318, width: 1040, height: 560, fontSize: 32, lineHeight: 1.4 } },
      { el: 'aside', tag: 'div', role: 'card', slot: ['metric', 'text', 'chart'], required: false, hint: 'aside: one key number or a short paragraph', css: { left: 1170, top: 318, width: 649, height: 560, fontSize: 32, lineHeight: 1.6, extra: 'padding: 40px 36px;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'a one-line note', fit: true, css: { left: 101, top: 904, width: 1718, height: 70, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="chart-aside"] [data-el="aside"] .metric { justify-content: flex-start; }
[data-layout="chart-aside"] [data-el="aside"] .metric-value { font-size: 84px; line-height: 1; }
[data-layout="chart-aside"] [data-el="aside"] .metric-label { font-size: 32px; line-height: 1.4; margin-top: 18px; }
[data-layout="chart-aside"] [data-el="aside"] .metric-delta { font-size: 28px; line-height: 1.5; margin-top: 12px; }`,
    sample: { ...HEAD_SAMPLE, title: t('Start with the three sections everyone reads'), chart: { type: 'chart', kind: 'bar', series: [{ label: 'Progress', value: 41 }, { label: 'Blockers', value: 27 }, { label: 'Decisions', value: 19 }, { label: 'Everything else', value: 13 }], unit: '%', toggle: true }, aside: metric('87%', 'the top three combined', 'are the sections people scroll to first'), caption: t('The top three match in every team; click a legend entry during playback to drop one and compare again.') },
  },
  {
    id: 'tabs', name: 'Tabs: Warm Keynote', description: 'Chapter head and lede, then a glass card holding a few tabs, each with its own panel (a list, a table or a paragraph); clicking a tab during playback switches, static rendering shows only the first. Three separate slides would lose the comparison of switching inside the same frame.',
    content_relations: ['list', 'comparison', 'evidence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 320, max_elements: 7 },
    elements: [
      ...chapterHead(),
      lede(),
      { el: 'panels', tag: 'div', role: 'tabs', slot: ['tabs'], required: true, hint: '2 to 5 tabs, labels up to 6 characters; a panel holds 3 to 5 items or a small table; the first panel is what static rendering and QA see', css: { left: 101, top: 400, width: 1718, height: 500, fontSize: 32, lineHeight: 1.6, extra: 'padding: 0 40px 28px;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: 'a one-line note', fit: true, css: { left: 101, top: 920, width: 1718, height: 70, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="tabs"] [data-el="panels"] .tabs { gap: 0 8px; }
[data-layout="tabs"] [data-el="panels"] .tab { padding: 16px 26px; font-size: 28px; line-height: 1.3; }
[data-layout="tabs"] [data-el="panels"] .tab-panel { padding: 26px 8px 0; }
[data-layout="tabs"] [data-el="panels"] li { padding-left: 34px; margin-bottom: 14px; }
[data-layout="tabs"] [data-el="panels"] .table th, [data-layout="tabs"] [data-el="panels"] .table td { padding: 12px 24px; }
[data-layout="tabs"] [data-el="panels"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('One page, three readers, each with their own section'), subtitle: t('leads write the progress, owners answer the blockers, everyone reads the decisions.'), panels: { type: 'tabs', panels: [
      { label: 'leads', content: list(['Write: three lines per thread, numbers first', 'Review: read the other leads before Friday noon', 'Decide: mark what still needs a call']) },
      { label: 'owners', content: list(['Answer only the blockers with your name on them', 'One line: what unblocks it, and by when', 'Silence counts as agreement by Monday']) },
      { label: 'everyone', content: { type: 'table', header: ['What to do', 'Basis'], rows: [['Read the decisions', 'The Friday page'], ['Comment in place', 'The comment step']] } },
    ] }, caption: t('Click a tab during playback; static mode shows only the first panel.') },
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
  // every inner layout gets the progress ticks right before its page chip (the cover, kept by hand, has them too)
  L.elements = L.elements.flatMap((e) => (e.el === 'page' ? [progress(), e] : [e]));
  L.density = { ...L.density, max_elements: L.density.max_elements + 1 };
  const html = [`<section class="slide" data-layout="${L.id}">`];
  for (const e of L.elements) {
    if (e.svg) {
      html.push(`  <svg data-el="${e.el}" data-role="${e.role}" data-shape="${e.shape}" viewBox="${e.viewBox}" preserveAspectRatio="none" aria-hidden="true">${e.svg}</svg>`);
    } else if (e.slot) {
      html.push(`  <${e.tag} data-el="${e.el}" data-slot="${e.el}" data-role="${e.role}"${e.fit ? ' data-fit="true"' : ''}>{{${e.el}}}</${e.tag}>`);
    } else {
      html.push(`  <div data-el="${e.el}" data-role="${e.role}"></div>`);
    }
  }
  html.push('</section>', '');
  const css = [`/* warm-keynote/${L.id} — geometry only. Adapted from a colleague's 1600×900 deck (×1.2), with permission. */`];
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
