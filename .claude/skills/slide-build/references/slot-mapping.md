# Story fields -> layout slots

`pnpm deck:scaffold` makes a first automatic mapping; this reference explains how it fills the slots and how you revise them afterwards.

## Automatic mapping

| slot | Source |
|---|---|
| `title` | the slide's title |
| `kicker` | the chapter label (`01`, an em dash, the chapter name) when the slide has a `chapter`; chapters are numbered in order of first appearance. Without one, only the hero slide gets the first clause of `occasion` and every other slide is left empty (the scaffold cannot tell which chapter a slide belongs to) |
| `subtitle`, `body`, `caption` | `message` |
| `evidence` (list) | all of `evidence` |
| `card-1` ... `card-3` | evidence items 1 to 3; `number \| label \| change` becomes a metric |
| `left-title` / `left-items` | evidence item 1, `Name: a, b, c` split into the column name and its items |
| `right-title` / `right-items` | evidence item 2, the same way |
| `cta` (closing) | evidence item 1, else `message` |
| `photo` | a placeholder image, which has to be replaced |
| `brand` (page furniture) | the series name of the frontmatter `title` (the part before the first colon or a spaced dash), usually the left of the top bar; left empty over 24 characters |
| `meta` (page furniture) | the first clause of the frontmatter `occasion` (before the first comma, full stop, semicolon, colon or bracket), usually the pill on the right of the top bar; left empty over 10 characters |
| `page` (page furniture) | a two-digit page number such as `03 / 08`, computed by the scaffold |

