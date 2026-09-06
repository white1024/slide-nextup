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
    { el: 'kicker', tag: 'p', role: 'chapter', slot: ['text'], required: false, hint: '章節標籤，例如「01 — 為什麼做」；敘事逐頁有 chapter 時 scaffold 自動編號，否則留空（留空就連豎條一起消失）', css: { left: 101, top: 77, width: 1120, height: 41, fontSize: 28, lineHeight: '41px', extra: 'padding-left: 20px;' } },
    { el: 'meta', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: '右上角的膠囊標籤：對象、階段或場合，十字以內，自動填 occasion 的第一句；不需要就留空', css: { left: 1558, top: 72, width: 261, height: 50, fontSize: 24, lineHeight: '48px', textAlign: 'center' } },
  ];
  if (withTitle) els.push({ el: 'title', tag: 'h1', role: 'heading', slot: ['text'], required: true, hint: '一句話的頁面主張，兩行以內、二十四字以內；可用 *關鍵詞* 強調', css: { left: 101, top: 140, width: 1718, height: 150, fontSize: 55, lineHeight: 1.28, extra: 'text-wrap: balance;' } });
  return els;
}
const pageChip = () => ({ el: 'page', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: '頁碼膠囊，自動填「01 / 08」', css: { left: 1739, top: 1016, width: 150, height: 40, fontSize: 20, lineHeight: '38px', textAlign: 'center' } });
// the progress ticks at the bottom left: one tick per page, the current one lit. The theme draws
// them from the section's --page-index / --page-count (renderer + player), so every layout carries
// the same shape; the loop below slips it in before the page chip.
const progress = () => ({ el: 'progress', role: 'progress', css: { left: 31, top: 1050, width: 260, height: 6 } });
const lede = (top = 318, height = 60, hint = '一行導語，五十字以內') => ({ el: 'subtitle', tag: 'p', role: 'body', slot: ['text'], required: false, hint, fit: true, css: { left: 101, top, width: 1718, height, fontSize: 32, lineHeight: 1.6 } });
const note = (top, height = 110, id = 'caption', hint = '結尾的補充或提醒，一到兩行') => ({ el: id, tag: 'p', role: 'caption', slot: ['text'], required: false, hint, fit: true, css: { left: 101, top, width: 1718, height, fontSize: 28, lineHeight: 1.6 } });
const arrow = (el, css) => ({ el, role: 'connector', css, svg: '<line x1="2" y1="12" x2="30" y2="12"></line><polygon points="28,4 40,12 28,20"></polygon>', shape: 'arrow', viewBox: '0 0 41 24' });

const HEAD_SAMPLE = { kicker: t('01 — 為什麼做'), meta: t('員工端'), page: t('03 / 08') };

