# 新增一個版型

版型放在 `layouts/<id>/`，三個檔案。契約由 `pnpm theme:lint` 逐條檢查，規則在 `src/qa/layout-check.ts` 與 `src/qa/css-ownership.ts`。

主題包自己的版型放 `themes/<theme-id>/layouts/<id>/`，格式相同；同名會蓋掉 `layouts/<id>/`（每個主題包都有自己的 `cover`），`pnpm layouts --theme <theme-id>` 與 `deck:scaffold --theme` 都會用到它們。跨主題包不混用版型。

## layout.json

```json
{
  "id": "<kebab-case，與目錄名相同>",
  "name": "<顯示名>",
  "description": "<適合什麼內容關係；改成普通 grid 會失去什麼>",
  "content_relations": ["sequence"],
  "scene_roles": ["relationship"],
  "density": { "max_chars": 200, "max_elements": 5 },
  "slots": {
    "title": { "type": "text", "required": true, "hint": "..." },
    "step-1": { "type": ["text", "metric"], "required": true, "hint": "..." }
  },
  "elements": [
    { "id": "title", "kind": "text" },
    { "id": "step-1", "kind": "text" },
    { "id": "rail", "kind": "shape" }
  ],
  "sample": { "title": { "type": "text", "value": "..." } }
}
```

- 每個 slot 必須有同名 element；text／list／metric 的 slot 對應 kind `text`，image 對應 `image`；純裝飾用 `shape`。
- `sample` 是預覽與測試用的範例內容，必要 slot 都要有。

## layout.html

```html
<section class="slide" data-layout="<id>">
  <h1 data-el="title" data-slot="title" data-role="title">{{title}}</h1>
  <div data-el="rail" data-role="divider"></div>
  <div data-el="step-1" data-slot="step-1" data-role="card">{{step-1}}</div>
</section>
```

- 一個元件一個標籤，`data-el` 與 json 的 elements 一一對應，有內容的元件加同名 `data-slot` 與一個 `{{slot}}` 佔位符。
- 每個元件都要有 `data-role`，用既有的 role，主題才會上色：
  - 內容：title、kicker、subtitle、body、caption、list、card、cta、photo、number（章節大號數字）、stat（無底的 KPI 數字，metric 或短句）
  - 家具：meta（頂欄小字、頁碼；字級下限 20px 而不是 32px）
  - 裝飾 shape：backdrop（實色塊、色條）、divider（細線）、corner／corner-end（左上與右下角標，主題用 border 畫 L 形）、glow（光暈，主題用徑向漸層加 blur）、frame（內框或讀數框）、node（流程節點）、connector（流程連線）、progress（進度刻度：一頁一格、目前頁點亮；每個 section 帶 `--page-index`／`--page-count`，渲染器依敘事順序寫、播放時依播放順序重算，主題只能用百分比與這兩個變數畫，不寫幾何）
  - 複合槽位的容器：chart（圖表，透明底）、table（表格）、code（程式碼區塊，主題給底色與邊框）、icon（圖示，主題給顏色）、tabs（分頁籤的框：渲染器的基礎 CSS 已給頁籤列與作用中頁籤的底線，主題可再用 `[data-role="tabs"] .tab`／`.tab.is-active` 換色）、scrim（全幅圖上的半透明色帶，主題用 paper 色加透明度）
