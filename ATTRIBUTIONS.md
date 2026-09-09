# Attributions

## ppt-agent-skill (MIT) — https://github.com/Akxan/ppt-agent-skill

Design techniques borrowed for the 2026-09 layout-library expansion (T-0012 to T-0014), re-implemented
under this project's layout/theme contract (geometry in layouts, appearance in themes, decoration as
editable shape elements):

- page furniture (top bar brand/meta, anchored labels, L-shaped corner marks, page counter)
- layered backgrounds (radial aurora glows, 80px grid lines, paper noise, dot grids)
- typography moves (negative tracking on display sizes, serif-italic emphasis on a keyword, tabular numerals)
- bento-grid layout family (hero + 3, big + 2 small, asymmetric 2/3 + 1/3, 2x2), process rail with nodes

No code was copied; the reference mocks were read for their CSS approach only.

## Lucide (ISC) — https://lucide.dev

A curated subset of 77 icons is embedded as an SVG sprite in every rendered deck (src/render/icons.ts,
generated from the `lucide-static` package). The in-browser editor's chrome (src/editor/editor.js) inlines
another 17 icon paths from the same set for its toolbars. ISC licence text ships with the package in
node_modules.