function cardsLayout(id, n, name, desc) {
  const gap = 29;
  const w = Math.floor((1718 - gap * (n - 1)) / n);
  const h = 340;
  const pad = n === 4 ? '32px 28px' : '40px 36px';
  const fs = 32; // content floor is 32px, four narrow cards included
  const els = [...chapterHead(), lede()];
  for (let i = 0; i < n; i++) {
    els.push({ el: `card-${i + 1}`, tag: 'div', role: 'card', slot: ['text', 'metric'], required: i < Math.min(2, n), hint: i === 0 ? '卡片：metric 的 value 是編號或字母、label 是標題、delta 是說明；或一段短文；可加 details（播放時點卡片展開的完整內容）' : '同上', css: { left: 101 + i * (w + gap), top: 410, width: w, height: h, fontSize: fs, lineHeight: 1.6, extra: `padding: ${pad};` } });
  }
  els.push(pageChip());
  const sample = { ...HEAD_SAMPLE, title: t('每件事都不難，難的是散在不同入口'), subtitle: t('四道小小的認知負擔加起來，就成了拖延。') };
  const cards = [
    { ...metric('A', '我有異常嗎？', '忘刷了自己不會知道'), details: list(['忘刷卡：系統不主動通知', '遲到早退：月底才在報表看到', '加班未申請：時數直接消失']) },
    metric('B', '要去哪處理？', '入口不在手邊，得先找'),
    metric('C', '規定怎麼算？', '翻手冊，或是去問 HR'),
    metric('D', '這樣填對嗎？', '填錯被退，再來一次'),
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
    id: 'section', name: '章節：暖色 Keynote', description: '章節開場：右上膠囊標籤、左邊一個淡青綠的巨大編號、青綠短線、大標與一段導語。改成一般標題頁會失去編號帶來的「翻到下一章」節奏。',
    content_relations: ['statement', 'list'], scene_roles: ['map', 'pause', 'relationship'], density: { max_chars: 120, max_elements: 6 },
    elements: [
      { el: 'meta', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: '右上角的膠囊標籤', css: { left: 1558, top: 72, width: 261, height: 50, fontSize: 24, lineHeight: '48px', textAlign: 'center' } },
      { el: 'number', tag: 'p', role: 'number', slot: ['text'], required: true, hint: '章節編號，兩位數', css: { left: 101, top: 290, width: 700, height: 220, fontSize: 200, lineHeight: 1 } },
      { el: 'rule', role: 'backdrop', css: { left: 101, top: 548, width: 82, height: 6 } },
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: '章節標題，一到兩行、十四字以內', css: { left: 101, top: 590, width: 1500, height: 200, fontSize: 76, lineHeight: 1.15, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: '一段導語，五十字以內', fit: true, css: { left: 101, top: 810, width: 1300, height: 110, fontSize: 32, lineHeight: 1.65 } },
      pageChip(),
    ],
    sample: { meta: t('第一章'), number: t('01'), title: t('為什麼一直改版面'), body: t('先看使用者怎麼描述問題，再看數字。'), page: t('02 / 08') },
  },
  {
    id: 'statement', name: '主張：暖色 Keynote', description: '一頁一個主張：章節頭、導語，下面一張玻璃卡片放支撐的條列。改成純文字頁會失去卡片把論點框起來的份量。',
    content_relations: ['statement', 'evidence', 'sequence'], scene_roles: ['evidence', 'relationship', 'pause'], density: { max_chars: 320, max_elements: 8 },
    elements: [
      ...chapterHead(),
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: '一到兩行導語', fit: true, css: { left: 101, top: 318, width: 1718, height: 110, fontSize: 32, lineHeight: 1.65 } },
      { el: 'slab', role: 'card', css: { left: 101, top: 452, width: 1718, height: 530 } },
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: false, hint: '三到五條支撐；每條一行', css: { left: 141, top: 492, width: 1638, height: 450, fontSize: 32, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="statement"] [data-el="evidence"] li { padding-left: 34px; margin-bottom: 18px; }`,
    sample: { ...HEAD_SAMPLE, title: t('我們改簡報的時間，花在版面'), body: t('上季六份簡報平均改四輪，其中三輪只動版面。'), evidence: list(['第一輪：換配色', '第二輪：換版型', '第三輪：內容其實沒動']) },
  },
  cardsLayout('cards', 3, '三張卡：暖色 Keynote', '章節頭加導語，下面三張玻璃卡片，各放編號、標題與一句說明。改成條列會失去卡片各自成立的並列感。'),
  cardsLayout('cards-2', 2, '兩張卡：暖色 Keynote', '章節頭加導語，下面兩張寬的玻璃卡片。兩個並列的概念用這個，不要硬塞第三張。'),
  cardsLayout('cards-4', 4, '四張卡：暖色 Keynote', '章節頭加導語，下面四張窄的玻璃卡片。四個並列的小點用這個；文字要短。'),
  {
    id: 'process', name: '流程：暖色 Keynote', description: '一條橫向流程：六個膠囊節點與五個箭頭，上面導語、下面提醒。改成條列會失去「一眼看完整條線」的效果。',
    content_relations: ['sequence'], scene_roles: ['relationship', 'map'], density: { max_chars: 260, max_elements: 18 },
    elements: (() => {
      const els = [...chapterHead(), lede()];
      for (let i = 0; i < 6; i++) {
        els.push({ el: `step-${i + 1}`, tag: 'div', role: 'pill', slot: ['text', 'metric'], required: i < 3, hint: i === 0 ? '步驟名，每行七字以內、兩行以內' : '同上；不需要就留空', css: { left: 101 + i * 297, top: 430, width: 232, height: 96, fontSize: 26, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 14px 16px; display: flex; align-items: center; justify-content: center;' } });
        if (i < 5) els.push(arrow(`arrow-${i + 1}`, { left: 101 + 232 + i * 297 + 12, top: 466, width: 41, height: 24 }));
      }
      els.push(note(560, 120, 'caption', '流程的提醒：最容易漏的一兩件事'));
      els.push(pageChip());
      return els;
    })(),
    sample: { ...HEAD_SAMPLE, title: t('固定六步的量測流程'), subtitle: t('一次完整量測是固定的六步，可中斷、可續跑。'), 'step-1': t('preflight'), 'step-2': t('download'), 'step-3': t('plan'), 'step-4': t('run'), 'step-5': t('aggregate'), 'step-6': t('export'), caption: t('run 不會自動產出結果檔，漏掉 export 等於跑完卻交不出東西。') },
  },
  {
    id: 'comparison', name: '起因與後果：暖色 Keynote', description: '左邊玻璃卡片放起因，右邊橘紅卡片放後果，中間一顆橘紅圓形箭頭。後果那張刻意比較重。改成左右對稱的兩欄會失去因果方向。',
    content_relations: ['comparison'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 320, max_elements: 14 },
    elements: [
      ...chapterHead(),
      { el: 'left', role: 'card', css: { left: 101, top: 318, width: 760, height: 650 } },
      { el: 'left-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: '左欄標題，例如「HR 的月底循環」', css: { left: 141, top: 358, width: 680, height: 50, fontSize: 32, lineHeight: '50px' } },
      { el: 'left-items', tag: 'div', role: 'list', slot: ['list'], required: true, hint: '左欄三到四條', css: { left: 141, top: 428, width: 680, height: 520, fontSize: 32, lineHeight: 1.6 } },
      { el: 'link', role: 'divider', css: { left: 881, top: 642, width: 178, height: 2 } },
      { el: 'badge', role: 'badge', css: { left: 938, top: 610, width: 65, height: 65 } },
      arrow('badge-arrow', { left: 954, top: 631, width: 33, height: 22 }),
      { el: 'right', role: 'alert', css: { left: 1059, top: 318, width: 760, height: 650 } },
      { el: 'right-title', tag: 'p', role: 'label-alert', slot: ['text'], required: true, hint: '右欄標題，例如「催不動的代價」', css: { left: 1099, top: 358, width: 680, height: 50, fontSize: 32, lineHeight: '50px' } },
      { el: 'right-items', tag: 'div', role: 'list-alert', slot: ['list'], required: true, hint: '右欄三到四條', css: { left: 1099, top: 428, width: 680, height: 520, fontSize: 32, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="comparison"] [data-el="left-items"] li, [data-layout="comparison"] [data-el="right-items"] li { padding-left: 34px; margin-bottom: 16px; }`,
    sample: { ...HEAD_SAMPLE, title: t('員工拖延，後果由 HR 扛'), 'left-title': t('HR 的月底循環'), 'left-items': list(['檢查異常：逐人比對打卡紀錄', '催員工補單：追第二次第三次', '答重複問題：同樣的問題每天答數十次']), 'right-title': t('催不動的代價'), 'right-items': list(['薪資算錯：HR 先被追究', '法遵風險：出勤不實與短付加班費', '時間黑洞：催繳與答詢吃掉工時']) },
  },
  {
    id: 'before-after', name: '之前之後：暖色 Keynote', description: '左邊沉底卡片放之前的步驟膠囊，右邊玻璃卡片放之後的青綠膠囊，下面一行提醒。改成兩個條列會失去「步驟變少」的視覺對比。',
    content_relations: ['comparison', 'sequence'], scene_roles: ['relationship', 'evidence'], density: { max_chars: 240, max_elements: 12 },
    elements: [
      ...chapterHead(),
      { el: 'before-box', role: 'sunk', css: { left: 101, top: 318, width: 844, height: 330 } },
      { el: 'before-label', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: '左欄小標，例如「BEFORE · 5 步」', css: { left: 141, top: 350, width: 764, height: 30, fontSize: 20, lineHeight: '30px' } },
      { el: 'before', tag: 'div', role: 'flow', slot: ['list', 'text'], required: true, hint: '之前的步驟，每條一個膠囊', css: { left: 141, top: 400, width: 764, height: 220, fontSize: 26, lineHeight: 1.5 } },
      { el: 'after-box', role: 'card', css: { left: 975, top: 318, width: 844, height: 330 } },
      { el: 'after-label', tag: 'p', role: 'eyebrow-accent', slot: ['text'], required: false, hint: '右欄小標，例如「AFTER · 3 步」', css: { left: 1015, top: 350, width: 764, height: 30, fontSize: 20, lineHeight: '30px' } },
      { el: 'after', tag: 'div', role: 'flow-accent', slot: ['list', 'text'], required: true, hint: '之後的步驟，每條一個膠囊', css: { left: 1015, top: 400, width: 764, height: 220, fontSize: 26, lineHeight: 1.5 } },
      note(680, 110),
      pageChip(),
    ],
    extraCss: `[data-layout="before-after"] [data-el="before"] li, [data-layout="before-after"] [data-el="after"] li { display: inline-block; padding: 10px 22px; margin: 0 36px 14px 0; }`,
    sample: { ...HEAD_SAMPLE, title: t('不是再多一個入口，是把功能送進對話'), 'before-label': t('BEFORE · 5 步'), before: list(['找入口', '查紀錄', '選表單', '填欄位', '送出']), 'after-label': t('AFTER · 3 步'), after: list(['收到通知', '確認預填內容', '送出']), caption: t('少掉的兩步，正是員工最常卡住的地方。') },
  },
  {
    id: 'photo', name: '圖：暖色 Keynote', description: '章節頭下面一張全寬的玻璃框，裡面放圖（系統圖、截圖），底下一行說明。改成小圖加文字會失去圖本身當主角的份量。',
    content_relations: ['evidence', 'statement'], scene_roles: ['hero', 'evidence', 'pause'], density: { max_chars: 120, max_elements: 8 },
    elements: [
      ...chapterHead(),
      { el: 'frame', role: 'card', css: { left: 101, top: 318, width: 1718, height: 600 } },
      { el: 'photo', tag: 'div', role: 'photo', slot: ['image'], required: true, hint: '圖片，建議 1678×560 或同比例；可加 hotspots（播放時點擊跳頁的區域，百分比定位）', css: { left: 121, top: 338, width: 1678, height: 560 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '一行圖說', fit: true, css: { left: 101, top: 934, width: 1718, height: 50, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    sample: { ...HEAD_SAMPLE, title: t('量測工具的骨架'), photo: { type: 'image', src: 'data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%279%27%3E%3Crect width=%2716%27 height=%279%27 fill=%27%23e6dcc4%27/%3E%3C/svg%3E', alt: '系統圖', hotspots: [{ target: 'cards', x: 56, y: 30, w: 16, h: 40, label: 'run 目錄：看設計原則' }] }, caption: t('設定與模型進來，走兩條路徑，落到同一個 run 目錄。') },
  },
  {
    id: 'data-table', name: '表格：暖色 Keynote', description: '章節頭、導語，下面一張玻璃容器裝表格，表頭是等寬大寫小字，底下一行註記。改成條列會失去欄與欄的對齊。',
    content_relations: ['comparison', 'evidence', 'list'], scene_roles: ['evidence'], density: { max_chars: 400, max_elements: 8 },
    elements: [
      ...chapterHead(),
      lede(),
      { el: 'table', tag: 'div', role: 'table', slot: ['table'], required: true, hint: '表格：表頭一列、三到六列資料；格子裡一行', css: { left: 101, top: 400, width: 1718, height: 450, fontSize: 26, lineHeight: 1.5, extra: 'padding: 0;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '一行註記', fit: true, css: { left: 101, top: 920, width: 1718, height: 70, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="data-table"] [data-el="table"] .table th, [data-layout="data-table"] [data-el="table"] .table td { padding: 16px 28px; }
[data-layout="data-table"] [data-el="table"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('Agent 的能力上限，就是工具規格的邊界'), subtitle: t('有幾項能力，就要寫幾支工具規格。'), table: { type: 'table', header: ['Tool', '用途', 'Input', 'Output'], rows: [['getAttendance', '查打卡紀錄', 'employeeId, date', 'clockIn, clockOut'], ['createCorrection', '建立補卡', 'employeeId, date, type', 'correctionId, status'], ['getLeaveBalance', '查剩餘假別', 'employeeId, leaveType', 'remainingDays']] }, caption: t('Input / Output 只是最低要求。') },
  },
  {
    id: 'quote', name: '引言：暖色 Keynote', description: '章節標籤下面一整塊青綠淡底的引言框，粗體大字，底下一行出處。改成一般文字頁會失去停頓感。',
    content_relations: ['statement'], scene_roles: ['pause', 'hero', 'close'], density: { max_chars: 100, max_elements: 7 },
    elements: [
      ...chapterHead(false),
      { el: 'box', role: 'tint', css: { left: 101, top: 180, width: 1718, height: 320 } },
      { el: 'title', tag: 'h1', role: 'quote', slot: ['text'], required: true, hint: '引言本文，三行以內、六十字以內；可用 *關鍵詞* 換青綠', fit: true, css: { left: 161, top: 230, width: 1598, height: 220, fontSize: 46, lineHeight: 1.55 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '出處或說明', css: { left: 101, top: 540, width: 1718, height: 60, fontSize: 28, lineHeight: 1.6 } },
      pageChip(),
    ],
    sample: { kicker: t('03 — 怎麼設計'), meta: t('原則'), title: t('說錯了會不會造成*法遵風險*？會，就寫死；只是語氣問題，才交給 LLM。'), caption: t('數字和法規一律寫死，語氣才交給 LLM'), page: t('05 / 08') },
  },
  {
    id: 'closing', name: '結尾：暖色 Keynote', description: '青綠短線、一句收尾大標、一行導語與一行提醒，最後一排膠囊：主要的行動呼籲加幾個要點。改成「謝謝」頁會失去把下一步交到對方手上的動作。',
    content_relations: ['closing', 'statement'], scene_roles: ['close'], density: { max_chars: 220, max_elements: 7 },
    elements: [
      { el: 'bar', role: 'backdrop', css: { left: 120, top: 300, width: 82, height: 6 } },
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: '收尾主張，兩行以內', css: { left: 120, top: 340, width: 1680, height: 250, fontSize: 58, lineHeight: 1.28, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: '一行導語', fit: true, css: { left: 120, top: 620, width: 1680, height: 60, fontSize: 32, lineHeight: 1.65 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '一行提醒，膠囊前的引言', css: { left: 120, top: 700, width: 1680, height: 44, fontSize: 28, lineHeight: '44px' } },
      { el: 'cta', tag: 'p', role: 'cta', slot: ['text'], required: true, hint: '主要的行動呼籲，一個短句、十二字以內', fit: true, css: { left: 120, top: 770, width: 620, height: 96, fontSize: 26, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 14px 30px; display: flex; align-items: center; justify-content: center;' } },
      { el: 'evidence', tag: 'div', role: 'flow', slot: ['list', 'text'], required: false, hint: '幾個要點，每條一個膠囊', css: { left: 780, top: 770, width: 1020, height: 160, fontSize: 26, lineHeight: 1.5 } },
      pageChip(),
    ],
    extraCss: `[data-layout="closing"] [data-el="evidence"] li { display: inline-block; padding: 10px 22px; margin: 0 16px 14px 0; }`,
    sample: { title: t('只要想到「這件事能不能交給 AI」，就可以來聊聊。'), body: t('不管是想讓 AI 陪你一起想，還是直接把任務交給它代工，都歡迎。'), caption: t('真的要動手時，這五題我們會陪你一起釐清：'), cta: t('找 AI 小組聊聊'), evidence: list(['需要哪些工具', '抽哪些欄位', '什麼時候追問', '要不要人工確認']), page: t('08 / 08') },
  },
  {
    id: 'fact', name: '大數字：暖色 Keynote', description: '章節標籤下面一個巨大的青綠數字與標籤，底下一段說明。改成表格會失去「一個數字講完」的力道。',
    content_relations: ['evidence', 'statement'], scene_roles: ['evidence', 'hero', 'pause'], density: { max_chars: 120, max_elements: 6 },
    elements: [
      ...chapterHead(false),
      { el: 'fact', tag: 'div', role: 'stat', slot: ['metric', 'text'], required: true, hint: 'metric：value 是數字、label 是單位或說明', css: { left: 101, top: 300, width: 1718, height: 420, fontSize: 40, lineHeight: 1.2 } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '一到兩行說明', fit: true, css: { left: 101, top: 760, width: 1718, height: 120, fontSize: 32, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="fact"] [data-el="fact"] .metric { justify-content: flex-start; }
[data-layout="fact"] [data-el="fact"] .metric-value { font-size: 240px; line-height: 1; }
[data-layout="fact"] [data-el="fact"] .metric-label { font-size: 36px; line-height: 1.4; margin-top: 24px; }`,
    sample: { kicker: t('01 — 為什麼做'), meta: t('員工端'), fact: metric('104,411', '名員工受影響'), caption: t('每一次要處理假勤，員工都得自己重新想過幾件事。'), page: t('02 / 08') },
  },
  {
    id: 'chart-aside', name: '圖表與旁註：暖色 Keynote', description: '章節頭下面左邊一張圖表（長條、進度、折線、環形），右邊一張玻璃卡片放旁註或關鍵數字，底下一行註記。改成純表格會失去比例感。',
    content_relations: ['evidence', 'comparison', 'sequence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 260, max_elements: 8 },
    elements: [
      ...chapterHead(),
      { el: 'chart', tag: 'div', role: 'chart', slot: ['chart'], required: true, hint: '圖表；progress 最像原版的長條列', css: { left: 101, top: 318, width: 1040, height: 560, fontSize: 32, lineHeight: 1.4 } },
      { el: 'aside', tag: 'div', role: 'card', slot: ['metric', 'text', 'chart'], required: false, hint: '旁註：一個關鍵數字或一段話', css: { left: 1170, top: 318, width: 649, height: 560, fontSize: 32, lineHeight: 1.6, extra: 'padding: 40px 36px;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '一行註記', fit: true, css: { left: 101, top: 904, width: 1718, height: 70, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="chart-aside"] [data-el="aside"] .metric { justify-content: flex-start; }
[data-layout="chart-aside"] [data-el="aside"] .metric-value { font-size: 84px; line-height: 1; }
[data-layout="chart-aside"] [data-el="aside"] .metric-label { font-size: 32px; line-height: 1.4; margin-top: 18px; }
[data-layout="chart-aside"] [data-el="aside"] .metric-delta { font-size: 28px; line-height: 1.5; margin-top: 12px; }`,
    sample: { ...HEAD_SAMPLE, title: t('先做用量最大的三張單'), chart: { type: 'chart', kind: 'bar', series: [{ label: '請假單', value: 37 }, { label: '加班單', value: 28 }, { label: '忘刷單', value: 20 }, { label: '公出差旅單', value: 9 }], unit: '%', toggle: true }, aside: metric('85%', '前三張加總', '是員工最常用的表單'), caption: t('各產業前三名一致；播放時點圖例可以拿掉一項再比。') },
  },
  {
    id: 'tabs', name: '分頁籤：暖色 Keynote', description: '章節頭、導語，下面一張玻璃卡片裝幾個頁籤，各放一個面板（條列、表格或一段話），播放時點頁籤切換，靜態只看第一個。改成三頁會失去「同一個框裡切換比較」的對照感。',
    content_relations: ['list', 'comparison', 'evidence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 320, max_elements: 7 },
    elements: [
      ...chapterHead(),
      lede(),
      { el: 'panels', tag: 'div', role: 'tabs', slot: ['tabs'], required: true, hint: '二到五個頁籤，標籤六字以內；每個面板三到五條或一張小表格，第一個面板是靜態與 QA 看到的', css: { left: 101, top: 400, width: 1718, height: 500, fontSize: 32, lineHeight: 1.6, extra: 'padding: 0 40px 28px;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '一行註記', fit: true, css: { left: 101, top: 920, width: 1718, height: 70, fontSize: 26, lineHeight: 1.6 } },
      pageChip(),
    ],
    extraCss: `[data-layout="tabs"] [data-el="panels"] .tabs { gap: 0 8px; }
[data-layout="tabs"] [data-el="panels"] .tab { padding: 16px 26px; font-size: 28px; line-height: 1.3; }
[data-layout="tabs"] [data-el="panels"] .tab-panel { padding: 26px 8px 0; }
[data-layout="tabs"] [data-el="panels"] li { padding-left: 34px; margin-bottom: 14px; }
[data-layout="tabs"] [data-el="panels"] .table th, [data-layout="tabs"] [data-el="panels"] .table td { padding: 12px 24px; }
[data-layout="tabs"] [data-el="panels"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('同一份交付包，三種人各看自己的文件'), subtitle: t('operator 跑量測、viewer 看結果、new-platform 接新平台，各有一份角色文件。'), panels: { type: 'tabs', panels: [
      { label: 'operator', content: list(['整備機器：跑 preflight，缺件就停', '量測：固定六步，可中斷續跑', '交付：export 才有 result.json']) },
      { label: 'viewer', content: list(['只看 result.json，不碰 run 目錄', '摘要四格、色階圖、折線圖', '完整表格在展開層']) },
      { label: 'new-platform', content: { type: 'table', header: ['要做的事', '依據'], rows: [['產出 result.json', 'Result Schema v1'], ['通過 smoke', '交付包的 preflight']] } },
    ] }, caption: t('播放時點頁籤切換；靜態模式只顯示第一個面板。') },
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
