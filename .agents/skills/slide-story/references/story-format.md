# story.md 格式參考

正本是 `src/model/story.ts` 與 `specs/story-format`（`pnpm story:check` 依此檢查）。這裡是給寫作用的摘要。

## 檔案結構

```markdown
---
title: <簡報標題>
audience: <受眾：誰、幾人、背景>
occasion: <場合與目的>
duration_minutes: <整數，分鐘>
density: minimal | light | standard | dense
narrative_pattern: problem-solution | timeline | contrast | pyramid | journey
core_message: <一句話的核心主張>
---

## 目標與受眾
<散文：目標、受眾現況、希望受眾結束時做的事>

## 核心主張
<一到三句：主張是什麼、為什麼受眾該在乎>

## 敘事骨架
1. <章節：這章要讓受眾相信什麼>
2. ...

## 逐頁

### s1 | <標題>
- scene_role: hero | map | evidence | relationship | pause | close
- intensity: 1–5
- content_relation: statement | comparison | sequence | hierarchy | evidence | list | closing
- message: <一句話>
- evidence: <一條，或縮排清單多條>
- notes: <講稿提示>
- chapter: <選填：這頁屬於骨架的哪一章，例如「骨架」>
```

頁面 id 只能用英數、底線、連字號（慣例 `s1`、`s2`…）；標題與 id 之間用 `|`。

## 欄位怎麼填

| 欄位 | 意思 | 怎麼決定 |
|---|---|---|
| `scene_role` | 這頁在整體節奏裡的角色 | hero 開場主張；map 地圖或目錄；evidence 證據；relationship 關係、流程、比較；pause 停頓、提問、留白；close 收尾與行動 |
| `intensity` | 視覺與情緒強度 | 1 幾乎空白、2 安靜、3 一般內容、4 重點、5 全場高峰 |
| `content_relation` | 內容的結構 | statement 單一主張；comparison 兩邊對比；sequence 步驟或時間；hierarchy 層級或優先序；evidence 數據與事實；list 平行的幾件事；closing 行動呼籲 |
| `message` | 這頁唯一要說的話 | 一句、有動詞、可被證據支撐 |
| `evidence` | 要放上投影片的事實 | 見下方寫法約定 |
| `notes` | 講者備註 | 轉場、停頓、提問、限制說明 |
| `chapter` | 選填，這頁屬於敘事骨架的哪一章 | 用骨架裡的章名（「骨架」「交付物」）；生成時會依第一次出現的順序編成「01 — 骨架」填進有章節標籤的版型，同章的頁共用一號。封面與結尾通常不填 |

## 內容關係與版型的對應（生成時的預設）

| scene_role / content_relation | 預設版型 |
|---|---|
| hero | cover |
| close 或 closing | closing |
| comparison | comparison（evidence 前兩條分別是左右欄） |
| list、hierarchy | cards（evidence 每條一張卡，最多三張） |
| evidence 且每條都是「數字｜標籤｜變化」 | cards（大數字卡） |
| 其他 | statement（標題、message、evidence 清單） |

需要圖片的頁可在生成時指定 `photo` 版型。

## evidence 的寫法約定

- 大數字：`72%｜主要指標名稱｜較去年 +11pp`（第三段可省略）
- 對比：兩條，各以「名稱：」開頭，項目用「、」或「→」分隔，例如 `現況：開軟體 → 排版 → 講一遍`
- 流程：一條，用「→」串接
- 一般事實：完整短句，附年份、母體或來源

## 節奏規則（error 級，會擋）

- 至少一頁 `intensity` ≤ 2；至少一頁 ≥ 4
- 同一 `scene_role` 不連續超過 3 頁
- 每頁只有一個 `message`，不能多行

警告級：第一頁不是 hero、最後一頁不是 close、evidence 頁沒有 evidence、message 看起來不只一句、頁數與時長不符（每頁 1 到 2 分鐘）。