- slot 型別除了 text／list／metric／image，還有 chart／table／code／icon／tabs（都對應 kind `text`，內容用多行文字覆寫；寫法見 slot-mapping.md）。
- 互動是槽位的屬性，不是版型的事：text／list／metric 可帶 `details`（播放時點擊展開；只限主題畫成有底框的 role：card、stat、tint、alert、sunk，展開層沿用那個 role 的底）、image 可帶 `hotspots`（點擊跳頁）、chart 可帶 `toggle`（圖例可點）。版型只要在 sample 裡示範一次（cards 的第一張卡帶 details、photo 帶一個 hotspot、chart-aside 的圖表開 toggle），畫廊與 theme:qa 看到的都是預設狀態；hotspot 的 target 在 sample 裡寫某個版型 id（sample deck 的頁面 id 就是版型 id）。展開後的卡片沿用元件的 data-role，主題不必另寫。
- 箭頭：版型 HTML 可直接放一個帶 `data-el`、`data-role="connector"`、`data-shape="arrow"` 的 `<svg>`（line 加 polygon），主題以 `[data-role="connector"] line / polygon` 上 stroke 與 fill；元件盒子的長寬比要跟 viewBox 一致。
- 自動縮字：文字元件加 `data-fit="true"`，播放器在字型載入後把字級往下縮到剛好不溢出（下限 32px，meta 20px）。給副標、導語、說明這類長度不定的元件；標題不要加，標題溢出應該改文案。
- 目前的版型庫：cover、hero（封面）；section（章節）；statement、quote、fact（單一主張、引言、單一數字）；cards、bento-hero3、bento-big2、grid-2x2、icon-cards（卡片）；comparison、split-asym、two-cols-header、before-after（兩欄）；process（流程）；chart-aside、data-table、code-block、tabs（資料與分頁籤）；photo、photo-right、full-bleed（圖）；closing、closing-cta（結尾）。用 `pnpm layouts` 看每個的 slots。
- 家具槽位 `brand`、`meta`、`page` 宣告了 scaffold 就會自動填（標題的系列名、場合的第一句、頁碼）；`kicker` 填章節標籤（story 有 `chapter`）或 hero 頁的場合。meta 的框至少要放得下 10 個字、brand 24 個字，否則 scaffold 填的預設會溢出。
- slot 的 `hint` 寫字數或行數時要寫框真的放得下的量（「每行七字以內、兩行以內」比「十字以內」有用，中文哪裡都能換行）；`pnpm layout:gallery --capacity` 會印出每個文字框實測的每行字數與行數，提示超過實測就算失敗。
- 裝飾一律做成 shape 元件，不用 `::before`／`::after`（`content` 被 lint 擋，而且偽元素在編輯器裡選不到）。
- 反相頁在 section 加 `data-tone="inverse"`。

## layout.css

只寫幾何，每條選擇器以 `[data-layout="<id>"]` 開頭：

```css
[data-layout="<id>"] [data-el="title"] {
  left: 96px; top: 96px; width: 1728px; height: 200px;
  font-size: 80px; line-height: 1.2; text-wrap: balance;
}
```

- 畫布 1920×1080，內容安全邊距 96px。
- 每個元件給明確的 left／top／width／height，文字元件給 font-size 與 line-height；內文字級不低於 32px，`data-role="meta"` 的家具不低於 20px。
- 斜切、切角用 `clip-path`，傾斜用 `transform: skew()`；兩者都是幾何，版型寫。
- 顏色、字型、邊框、陰影都不能寫，lint 會擋。

## 檢查

```bash
pnpm theme:lint
pnpm layout:gallery [--theme <theme-id>] <id>
pnpm theme:qa --theme <theme-id> [<id>]
```

gallery 會用 sample 渲染、截圖到 `artifacts/layout-gallery/<id>.png`、檢查溢出，並把每個文字框的容量對照 hint 裡的字數與行數（容量表在 `capacity-<theme>.json`，加 `--capacity` 直接印出）；看一眼截圖再用。主題包裡的版型一定要加 `--theme`，沒加只會查通用版型庫。

theme:qa 把該主題每個版型的 sample 組成一份 deck 跑完整 QA（字級下限、重疊、密度、幾何不變，不只溢出），error 與 warning 都算失敗；tests 對八套主題全跑，所以 sample 要當成版型自己的示範來寫：必要 slot 都填、字數在密度上限內、家具角色的字級不低於下限表（內文 32px；meta／chip／eyebrow 20px；chapter／pill／caption／cta／kicker／flow 24px；表格 22px）。
