# 敘事欄位 → 版型 slot

`pnpm deck:scaffold` 先做一版自動對應，這裡說明它怎麼填、你之後怎麼修。

## 自動對應

| slot | 來源 |
|---|---|
| `title` | 頁面標題 |
| `kicker` | 該頁有 `chapter` 就是章節標籤「01 — 骨架」（依章節第一次出現的順序編號）；沒有的話只有 hero 頁填 `occasion` 的第一句，其他頁留空（scaffold 不知道哪頁屬於哪一章） |
| `subtitle`、`body`、`caption` | `message` |
| `evidence`（list） | `evidence` 全部 |
| `card-1`…`card-3` | `evidence` 第 1 到 3 條；「數字｜標籤｜變化」會變成 metric |
| `left-title` / `left-items` | `evidence` 第 1 條，「名稱：a、b、c」拆成欄名與項目 |
| `right-title` / `right-items` | `evidence` 第 2 條，同上 |
| `cta`（closing） | `evidence` 第 1 條，沒有就用 `message` |
| `photo` | 佔位圖，必須換掉 |
| `brand`（頁面家具） | frontmatter `title` 的系列名（「：」或「 — 」之前），通常放在頂欄左側；超過 24 字就留空 |
| `meta`（頁面家具） | frontmatter `occasion` 的第一句（第一個逗號、句號、冒號之前），通常放在頂欄右側的膠囊；超過 10 字就留空 |
| `page`（頁面家具） | 「03 / 08」這種兩位數頁碼，scaffold 自動算 |

版型不接受的 slot 不會出現；必要 slot 填不出來會在輸出裡警告。家具留空時輸出也會警告一次並列出頁面：把 `occasion` 的第一句改短（例如「專案進度會，介紹……」）、標題用「系列名：副標」的寫法，或在 deck.json 直接填。字數的上限來自 `pnpm layout:gallery --capacity` 對八套主題的實測（最緊的是 warm-keynote 右上角的膠囊）。

## 圖表、表格、程式碼、圖示

scaffold 不會自動填這四種槽位；用 `--layouts s3=chart-aside` 指定版型後，在 deck.json 裡照下面的形狀填。編輯器裡這四種元件整塊可移動縮放，內容在面板的「內容」欄以多行文字改，每行一筆。

| 槽位 | deck.json | 覆寫文字（每行一筆） |
|---|---|---|
| `chart` | `{ "type": "chart", "kind": "bar"｜"line"｜"donut"｜"progress", "series": [{ "label": "…", "value": 11 }], "unit": " 輪", "max": 100 }` | `標籤｜數值`；`unit` 與 `max` 不變 |
| `table` | `{ "type": "table", "header": ["欄", "欄"], "rows": [["格", "格"]] }` | `格 | 格`；有 header 時第一行是表頭 |
| `code` | `{ "type": "code", "value": "多行文字", "lang": "bash" }` | 原文 |
| `icon` | `{ "type": "icon", "name": "check" }` | 圖示名（清單在 `src/render/icons.ts`，Lucide 子集） |
| `tabs` | `{ "type": "tabs", "panels": [{ "label": "operator", "content": <任一槽位> }] }` | `## 標籤` 起一個面板，底下的行是該面板的內容（依面板原本的型別讀：表格用 `格 | 格`，清單一行一條） |

圖表規則：bar 與 line 用整個 series（三到八筆），donut 與 progress 用第一筆對 `max`（預設 100；donut 多筆時預設是總和）。`unit` 直接接在數字後面，要空格自己加。表格最多六列五欄，每格一到十個字；程式碼最多十行、每行四十字，不做語法上色。

## 互動槽位（播放時才動，靜態與 QA 只看預設狀態）

