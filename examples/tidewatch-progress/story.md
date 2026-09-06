---
title: Tidewatch 網站健檢工具：進度、交付與方向
audience: 產品負責人一人，可能有同組的兩位同事；負責人已清楚三人分工，在意工具交得出去嗎、交出去的是什麼形態、非技術人員用不用得了
occasion: 專案進度會，介紹健檢工具的現況、已交付的東西與工作方向
duration_minutes: 10
density: standard
narrative_pattern: pyramid
core_message: 健檢工具已經是一包可交付的東西：報告契約、CLI 與解壓即用的交付包都在，GUI 正在把它變成非技術人員也能用的版本。
---

## 目標與受眾

這場進度會要讓產品負責人在 10 分鐘內知道兩件事：工具已經交出了什麼形態、現在正在做什麼。負責人是三人分工計畫的發起人，已經清楚各自負責什麼，所以不重述分工，直接講工具。本專案目前的責任是交付工具，不是產出健檢數據，所以全程不拿過去檢查的數字出來。結束時希望他清楚工具的現況，並對「交付包加 GUI」這個交付形態點頭。

## 核心主張

工具已經是一包可交付的東西。對外有 Result Schema v1 這份跨平台契約，有 CLI 與固定六步的健檢流程，有解壓即用、空機無人值守安裝的交付包。正在做的 GUI 是負責人指定的方向，目的是讓行銷與客服不開終端機也能設定、健檢、看結果。

## 敘事骨架

1. 結論：健檢工具已經是一包可交付的東西，GUI 正在讓它更好用。
2. 骨架：一張圖看工具怎麼組成，再講三個刻意的設計原則。
3. 交付物：Result Schema 契約、解壓即用的交付包、固定六步的健檢流程。
4. 進行中：給非技術人員的 GUI。
5. 收尾：交給客服的是同一包，CLI 與 GUI 共用同一份設定與結果。

## 逐頁

### s1 | 健檢工具已經是一包可交付的東西
- scene_role: hero
- intensity: 4
- content_relation: statement
- message: 健檢工具已經有報告契約、CLI 與解壓即用的交付包，GUI 正在把它變成非技術人員也能用的版本。
- evidence: Tidewatch 網站健檢工具 tidewatch，2026-08 起的進度回報。
- notes: 開場一句話講結論。負責人最想知道的是「工具交得出去嗎」，先給答案再展開。

### s2 | 今天講兩件事
- scene_role: map
- intensity: 2
- content_relation: list
- message: 今天講已經交出來的工具與契約，以及進行中的 GUI。
- evidence:
  - 已交付：健檢工具骨架、Result Schema 契約、交付包、六步流程
  - 進行中：給非技術人員的 GUI
- notes: 十秒帶過，讓負責人知道結構就好。

### s3 | 健檢工具 tidewatch 的骨架
- scene_role: relationship
- intensity: 4
- content_relation: statement
- message: 站台清單進來，走兩條檢查路徑，落到同一個報告目錄，評分是獨立的第二遍。
- evidence: 系統圖：站台清單 → 瀏覽器路徑／爬蟲路徑 → 報告目錄 → aggregate／export
- notes: 這頁用 photo 版型放簡化版系統圖（四個大字塊），完整系統圖留作備用。講的時候用手指順著箭頭走一遍就好，原則留到下一頁。

### s4 | 三個刻意的設計原則
- scene_role: evidence
- intensity: 3
- content_relation: list
- message: 兩條路徑不併表、報告目錄是共用契約、評分與檢查分開，三件事都是刻意的。
- evidence:
  - 兩條路徑不併表：瀏覽器路徑含載入與轉譯，是對外主數據源；爬蟲路徑只做交叉核對
  - 報告目錄是共用契約：逐頁狀態原子寫入，任何一刻中斷都能續跑
  - 評分是獨立的第二遍：重新評分免費，重新檢查要一整夜，判定政策可改而數字不必重跑
- notes: 三張卡各對應系統圖的一個區塊。「不併表」是因為檢查邊界不同，不提任何實測比值。

### s5 | 交出去的東西：契約與交付包
- scene_role: evidence
- intensity: 3
- content_relation: list
- message: 對外已經有 Result Schema v1 契約，以及解壓即用、空機無人值守安裝的交付包。
- evidence:
  - Result Schema v1.0.0：所有平台共用的 result.json 契約，附三份角色文件
  - 交付包 0.1.0：執行檔、設定檔、文件、瀏覽器核心，空機解壓後無人值守安裝
- notes: 交付包對應分工計畫裡「可重複執行的標準化健檢 Package」。三份角色文件是 operator、viewer、new-platform。第三張卡留空。

### s6 | 固定六步的健檢流程
- scene_role: relationship
- intensity: 3
- content_relation: sequence
- message: 一次完整健檢是固定的六步，可中斷、可續跑，最後一步 export 才產出交出去的結果檔。
- evidence: preflight（機器準備好了嗎）→ download（取得站台清單）→ plan（空跑看要查幾頁）→ run（逐頁檢查、狀態落盤）→ aggregate（彙整成表）→ export（產出 result.json）
- notes: 全寬一條流程。提醒兩個最容易漏的地方：run 不會自動產出 result.json，漏掉 export 等於跑完卻交不出東西；aggregate 要在還留著快照的機器上跑。

### s7 | 進行中：給非技術人員的 GUI
- scene_role: evidence
- intensity: 4
- content_relation: list
- message: 正在做的是一個解壓即用的本機 GUI，讓行銷與客服不開終端機也能設定、健檢、看結果。
- evidence:
  - 站台設定：匯入站台清單，逐階段進度，缺件擋、檢查條件只告知
  - 執行健檢：固定預設集按鈕，參數不可改，可比性由設定檔版本控管
  - 結果：摘要四格、色階圖、折線圖、時序圖，完整表格降到展開層
- notes: 負責人上個月提的方向。兩個裁定：不做全參數編輯器、不拆成兩個 APP。目前三頁走通、三套外觀，驗收條件是「重灌後的空機解壓雙擊跑完 smoke，全程不開終端機」。

### s8 | 交給客服的是同一包
- scene_role: close
- intensity: 3
- content_relation: closing
- message: CLI 與 GUI 共用同一份設定與結果，交出去的永遠是同一個解壓即用的包。
- evidence: 薄殼原則：GUI 不重做判斷邏輯，只經退出碼與 result.json 溝通；不裝 GUI 的包照常可用。
- notes: 收尾只講交付形態，不講數據、不列時程。若負責人問下一步，答「交付包在重灌後的空機做端到端驗收」。
