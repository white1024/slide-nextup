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
const kicker = () => ({ el: 'kicker', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: '左上角的章節標籤，例如「01 — 為什麼做」；敘事逐頁有 chapter 時 scaffold 自動編號，否則留空', css: { left: M, top: 62, width: 1100, height: 36, fontSize: 24, lineHeight: '36px' } });
const chip = () => ({ el: 'meta', tag: 'p', role: 'chip', slot: ['text'], required: false, hint: '右上角的圓角標籤：對象、階段或場合，十字以內，自動填 occasion 的第一句；不需要就留空', css: { left: 1563, top: 58, width: 280, height: 44, fontSize: 22, lineHeight: '44px', textAlign: 'center', extra: 'padding: 0 24px;' } });
const heading = () => ({ el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: '一句話的頁面主張，兩行以內、二十六字以內；可用 *關鍵詞* 強調（藍色）', css: { left: M, top: 128, width: W, height: 140, fontSize: 56, lineHeight: 1.2, extra: 'text-wrap: balance;' } });
const head = () => [kicker(), chip(), heading()];
const lede = (top = 292, height = 56, hint = '一行導語，五十字以內') => ({ el: 'subtitle', tag: 'p', role: 'subtitle', slot: ['text'], required: false, hint, fit: true, css: { left: M, top, width: W, height, fontSize: 32, lineHeight: 1.6 } });
const note = (top, height = 60, id = 'caption', hint = '一行註記或提醒') => ({ el: id, tag: 'p', role: 'caption', slot: ['text'], required: false, hint, fit: true, css: { left: M, top, width: W, height, fontSize: 26, lineHeight: 1.6 } });
const pageNo = () => ({ el: 'page', tag: 'p', role: 'meta', slot: ['text'], required: false, hint: '頁碼，自動填「01 / 08」', css: { left: 58, top: 1029, width: 200, height: 24, fontSize: 20, lineHeight: '24px' } });
// the template's fixed progress bar: the theme fills index/count of this box from the section's --page-index / --page-count
const progress = () => ({ el: 'progress', role: 'progress', css: { left: 0, top: 1077, width: 1920, height: 3 } });
// the 60×4 cobalt rule
const rule = (el, left, top) => ({ el, role: 'backdrop', css: { left, top, width: 60, height: 4 } });

const HEAD_SAMPLE = { kicker: t('02 — 營運現況'), meta: t('季度回顧'), page: t('03 / 10') };
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%279%27%3E%3Crect width=%2716%27 height=%279%27 fill=%27%23ebe9e9%27/%3E%3C/svg%3E';

