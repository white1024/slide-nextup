# 視覺方向與主題檔參考

## 主題能決定什麼

主題只管外觀：色彩、字型、字重、字距、邊框、背景、透明度。位置、尺寸、字級、行高、對齊屬於版型，主題寫了會被 `pnpm theme:lint` 擋下。

## 播放時的 hover 狀態

播放時元件要對滑鼠有回應，這也是主題的事：

- 每條 hover 規則寫成 `[data-interactive] [data-role="card"]:hover { … }`：以 `[data-interactive]` 開頭、用 data-role 選元件（後面可以再接 data-tone 或後代元素，例如 `[data-interactive] [data-role="table"] tbody tr:hover td`）。播放器在靜態模式（`?static=1`、QA）與編輯模式會拿掉 `html[data-interactive]`，所以量測與拖曳永遠碰不到 hover。
- hover 規則裡可以用 `transform`（抬起、微放大），其他地方仍然不行；過場由播放器統一給（0.18 秒），主題不寫 `transition`。
- 主題定了 card、pill、cta、photo、table 哪一個的外觀，就必須給它 hover 狀態，`pnpm theme:lint` 會擋。慣例：card 抬起並加深陰影、pill／cta 高亮或微放大、table 列換底色、photo 微縮放。
- 圖表 hover 的數值提示（`.chart-tip`）與圖片點擊放大由播放器負責；提示用 `--color-ink` 底、`--color-paper` 字，主題要換就寫 `[data-role="chart"] .chart-tip rect`。
- 互動元件的外觀也走同一條路：展開的卡片（`.deck-details`）沿用來源元件的 data-role，所以 card 的玻璃底、陰影會自動套上；分頁籤的框是 `[data-role="tabs"]`，頁籤列與作用中頁籤的底線由基礎 CSS 給，主題只換顏色與字型（`[data-role="tabs"] .tab`、`.tab.is-active`，hover 一樣掛在 `[data-interactive]` 底下）；圖例色塊 `.chart-swatch` 與圖表填色同源，關掉的項目由播放器降透明度；熱區的虛線框與標籤用 `--color-accent`、`--color-ink`／`--color-paper`。

`themes/<id>/theme.json`：

```json
{
  "id": "<kebab-case>",
  "name": "<顯示名>",
  "description": "<一句話的視覺語言>",
  "colors": {
    "paper":   { "value": "#rrggbb", "use": "頁面底色" },
    "ink":     { "value": "#rrggbb", "use": "主要文字；反相頁的底色" },
    "muted":   { "value": "#rrggbb", "use": "副標、說明" },
    "accent":  { "value": "#rrggbb", "use": "唯一強調色" },
    "surface": { "value": "#rrggbb", "use": "卡片、面板底" },
    "line":    { "value": "#rrggbb", "use": "細線、邊框" }
  },
  "typography": {
    "display": { "family": "<字型堆疊>", "weight": 700 },
    "body":    { "family": "<字型堆疊>", "weight": 400 }
  },
  "spacing": { "radius": 4 },
  "decoration": { "vocabulary": ["..."], "avoid": ["..."] }
}
```

六個色彩角色都是必要的；可以多加自訂色（例如 `accent2`），渲染器會一併轉成 `--color-<name>` 變數。

`themes/<id>/theme.css` 只透過變數取值：`var(--color-paper)`、`var(--color-ink)`、`var(--color-muted)`、`var(--color-accent)`、`var(--color-surface)`、`var(--color-line)`、`var(--font-display)`、`var(--font-display-weight)`、`var(--font-body)`、`var(--font-body-weight)`、`var(--radius)`。

## 主題要上色的 role

版型用 `data-role` 標記元件的語意，主題只認 role，不認版型或元件 id：

| role | 出現在 | 通常怎麼畫 |
|---|---|---|
| `title` | 每個版型 | display 字型、ink 色 |
| `kicker` | cover | accent 色、加字距 |
| `subtitle`、`caption` | cover、comparison 欄名、photo | muted 色 |
| `body` | statement、closing | ink 色 |
| `list` | statement、comparison | `.list li` 的記號用 `border-left` 畫，不用 `content` |
| `card` | cards | surface 底、line 邊框、radius |
| `backdrop` | cover、closing 的色條 | accent 色塊 |
| `divider` | comparison | line 色 |
| `cta` | closing | accent 或粗體 |
| `photo` | photo | surface 底、line 邊框 |

`data-tone="inverse"` 標在整頁（closing）：主題要為反相頁定義底色與文字色。

metric 卡的內部結構是 `.metric-value`、`.metric-label`、`.metric-delta`，主題可以對這些 class 上色。

## 三個方向怎麼拉開差距

| 方向 | 手法 |
|---|---|
| 穩妥 | 既有主題，或只換 accent 與字型的變體 |
| 大膽 | 反相（ink 當底、paper 當字）、大面積 accent、極粗 display 字重、雙色 |
| 自由發揮 | 從題目長出來的隱喻：例如「實驗室」用冷灰與等寬字、「手作」用暖紙與襯線、「城市夜景」用深藍與霓虹單色 |

一個方向一句話能講清楚才算成立：「氛圍 + 色 + 字 + 一個裝飾語彙」。

## 允許而且鼓勵的多層手法

好看的簡報不是純色底加文字。主題可以疊這些（都是外觀屬性，lint 不擋）：

