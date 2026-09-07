---
name: slide-build
description: After the story is confirmed and the visual direction chosen, picks a layout for every slide, generates decks/<id>/deck.json, renders it into editable HTML, runs the quality checks, delivers and explains how to edit. Also use it when the user says "redo page 3", "a different layout for this slide" or "regenerate" (only that slide is redone; manual overrides are kept).
---

# slide-build - from the story to editable HTML

## Gate (run it first; stop if it fails)

```bash
pnpm story:check decks/<id>/story.md --require-confirmed
```

The command fails when the story is not confirmed (`not confirmed: show the user the per-slide summary first, then run pnpm story:confirm once they agree`) or was changed after confirmation (`the story file was modified after it was confirmed (...), confirm it again`): go back to slide-story, present again and get the confirmation. **Do not use `--force`.**

## Steps

### 1. See which layouts exist

```bash
pnpm layouts --theme <the theme in design.json>
# a finished deck moving to another theme pack: pnpm deck:retheme decks/<id>/deck.json --theme <slug> [--reset-positions] [--dry-run], then pnpm render again
```

Every layout lists the scene_roles and content_relations it suits, its slots (type, required or not, hint) and its density limits. The header states the unit rule the hints use (character counts are full-width units: a CJK glyph counts 1, a Latin letter or digit half). A theme is looked up in the deck's own folder first, then the user directory, then the repo's `themes/`; `--deck <deck.json>` makes the list search the deck folder too.

### 2. Decide the layout slide by slide

`deck:scaffold` chooses from each slide's scene_role and content_relation (the mapping table is in slide-story's references). Your job is one question per slide: **"what would this slide lose as a plain grid?"** If you can answer it, use that layout; if you cannot, the content relation is wrong: go back to the story or change the layout. Pin the slides that do not fit with `--layouts s3=photo,s5=cards`.

When the layout you need does not exist (a timeline, a four-quadrant grid): add one following [references/new-layout.md](references/new-layout.md) instead of forcing the content into a layout that does not fit. After adding it, run `pnpm layout:gallery --theme <theme> <id>` and show the user the screenshot; iterate until they nod, then register it with `--layouts`. A user who asks for a new layout outside the workflow goes through the same reference.

### 3. Generate deck.json

```bash
pnpm deck:scaffold decks/<id>/story.md --theme <the theme in design.json> [--layouts s1=cover,s4=comparison]
```

Read the output: the layout chosen for every slide, which required slots are unfilled, which images are placeholders, whether the furniture (`meta` / `brand`) was left empty because the text was too long, and which slides exceed the layout's density (the scaffold suggests `details` before a split). To redo one slide use `--slide s3`; existing manual overrides are always kept, and an override that points at an element that no longer exists is listed as orphaned but not deleted.

### 4. Fix the content

Open `decks/<id>/deck.json` and turn every slide's `slots` into sentences that can really go on a slide; the rules are in [references/slot-mapping.md](references/slot-mapping.md). **Change only `slots` and `notes`; leave `elements` and `overrides` alone.** Images go in `decks/<id>/assets/` and are referenced by relative path; every placeholder image has to be replaced, or the slide moved to a layout that needs no image.

### 5. Validate, render, check

```bash
pnpm deck:validate decks/<id>/deck.json
pnpm render decks/<id>/deck.json -o decks/<id>/deck.html
pnpm qa decks/<id>/deck.html
```

A failed QA is reported, not repaired automatically: an overflow or a density breach means shorter text or a split slide (back to slide-story to change the story, then redo that slide); an overlap usually comes from an override, so ask the user to sort it out in edit mode. Do not edit the HTML and do not rescue a slide with overrides. The summary reads `passed: N errors, M warnings` or `failed: N errors, M warnings`; the report is in `artifacts/qa/<id>.json`.

### 6. Deliver

Tell the user:

- The path of the HTML, the slide count, the QA result and the warnings that remain.
- Open the HTML and press `E` for edit mode: the top bar holds Undo / Redo, Snap, Show hidden, Element motion, Dock toolbar, the Transition select, Download deck.json (and Download deck.html when the dev server is running) and Present (its `?` lists the shortcuts); the left column is the page thumbnails. Click an element and its style controls (font, size, weight, line height, spacing, the theme's colour swatches) appear in a floating toolbar next to it; position, size, reveal step, entrance, align and distribute, layer and details sit behind the toolbar's "more" button. Shift-click or a drag on empty space selects several elements; Ctrl+Alt+C / Ctrl+Alt+V copy and paste a style. Every change is written only to the deck's overrides, so regenerating a slide later never wipes it; without a dev server (`pnpm dev decks/<id>/deck.json`) the edits stay as a draft in the browser and can be restored on the next visit.
- Playback: the right arrow advances the current slide's reveal steps before turning the page, the left arrow goes back; `P` opens the presenter window (notes, next slide, timer, on the same machine); `?static=1` shows the final state. Motion is on by default: the scaffold sequences cards, process steps, comparisons and evidence (the element's `step`), and each element enters by the theme's motion rules when its step is reached (an element's `enter` is set behind the toolbar's "more" button or in deck.json; elements sharing a step are staggered). The page transition is the theme's default, else `fade`. To switch motion off: set the deck's `motion` to `off` (the Element motion toggle) and `transition` to `none`; `M` during playback overrides it for that browser, and an audience with prefers-reduced-motion gets no motion at all.
- Micro-interactions during playback: cards, pills, calls to action, table rows and images respond to hover (defined by the theme), a chart shows its values on hover, an image enlarges on click (Esc closes), and `[text](https://...)` in any text is a clickable link (a target of `#s3` jumps to that slide). `?static=1` and edit mode switch all of it off; QA measures the static state.
- Interactive components (written in the slots; see "Interactive slots" in slot-mapping.md): the `details` of a boxed card (role card, stat, tint, alert or sunk) expand the full content on a click, an image's `hotspots` jump to a slide, a chart's `toggle` makes the legend clickable, and a `tabs` slot is a set of tabs in one box; all of it works from the keyboard (Tab, Enter, the arrow keys). The editor's floating toolbar edits the expanded content (Details); Hotspots lets the user draw a box straight on the image, drag it and pick the target page. When the story exceeds a layout's density, the scaffold suggests details before a split.
- Skipping a slide for one occasion, or changing the running order: the page column in edit mode hides / shows, drags or moves a page (Ctrl+Shift+Up / Down, Ctrl+Shift+H), written to `pages` in deck.json and kept when a slide is redone; the page-number chips renumber themselves. story.md stays the source of the narrative: to make that arrangement the source, run `pnpm story:apply-deck decks/<id>/deck.json` (`--dry-run` shows the change first); it reorders the per-slide sections and removes the hidden slides, then go back to slide-story to present and confirm again; the next `deck:scaffold` clears `pages`, and the playback order stays the same.
- To change the story: back to slide-story; after the new confirmation, `pnpm deck:scaffold ... --slide <id>` redoes only those slides.

## What this skill does not do

- It does not edit deck.html by hand, does not write overrides and does not use `--force` on an unconfirmed story.
- It does not cut evidence out of the story to fit a layout; what does not fit is a slide the story should split.
- It leaves no process text on a slide ("placeholder", "to be added", "Option A"); an optional slot with nothing to say is left empty.
