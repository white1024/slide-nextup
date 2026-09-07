# Adding a layout

A layout lives in `layouts/<id>/` as three files. `pnpm theme:lint` checks the contract rule by rule; the rules are in `src/qa/layout-check.ts` and `src/qa/css-ownership.ts`.

A theme pack's own layouts live in `themes/<theme-id>/layouts/<id>/` in the same format; a layout with the same id overrides `layouts/<id>/` (a pack may ship no layouts at all and use the generic ones; the ported packs each have at least their own `cover`), and both `pnpm layouts --theme <theme-id>` and `deck:scaffold --theme` use them. Layouts are never mixed across theme packs.

## layout.json

```json
{
  "id": "<kebab-case, the same as the folder name>",
  "name": "<display name>",
  "description": "<which content relation it suits; what a plain grid would lose>",
  "content_relations": ["sequence"],
  "scene_roles": ["relationship"],
  "density": { "max_chars": 200, "max_elements": 5 },
  "slots": {
    "title": { "type": "text", "required": true, "hint": "a one-line claim, up to 24 characters" },
    "step-1": { "type": ["text", "metric"], "required": true, "hint": "step name, up to 8 characters per line" }
  },
  "elements": [
    { "id": "title", "kind": "text" },
    { "id": "step-1", "kind": "text" },
    { "id": "rail", "kind": "shape" }
  ],
  "sample": { "title": { "type": "text", "value": "..." } }
}
```

- Every slot needs an element of the same name; a text / list / metric slot maps to kind `text`, an image slot to `image`; pure decoration is a `shape`.
- `sample` is the example content for previews and tests; every required slot needs one.
- `name` is a short English name; `description` is one or two sentences: the content relation it suits and what a plain grid would lose.

## layout.html

```html
<section class="slide" data-layout="<id>">
  <h1 data-el="title" data-slot="title" data-role="title">{{title}}</h1>
  <div data-el="rail" data-role="divider"></div>
  <div data-el="step-1" data-slot="step-1" data-role="card">{{step-1}}</div>
</section>
```

- One tag per element; `data-el` matches the json's elements one to one; an element with content also carries a `data-slot` of the same name and one `{{slot}}` placeholder (once only).
- Every element carries a `data-role`, from the existing vocabulary so the theme can paint it:
  - content: title, kicker, subtitle, body, caption, list, card, cta, photo, number (the big chapter numeral), stat (a KPI number without a box: a metric or a short phrase)
  - furniture: meta (top-bar small print, page number; its font floor is 20px instead of 32px)
  - decorative shapes: backdrop (a solid block or colour bar), divider (a thin rule), corner / corner-end (the top-left and bottom-right marks; the theme draws an L with borders), glow (a halo: radial gradient plus blur, in the theme), frame (an inner frame or a readout frame), node (a process node), connector (a process line), progress (progress ticks: one per slide, the current one lit; every section carries `--page-index` / `--page-count`, written by the renderer in story order and recomputed in playback order, and the theme draws the ticks only with percentages and those two variables, never with geometry)
  - containers of composite slots: chart (transparent ground), table, code (the theme gives ground and border), icon (the theme gives the colour), tabs (the frame of a tab set: the renderer's base CSS gives the tab strip and the active tab's underline, the theme recolours with `[data-role="tabs"] .tab` / `.tab.is-active`), scrim (a translucent band over a full-bleed image; paper colour with opacity, in the theme)
