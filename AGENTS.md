# slide-nextup

以敘事為核心的簡報生成框架與工作流：agent（Claude Code／Codex）先與使用者確認敘事，再生成可在瀏覽器內完整編輯的 HTML 簡報。

> 🗣️ 用使用者寫的語言回覆。
> 📇 這份檔案是每個 agent 平台的入口：Claude Code 讀 `CLAUDE.md`（它只是一行 `@AGENTS.md`），Codex 直接讀這裡。

## 簡報工作流

固定順序：**brief → 敘事（使用者確認）→ 視覺方向 → 生成 → 瀏覽器內編輯**。每份簡報放在 `decks/<id>/`（brief.md、story.md、story.confirmed.json、design.json、deck.json、assets/、deck.html）。

| Skill（正本 `.agents/skills/`） | 做什麼 | 產出 |
|---|---|---|
| `slide-brief` | 一次問四題（用途受眾、時長頁數、內容就緒度、密度） | `decks/<id>/brief.md` |
| `slide-story` | 寫敘事、`pnpm story:check`、呈現逐頁摘要、**停下等使用者確認**、`pnpm story:confirm` | `story.md`、`story.confirmed.json` |
| `slide-design` | 三個視覺方向各一張真實封面預覽，使用者挑 | `themes/<id>/`、`design.json` |
| `slide-build` | 關卡 `story:check --require-confirmed` → `pnpm layouts` → `pnpm deck:scaffold` → 修 slots → `deck:validate` → `render` → `qa` → 交付 | `deck.json`、`deck.html` |

關卡是工具強制的：未確認或敘事改過，`deck:scaffold` 會拒絕。`.claude/skills/` 是鏡像，改正本後跑 `pnpm skills:sync`；`pnpm skills:check` 抓漂移。Codex 從這份 AGENTS.md 找到 skills 後直接讀 `.agents/skills/<name>/SKILL.md` 照做。

## 使用者說什麼就做什麼

- 「幫我做一份簡報」「做個 deck」「準備一場提案」而還沒有 brief → `slide-brief`。
- 「先把故事線想好」「改敘事」「調整順序」「重寫第幾頁的訊息」→ `slide-story`；使用者確認前絕不生成頁面。
- 「換個風格」「主題」「配色」「看起來太 AI」→ `slide-design`。
- 「重做第 3 頁」「這頁換版型」「重新生成」→ `slide-build`，只重做該頁，手動覆寫保留。
- 「我要一個時間軸版型」「這頁沒有合適的版型」→ 沒有另外的 skill：照 `slide-build` 逐頁決定版型那一步讀 `.agents/skills/slide-build/references/new-layout.md` 新增（三個檔，規則由 `theme:lint` 與 `theme:qa` 把關），先 `pnpm layout:gallery --theme <theme> <id>` 截圖給使用者看，點頭再用 `deck:scaffold --layouts sN=<id>` 登記；放在主題包的 `layouts/` 裡就能隨 `theme:export` 分享，但只有用該主題的 deck 看得到。

## 邊界

- 規則寫在程式碼與測試裡（`src/`、`tests/`），skills 只描述流程，不重述細節。
- 第一階段只輸出 HTML；`pnpm qa` 用 headless Chromium 檢查溢出、重疊、字級下限、密度。
- 範例：`examples/tidewatch-progress/`（一份走完整流程的示範簡報）、`examples/story.sample.md`。
