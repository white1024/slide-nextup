<div align="center">

<img src="brand/icon.png" width="96" height="96" alt="slide-nextup icon" />

# slide-nextup

*Narrative-first slide decks: your agent confirms the story, then generates an HTML deck you edit in the browser*

[![Node.js](https://img.shields.io/badge/Node.js->=24-3c873a?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Getting started](#getting-started) • [How it works](#how-it-works) • [Commands](#commands) • [Editing in the browser](#editing-in-the-browser) • [Themes and layouts](#themes-and-layouts)

</div>

slide-nextup is a deck-generation workflow driven by a coding agent (Claude Code or Codex). The agent writes the narrative first and stops for your confirmation; only then does it pick layouts, fill a theme and render a self-contained HTML deck. Every element of the result can be moved, resized, restyled or rewritten in the browser, and those edits are saved back to the deck model rather than lost in the DOM.

## Features

- **Story before slides.** A brief becomes a narrative document (`story.md`) with a core message, a scene role and an intensity per page. The build step refuses to run until you have confirmed it, and again if the story changes afterwards: the gate is enforced by the tools, not by the prompt.
- **One self-contained HTML file.** Keyboard navigation, step reveals, entrance animations, page transitions, a presenter window with notes and a timer, and interactive slots (expandable details, image hotspots, chart legend toggles, tabs). No build step and no server needed to present.
- **Full in-browser editing.** Drag, resize, rotate, double-click to edit text, swap images, change fonts and colours, multi-select with alignment and distribution, undo and redo. With the dev server running, edits autosave to `deck.json`; without it, a draft is kept in the browser.
- **Automated quality checks.** Headless Chromium measures every page for overflow, overlapping text, minimum font sizes, density and theme geometry, for a deck or for every layout of a theme pack.
- **Portable theme packs.** A theme is a folder (`theme.json`, `theme.css`, `layouts/`) that can be exported as a zip and imported elsewhere, after passing the same checks. Themes are resolved from the deck folder, the workspace's `themes/`, a user directory or the package.
- **Two agent platforms, one set of skills.** The process skills live once in `.agents/skills/`; the Claude Code mirror is generated and drift-checked.

## Getting started

You need Node.js 24 or newer and pnpm 10 or newer (Node 24 ships corepack, so `corepack enable pnpm` is enough there; otherwise `npm install -g pnpm`). slide-nextup is an npm package: `init` creates a workspace for your decks and pins the package in it, so the tool lives in that workspace's `node_modules` and every workspace can be on its own version.

```bash
npx slide-nextup init my-decks   # package.json, AGENTS.md, the skills, decks/, themes/
cd my-decks
pnpm install
pnpm browsers:install            # the Chromium used for QA and previews (once per Playwright version)
pnpm preflight                   # checks node, pnpm, playwright and chromium
```

> [!NOTE]
> `pnpm doctor` is a pnpm built-in and has nothing to do with this project; `pnpm preflight` is the check you want.

Then open the folder in Claude Code or Codex and ask for a presentation. The agent follows the workspace's `AGENTS.md` (written from [templates/AGENTS.md](templates/AGENTS.md)) and the skills below. Every deck command in this README (`pnpm dev`, `pnpm render`, `pnpm qa` and the rest of the Commands table) is a script that `init` wrote into the workspace's `package.json`; `slide-nextup <command>` is the same thing. Only the test, lint, type-check and build commands under Development belong to the repo.

To see a finished deck first, add `--example` to `init` (it also works later, inside the workspace: `npx slide-nextup init --example`). It copies the bundled `tidewatch-progress` deck, a confirmed story with its generated `deck.json`, into `decks/`:

```bash
pnpm dev decks/tidewatch-progress/deck.json                                      # http://127.0.0.1:4321, press E to edit
pnpm render decks/tidewatch-progress/deck.json -o decks/tidewatch-progress/deck.html
pnpm qa decks/tidewatch-progress/deck.json                                       # report in artifacts/qa/
```

What `init` writes, and what it leaves alone:

- `package.json`: one script per command (all but `init`) and `slide-nextup` pinned to the exact version as a devDependency. An existing file keeps its other fields and scripts.
- `AGENTS.md` and `CLAUDE.md`: the agent's entry points, from the package's templates. Existing ones are kept unless you pass `--force`.
- `.agents/skills/`: the four slide skills, the canonical copies; `.claude/skills/` is the generated mirror for Claude Code (`pnpm skills:check` catches drift).
- `decks/` for your decks and `themes/` for theme packs of your own; a pack in the workspace's `themes/` is found before the user directory and the package's own themes.
- `.gitignore` for `node_modules`, `dist/`, rendered `deck.html` files and the QA, gallery, preview and theme-export outputs under `artifacts/`.

To upgrade, `pnpm add -D slide-nextup@latest` (the version is pinned exactly, so a plain `pnpm update` stays where it is) and then `pnpm exec slide-nextup init --update`: it refreshes the skills, the scripts and the pin, and never touches `AGENTS.md` or your decks.


## How it works

The workflow is a fixed sequence: **brief → story (you confirm) → visual direction → build → edit in the browser**. Each deck lives in `decks/<id>/` with `brief.md`, `story.md`, `story.confirmed.json`, `design.json`, `deck.json`, `assets/` and the rendered `deck.html`.

| Skill (`.agents/skills/`) | What it does | Output |
| --- | --- | --- |
| `slide-brief` | Asks four questions in one go: purpose and audience, length and page count, how ready the content is, density | `decks/<id>/brief.md` |
| `slide-story` | Writes the narrative, runs `pnpm story:check`, shows a page-by-page summary and **stops for your confirmation**, then `pnpm story:confirm` | `story.md`, `story.confirmed.json` |
| `slide-design` | Renders three visual directions as real cover previews from your story and lets you pick one | `themes/<id>/`, `design.json` |
| `slide-build` | Gate `story:check --require-confirmed` → `pnpm layouts` → `pnpm deck:scaffold` → fill slots → `deck:validate` → `render` → `qa` → hand over | `deck.json`, `deck.html` |

`deck:scaffold` refuses to run on an unconfirmed story or one that changed after confirmation. Redoing a single page ("regenerate page 3", "change this layout") rebuilds only that page and keeps your manual overrides.

A story is a Markdown file with a YAML frontmatter (`title`, `audience`, `occasion`, `duration_minutes`, `density`, `narrative_pattern`, `core_message`, optionally `lang`) and four sections: `## Goal and audience`, `## Core message`, `## Narrative skeleton` and `## Slides`, where each slide is a `### <id> | <title>` block with `scene_role`, `intensity`, `content_relation`, `message` and optional `evidence`, `notes` and `chapter`. The original Chinese headings are still accepted as aliases. See `examples/story.sample.md` and the format reference in `.agents/skills/slide-story/references/story-format.md`.

## Commands

| Command | What it does |
| --- | --- |
| `slide-nextup init [<dir>] [--example] [--update] [--force] [--package <spec>]` | Creates a workspace (see Getting started) or, with `--update`, refreshes its skills, scripts and pinned version. `--example` copies the bundled deck into `decks/`; `--package` pins a tarball or folder instead of this version. Run it with `npx slide-nextup init` before the package is installed anywhere. |
| `pnpm dev <deck.json> [--port 4321]` | Local preview and editing, bound to 127.0.0.1. Edits are written back to `deck.json` 1.5 s after you stop; file changes reload the page. The edit toolbar's **Download deck.html** renders the deck on disk into one HTML file with images inlined (the same as `pnpm render --inline-assets`). |
| `pnpm render <deck.json> [-o out.html] [--inline-assets]` | Renders `deck.json` into a self-contained HTML file: fixed-canvas scaling, keyboard navigation, the model embedded. |
| `pnpm qa <deck.json \| deck.html>` | Checks overflow, overlap, minimum font sizes, density and theme geometry in headless Chromium; the report goes to `artifacts/qa/`. |
| `pnpm story:check <story.md> [--require-confirmed]` | Validates the narrative's fields and rhythm rules and prints a page-by-page summary; the flag also requires a confirmation. |
| `pnpm story:confirm <story.md>` | Records the sha256 of the story you confirmed (the build gate). |
| `pnpm story:apply-deck <deck.json> [--dry-run]` | Writes the page arrangement made in the editor (playback order, hidden pages) back into `story.md`. Confirm again afterwards; regenerating those pages then clears the stale `pages` entry. |
| `pnpm deck:scaffold <story.md> [--theme id] [--layouts …] [--slide sN] [--from slide.json] [--reset-overrides] [-o deck.json]` | Generates or regenerates `deck.json` from the story, keeping manual overrides; `--slide` redoes one page, `--from` replaces it with a page the agent wrote, `--reset-overrides` clears the overrides of the regenerated pages only. |
| `pnpm layouts [--theme id] [--deck <deck.json>] [--json]` | Lists the layouts and their slots so the agent can choose; with a theme, that pack's own layouts replace the generic ones of the same id. |
| `pnpm design:preview <story.md> --theme <id> [--layout cover] [-o dir]` | Renders a theme's cover (or another layout) with the first page of your story into `artifacts/design/<deck>/`. |
| `pnpm deck:validate <deck.json> [--write]` | Validates the deck model and its cross-references against `schemas/deck.schema.json`; `--write` normalises the file. |
| `pnpm deck:retheme <deck.json> --theme <id> [--reset-positions] [--dry-run]` | Moves a finished deck to another theme pack: each layout id is resolved again under the new theme (its own copy first), overrides are kept, and the report lists dropped slots, filled required slots and orphaned overrides. |
| `pnpm theme:lint [--as theme\|layout <css>]` | Checks the theme and layout contract: schema, html/json element consistency, CSS ownership. |
| `pnpm theme:qa [--theme id] [layout…]` | Builds a deck from every layout's own sample and runs the full QA; errors and warnings both fail. Report in `artifacts/qa/theme-<id>.json`. |
| `pnpm theme:check [--theme id] [--deck <deck.json>]` | One-shot fitness report for sharing a theme pack: `schemaVersion` and `engine`, everything `theme:lint` checks, layout structure, the core layouts and their core slots for packs that ship layouts (a cover-only pack gets a warning instead), and a `theme.css` rule for every role (missing roles are warnings). Exit code 1 on errors. |
| `pnpm theme:export <id> [-o <dir\|file.zip>] [--deck <deck.json>] [--force]` | Copies a theme pack as a folder or zips it (default `artifacts/themes/<id>.zip`), with the `theme:check` report and a file list; check findings are printed, not blocking. |
| `pnpm theme:import <dir\|file.zip> [--to user\|workspace\|repo\|deck:<deck.json>] [--force]` | Unpacks into a temporary directory and copies the pack into the user directory (default), the workspace's `themes/`, the repo or a deck folder only after `theme:check` and `theme:qa` pass. Nothing is written if either fails; an existing id needs `--force`. |
| `pnpm layout:gallery [--theme id] [--capacity] [--deck <deck.json>] [-o dir] [layout…]` | Screenshots every layout with its sample content into `artifacts/layout-gallery/` (theme `ink-paper` unless given), checks for overflow and measures how many characters and lines each text box holds against the slot hints (`--capacity` prints the table). |
| `pnpm skills:sync` / `pnpm skills:check` | Mirrors `.agents/skills` into `.claude/skills`; the check catches drift. |

## Editing in the browser

Open a rendered deck and press `E` (or add `?edit=1` to the URL) to enter edit mode:

- Click an element to drag it, pull a handle to resize, double-click to edit text. The floating toolbar keeps its controls in fixed groups: text (font, size, bold / italic / underline, alignment), text style (weight, line height, letter spacing, text colour and fill picked from the theme's palette) and element (hide, copy and paste style, reset to generated); behind **More** sit position and size, appearance (opacity, corner radius), arrange, animation (appears on click, entrance effect) and expandable content. Font size, line height, letter spacing, opacity and corner radius each pair a number field with a slider, and **Side panel** in the top bar keeps the same toolbar open as a column on the right.
- `Shift`+click or drag on empty space to select several elements, `Ctrl+A` for the page; the toolbar then aligns and distributes them.
- `Delete` hides an element, `Ctrl+Z` / `Ctrl+Y` undo and redo, `Ctrl+Alt+C` / `Ctrl+Alt+V` copy and paste a style, `Esc` clears the selection, `E` returns to playback.
- The slide rail on the left reorders pages by drag or `Ctrl+Shift+↑↓` and hides them with `Ctrl+Shift+H`; hidden pages are skipped in playback.
- Interactive content is edited in place: **Expandable content** adds content that opens when a boxed element (a card, stat, tint, alert or sunk panel) is clicked and only appears for those, **Clickable areas** lets you draw click-to-jump areas on an image, and the content field takes charts (`label | value`), tables (`|` between cells), icons by name and tabs (`## label` opens a panel).

Position, size, style, text, details and hotspots are stored as `overrides` in the embedded model; reveal steps and entrances go to the slide's elements, page order and hidden pages to `pages`, and the **Animations** and **Slide transition** switches in the top bar to the deck itself. Generated content is never rewritten from the DOM. `window.__deck.exportModel()` returns the model, and **Download deck.json** saves it as a file at any time; with the dev server running, edits are also written to disk automatically.

During playback, `P` opens the presenter window (next slide, notes, position, timer), `M` switches the animations off or on for this browser, and `?static=1` shows every element with no transitions, which is also what QA measures. The page's `lang` attribute follows the deck: `lang` in deck.json, which the scaffold copies from the story's frontmatter or guesses from the script of the text (`zh-Hant`, `ja`, `ko` or `en`). Themes may define hover states for cards, pills, calls to action, table rows and images; the player adds chart tooltips, image lightboxes and `[text](url)` links.

## Themes and layouts

Themes are looked up in four places, first match wins: the deck's own folder (`decks/<id>/themes/<theme>/`), the workspace's `themes/` (the folder the command runs in; in the slide-nextup repo itself that is the repo's own `themes/`, listed once), the user directory (`$SLIDE_NEXTUP_HOME/themes/`, or `~/.slide-nextup/themes/` when the variable is unset), then the package's `themes/` (the repo's, when developing). Commands that take a `deck.json` (`render`, `qa`, `deck:validate`, `deck:retheme`, `pnpm dev`) start from its folder; `deck:scaffold` and `design:preview` start from the story's folder (for scaffold, the folder of `-o` when given). `theme:lint`, `theme:qa`, `theme:check`, `theme:export`, `layouts` and `layout:gallery` only look at a deck folder when you pass `--deck <deck.json>`. Generic layouts always come from the repo's `layouts/`.

### Adding a layout

When no layout fits (a timeline, a four-quadrant grid), a layout is three files under `layouts/<id>/` or `themes/<theme>/layouts/<id>/`: `layout.json`, `layout.html` and `layout.css`. The spec and the list of roles are in `.agents/skills/slide-build/references/new-layout.md`; let the agent write the files from it, there is no separate skill. The rules are enforced by tools: `pnpm theme:lint` rejects colour and font CSS that does not belong in a layout, `pnpm layout:gallery --theme <theme> <id>` screenshots the sample and compares each text box's capacity with the slot hint, and `pnpm theme:qa --theme <theme> <id>` runs the full QA. Slot hints state their limits in a small grammar the capacity check reads ("up to 24 characters", "4 to 12 characters", "8 characters per line", "one line", "up to 2 lines", "3 to 5 items, one line each"); character counts are full-width units, so a CJK glyph counts as one and a Latin letter or digit as a half, and the QA density limit is counted the same way. Show the screenshot first, iterate until it looks right, then register the layout with `deck:scaffold --layouts s3=<id>`. Layouts inside a theme pack are visible only to decks using that theme and travel with `theme:export`. Theme packs that ship a full layout set also ship a `generate-layouts.cjs`, a template for generating the three files from a compact spec; copy and adapt it, since running it as is rewrites that pack's layouts.

### Sharing a theme pack

A theme pack is one folder: `theme.json` (with `schemaVersion` and an optional `engine` range), `theme.css`, `layouts/<id>/` triples and any generator it comes with. `pnpm theme:export <id>` produces `artifacts/themes/<id>.zip` (or `-o <folder>`). `pnpm theme:import <zip or folder>` installs into the user directory by default so every deck can use it; `--to workspace` keeps it with the workspace (found before the user directory), `--to deck:<deck.json>` limits it to one deck, `--to repo` puts it into the slide-nextup repo itself. The import runs `theme:check` and `theme:qa` in a temporary directory first and writes nothing if either fails.

> [!TIP]
> A theme ported from someone else's template has a `source` field in `theme.json`; after importing one, add an entry to `THIRD_PARTY_NOTICES.md`.

## Development

Clone the repository to work on slide-nextup itself. There the same commands run straight from the sources (`node src/cli/<name>.ts`; Node strips the types), and the tests, lint and type check are:

```bash
git clone https://github.com/white1024/slide-nextup.git && cd slide-nextup
pnpm install && pnpm browsers:install
pnpm test        # vitest, including browser tests in headless Chromium
pnpm check       # biome lint and format
pnpm typecheck   # tsc --noEmit
```

Examples: `examples/tidewatch-progress/` is a confirmed story with its design choice, generated `deck.json` and assets (the deck that `init --example` copies); `examples/story.sample.md` passes `story:check`, while `examples/story.broken-fields.md` and `examples/story.broken-rhythm.md` show the two kinds of failure.

The package ships `dist/`, built by `pnpm build` (tsc plus the editor and runtime files copied next to the compiled modules), because Node does not strip types under `node_modules`. `npm pack` and `npm publish` build it first (`prepack`); the tarball is a few hundred files and about a quarter of a megabyte (the end-to-end transcript below records the exact numbers of the last run). `node tools/e2e-package.mjs` packs the tarball, creates a workspace from it in a temp folder, installs it and runs the workspace scripts through the bin, writing a transcript to `artifacts/demo/npm-package/`.

## License

MIT, see [LICENSE](LICENSE). The sources and licences of the ported themes and icons are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