A slot the layout does not accept never appears; a required slot that cannot be filled is warned about in the output. When furniture is left empty the output warns once and lists the slides, e.g. `the first clause of occasion "..." is over 10 characters, so meta is left empty on s3, s5: ...`: shorten the first clause of occasion (e.g. "Project review, introducing ..."), write the title as `series name: subtitle`, or fill deck.json directly. The limits come from `pnpm layout:gallery --capacity` measured over the eight theme packs (the tightest slot is warm-keynote's meta pill top right).

**Character units.** Every character count here, in the layouts' hints and in the density limits is a full-width unit: a CJK glyph counts 1, a Latin letter or digit half, so `up to 24 characters` is roughly 48 Latin letters. Hints state their counts in the grammar `pnpm layout:gallery --capacity` parses (`up to 24 characters`, `4 to 12 characters`, `up to 8 characters per line`, `one line`, `up to 2 lines`, `3 to 5 items, one line each`).

## Charts, tables, code, icons

The scaffold never fills these five slot types; pin the layout with `--layouts s3=chart-aside` and then write the shape below into deck.json. In the editor these components move and resize as one block, and their content is edited as multi-line text in the toolbar's content field, one entry per line.

| Slot | deck.json | Override text (one entry per line) |
|---|---|---|
| `chart` | `{ "type": "chart", "kind": "bar" \| "line" \| "donut" \| "progress", "series": [{ "label": "...", "value": 11 }], "unit": " rounds", "max": 100 }` | `label \| value`; `unit` and `max` stay as they are |
| `table` | `{ "type": "table", "header": ["column", "column"], "rows": [["cell", "cell"]] }` | `cell \| cell`; with a header the first line is the header row |
| `code` | `{ "type": "code", "value": "multi-line text", "lang": "bash" }` | the text itself |
| `icon` | `{ "type": "icon", "name": "check" }` | the icon name (the set is in `src/render/icons.ts`, a Lucide subset) |
| `tabs` | `{ "type": "tabs", "panels": [{ "label": "operator", "content": <any slot> }] }` | `## label` starts a panel and the lines below are its content (read in the panel's original type: `cell \| cell` for a table, one item per line for a list) |

Chart rules: bar and line use the whole series (3 to 8 points; the schema stops at 12), donut and progress use the first point against `max` (default 100; a donut with several points defaults to their sum). `unit` is appended straight after the number, so add the space yourself. A table holds up to 6 rows and 5 columns with 1 to 10 characters per cell; code holds up to 10 lines of 40 characters, without syntax colouring; a tab set holds up to 6 panels.

## Interactive slots (they act only during playback; static mode and QA see the default state)

| Where | deck.json | During playback | Editor |
|---|---|---|---|
| `details` on a boxed element (role card, stat, tint, alert or sunk; slot type text / list / metric) | `{ "type": "metric", ..., "details": { "type": "list", "items": [...] } }` (details may be any slot: a paragraph, a list, a table; on an element without a box, such as a title or a caption, `deck:validate` and `render` refuse it) | a plus mark appears at the bottom right of the card; a click expands it in place into a taller card (the summary plus the full content); Esc, a click on the card or turning the page collapses it; Tab to the card and Enter works too | the Details field of the floating toolbar (shown straight away on an element that has details; otherwise press "more" and then Details, a button only the roles above get); clearing the field removes the expansion; written as the override `details` |
| `hotspots` on an image | `{ "type": "image", "src": "...", "hotspots": [{ "target": "s4", "x": 25, "y": 10, "w": 25, "h": 78, "label": "two paths" }] }`; the numbers are percentages of the image box, `target` must be an existing slide id, at most 12 per image | hovering the area shows a dashed frame and the label, a click jumps to that slide; Tab to the hotspot and Enter works too | select the image and press Hotspots: press and drag on the image to draw a new one, the row under the box picks the target page (id and title), takes a label and deletes; click an existing box to drag it or pull a corner, Delete removes it, Esc finishes; in edit mode every box shows its target and label; written as the override `hotspots` (percentages of the image box) |
| `toggle: true` on a chart | `{ "type": "chart", "kind": "bar", "toggle": true, "series": [...] }` | a legend row above the chart; clicking an item removes it and the rest rescale (at least one stays); leaving playback restores the default | as for any chart: the content field takes `label \| value` |
| a `tabs` slot | see the table above; the layout has to declare a `tabs` slot (the generic `tabs`, warm-keynote's `tabs`) | clicking a tab switches the panel, the left and right arrows move between tabs | the content field, panels separated by `## label` |

Rule: collapsed, first panel, every legend item on is the "default state"; `?static=1`, QA, the editor and the thumbnails see only that. Expanded content does not count towards density, but what goes in there is still a sentence for the stage. When the story text exceeds the layout's density, `deck:scaffold` suggests details before a split; it only suggests and never changes anything itself.

## Emphasis marks

Any text slot (including each item of a list and a metric's label) may mark one word with `*keyword*`; it renders as `<em>` and the theme decides the look (often an italic serif in the accent colour). At most once per slide, on the keyword of the claim, e.g. "the measuring tool is already *something we can deliver*". A literal asterisk is written `\*`.

The same places take a link `[text](target)`: `https://...` and `mailto:` targets open a new tab, a slide id such as `#s3` jumps to that slide, any other target is plain text. Links are clickable only during playback (static and edit modes cannot trigger them by accident); the editor's in-place text editing writes the notation back unchanged, and a link and an `*emphasis*` may contain each other. A literal square bracket is written `\[`.

## Rules for revising text

- **The title is a claim**: with a verb, one or two lines, not a topic name. "What the revision count really says" works; "Data analysis" does not.
- **body is one to three lines**: an explanation or one more piece of evidence; do not repeat the evidence.
- **A card is one sentence**: a short phrase or one big number; the three cards share a form (all nouns, or all starting with a verb).
- **Comparison columns**: three to five items, both sides about equal; column names of two to six characters.
- **Lists of three or four items**: each within one line; more is a slide to split.
- **cta is an action**: the one thing the audience does when they leave, in one sentence.
- **kicker is a chapter or an occasion**: four to ten characters; in a theme pack with a chapter bar, such as warm-keynote, adding `- chapter: Skeleton` to the story's slides numbers them automatically, with no per-slide edits.
- **The counts in hints are measured**: when a slot's hint says `up to 7 characters per line, up to 2 lines`, that is what the box holds; `pnpm layout:gallery` checks it.
- Density limit: the layout's `max_chars` is the whole slide's character budget (in the units above); going over is the first sign of an overflow.

## Density table

| density | Roughly per slide |
|---|---|
| minimal | one sentence or one number; mostly cover and statement with only the title filled |
| light | a title plus one to three items |
| standard | a title plus three to five items, or one paragraph |
| dense | comparison or cards to split the structure, still within `max_chars` |

## Images

- Put them in `decks/<id>/assets/` and reference them by relative path in deck.json, e.g. `assets/chart.png`.
- `pnpm render ... --inline-assets` embeds the images for a single-file share.
- Placeholder images exist only during generation; before delivery they are replaced with real ones, or the layout changes.
- A diagram or chart belongs in a slot whose layout declares `fit: contain` (technical-brief's `photo` and `diagram-notes` do); in a `cover` slot QA warns when the picture's ratio is far from the box's, because cover crops it. Crop a photo to the box's ratio instead of letting cover decide.

## What not to touch in deck.json

- `elements`: id and kind come from the layout; a change makes the renderer refuse the deck. The only additions allowed are `step` (an integer >= 1: progressive reveal, the element appears on the n-th press of "next"; three or four steps per slide at most, most often on cards and lists) and `enter` (the entrance when the step is reached: `fade-up`, `fade`, `scale-in`, `slide-left`, `slide-right`, `wipe`, `pop` (an overshoot), `blur` (sharpens while rising), `cascade` (a list's entries or the element's parts, 50ms apart), `grow` / `draw` (a chart's bars, rings and lines play out to their real values; either works for every chart kind) or `count` (a number runs up to its real value); absent means the theme's default for the role, and the theme's motion family sets the pace). The scaffold writes the steps from the story, not from the layout: an evidence or relationship page builds up element by element, a map page reveals only its agenda items or cards, a hero, pause or close page and any page at intensity 4 or 5 shows whole, and intensity 1 or 2 builds in at most two beats. After the story changes, `pnpm deck:sync-story` reports the pages whose rhythm no longer follows it and `--resequence` rewrites them.
- A slide's own `transition` (same families as below): played when that page comes in, absent means the deck's. The scaffold writes `breath` on a pause page and `settle` on a hero page after the first; the toolbar's "This page" menu changes it.
- Top-level `transition`: a family, `rise` (6px up, the house default), `settle` (12px up with a touch of blur, for covers), `dissolve` (opacity only), `breath` (a full exit, a beat, then the entrance; section breaks), `fade` (a plain crossfade), `push` (12px sideways, mirrored going back), `lift` (8px up) or `none` (`slide-left` is the old name for `push`). Every family stays within 140–280ms and 12px, so the choice is a matter of feel, not of size; absent means the theme's motion default, else `fade`. Top-level `motion: "off"` switches every reveal step and entrance off. Static mode and QA never transition.
- `overrides`: the user's manual edits in the browser; the agent neither writes nor deletes them.
- `pages`: playback order and hidden slides, written by the editor; `pnpm story:apply-deck` folds them back into the story.
- `story.sha256`: written by the scaffold to detect a diverged story.
