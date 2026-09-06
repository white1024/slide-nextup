# slide-nextup

以敘事為核心的簡報生成框架與工作流。agent（Claude Code／Codex）先與你確認敘事，再生成可在瀏覽器內完整編輯的 HTML 簡報。

## 安裝

需要 Node.js 24 以上與 pnpm（隨 Node 附的 corepack 可啟用：`corepack enable pnpm`）。

```bash
pnpm install
pnpm browsers:install   # 下載 Playwright 用的 Chromium，只需一次
pnpm preflight          # 確認 node / pnpm / playwright / chromium 都正常（pnpm doctor 是 pnpm 內建指令，不是這個）
```

## 指令

| 指令 | 用途 | 狀態 |
| --- | --- | --- |
| `pnpm dev <deck.json> [--port 4321]` | 本機預覽與編輯（只綁 127.0.0.1）：編輯停手 1.5 秒自動寫回 deck.json，檔案變動自動重載；編輯模式工具列的「下載 deck.html」會把磁碟上的簡報渲染成圖片內嵌的單一 HTML（等同 `pnpm render --inline-assets`） | 可用（T-0010、T-0040） |
| `pnpm render <deck.json> [-o out.html] [--inline-assets]` | 把 deck.json 渲染成自足單檔 HTML（固定畫布縮放、鍵盤翻頁、內嵌模型） | 可用（T-0006） |
| `pnpm qa <deck.json | deck.html>` | 用 headless Chromium 檢查溢出、重疊、字級下限、密度、主題幾何不變；報告寫到 artifacts/qa/ | 可用（T-0008） |

| `pnpm story:check <story.md> [--require-confirmed]` | 檢查敘事文件的欄位與節奏規則，印出逐頁摘要；加旗標時同時要求已確認 | 可用（T-0002） |
| `pnpm story:confirm <story.md>` | 使用者確認敘事後記錄 sha256（生成關卡） | 可用（T-0009） |
| `pnpm story:apply-deck <deck.json> [--dry-run]` | 把編輯器寫進 deck.json 的頁面編排（播放順序、隱藏頁）寫回 story.md：逐頁段落重排、隱藏頁移除；寫回後要重新確認，再重做頁面時 scaffold 會清空對應的 `pages` | 可用（T-0027） |
| `pnpm deck:scaffold <story.md> [--theme id] [--layouts …] [--slide sN]` | 從敘事生成或重生成 deck.json，保留手動覆寫 | 可用（T-0009） |
| `pnpm layouts [--json]` | 列出版型與其 slots，給 agent 選版型 | 可用（T-0009） |
| `pnpm design:preview <story.md> --theme <id>` | 用敘事第一頁渲染某主題的封面預覽 | 可用（T-0009） |
| `pnpm skills:sync` / `pnpm skills:check` | 把 .agents/skills 鏡射到 .claude/skills；檢查漂移 | 可用（T-0009） |
| `pnpm deck:validate <deck.json> [--write]` | 依 schemas/deck.schema.json 驗證 deck 模型與交叉引用；`--write` 寫回標準格式 | 可用（T-0003） |
| `pnpm theme:lint [--as theme|layout <css>]` | 檢查主題與版型契約：schema、html／json 元件一致、CSS ownership | 可用（T-0004） |
| `pnpm theme:qa [--theme id] [layout…]` | 每個版型用自己的 sample 組成一份 deck 跑完整 QA（字級下限、重疊、密度、幾何不變）；error 與 warning 都算失敗，報告在 artifacts/qa/theme-<id>.json | 可用（T-0021） |
| `pnpm layout:gallery [--theme id] [--capacity] [layout…]` | 用每個版型的範例內容截圖到 artifacts/layout-gallery/、檢查溢出，並量每個文字框放得下幾字幾行來對照 slot hint 的字數（`--capacity` 印出容量表） | 可用（T-0004、T-0020） |

渲染出的 HTML 內建編輯器：開啟檔案後按 `E`（或在網址加 `?edit=1`）進入，點選元件拖曳、拉把手縮放、雙擊改文字、右側面板改樣式或換圖、Delete 隱藏、Ctrl+Z 復原；所有修改只寫進內嵌模型的 overrides，`window.__deck.exportModel()` 可取回（儲存回 deck.json 由 T-0010 提供）。播放時有微互動：主題以 `[data-interactive] [data-role=…]:hover` 定義卡片、膠囊、行動呼籲、表格列與圖片的 hover 狀態，播放器負責圖表的數值提示、圖片點擊放大與 `[文字](網址)` 連結；`?static=1` 與編輯模式一律關閉。互動元件寫在 slots 裡：有底框的卡片（role 是 card、stat、tint、alert、sunk）的 `details`（點卡片展開完整內容）、image 的 `hotspots`（點擊跳頁）、chart 的 `toggle`（圖例可點、其餘重算比例）、`tabs` 槽位（同一個框裡的分頁籤），鍵盤可操作；靜態模式、QA 與編輯器只看預設狀態（收合、第一個面板、全開），編輯器可改展開內容，熱區按「熱區」後在圖上直接拉框、拖曳、選目標頁。

開發用：`pnpm test`、`pnpm check`（biome）、`pnpm typecheck`。範例：`examples/story.sample.md`（通過）、`examples/story.broken-fields.md`、`examples/story.broken-rhythm.md`（示範錯誤）。

## 授權

MIT，見 [LICENSE](LICENSE)。移植的主題與圖示的來源與授權列在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 與 [ATTRIBUTIONS.md](ATTRIBUTIONS.md)。