function cardsLayout(id, n, name, desc) {
  const gap = 36;
  const w = Math.floor((W - gap * (n - 1)) / n);
  const els = [...head(), lede()];
  for (let i = 0; i < n; i++) {
    els.push({ el: `card-${i + 1}`, tag: 'div', role: 'card', slot: ['text', 'metric'], required: i < Math.min(2, n), hint: i === 0 ? '卡片：metric 的 value 是大數字、label 是標題、delta 是說明；或一段短文；可加 details（播放時點卡片展開的完整內容）' : '同上', css: { left: M + i * (w + gap), top: 380, width: w, height: 480, fontSize: 32, lineHeight: 1.6, extra: `padding: ${n === 4 ? '32px 28px' : '40px 36px'};` } });
  }
  els.push(pageNo());
  const sample = { ...HEAD_SAMPLE, title: t('三個數字說明這一季的變化'), subtitle: t('與上一季相比，慢頁面變少、無回饋的表單變少，重複回到待辦的問題還在。') };
  const cards = [
    { ...metric('−38%', '慢頁面減少', '首頁與列表頁的載入時間都回到三秒內'), details: list(['行動版首頁：4.1 秒 → 2.6 秒', '列表頁：3.8 秒 → 2.4 秒', '圖片改為延遲載入是主要原因']) },
    metric('12 件', '表單補上回饋', '送出後的等待狀態與成功訊息都有了'),
    metric('3 次', '重複回到待辦', '同一個問題被指派三次，流程仍缺負責人'),
    metric('2 週', '平均修復時間', '從回報到上線的中位數'),
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
    id: 'cover', name: '封面：藍色專業', description: '顧問報告的封面：右側一片斜切的淡色面、右下 3×3 小點陣，左側系列名、短藍線、標題、導語與一行 meta，左下頁碼、底部進度條。改成置中標題頁會失去「文件感」的左對齊節奏與斜切面的份量。',
    content_relations: ['statement'], scene_roles: ['hero'], density: { max_chars: 200 },
    elements: [
      { el: 'panel', role: 'tint', css: { left: 1248, top: 0, width: 672, height: 1080, extra: 'clip-path: polygon(30% 0, 100% 0, 100% 100%, 0 100%);' } },
      { el: 'dots', role: 'dots', css: { left: 1718, top: 902, width: 48, height: 48 } },
      { el: 'brand', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: '系列名或簡報名，自動填敘事標題冒號前的部分；不需要就留空', css: { left: 154, top: 262, width: 900, height: 36, fontSize: 24, lineHeight: '36px' } },
      rule('accent', 154, 323),
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: '主張式標題，一到兩行，十六字以內；可用 *關鍵詞* 強調（藍色）', css: { left: 154, top: 351, width: 1056, height: 200, fontSize: 88, lineHeight: 1.05, extra: 'text-wrap: balance;' } },
      { el: 'subtitle', tag: 'p', role: 'subtitle', slot: ['text'], required: false, hint: '一到兩行導語，四十五字以內', fit: true, css: { left: 154, top: 565, width: 768, height: 104, fontSize: 32, lineHeight: 1.6 } },
      { el: 'meta', tag: 'p', role: 'meta', slot: ['text'], required: false, hint: '場合、日期或機密等級，自動填 occasion 的第一句（十字以內）', css: { left: 154, top: 713, width: 900, height: 32, fontSize: 20, lineHeight: '32px' } },
      pageNo(),
    ],
    sample: { brand: t('季度營運回顧'), title: t('先修*等待*，再談功能'), subtitle: t('三個月的量測說明：使用者流失在載入與表單，不在功能清單。'), meta: t('季度回顧 · 2026-09 · 內部'), page: t('01 / 10') },
  },
  {
    id: 'agenda', name: '議程：藍色專業', description: '目錄頁：標題下一條短藍線，六個編號項目排成兩欄三列，每項是藍色序號、小標與一句說明，底下細線分隔。改成一條清單會失去「六件事各自成格」的掃視節奏。',
    content_relations: ['list', 'hierarchy', 'sequence'], scene_roles: ['map'], density: { max_chars: 320 },
    elements: (() => {
      const els = [...head(), rule('accent', M, 292)];
      for (let i = 0; i < 6; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        els.push({ el: `item-${i + 1}`, tag: 'div', role: 'entry', slot: ['text', 'metric'], required: i < 2, hint: i === 0 ? '議程項目：metric 的 value 是序號（01）、label 是小標、delta 是一句說明；或一段短文' : '同上；不需要就留空', css: { left: M + col * 907, top: 330 + row * 216, width: 859, height: 200, fontSize: 32, lineHeight: 1.4, extra: 'padding: 20px 24px;' } });
      }
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="agenda"] [data-role="entry"] .metric { display: grid; grid-template-columns: 96px 1fr; grid-template-rows: auto auto; column-gap: 24px; align-content: center; justify-items: start; }
[data-layout="agenda"] [data-role="entry"] .metric-value { grid-row: 1 / span 2; align-self: center; font-size: 48px; line-height: 1; }
[data-layout="agenda"] [data-role="entry"] .metric-label { font-size: 32px; line-height: 1.3; }
[data-layout="agenda"] [data-role="entry"] .metric-delta { font-size: 28px; line-height: 1.45; margin-top: 8px; }`,
    sample: { ...HEAD_SAMPLE, kicker: t('目錄'), meta: t('總覽'), title: t('這場回顧要談的六件事'), 'item-1': metric('01', '現況盤點', '三個月的健檢數據怎麼看'), 'item-2': metric('02', '風險排序', '哪些問題先修、哪些可以等'), 'item-3': metric('03', '投入配置', '人力與預算往哪裡移'), 'item-4': metric('04', '季度目標', '下一季要交出的三件事'), 'item-5': metric('05', '風險與機會', '守成與進攻的取捨'), 'item-6': metric('06', '結論與下一步', '會後誰要做什麼'), page: t('02 / 10') },
  },
  {
    id: 'section', name: '章節：藍色專業', description: '章節開場：系列名與右上標籤，左邊一個巨大的藍色編號、短藍線、章節標題與一段導語。改成一般標題頁會失去編號帶來的「翻到下一章」節奏。',
    content_relations: ['statement', 'list'], scene_roles: ['map', 'pause', 'relationship'], density: { max_chars: 140 },
    elements: [
      { el: 'brand', tag: 'p', role: 'eyebrow', slot: ['text'], required: false, hint: '系列名或簡報名，自動填；不需要就留空', css: { left: M, top: 62, width: 1100, height: 36, fontSize: 24, lineHeight: '36px' } },
      chip(),
      { el: 'number', tag: 'p', role: 'number', slot: ['text'], required: true, hint: '章節編號，兩位數', css: { left: M, top: 236, width: 900, height: 290, fontSize: 240, lineHeight: 1.1 } },
      rule('accent', M, 560),
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: '章節標題，一到兩行、十四字以內', css: { left: M, top: 600, width: 1500, height: 180, fontSize: 72, lineHeight: 1.2, extra: 'text-wrap: balance;' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: '一到兩行導語，六十字以內', fit: true, css: { left: M, top: 800, width: 1300, height: 110, fontSize: 32, lineHeight: 1.65 } },
      pageNo(),
    ],
    sample: { brand: t('季度營運回顧'), meta: t('第二章'), number: t('02'), title: t('營運現況：數字先於判斷'), body: t('先看三個月的量測結果，再談哪些該修、哪些可以等。'), page: t('02 / 10') },
  },
  {
    id: 'statement', name: '主張：藍色專業', description: '一頁一個主張：左欄是帶藍線的支撐條列，右欄隔一條細線放淡藍底的主張框、三張小數字卡與一行補充。改成純文字頁會失去「證據在左、結論在右」的閱讀方向。',
    content_relations: ['statement', 'evidence', 'sequence'], scene_roles: ['evidence', 'relationship', 'pause'], density: { max_chars: 360 },
    elements: [
      ...head(),
      { el: 'evidence', tag: 'div', role: 'list', slot: ['list', 'text'], required: false, hint: '三到五條支撐；每條兩行以內', css: { left: M, top: 300, width: 880, height: 560, fontSize: 32, lineHeight: 1.55 } },
      { el: 'split', role: 'divider', css: { left: 981, top: 300, width: 2, height: 660 } },
      { el: 'body', tag: 'p', role: 'highlight', slot: ['text'], required: false, hint: '主張的一句話或引言，三行以內、五十字以內', fit: true, css: { left: 1013, top: 300, width: 830, height: 250, fontSize: 34, lineHeight: 1.45, extra: 'padding: 32px 36px;' } },
      ...[1, 2, 3].map((i) => ({ el: `stat-${i}`, tag: 'div', role: 'stat', slot: ['metric', 'text'], required: false, hint: i === 1 ? '小數字卡：metric 的 value 是數字、label 是說明（八字以內）；不需要就留空' : '同上', css: { left: 1013 + (i - 1) * 283, top: 582, width: 263, height: 180, fontSize: 32, lineHeight: 1.3, extra: 'padding: 20px 22px;' } })),
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '右欄的補充說明，兩行以內', fit: true, css: { left: 1013, top: 790, width: 830, height: 100, fontSize: 28, lineHeight: 1.6 } },
      pageNo(),
    ],
    extraCss: `[data-layout="statement"] [data-el="evidence"] li { padding-left: 24px; margin-bottom: 18px; }
[data-layout="statement"] [data-role="stat"] .metric { justify-content: flex-start; }
[data-layout="statement"] [data-role="stat"] .metric-value { font-size: 48px; line-height: 1; }
[data-layout="statement"] [data-role="stat"] .metric-label { font-size: 28px; line-height: 1.35; margin-top: 10px; }`,
    sample: { ...HEAD_SAMPLE, title: t('先修會影響交付的三個問題，其餘排進下一季'), evidence: list(['首頁載入超過三秒的頁面佔兩成，且集中在行動版', '有三成的表單送出後沒有回饋，使用者會重複送出', '監控只看主機，看不到使用者實際的等待時間', '修復流程沒有負責人，同一個問題會回到待辦三次']), body: t('「不是所有問題都值得現在修，但這三個會直接影響交付。」'), 'stat-1': metric('20%', '慢頁面佔比'), 'stat-2': metric('3 成', '無回饋表單'), 'stat-3': metric('3 次', '重複回到待辦'), caption: t('其餘十二項列在附錄，依影響與成本排序，下一季再談。') },
  },
  cardsLayout('cards', 3, '三張卡：藍色專業', '標題與導語下面三張淡藍底的圓角卡片，各放一個藍色大數字、粗體標題與一句說明。改成條列會失去卡片各自成立的並列感。'),
  cardsLayout('cards-2', 2, '兩張卡：藍色專業', '標題與導語下面兩張寬的淡藍底卡片。兩個並列的概念用這個，不要硬塞第三張。'),
  cardsLayout('cards-4', 4, '四張卡：藍色專業', '標題與導語下面四張窄的淡藍底卡片。四個並列的小點用這個；文字要短。'),
  {
    id: 'dashboard', name: '儀表板：藍色專業', description: '六格數據：標題下三欄兩列的淡藍底格子，各放一個藍色數字、指標名稱與一行細線隔開的脈絡。改成表格會失去每個數字各自被框住的份量。',
    content_relations: ['evidence', 'list', 'comparison'], scene_roles: ['evidence', 'map'], density: { max_chars: 360 },
    elements: (() => {
      const els = [...head()];
      for (let i = 0; i < 6; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        els.push({ el: `stat-${i + 1}`, tag: 'div', role: 'stat', slot: ['metric', 'text'], required: i < 3, hint: i === 0 ? '數據格：metric 的 value 是數字、label 是指標名稱（十五字以內）、delta 是一行脈絡；可加 details' : '同上；不需要就留空', css: { left: M + col * 598, top: 300 + row * 354, width: 570, height: 330, fontSize: 32, lineHeight: 1.35, extra: 'padding: 32px 36px;' } });
      }
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="dashboard"] [data-role="stat"] .metric { justify-content: flex-start; }
[data-layout="dashboard"] [data-role="stat"] .metric-value { font-size: 64px; line-height: 1; }
[data-layout="dashboard"] [data-role="stat"] .metric-label { font-size: 32px; line-height: 1.35; margin-top: 14px; }
[data-layout="dashboard"] [data-role="stat"] .metric-delta { font-size: 28px; line-height: 1.45; margin-top: 16px; padding-top: 14px; }`,
    sample: { ...HEAD_SAMPLE, title: t('六個指標看這一季的體質'), 'stat-1': metric('98.7%', '可用率', '較上季持平，兩次短暫中斷都在維護時段'), 'stat-2': metric('2.6 秒', '首頁載入中位數', '較上季快 1.5 秒，行動版改善最多'), 'stat-3': metric('412', '本季回報問題數', '其中六成在兩週內關閉'), 'stat-4': metric('61%', '兩週內關閉率', '上季 44%，流程加了負責人後改善'), 'stat-5': metric('17', '待辦超過一個月', '多為需要改架構的項目'), 'stat-6': metric('4.6', '滿意度（5 分）', '抽樣兩百位使用者的問卷') },
  },
  {
    id: 'chart-aside', name: '圖表與旁註：藍色專業', description: '標題下面左邊一張圖表（橫條排名、進度、折線、環形），右邊一張淡藍底卡片放旁註或關鍵數字，底下一行註記。改成純表格會失去比例感。',
    content_relations: ['evidence', 'comparison', 'sequence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 260 },
    elements: [
      ...head(),
      { el: 'chart', tag: 'div', role: 'chart', slot: ['chart'], required: true, hint: '圖表：bar 或 progress 最像原版的橫條排名，也可 line、donut', css: { left: M, top: 300, width: 1140, height: 620, fontSize: 32, lineHeight: 1.4 } },
      { el: 'aside', tag: 'div', role: 'card', slot: ['metric', 'text', 'chart'], required: false, hint: '旁註：一個關鍵數字或一段話', css: { left: 1257, top: 300, width: 586, height: 620, fontSize: 32, lineHeight: 1.6, extra: 'padding: 40px 36px;' } },
      note(944, 48),
      pageNo(),
    ],
    extraCss: `[data-layout="chart-aside"] [data-el="aside"] .metric { justify-content: flex-start; }
[data-layout="chart-aside"] [data-el="aside"] .metric-value { font-size: 84px; line-height: 1; }
[data-layout="chart-aside"] [data-el="aside"] .metric-label { font-size: 32px; line-height: 1.4; margin-top: 18px; }
[data-layout="chart-aside"] [data-el="aside"] .metric-delta { font-size: 28px; line-height: 1.5; margin-top: 12px; }`,
    sample: { ...HEAD_SAMPLE, title: t('使用者最在意的是等待，不是功能'), chart: { type: 'chart', kind: 'bar', series: [{ label: '頁面載入慢', value: 79 }, { label: '表單沒有回饋', value: 69 }, { label: '搜尋找不到', value: 39 }, { label: '行動版排版跑掉', value: 37 }, { label: '通知太多', value: 25 }], unit: '%', toggle: true }, aside: metric('79%', '把「等待」排在第一', '每五位受訪者就有四位提到載入時間'), caption: t('抽樣兩百位使用者，複選；播放時點圖例可以拿掉一項再比。') },
  },
  {
    id: 'process', name: '流程：藍色專業', description: '一條橫向流程：六個編號的藍色圓形節點，越後面越淡，節點之間一截細線，下面是步驟名與一句說明，最後一行提醒。改成條列會失去「一眼看完整條線」的效果。',
    content_relations: ['sequence'], scene_roles: ['relationship', 'map'], density: { max_chars: 300 },
    elements: (() => {
      const els = [...head(), lede()];
      for (let i = 0; i < 6; i++) {
        els.push({ el: `step-${i + 1}`, tag: 'div', role: 'step', tone: `s${i + 1}`, slot: ['text', 'metric'], required: i < 3, hint: i === 0 ? '步驟：text 是步驟名（每行八字以內）；metric 的 value 是步驟名、label 是一句說明' : '同上；不需要就留空（節點與連線一起消失）', css: { left: M + i * 294, top: 400, width: 294, height: 440, fontSize: 32, lineHeight: 1.3, textAlign: 'center', extra: 'padding: 100px 16px 0;' } });
      }
      els.push(note(880, 100, 'caption', '流程的提醒：最容易漏的一兩件事'));
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="process"] [data-role="step"] .metric { justify-content: flex-start; }
[data-layout="process"] [data-role="step"] .metric-value { font-size: 32px; line-height: 1.3; }
[data-layout="process"] [data-role="step"] .metric-label { font-size: 28px; line-height: 1.5; margin-top: 12px; }`,
    sample: { ...HEAD_SAMPLE, title: t('每季固定六步，可中斷、可續跑'), subtitle: t('每一步都有產出物，跳過任何一步下一步就做不下去。'), 'step-1': metric('盤點', '列出本季所有回報'), 'step-2': metric('排序', '依影響與成本分級'), 'step-3': metric('指派', '每項一個負責人'), 'step-4': metric('修復', '兩週一個循環'), 'step-5': metric('驗證', '用同一套量測重跑'), 'step-6': metric('回顧', '把結果寫進下一季'), caption: t('最常漏的是驗證：修完不重跑量測，等於沒有修。') },
  },
  {
    id: 'comparison', name: '對照：藍色專業', description: '左右兩張淡藍底卡片，各有一個粗體欄名與帶藍線的條列；右邊那張加藍色邊框，是結論要落的那一邊。改成上下兩段會失去並排對照的張力。',
    content_relations: ['comparison'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 360 },
    elements: [
      ...head(),
      { el: 'left', role: 'card', css: { left: M, top: 300, width: 859, height: 660 } },
      { el: 'left-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: '左欄名稱，二到八個字', css: { left: M + 40, top: 340, width: 779, height: 52, fontSize: 36, lineHeight: '52px' } },
      { el: 'left-items', tag: 'div', role: 'list', slot: ['list'], required: true, hint: '三到五條，每條兩行以內', css: { left: M + 40, top: 412, width: 779, height: 520, fontSize: 32, lineHeight: 1.55 } },
      { el: 'right', role: 'card', tone: 'accent', css: { left: 984, top: 300, width: 859, height: 660 } },
      { el: 'right-title', tag: 'p', role: 'label', slot: ['text'], required: true, hint: '右欄名稱，二到八個字', css: { left: 1024, top: 340, width: 779, height: 52, fontSize: 36, lineHeight: '52px' } },
      { el: 'right-items', tag: 'div', role: 'list', slot: ['list'], required: true, hint: '三到五條，每條兩行以內', css: { left: 1024, top: 412, width: 779, height: 520, fontSize: 32, lineHeight: 1.55 } },
      pageNo(),
    ],
    extraCss: `[data-layout="comparison"] [data-el="left-items"] li, [data-layout="comparison"] [data-el="right-items"] li { padding-left: 24px; margin-bottom: 16px; }`,
    sample: { ...HEAD_SAMPLE, title: t('先守住交付，再談新功能'), 'left-title': t('守成：先修的'), 'left-items': list(['首頁與列表頁的載入時間', '表單送出後的回饋', '監控補上使用者端的等待時間', '修復流程指定負責人']), 'right-title': t('進攻：下一季再排'), 'right-items': list(['搜尋結果的相關性', '行動版的排版重整', '通知的頻率與分類', '報表匯出']) },
  },
  {
    id: 'photo', name: '圖：藍色專業', description: '標題下面一張全寬的淡藍框放圖（系統圖、截圖），底下一行說明。改成小圖加文字會失去圖本身當主角的份量。',
    content_relations: ['evidence', 'statement'], scene_roles: ['hero', 'evidence', 'pause'], density: { max_chars: 120 },
    elements: [
      ...head(),
      { el: 'photo', tag: 'div', role: 'photo', slot: ['image'], required: true, hint: '圖片，建議 1766×620 或同比例，會以 cover 方式裁切；可加 hotspots（播放時點擊跳頁的區域，百分比定位）', css: { left: M, top: 300, width: W, height: 620 } },
      note(944, 48, 'caption', '一行圖說'),
      pageNo(),
    ],
    sample: { ...HEAD_SAMPLE, title: t('量測從使用者這一端開始'), photo: { type: 'image', src: PLACEHOLDER_IMAGE, alt: '系統圖', hotspots: [{ target: 'cards', x: 56, y: 30, w: 16, h: 40, label: '看三個數字' }] }, caption: t('瀏覽器端的等待時間先進監控，再對回主機的日誌。') },
  },
  {
    id: 'data-table', name: '表格：藍色專業', description: '標題、導語，下面一張淡藍框裝表格，表頭是藍色大寫小字加藍色底線，底下一行註記。改成條列會失去欄與欄的對齊。',
    content_relations: ['comparison', 'evidence', 'list'], scene_roles: ['evidence'], density: { max_chars: 400 },
    elements: [
      ...head(),
      lede(),
      { el: 'table', tag: 'div', role: 'table', slot: ['table'], required: true, hint: '表格：表頭一列、三到六列資料；每格一到十個字', css: { left: M, top: 380, width: W, height: 500, fontSize: 28, lineHeight: 1.5, extra: 'padding: 8px 12px;' } },
      note(910, 60, 'caption', '一行註記或資料來源'),
      pageNo(),
    ],
    extraCss: `[data-layout="data-table"] [data-el="table"] .table th, [data-layout="data-table"] [data-el="table"] .table td { padding: 16px 28px; }
[data-layout="data-table"] [data-el="table"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('四個指標，上季與本季並排看'), subtitle: t('變化欄是本季減上季；負值代表變快或變少。'), table: { type: 'table', header: ['指標', '上季', '本季', '變化'], rows: [['首頁載入中位數', '4.1 秒', '2.6 秒', '−1.5 秒'], ['兩週內關閉率', '44%', '61%', '+17 pts'], ['待辦超過一個月', '23', '17', '−6'], ['滿意度（5 分）', '4.2', '4.6', '+0.4']] }, caption: t('資料來源：本季量測與問卷；問卷抽樣兩百位。') },
  },
  {
    id: 'quote', name: '引言：藍色專業', description: '置中的一段引言：上方一個淡藍的引號、粗體大字，底下一行出處；左上一個細圓環、右下一個淡藍圓點。改成一般文字頁會失去停頓感。',
    content_relations: ['statement'], scene_roles: ['pause', 'hero', 'close'], density: { max_chars: 120 },
    elements: [
      kicker(),
      chip(),
      { el: 'ring', role: 'ring', css: { left: 96, top: 108, width: 80, height: 80 } },
      { el: 'orb', role: 'orb', css: { left: 1728, top: 890, width: 60, height: 60 } },
      { el: 'mark', role: 'quote-mark', svg: '<path d="M3 3h8v7c0 4.4-2.6 7.2-7 8v-3.2c2-.5 3.1-1.8 3.3-3.8H3V3zm11 0h8v7c0 4.4-2.6 7.2-7 8v-3.2c2-.5 3.1-1.8 3.3-3.8H14V3z"/>', shape: 'quote', viewBox: '0 0 25 20', css: { left: 910, top: 268, width: 100, height: 80 } },
      { el: 'title', tag: 'h1', role: 'quote', slot: ['text'], required: true, hint: '引言本文，三行以內、六十字以內；可用 *關鍵詞* 換藍色', fit: true, css: { left: 335, top: 400, width: 1250, height: 240, fontSize: 56, lineHeight: 1.4, textAlign: 'center', extra: 'text-wrap: balance;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '出處：誰說的、在哪個場合，一行', css: { left: 335, top: 680, width: 1250, height: 48, fontSize: 28, lineHeight: 1.6, textAlign: 'center' } },
      pageNo(),
    ],
    sample: { kicker: t('03 — 判斷'), meta: t('原則'), title: t('先把*等待*修掉，功能才有人用；使用者不會為了新功能忍受慢。'), caption: t('產品負責人，季度回顧會議'), page: t('05 / 10') },
  },
  {
    id: 'closing', name: '結尾：藍色專業', description: '置中收尾：背後兩個同心的細圓環，短藍線、一句收尾大標、一段說明、一顆實心藍色膠囊按鈕當行動呼籲，最後一行聯絡方式。改成「謝謝」頁會失去把下一步交到對方手上的動作。',
    content_relations: ['closing', 'statement'], scene_roles: ['close'], density: { max_chars: 200 },
    elements: [
      { el: 'ring-big', role: 'ring', tone: 'faint', css: { left: 710, top: 290, width: 500, height: 500 } },
      { el: 'ring-small', role: 'ring', tone: 'faint', css: { left: 780, top: 360, width: 360, height: 360 } },
      rule('accent', 930, 330),
      { el: 'title', tag: 'h1', role: 'title', slot: ['text'], required: true, hint: '收尾主張，一行、十六字以內', css: { left: 160, top: 370, width: 1600, height: 110, fontSize: 88, lineHeight: 1.1, textAlign: 'center' } },
      { el: 'body', tag: 'p', role: 'body', slot: ['text'], required: false, hint: '一到兩行說明，五十字以內', fit: true, css: { left: 460, top: 520, width: 1000, height: 104, fontSize: 32, lineHeight: 1.6, textAlign: 'center' } },
      { el: 'cta', tag: 'p', role: 'cta', slot: ['text'], required: true, hint: '主要的行動呼籲，一個短句、十二字以內', fit: true, css: { left: 700, top: 680, width: 520, height: 84, fontSize: 28, lineHeight: '84px', textAlign: 'center', extra: 'padding: 0 40px;' } },
      { el: 'caption', tag: 'p', role: 'caption', slot: ['text'], required: false, hint: '聯絡方式或下一次見面的時間，一行', css: { left: 460, top: 820, width: 1000, height: 40, fontSize: 24, lineHeight: '40px', textAlign: 'center' } },
      pageNo(),
    ],
    sample: { title: t('先修等待，再談功能'), body: t('這一季把三個影響交付的問題修掉，下一季才有餘裕做新的東西。'), cta: t('下週三前回覆優先順序'), caption: t('回顧資料與附錄放在共用資料夾，會後一小時內更新'), page: t('10 / 10') },
  },
  {
    id: 'detail', name: '細節：藍色專業', description: '兩欄兩列四個淡藍底區塊，各有一個粗體小標與帶藍線的兩到三條要點。改成一條長清單會失去「四件事各自成組」的分類感。',
    content_relations: ['list', 'hierarchy', 'evidence'], scene_roles: ['evidence', 'map'], density: { max_chars: 400 },
    elements: (() => {
      const els = [...head()];
      for (let i = 0; i < 4; i++) {
        const x = M + (i % 2) * 907;
        const y = 300 + Math.floor(i / 2) * 354;
        els.push({ el: `block-${i + 1}`, role: 'card', css: { left: x, top: y, width: 859, height: 330 } });
        els.push({ el: `head-${i + 1}`, tag: 'p', role: 'label', slot: ['text'], required: i < 2, hint: i === 0 ? '區塊小標，十二字以內' : '同上；不需要就整組留空', css: { left: x + 32, top: y + 28, width: 795, height: 44, fontSize: 32, lineHeight: '44px' } });
        els.push({ el: `list-${i + 1}`, tag: 'div', role: 'list', slot: ['list', 'text'], required: i < 2, hint: i === 0 ? '二到三條，每條一行' : '同上', css: { left: x + 32, top: y + 88, width: 795, height: 220, fontSize: 32, lineHeight: 1.5 } });
      }
      els.push(pageNo());
      return els;
    })(),
    extraCss: `[data-layout="detail"] [data-role="list"] li { padding-left: 22px; margin-bottom: 10px; }`,
    sample: { ...HEAD_SAMPLE, title: t('四個做法上的改變'), 'head-1': t('假設更高的修復成本'), 'list-1': list(['每項修復都估兩週以上的循環', '小修不再插隊，改排進固定循環', '先量再修，避免修錯地方']), 'head-2': t('更保守的排程'), 'list-2': list(['同時進行的項目不超過三個', '每個項目都有停損點', '超過一個月的自動升級討論']), 'head-3': t('以交付為先'), 'list-3': list(['先修影響交付的問題', '新功能排在體質指標達標之後', '每季只承諾三件事']), 'head-4': t('由下而上的回報'), 'list-4': list(['問題由第一線直接回報', '兩週一次的公開排序', '數據放在大家看得到的地方']) },
  },
  {
    id: 'tabs', name: '分頁籤：藍色專業', description: '標題、導語，下面一張淡藍框裝幾個頁籤，各放一個面板（條列、表格或一段話），播放時點頁籤切換，靜態只看第一個。改成三頁會失去「同一個框裡切換比較」的對照感。',
    content_relations: ['list', 'comparison', 'evidence'], scene_roles: ['evidence', 'relationship'], density: { max_chars: 320 },
    elements: [
      ...head(),
      lede(),
      { el: 'panels', tag: 'div', role: 'tabs', slot: ['tabs'], required: true, hint: '二到五個頁籤，標籤六字以內；每個面板三到五條或一張小表格，第一個面板是靜態與 QA 看到的', css: { left: M, top: 380, width: W, height: 500, fontSize: 32, lineHeight: 1.6, extra: 'padding: 0 40px 28px;' } },
      note(910, 60),
      pageNo(),
    ],
    extraCss: `[data-layout="tabs"] [data-el="panels"] .tabs { gap: 0 8px; }
[data-layout="tabs"] [data-el="panels"] .tab { padding: 16px 26px; font-size: 28px; line-height: 1.3; }
[data-layout="tabs"] [data-el="panels"] .tab-panel { padding: 26px 8px 0; }
[data-layout="tabs"] [data-el="panels"] li { padding-left: 24px; margin-bottom: 14px; }
[data-layout="tabs"] [data-el="panels"] .table th, [data-layout="tabs"] [data-el="panels"] .table td { padding: 12px 24px; }
[data-layout="tabs"] [data-el="panels"] .table th { font-size: 22px; line-height: 1.3; }`,
    sample: { ...HEAD_SAMPLE, title: t('三種人各看自己要的那一頁'), subtitle: t('主管看指標、工程看待辦、客服看回報流程，資料同一份。'), panels: { type: 'tabs', panels: [
      { label: '主管', content: list(['六個指標每月更新', '紅色代表落後目標', '點指標看趨勢']) },
      { label: '工程', content: list(['待辦依影響排序', '每項有負責人與停損點', '兩週一個循環']) },
      { label: '客服', content: { type: 'table', header: ['情境', '怎麼做'], rows: [['使用者回報慢', '貼連結到回報表單'], ['表單送不出去', '先查狀態頁再回覆']] } },
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
