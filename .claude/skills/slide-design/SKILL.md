---
name: slide-design
description: 敘事確認後、生成頁面前，提出三個視覺方向（一穩妥、一大膽、一自由發揮），各渲染一張用真實敘事內容做的封面預覽讓使用者挑，把選擇寫進 decks/<id>/design.json。使用者說「換個風格」「主題」「配色」「看起來太 AI」時也用這個。
---

# slide-design — 用真的封面挑方向，不用形容詞

使用者說不清楚想要什麼風格是正常的；讓他們從三張真的封面裡挑，比問「你喜歡什麼風格」有效得多。

## 前提

`pnpm story:check decks/<id>/story.md --require-confirmed` 要通過。敘事還沒確認就先回 slide-story。

若使用者已經指定主題，或 `decks/<id>/design.json` 已存在且使用者沒要換，直接跳到步驟 6 確認 theme id 後進 slide-build。

## 步驟

### 1. 讀敘事的語氣

從 story.md 的受眾、場合、核心主張判斷語氣：正式或輕鬆、內部或對外、要說服還是要教。這決定三個方向的落點。

### 2. 從模板庫挑三個候選

方向不自創（自創主題的效果一直不如移植成熟模板，四輪比稿都被打回）。來源是 [beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates)（MIT，34 套；本機 clone 一份，路徑自行決定）：讀它的 `index.json`，用敘事的語氣對 `mood`／`tone`／`formality`／`density` 挑三套**彼此真的不同**的（一穩妥、一大膽、一出乎意料），把 `screenshots/` 的截圖做成一頁畫廊給使用者看（範例：`artifacts/design/<deck-id>/template-gallery.html`）。已經移植過的主題包（`pnpm layouts` 列出的主題）可以直接當候選。

### 3. 把候選移植成主題包

一套模板 = 一個主題包：`themes/<slug>/theme.{json,css}` 管外觀，`themes/<slug>/layouts/<id>/` 放它自己的版型（同名會蓋掉通用版型）。比稿階段只移植封面（`layouts/cover/`）；使用者選定後再移植該套全部內頁版型。做法與換算規則見 [references/design-directions.md](references/design-directions.md) 的「移植主題包」。然後：

```bash
pnpm theme:lint
```

零錯誤才往下。主題只能寫外觀，寫到幾何屬性 lint 會擋；主題內版型也會一起檢查。

### 4. 渲染預覽

```bash
pnpm design:preview decks/<id>/story.md --theme <theme-id>
```

每個方向跑一次，輸出 `artifacts/design/<id>/<theme-id>.png`；`--layout cover` 會先找主題包自己的封面。預覽用的是敘事第一頁的真實內容，所以畫面上不會有任何流程性文字；不要另外手做預覽頁。把三張 PNG 與原模板截圖並排成一頁（範例：`artifacts/design/<id>/round4.html`）更好比。

### 5. 讓使用者挑

在訊息裡列出三張 PNG 的路徑，各配一句描述與主題 id；方向名稱與主題 id 只出現在訊息裡。問使用者選哪一個，或想混搭什麼（例如 A 的字型加 B 的顏色）。混搭就建立第四個主題再預覽一次。

### 6. 記錄選擇

寫 `decks/<id>/design.json`：

```json
{ "theme": "<theme-id>" }
```

未被選的主題可以留著給以後用；使用者要求才刪。然後進入 slide-build。

## 不做的事

- 不替使用者決定；不只給一個方向。
- 不做三個只差顏色的方向；不從零自創主題，也不把兩套模板的版型混在一起。
- 不在預覽或主題裡放使用者需求的文字（「大膽」「內部分享」之類），也不放主題名稱。
- 不用漸層、陰影、Inter／Roboto、白底紫漸層這類預設味很重的做法（見 references）。