- Slot types beyond text / list / metric / image: chart / table / code / icon / tabs (all map to kind `text`; their content is overridden as multi-line text, see slot-mapping.md).
- Interaction belongs to the slot, not to the layout: text / list / metric may carry `details` (expands on a click during playback; only on the roles the theme paints as a box: card, stat, tint, alert, sunk; the expanded panel keeps that role's ground), image may carry `hotspots` (click to jump), chart may carry `toggle` (a clickable legend). A layout only demonstrates each once in its sample (the first card of cards carries details, photo carries one hotspot, chart-aside's chart has toggle on); the gallery and theme:qa see the default state; a hotspot's target in a sample is some layout id (the sample deck's slide ids are the layout ids). The expanded card keeps the element's data-role, so the theme needs nothing extra.
- Arrows: the layout HTML may hold an `<svg>` with `data-el`, `data-role="connector"` and `data-shape="arrow"` (a line plus a polygon); the theme sets stroke and fill through `[data-role="connector"] line / polygon`; the element box's aspect ratio must match the viewBox.
- Auto-fit: a text element with `data-fit="true"` has its font size shrunk by the player, after the fonts load, until it just stops overflowing (down to the role's floor: 32px for content, 24px for chapter / pill / caption / cta / kicker / flow, 22px for table, 20px for meta / chip / eyebrow). Use it for subtitles, ledes and explanations whose length varies; not for titles, where an overflow means the copy should change.
- The generic library at the moment: cover, cover-editorial, cover-poster, cover-readout, hero (covers); section (chapters); statement, quote, fact (one claim, a quotation, one number); cards, bento-hero3, bento-big2, grid-2x2, icon-cards (cards); comparison, split-asym, two-cols-header, before-after (two columns); process (a sequence); chart-aside, data-table, code-block, tabs (data and tabs); photo, photo-right, full-bleed (images); closing, closing-cta (endings). `pnpm layouts` lists the slots of each.
- The furniture slots `brand`, `meta` and `page`, once declared, are filled by the scaffold (the title's series name, the first clause of the occasion, the page number); `kicker` gets the chapter label (when the story has `chapter`) or, on the hero slide, the occasion. The meta box must hold at least 10 characters and the brand box 24, or the scaffold's defaults overflow.
- Hints and the unit rule: a slot's `hint` states the count the box really holds, in the grammar `pnpm layout:gallery --capacity` parses: `up to 24 characters`, `4 to 12 characters` (a range keeps its larger end), `up to 8 characters per line`, `1 to 10 characters per cell`, `one line`, `up to 2 lines`, `3 to 5 items, one line each`; numbers as digits or the words one to ten and twelve, digits above ten. Character counts are full-width units: a CJK glyph counts 1, a Latin letter or digit half, so `up to 24 characters` is about 48 Latin letters. `up to 7 characters per line, up to 2 lines` is more useful than `up to 10 characters`, because CJK text wraps anywhere. The gallery prints the measured characters per line and lines of every text box, and a hint that promises more than the box holds fails. Do not use "line(s)", "character(s)", "item(s)", "row(s)", "each" or "per" loosely where they are not a limit (write "a short phrase", not "a line of text"); "headline" and "outline" are fine, the parser needs a number right before `line`.
- Decoration is always a shape element, never `::before` / `::after` (`content` is banned by the lint, and a pseudo-element cannot be selected in the editor).
- An inverted slide sets `data-tone="inverse"` on the section.

## layout.css

Geometry only; every selector starts with `[data-layout="<id>"]`:

```css
[data-layout="<id>"] [data-el="title"] {
  left: 96px; top: 96px; width: 1728px; height: 200px;
  font-size: 80px; line-height: 1.2; text-wrap: balance;
}
```

- The canvas is 1920 x 1080 with a 96px safe margin.
- Give every element explicit left / top / width / height, and every text element font-size and line-height; content text no smaller than 32px, `data-role="meta"` furniture no smaller than 20px (the other furniture floors are in the auto-fit note above).
- Bevels and cut corners use `clip-path`, a slant uses `transform: skew()`; both are geometry and belong to the layout.
- No colour, typeface, border or shadow: the lint stops them.

## Checks

```bash
pnpm theme:lint
pnpm layout:gallery [--theme <theme-id>] [--capacity] <id>
pnpm theme:qa --theme <theme-id> [<id>]
```

The gallery renders the sample, screenshots it to `artifacts/layout-gallery/<id>.png`, checks for overflow, and compares the capacity of every text box with the counts and lines in its hint (the capacity table is `capacity-<theme>.json` next to the screenshots; `--capacity` prints it). It ends with `no layout overflows and every hint fits`, or with the number of overflow problems and hints that do not fit. Look at the screenshot before using the layout. A theme pack's layout always needs `--theme`; without it only the generic library is checked.

theme:qa assembles every layout sample of the theme into one deck and runs the full QA (font floors, overlap, density, geometry invariant, not only overflow); an error or a warning counts as a failure, and without `--theme` every pack runs. The tests run it for all eight themes, so write the sample as the layout's own demonstration: every required slot filled, the character count within the density limit, furniture roles no smaller than the floor table (content 32px; meta / chip / eyebrow 20px; chapter / pill / caption / cta / kicker / flow 24px; table 22px).
