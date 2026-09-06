# 第三方素材與授權聲明

本專案的部分主題與版型移植自開源專案；以下逐項列出來源、作者與授權。移植不是逐位元組複製：版型幾何重寫成本專案的 layout.css 契約，外觀規則重寫成 theme.css，並依 MIT 授權保留原作者的著作權聲明。開源本專案時，這個檔案要一併保留。

## beautiful-html-templates（Zara Zhang，MIT）

- 來源：<https://github.com/zarazhangrui/beautiful-html-templates>
- 相關專案：<https://github.com/zarazhangrui/frontend-slides>（同作者，MIT；模板索引與流程的出處）
- 移植的模板（各對應 `themes/<id>/`，theme.json 的 `source` 欄位記錄原始 slug）：
  - `blue-professional` ← templates/blue-professional
  - `cobalt-grid` ← templates/cobalt-grid
  - `creative-mode` ← templates/creative-mode

授權全文：

```
MIT License

Copyright (c) 2026 Zara Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 字型（SIL Open Font License 1.1）

移植的主題以 `@font-face` 引用 Google Fonts 提供的字型檔（僅拉丁子集；中文字落到系統字型）。這些字型都採 OFL 1.1，允許在網頁與文件中嵌入、引用與再散布，但不得單獨以字型名稱販售。

| 字型 | 作者 | 用在 |
|---|---|---|
| Space Grotesk | Florian Karsten | blue-professional（標題）、creative-mode（內文） |
| Inter | Rasmus Andersson | blue-professional（內文） |
| Newsreader | Production Type | cobalt-grid（標題） |
| Hanken Grotesk | Alfredo Marco Pradil, Hanken Design Co. | cobalt-grid（內文） |
| DM Mono | Colophon Foundry | cobalt-grid（家具） |
| Archivo Black | Omnibus-Type | creative-mode（標題） |
| JetBrains Mono | JetBrains | creative-mode（家具） |

## 圖示

- Lucide（ISC）：`src/render/icons.ts` 內嵌的圖示子集，<https://lucide.dev>。

## warm-keynote（私人簡報，經作者同意）

`themes/warm-keynote/` 的風格取自一位友人的內部簡報（2026-09-05 經作者同意，作者表明不需署名）。只取視覺系統（色彩、字型搭配、元件語彙、版型構圖），CSS 全部依本專案契約重寫，簡報內容一概未使用。字型 Inter 與 JetBrains Mono 同上表（OFL）。