- **光暈**：`[data-role="glow"]` 用 `radial-gradient` 加 `filter: blur()`，一到兩個、低透明度，放在版型給的位置。
- **紋理**：`.slide` 的 `background-image` 疊 80px 網格、點陣或紙張噪點（SVG data URI，透明度 2% 到 6%）。
- **內框與角標**：`[data-role="frame"]` 一條 1px 細線內框；`[data-role="corner"]` 用 `border-top` 加 `border-left` 畫 L 形。
- **關鍵詞混排**：`em` 換成襯線斜體加強調色（文字槽位用 `*關鍵詞*` 標記）。
- **家具小字**：`[data-role="meta"]` 大寫字距 0.18em 到 0.3em、等寬或無襯線、muted 色。
- **大字負字距**：display 字級 ≥ 96px 時 `letter-spacing: -0.02em` 到 `-0.045em`；小字反過來拉開。

## 避免的預設味

- Inter、Roboto、Arial 當 display 字型
- 白底紫藍漸層、整頁彩虹漸層
- 為裝飾而裝飾：刪掉它頁面資訊不會少的東西就刪掉；陰影只用在光暈與發光線，不做卡片投影牆
- 右側制式插圖、無意義的幾何色塊
- 三個方向只差顏色：方向的差異要先來自版型構圖，再來自主題

## 中文字型堆疊

- 襯線：`'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Source Han Serif TC', Georgia, serif`
- 無襯線：`'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Source Han Sans TC', 'Segoe UI', sans-serif`
- 等寬：`'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Noto Sans Mono CJK TC', monospace`

中文一律落系統字型，堆疊要能在 Windows 與 macOS 各自落到可用的系統字型。拉丁字型可以載入：主題包的 theme.css 直接放 Google Fonts 的 `@font-face`（只取 `/* latin */` 子集，src 指向 gstatic 的 woff2；lint 對主題的 font-face 放行）。不要用 `@import`——渲染器把 CSS 串接後它不會生效。

## 移植主題包（從 beautiful-html-templates）

一套模板移植成一個主題包，跨模板不混用版型（原專案的規則：每套是封閉的視覺系統）：

1. 讀 `templates/<slug>/template.html` 的 `:root` 與 `design.md` 開頭的 YAML tokens；`template.json` 的 palette／typography 是摘要。色彩全部落成 `#rrggbb`（rgba 的淡色先與紙色混色成實色），六個必要角色照語意對應，其餘自訂色照原名加（`green`、`pink2`、`tint`…）。
2. `theme.json` 填 `source`（name、url、author、license、template）；根目錄 `THIRD_PARTY_NOTICES.md` 列上這套；theme.css 與 layout.css 第一行註明出處。
3. 字型：抓 Google Fonts CSS（用 Chrome UA 才會給 woff2），只取 latin 子集貼進 theme.css；只有單一字重的字型（如 Archivo Black）把 `font-weight` 改成 `100 900`，中文 fallback 才能真的粗體。CJK 堆疊照上面。`design.md` 的「CJK & International Content」段有每套的中文配對建議。
4. 版型：模板的每一頁 = 主題包裡一個版型 `themes/<slug>/layouts/<id>/`。固定 1920×1080 的模板（deck-stage）數字直接用；vw／vh／clamp 的模板在 1920×1080 下換算（1vw = 19.2px、1vh = 10.8px、1rem = 16px），clamp 取中間值夾住的結果。原版字級在 1920 畫布常只有 13–20px，投影要放大：標題與內文按比例放大到 ≥ 32px，家具（`data-role="meta"`）≥ 20px，保持原本的層級比。
5. 裝飾一律做成 shape 元件：斜切面用 `clip-path`（幾何，版型可寫）、位移陰影用 `box-shadow`（外觀，主題寫）、圖案用 `background-image`、掃描線用內嵌 `<svg>` 加 pattern，顏色由主題以 `[data-role="<role>"] line { stroke }` 上。主題包可以用自己的 role（`tint`、`dots`、`pixel`、`poster`…），版型與主題成對即可。
6. 模板的家具對應我們的槽位：頁碼 → `page`，簡報名／系列名 → `brand`，場合／日期 → `meta` 或 `kicker`，來源行 → `cta`（scaffold 自動填第一條 evidence）。
7. `pnpm theme:lint` 零錯誤，`pnpm design:preview <story> --theme <slug> --layout cover` 看真實內容，和原模板截圖並排比對；`pnpm layouts --theme <slug>` 會列出主題包的版型。

### 共用版型詞彙（讓 deck 可以換主題包）

每個主題包都要提供這組核心版型 id，槽位名稱與型別跟通用版型一樣（可以多，不可以少或改名），`pnpm deck:retheme <deck.json> --theme <slug>` 才能把做好的 deck 直接換過去：

| id | 核心槽位 |
|---|---|
| cover | title、subtitle |
| section | number、title、body |
| statement | title、body、evidence（list） |
| cards | title、card-1、card-2、card-3（text｜metric） |
| comparison | title、left-title、left-items、right-title、right-items |
| process | title、step-1 到 step-4 |
| photo | title、photo、caption |
| data-table | title、table、caption |
| quote | title、caption |
| closing | title、body、cta |

家具槽位 `brand`、`meta`、`kicker`、`page` 選填。主題包可以再加自己的版型（例如 warm-keynote 的 `cards-2`、`cards-4`、`fact`、`before-after`、`chart-aside`）。缺的核心版型會退回通用版型，外觀仍由主題決定，但看起來會弱一截，所以還是補齊。字級下限依 role 分級：一般內容 32px，`chapter`／`pill`／`caption` 24px，`meta`／`chip`／`eyebrow` 20px，`table` 22px。
