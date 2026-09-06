---
name: slide-story
description: 依 brief 撰寫敘事文件 decks/<id>/story.md（核心主張、敘事骨架、逐頁角色與強度），用 pnpm story:check 驗證，把逐頁摘要拿給使用者確認；使用者確認前絕不生成頁面。使用者要「先把故事線想好」「改敘事」「調整順序」「重寫第幾頁的訊息」時也用這個。
---

# slide-story — 敘事先於版面，確認先於製作

這一步是整個流程唯一需要人停下來的關卡。版面改來改去多半是因為敘事在中途變了，所以敘事要在生成任何頁面之前被使用者明確確認。**確認是工具強制的**：`pnpm story:confirm` 會記錄 story.md 的雜湊，之後的生成指令在未確認或敘事已改時會直接拒絕。

## 步驟

### 1. 讀 brief

讀 `decks/<id>/brief.md`。若沒有 brief，先跑 slide-brief。若使用者提供了材料，先讀完材料再動筆。

### 2. 選敘事模式

| narrative_pattern | 適合 | 骨架 |
|---|---|---|
| `problem-solution` | 提案、爭取同意 | 痛點 → 診斷 → 解法 → 證據 → 行動 |
| `timeline` | 進度回報、回顧 | 起點 → 里程碑 → 現況 → 下一步 |
| `contrast` | 決策、比較方案 | 現況 vs 目標 → 差異 → 選擇 |
| `pyramid` | 高層報告、結論先行 | 結論 → 三個支撐 → 細節 → 行動 |
| `journey` | 教學、分享、故事 | 情境 → 轉折 → 學到什麼 → 帶走什麼 |

### 3. 寫 `decks/<id>/story.md`

格式與欄位見 [references/story-format.md](references/story-format.md)。寫的時候守住這幾條：

- **一頁一個 message**，一句話、可以被講者說出口。標題是主張，不是主題。
- **強度有節奏**：至少一頁強度 ≤2 的停頓、至少一頁 ≥4 的高峰，同一個 scene_role 不連續超過三頁。高峰放在最重要的證據或結論。
- **evidence 是事實**：數字、對比、案例、來源，不是形容詞。用約定的寫法讓之後能自動填進版型：數字寫成「72%｜指標名稱｜較去年 +11pp」，對比寫成「現況：a、b、c」與「目標：x、y、z」兩條。
- **第一頁 hero、最後一頁 close**；頁數落在 brief 的區間，用「每頁 1 到 2 分鐘」校對時長。
- notes 是講稿提示（轉場、停頓、要問的問題），不是把畫面再唸一次。

### 4. 檢查

```bash
pnpm story:check decks/<id>/story.md
```

修到零錯誤。警告要判斷：`pacing/pages` 超出時長是真問題；`message/single` 多半代表那頁塞了兩件事，該拆頁。

### 5. 呈現並停下

給使用者看：`story:check` 印出的摘要表與節奏條、核心主張一句、敘事骨架三到五行、你對節奏安排的一句說明。然後用這句話結尾，**不要接著做任何事**：

> 請回覆「確認」或告訴我要改哪裡；確認之前我不會開始做頁面。

只有使用者明確表示確認（確認、OK、可以、就這樣）才算；沉默、追問、或「先做看看」都不算。

### 6. 修改或確認

- 使用者要改：改 story.md，回到步驟 4，重新呈現。改動再小也要重新呈現受影響的頁。
- 使用者在編輯器裡調過播放順序或隱藏了頁（deck.json 有 `pages`）而要讓它成為正本：`pnpm story:apply-deck decks/<id>/deck.json` 會替你重排逐頁段落、移除隱藏頁（骨架不會自動改，自己核對），然後同樣回到步驟 4 呈現並確認。
- 使用者確認：

```bash
pnpm story:confirm decks/<id>/story.md
```

然後進入 slide-design（若 `decks/<id>/design.json` 已存在且使用者沒要換風格，直接進 slide-build）。

## 不做的事

- 不在確認前呼叫 `pnpm deck:scaffold`、`pnpm render`，也不手寫 deck.json。
- 不用 `--force` 繞過關卡；那是使用者明確要求時才有的權限。
- 確認之後如果使用者又改了敘事，必須重新確認（工具會擋，不要繞）。