| 寫在哪 | deck.json | 播放時 | 編輯器 |
|---|---|---|---|
| 有底框元件的 `details`（role 是 card、stat、tint、alert、sunk；槽位型別 text／list／metric） | `{ "type": "metric", …, "details": { "type": "list", "items": [...] } }`（details 可以是任一槽位：一段話、清單、表格；掛在標題、圖說這類沒有底框的元件上會被 deck:validate 與 render 擋下） | 卡片右下出現「＋」，點一下在同一個位置展開成一張更高的卡（摘要加完整內容），Esc、點卡片本身或翻頁收起；Tab 到卡片按 Enter 也行 | 浮動工具列的「展開內容」欄（已有 details 的元件直接出現；沒有的按「⋯」再按「＋展開內容」，只有上述 role 的元件有這顆按鈕）；清空就取消展開；寫成覆寫 `details` |
| image 的 `hotspots` | `{ "type": "image", "src": "…", "hotspots": [{ "target": "s4", "x": 25, "y": 10, "w": 25, "h": 78, "label": "兩條路徑" }] }`，數字是圖片框的百分比，target 必須是存在的頁面 id | 滑過該區域出現虛線框與標籤，點擊跳到那一頁；Tab 到熱區按 Enter 也行 | 選中圖片按工具列的「熱區」進入熱區模式：在圖上按住拖出一個框就是新熱區，框下的設定列選目標頁（id · 標題）、填說明、刪除；點既有的框可拖曳、拉角落縮放，Delete 刪除、Esc 結束；編輯模式裡每個框標出目標頁與說明；寫成覆寫 `hotspots`（圖片框的百分比） |
| chart 的 `toggle: true` | `{ "type": "chart", "kind": "bar", "toggle": true, "series": [...] }` | 圖表上方多一列圖例，點一項就把它拿掉並讓其餘重新算比例（至少留一項）；離開播放恢復預設 | 同圖表：內容欄改 `標籤｜數值` |
| `tabs` 槽位 | 見上表；版型要宣告接受 `tabs`（通用 `tabs`、warm-keynote `tabs` 的 `panels`） | 點頁籤切換面板，←→ 換頁籤 | 內容欄以 `## 標籤` 分面板 |

規則：收合、第一個面板、圖例全開就是「預設狀態」，`?static=1`、QA、編輯器與縮圖都只看它；展開的內容不算進密度，但放進去的仍是要上台的句子。`deck:scaffold` 在敘事填進版型後超過密度上限時會建議先用 details 而不是拆頁，它只建議，不會自己改。

## 強調標記

任何文字槽位（含 list 的每一條、metric 的 label）都可以用 `*關鍵詞*` 把一個詞標成強調，渲染成 `<em>`；主題決定它長什麼樣（常見是換成襯線斜體加強調色）。一頁最多用一次，放在主張的關鍵詞上，例如「量測工具已經是*一包可交付的東西*」。要打字面上的星號寫 `\*`。

同樣的地方也可以放連結 `[文字](目標)`：目標是 `https://…` 或 `mailto:` 時開新分頁，是 `#s3` 這種頁面 id 時跳到那一頁；其他目標當成純文字。連結只在播放時可點（靜態模式與編輯模式不會誤觸），編輯器就地改字會原樣寫回這種寫法，可以和 `*強調*` 互相包含；要打字面上的方括號寫 `\[`。

## 修文字的規則

- **標題是主張**：帶動詞、一行到兩行，不是主題名。「改版輪數的真相」可以，「數據分析」不行。
- **body 一到三行**：說明或補一句證據；不要把 evidence 重抄一遍。
- **卡片一句**：短句或一個大數字；三張卡的句式對齊（都名詞、或都動詞開頭）。
- **對比欄**：三到五條，左右條數接近；欄名二到六個字。
- **列表三到四條**：每條一行以內；超過就是該拆頁。
- **cta 是動作**：受眾離開時要做的一件事，一句。
- **kicker 是章節或場合**：四到十個字；warm-keynote 這類有章節豎條的主題包，在 story.md 逐頁加 `- chapter: 骨架` 就會自動編號，不用逐頁手改。
- **提示裡的字數是實測的**：版型 slot 的 hint 寫「每行七字以內、兩行以內」就是框放得下的量，`pnpm layout:gallery` 會對照。
- 密度上限：版型的 `max_chars` 是整頁字數上限，超過等於溢出的前兆。

## 密度對照

| density | 每頁大概 |
|---|---|
| minimal | 一句或一個數字，多用 cover、statement 只填標題 |
| light | 標題加一到三條 |
| standard | 標題加三到五條，或一段 |
| dense | 用 comparison 或 cards 拆結構，仍不超過 `max_chars` |

## 圖片

- 放在 `decks/<id>/assets/`，deck.json 裡寫相對路徑，例如 `assets/chart.png`。
- 用 `pnpm render ... --inline-assets` 可以把圖片內嵌成單一檔案分享。
- 佔位圖只在生成階段存在；交付前必須換成真圖或改版型。

## deck.json 裡不能碰的

- `elements`：id 與 kind 由版型決定，改了渲染會拒絕。唯一可以加的是 `step`（整數 ≥1）：逐步顯示，按第幾次「下一步」才出現；一頁最多三到四步，卡片與清單最常用。
- 頂層 `transition`：`none`（預設）、`fade`、`slide-left`；靜態模式與 QA 一律無轉場。
- `overrides`：使用者在瀏覽器裡的手動修改；agent 不寫、不刪。
- `story.sha256`：由 scaffold 寫入，用來偵測敘事分歧。
