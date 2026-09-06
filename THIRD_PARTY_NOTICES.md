# Third-party notices

Some of this project's themes and layouts are ported from open-source projects; each source, author and licence is listed below. A port is not a byte-for-byte copy: layout geometry is rewritten into this project's layout.css contract and appearance rules into theme.css, and the original copyright notice is kept as the MIT licence requires. This file ships with the project when it is published.

## beautiful-html-templates (Zara Zhang, MIT)

- Source: <https://github.com/zarazhangrui/beautiful-html-templates>
- Related: <https://github.com/zarazhangrui/frontend-slides> (same author, MIT; the origin of the template index and workflow)
- Ported templates (each maps to `themes/<id>/`; the `source` field of theme.json records the original slug):
  - `blue-professional` ← templates/blue-professional
  - `cobalt-grid` ← templates/cobalt-grid
  - `creative-mode` ← templates/creative-mode

Full licence text:

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

## Fonts (SIL Open Font License 1.1)

The ported themes reference font files served by Google Fonts through `@font-face` (Latin subsets only; CJK text falls back to system fonts). All of them are licensed under the OFL 1.1, which permits embedding, referencing and redistribution in web pages and documents but not selling the fonts by themselves.

| Font | Author | Used in |
|---|---|---|
| Space Grotesk | Florian Karsten | blue-professional (headings), creative-mode (body) |
| Inter | Rasmus Andersson | blue-professional (body) |
| Newsreader | Production Type | cobalt-grid (headings) |
| Hanken Grotesk | Alfredo Marco Pradil, Hanken Design Co. | cobalt-grid (body) |
| DM Mono | Colophon Foundry | cobalt-grid (furniture) |
| Archivo Black | Omnibus-Type | creative-mode (headings) |
| JetBrains Mono | JetBrains | creative-mode (furniture) |

## Icons

- Lucide (ISC): the icon subset embedded by `src/render/icons.ts`, <https://lucide.dev>.

## warm-keynote (a private deck, used with its author's consent)

The style of `themes/warm-keynote/` comes from a friend's internal presentation (consent given on 2026-09-05; the author asked not to be credited). Only the visual system was taken (colours, font pairing, component vocabulary, layout composition); all CSS was rewritten under this project's contract and none of the deck's content was used. The fonts Inter and JetBrains Mono are covered by the table above (OFL).
