---
name: slide-build
description: 敘事已確認、視覺方向已選之後，逐頁選版型、生成 decks/<id>/deck.json、渲染成可編輯的 HTML、跑品質檢查、交付並說明如何編輯。使用者要「重做第 3 頁」「這頁換版型」「重新生成」時也用這個（只重做該頁，手動覆寫會保留）。
---

# slide-build — 從敘事到可編輯的 HTML

## 關卡（先跑，不通過就停）

```bash
pnpm story:check decks/<id>/story.md --require-confirmed
```

未確認或敘事在確認後改過，指令會失敗：回 slide-story 重新呈現並取得確認。**不要用 `--force`。**

## 步驟

### 1. 看有哪些版型

```bash
pnpm layouts --theme <design.json 的 theme>
# 做好的 deck 要換另一套主題包：pnpm deck:retheme decks/<id>/deck.json --theme <slug> [--reset-positions] 再 pnpm render
```

每個版型列出適合的 scene_roles、content_relations、slots（型別、必要與否、提示）與密度上限。

### 2. 逐頁決定版型

`deck:scaffold` 會依每頁的 scene_role 與 content_relation 自動選（對應表在 slide-story 的 references）。你要做的是逐頁問一句：**「這頁改成普通 grid 會失去什麼？」** 答得出來就用那個版型；答不出來代表內容關係選錯了，回頭改 story 或換版型。不合的頁用 `--layouts s3=photo,s5=cards` 指定。

需要的版型不存在（例如時間軸、四象限）：依 [references/new-layout.md](references/new-layout.md) 新增一個，不要把內容硬塞進不合的版型。

### 3. 生成 deck.json

```bash
pnpm deck:scaffold decks/<id>/story.md --theme <design.json 的 theme> [--layouts s1=cover,s4=comparison]
```

讀輸出：每頁選了什麼版型、哪些必要 slot 沒填、哪些是佔位圖、家具（meta／brand）是否因為太長而留空。重做單頁用 `--slide s3`；既有的手動覆寫一律保留，指向已消失元件的覆寫會列為孤兒但不會刪。

### 4. 修內容

打開 `decks/<id>/deck.json`，逐頁把 `slots` 修成真的上得了投影片的句子；規則見 [references/slot-mapping.md](references/slot-mapping.md)。**只改 `slots` 與 `notes`，不動 `elements`，不動 `overrides`。** 圖片放 `decks/<id>/assets/`，用相對路徑；佔位圖必須換掉或改用不需要圖的版型。

### 5. 驗證、渲染、檢查

```bash
pnpm deck:validate decks/<id>/deck.json
pnpm render decks/<id>/deck.json -o decks/<id>/deck.html
pnpm qa decks/<id>/deck.html
```

QA 失敗只回報，不自動修：溢出或密度超標就縮短文字或拆頁（回 slide-story 改敘事再重做該頁），重疊多半是覆寫造成，請使用者在編輯模式裡處理；不要改 HTML，也不要用覆寫去救。報告在 `artifacts/qa/<id>.json`。

### 6. 交付

告訴使用者：

- HTML 路徑、頁數、QA 結果與剩下的警告。
- 開啟 HTML 後按 `E` 進入編輯模式：上方是工具列（復原／重做、貼齊、顯示隱藏元件、下載 deck.json、投影；「?」有快捷鍵說明），左側是頁面縮圖欄，點選元件後樣式控制（字體、字級、粗斜底線、主題色票）出現在元件旁的浮動工具列，位置、大小、步驟、進場、對齊等距、層次在它的「⋯」裡；Shift 點選或框選可以多選，Ctrl+Alt+C／V 複製貼上樣式。所有修改只寫進 deck 的覆寫區，之後重新生成頁面不會蓋掉；沒開 dev server 時編輯會留在瀏覽器的草稿，下次開啟可還原。
- 播放：→ 先推進本頁的步驟再翻頁，← 反向；按 `P` 開講者視窗（講稿、下一頁、計時，同一台機器）；`?static=1` 看最終狀態。預設就有動畫：scaffold 替卡片、流程、對比、證據排好逐步顯示（元件的 `step`），到達步驟時依主題的 motion 規則進場（元件的 `enter` 可在浮動工具列的「⋯」或 deck.json 指定，同一步驟內依序錯開），切頁轉場預設 `fade`。要關掉：頂層 `transition` 改 `none`、把 `step` 清掉；觀眾開了 prefers-reduced-motion 時自動無動畫。
- 播放時的微互動：卡片、膠囊、行動呼籲、表格列、圖片對 hover 有回饋（主題定義），圖表 hover 顯示數值，圖片點擊放大（Esc 關），文字裡的 `[文字](https://…)` 是可點的連結（目標寫 `#s3` 就跳到那一頁）；`?static=1` 與編輯模式一律關閉，QA 量的是靜態狀態。
- 互動元件（寫在 slots 裡，見 slot-mapping.md 的「互動槽位」）：有底框的卡片（role 是 card、stat、tint、alert、sunk）的 `details` 播放時點一下展開完整內容、圖片的 `hotspots` 點擊跳頁、圖表的 `toggle` 讓圖例可點、`tabs` 槽位是同一個框裡的分頁籤；都能用鍵盤（Tab、Enter、←→）。編輯器的浮動工具列可改展開內容；熱區按「熱區」後在圖上直接拉框、拖曳、選目標頁。scaffold 在敘事超過版型密度時會建議先用 details 而不是拆頁。
- 臨時不播某頁或調播放順序：編輯模式左側的頁面側欄可隱藏／顯示、拖曳或 ↑↓ 排序（Ctrl+Shift+↑↓、Ctrl+Shift+H），寫進 deck.json 的 `pages`，重做頁面時保留；頁碼膠囊會跟著重編。story.md 仍是敘事正本：要讓這份編排變成正本，跑 `pnpm story:apply-deck decks/<id>/deck.json`（`--dry-run` 先看），它會把逐頁段落重排、隱藏頁移除，然後回 slide-story 重新呈現並確認，再 `deck:scaffold` 重做頁面時 `pages` 就會被清空、播放順序不變。
- 要改敘事：回 slide-story，重新確認後 `pnpm deck:scaffold ... --slide <id>` 只重做那幾頁。

## 不做的事

- 不手改 deck.html，不寫 overrides，不在未確認時 `--force`。
- 不為了塞進版型而砍掉敘事裡的證據；放不下就是敘事該拆頁。
- 不在頁面上留下流程性文字（「示意」「待補」「Option A」）；沒有內容的選填 slot 就留空。
