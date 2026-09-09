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
- **Motion that follows the story.** The scaffold reads each slide's scene role and intensity: an evidence or relationship page builds up element by element, a peak lands whole, a pause page breathes between chapters. Charts grow from their data and numbers count up; the presenter window lights the talk's cue for each press. Every entrance ends on the state static mode shows, and the quality check plays the deck to prove it.
- **Full in-browser editing.** Drag, resize, rotate, double-click to edit text, swap images, change fonts and colours, multi-select with alignment and distribution, undo and redo. With the dev server running, edits autosave to `deck.json`; without it, a draft is kept in the browser and **Download deck.html** saves the deck with the edits as one file.
- **Automated quality checks.** Headless Chromium measures every page for overflow, overlapping text, minimum font sizes, density, image fit and theme geometry, then plays the deck to check that every entrance and page transition ends where it should, for a deck or for every layout of a theme pack.
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
- `.agents/skills/`: the five slide skills, the canonical copies; `.claude/skills/` is the generated mirror for Claude Code (`pnpm skills:check` catches drift).
- `decks/` for your decks and `themes/` for theme packs of your own; a pack in the workspace's `themes/` is found before the user directory and the package's own themes.
- `.gitignore` for `node_modules`, `dist/`, rendered `deck.html` files and the QA, gallery, preview and theme-export outputs under `artifacts/`.

To upgrade, `pnpm add -D slide-nextup@latest` (the version is pinned exactly, so a plain `pnpm update` stays where it is) and then `pnpm exec slide-nextup init --update`: it refreshes the skills, the scripts and the pin, and never touches `AGENTS.md` or your decks.

### When the package cannot be installed

Every deck command above, from `pnpm dev` to the Commands table below, is a workspace script that runs the installed package, so none of them work until `pnpm install` has succeeded in the workspace. When it cannot (the registry is out of reach, or the package is not there yet), run the same programs from a clone of this repository: its `bin/slide-nextup.mjs` takes the same command names and runs them from the sources, `init` included.

```bash
git clone https://github.com/white1024/slide-nextup.git ../slide-nextup   # next to the workspace
cd ../slide-nextup && pnpm install && pnpm browsers:install                 # its dependencies; Node 24 (older Node: see below)
node bin/slide-nextup.mjs init ../my-decks                                  # only when the workspace does not exist yet
cd ../my-decks
node ../slide-nextup/bin/slide-nextup.mjs theme:qa --theme my-theme
node ../slide-nextup/bin/slide-nextup.mjs layout:gallery --theme my-theme --capacity
node ../slide-nextup/bin/slide-nextup.mjs qa decks/my-deck/deck.json
```

The clone is stricter about Node than a workspace is. `pnpm install` refuses it below Node 24, because pnpm always enforces a project's own `engines` field whatever `engine-strict` says; install its dependencies with npm instead, which only warns (`npm install && npx playwright install chromium`). And the sources are TypeScript: Node 24 runs them as they are (so do 22.18 and 23.6 or newer), an earlier 22 or 23 needs `--experimental-strip-types` right after `node` in every command above, and below 22.6 they do not run at all.

Nothing else changes for the commands. The workspace is still the folder you run them **in**, so its `themes/` and its deck folders are found exactly as through the scripts, and a theme pack is still named with `--theme <id>`, never with its path (`theme:qa`, `theme:check` and `layout:gallery` say so when handed one). This is a route for you at the terminal, though: the agent's skills call the workspace's `pnpm` scripts, which come back the moment the package installs.

> [!NOTE]
> Bring the machine to Node 24 yourself, before starting the agent, rather than asking the agent to do it. Left to reach Node 24 on its own, an agent tends to call a version manager, and `nvm` for Windows 1.1.12 opens a modal dialog whenever it is run through a pipe rather than a terminal, so the session waits for a click that never comes (later releases dropped that check; the workspace's `AGENTS.md` tells the agent not to try).


## How it works

The workflow is a fixed sequence: **brief → story (you confirm) → visual direction → build → edit in the browser**, then **talk** when you have to present it. Each deck lives in `decks/<id>/` with `brief.md`, `story.md`, `story.confirmed.json`, `design.json`, `deck.json`, `assets/`, the rendered `deck.html` and, once you prepare to present, `talk.md`.

| Skill (`.agents/skills/`) | What it does | Output |
| --- | --- | --- |
| `slide-brief` | Asks four questions in one go: purpose and audience, length and page count, how ready the content is, density | `decks/<id>/brief.md` |
| `slide-story` | Writes the narrative, runs `pnpm story:check`, shows a page-by-page summary and **stops for your confirmation**, then `pnpm story:confirm` | `story.md`, `story.confirmed.json` |
| `slide-design` | Renders three visual directions as real cover previews from your story and lets you pick one | `themes/<id>/`, `design.json` |
| `slide-build` | Gate `story:check --require-confirmed` → `pnpm layouts` → `pnpm deck:scaffold` → fill slots → `deck:validate` → `render` → `qa` → hand over | `deck.json`, `deck.html` |
| `slide-talk` | After the build, when you have to present it: cues for every slide (marked `must` or `may`, not a script), the questions to expect ranked by how likely they are and how costly a wrong answer is, with the ones nobody can answer marked, and a checklist for the moment before going on; `pnpm talk:check` keeps it in step with the deck | `talk.md` |

`deck:scaffold` refuses to run on an unconfirmed story or one that changed after confirmation. Redoing a single page ("regenerate page 3", "change this layout") rebuilds only that page and keeps your manual overrides.

A story is a Markdown file with a YAML frontmatter (`title`, `audience`, `occasion`, `duration_minutes`, `density`, `narrative_pattern`, `core_message`, optionally `lang`) and four sections: `## Goal and audience`, `## Core message`, `## Narrative skeleton` and `## Slides`, where each slide is a `### <id> | <title>` block with `scene_role`, `intensity`, `content_relation`, `message` and optional `evidence`, `notes` and `chapter`. The original Chinese headings are still accepted as aliases. See `examples/story.sample.md` and the format reference in `.agents/skills/slide-story/references/story-format.md`.

## Commands

| Command | What it does |
| --- | --- |
| `slide-nextup init [<dir>] [--example] [--update] [--force] [--package <spec>]` | Creates a workspace (see Getting started) or, with `--update`, refreshes its skills, scripts and pinned version. `--example` copies the bundled deck into `decks/`; `--package` pins a tarball or folder instead of this version. Run it with `npx slide-nextup init` before the package is installed anywhere. |
| `pnpm dev <deck.json> [--port 4321]` | Local preview and editing, bound to 127.0.0.1. Edits are written back to `deck.json` 1.5 s after you stop; file changes reload the page. The edit toolbar's **Download deck.html** renders the deck on disk into one HTML file with images inlined (the same as `pnpm render --inline-assets`); without the dev server the same button saves the page itself with your edits, pictures still by their relative paths, so keep that file next to the original or render with `--inline-assets` first. |
| `pnpm render <deck.json> [-o out.html] [--inline-assets]` | Renders `deck.json` into a self-contained HTML file: fixed-canvas scaling, keyboard navigation, the model embedded. |
| `pnpm qa <deck.json \| deck.html> [--min-font <px>] [--min-inner-font <px>] [--slack off\|info\|warning]` | Checks overflow, overlap, minimum font sizes, density, image fit and theme geometry in headless Chromium; the report goes to `artifacts/qa/`. The font floors (32px for content, graded lower for page furniture; one table in `src/qa/font-floors.ts` shared with the player's auto-fit) are deliberate for a projected deck; the two flags lower them for one run, for a deck read up close. `slack` is the overflow measurement the other way: a text box that paints its ground (a card, a callout) but is more than 40px, or more than 15% from 24px up, taller than what it holds, or holds nothing, is listed as a notice that never fails the run; `--slack warning` counts it among the warnings (which fail `theme:qa`, while `pnpm qa` fails on errors only), `off` hides it. Images, shapes and the page-furniture roles (those with a lower font floor: meta, chips, eyebrows, kickers, captions, pills, calls to action, tables) are not measured. The deck is also played, every page to its last step: each element must end exactly where static mode puts it (`motion-rest`), nothing may still animate on a page leaving under the next (`motion-leaving`), prefers-reduced-motion must leave nothing moving (`motion-reduced`), and entrances and page transitions must stay inside their duration bands (`motion-band`, a warning); `theme:qa` plays each pack's layouts with the scaffold's steps and the pack's own transition, so a pack's entrances per role are measured, not trusted. |
| `pnpm deck:gallery <deck.json \| deck.html> [-o dir] [--hidden] [sN…]` | Screenshots every slide in its static state (what QA measures) as 1920×1080 PNGs into `artifacts/deck-gallery/<deck-id>/` with an `index.html` contact sheet; hidden pages are skipped unless `--hidden`. QA measures boxes, so a box far taller than its text, an empty callout that still paints its ground or an image cropped by its frame only show up here. |
| `pnpm story:check <story.md> [--require-confirmed]` | Validates the narrative's fields and rhythm rules and prints a page-by-page summary; the flag also requires a confirmation. |
| `pnpm story:confirm <story.md>` | Records the sha256 of the story you confirmed (the build gate). |
| `pnpm story:apply-deck <deck.json> [--dry-run]` | Writes the page arrangement made in the editor (playback order, hidden pages) back into `story.md`. Confirm again afterwards; regenerating those pages then clears the stale `pages` entry. |
| `pnpm deck:scaffold <story.md> [--theme id] [--layouts …] [--slide sN] [--from slide.json] [--reset-overrides] [-o deck.json]` | Generates or regenerates `deck.json` from the story (the theme defaults to the choice in `design.json`, then to the existing deck's), keeping manual overrides; `--slide` redoes one page, `--from` replaces it with a page the agent wrote, `--reset-overrides` clears the overrides of the regenerated pages only. The reveal steps and the page transitions follow the story's rhythm (scene role and intensity). `pnpm deck:regenerate` runs the same command. |
| `pnpm deck:sync-story <deck.json> [--dry-run] [--resequence [s3,s5]]` | After the story was edited and confirmed again, copies every slide's notes from the story into `deck.json` and records the story's new hash; slots, overrides, reveal steps and the page arrangement are untouched, and a slide whose text changed is redone with `deck:scaffold --slide`. It also lists the slides whose reveal steps and transition no longer follow the story's rhythm; `--resequence` rewrites them all, `--resequence s3,s5` only those. |
| `pnpm talk:scaffold <deck.json> [-o <talk.md>] [--force]` | Writes the skeleton of `decks/<id>/talk.md` from the deck and its story: one section per played slide in playback order, each with the story's message, evidence and notes and the text on the slide as a comment, then the questions table and the checklist. An existing talk is kept unless `--force`. |
| `pnpm talk:check <talk.md> [--deck <deck.json>]` | Holds the talk notes against their deck: every played slide has a section in playback order with at least one `must:` cue and no cue left empty; the questions are scored high / medium / low for likely and costly and sorted by the product; the checklist has items. A cue pinned to a press (`must@n:` / `may@n:`) beyond the steps the slide has is an error, and a slide that builds in steps with no pinned cue a warning. A cue over 80 full-width units, fewer than three questions and a slide's story comment left in place are warnings. |
| `pnpm layouts [--theme id] [--deck <deck.json>] [--json]` | Lists the layouts and their slots so the agent can choose; with a theme, that pack's own layouts replace the generic ones of the same id. |
| `pnpm design:preview <story.md> --theme <id> [--layout cover] [-o dir]` | Renders a theme's cover (or another layout) with the first page of your story into `artifacts/design/<deck>/`. |
| `pnpm design:set <story.md \| deck folder> --theme <id> [--direction <name>]` | Records the chosen visual direction in the deck folder's `design.json` (schema in `schemas/design.schema.json`) after checking that the theme can be found from there; `deck:scaffold` takes its default theme from it and `deck:validate` warns when the deck sits on another theme. |
| `pnpm deck:validate <deck.json> [--write]` | Validates the deck model and its cross-references against `schemas/deck.schema.json`; `--write` normalises the file. |
| `pnpm deck:retheme <deck.json> --theme <id> [--reset-positions] [--dry-run]` | Moves a finished deck to another theme pack: each layout id is resolved again under the new theme (its own copy first), overrides are kept, and the report lists dropped slots, filled required slots and orphaned overrides. |
| `pnpm theme:lint [--deck <deck.json>]`<br>`pnpm theme:lint <file.css…> --as theme\|layout` | Checks the theme and layout contract: schema, html/json element consistency, CSS ownership. With no file it lints every pack and layout it can see; a single CSS file needs `--as theme` (colour, font and effects only) or `--as layout` (geometry only), because the file name does not decide which half of the contract applies. |
| `pnpm theme:qa [--theme id] [--slack off\|info\|warning] [layout…]` | Builds a deck from every layout's own sample and runs the full QA, plus every slot hint against the box it describes (characters, lines, a list as items × lines including the margin between items, chips as the rows they need); errors and warnings both fail. A painted box far taller than its sample is a `slack` notice, not a failure: the sample shows one filling and the box is sized for the hint's worst case (`--slack warning` makes it count). Report in `artifacts/qa/theme-<id>.json`. |
| `pnpm theme:check [--theme id] [--deck <deck.json>]` | One-shot fitness report for sharing a theme pack: `schemaVersion` and `engine`, everything `theme:lint` checks, layout structure, the core layouts and their core slots for packs that ship layouts (a cover-only pack gets a warning instead), and a `theme.css` rule for every role (missing roles are warnings). Exit code 1 on errors. |
| `pnpm theme:export <id> [-o <dir\|file.zip>] [--deck <deck.json>] [--force]` | Copies a theme pack as a folder or zips it (default `artifacts/themes/<id>.zip`), with the `theme:check` report and a file list; check findings are printed, not blocking. |
| `pnpm theme:import <dir\|file.zip> [--to user\|workspace\|repo\|deck:<deck.json>] [--force]` | Unpacks into a temporary directory and copies the pack into the user directory (default), the workspace's `themes/`, the repo or a deck folder only after `theme:check` and `theme:qa` pass. Nothing is written if either fails; an existing id needs `--force`. |
| `pnpm layout:gallery [--theme id] [--capacity] [--deck <deck.json>] [-o dir] [layout…]` | Screenshots every layout with its sample content into `artifacts/layout-gallery/` (theme `blue-professional` unless given), checks for overflow and measures how many characters and lines each text box holds against the slot hints (`--capacity` prints the table). |
| `pnpm theme:gallery [--theme <id>]… [-o dir] [--check]` | Renders the layouts each theme pack ships (its own, not the generic library) from their samples into `docs/gallery/`: one self-contained HTML page per theme × layout (no browser, no screenshots), a page per pack of live, scaled frames that open full size, and a short index of the packs. The committed folder is what GitHub Pages serves at `/gallery/`; `--check` fails when it is behind the themes and layouts, and `pnpm test` runs that check. |
| `pnpm skills:sync` / `pnpm skills:check` | Mirrors `.agents/skills` into `.claude/skills`; the check catches drift. |

## Editing in the browser

Open a rendered deck and press `E` (or add `?edit=1` to the URL) to enter edit mode:

- Click an element to drag it, pull a handle to resize, double-click to edit text. The floating toolbar keeps its controls in fixed groups: text (font, size, bold / italic / underline, alignment), text style (weight, line height, letter spacing, text colour and fill picked from the theme's palette) and element (hide, copy and paste style, reset to generated); behind **More** sit position and size, appearance (opacity, corner radius), arrange, animation (appears on click, entrance effect) and expandable content. Font size, line height, letter spacing, opacity and corner radius each pair a number field with a slider, and **Side panel** in the top bar keeps the same toolbar open as a column on the right.
- `Shift`+click or drag on empty space to select several elements, `Ctrl+A` for the page; the toolbar then aligns and distributes them.
- `Delete` hides an element, `Ctrl+Z` / `Ctrl+Y` undo and redo, `Ctrl+Alt+C` / `Ctrl+Alt+V` copy and paste a style, `Esc` clears the selection, `E` returns to playback.
- The slide rail on the left reorders pages by drag or `Ctrl+Shift+↑↓` and hides them with `Ctrl+Shift+H`; hidden pages are skipped in playback.
- Interactive content is edited in place: **Expandable content** adds content that opens when a boxed element (a card, stat, tint, alert or sunk panel) is clicked and only appears for those, **Clickable areas** lets you draw click-to-jump areas on an image, and the content field takes charts (`label | value`), tables (`|` between cells), icons by name and tabs (`## label` opens a panel).

Position, size, style, text, details and hotspots are stored as `overrides` in the embedded model; reveal steps and entrances go to the slide's elements, page order and hidden pages to `pages`, the **Animations** toggle and the deck's **Transition** menu in the top bar to the deck itself, and the **This page** menu next to it to the slide (the scaffold writes both from the story's rhythm first: a pause page breathes, a hero after the first settles). Generated content is never rewritten from the DOM. `window.__deck.exportModel()` returns the model, **Download deck.json** saves it as a file at any time, and **Download deck.html** saves the whole deck with the edits as one HTML file, with or without the dev server (a file saved without it carries the edits in its model and puts them back on the page when it opens; a deck rendered before this existed needs one more `pnpm render` to get the button); with the dev server running, edits are also written to disk automatically.

During playback, `P` opens the presenter window (next slide, the talk's cues when a `talk.md` sat next to the deck at render time, page cues at once and `must@n:` / `may@n:` cues lit as their press comes, the story's notes, position, timer), `F` fills the screen with the deck (Esc or `F` again leaves), `M` switches the animations off or on for this browser, and `?static=1` shows every element with no transitions, which is also what QA measures (`deck.html?static=1#7` opens page 7 that way; `pnpm deck:gallery` screenshots every page in this state). The page's `lang` attribute follows the deck: `lang` in deck.json, which the scaffold copies from the story's frontmatter or guesses from the script of the text (`zh-Hant`, `ja`, `ko` or `en`). Themes may define hover states for cards, pills, calls to action, table rows and images; the player adds chart tooltips, image lightboxes and `[text](url)` links.

## Themes and layouts

Every pack has a page of its layouts at <https://white1024.github.io/slide-nextup/gallery/> (the committed `docs/gallery/`, regenerated by `pnpm theme:gallery`): real pages rendered from the layouts' samples, not screenshots, so what you see is what the quality checks measured.

Themes are looked up in four places, first match wins: the deck's own folder (`decks/<id>/themes/<theme>/`), the workspace's `themes/` (the folder the command runs in; in the slide-nextup repo itself that is the repo's own `themes/`, listed once), the user directory (`$SLIDE_NEXTUP_HOME/themes/`, or `~/.slide-nextup/themes/` when the variable is unset), then the package's `themes/` (the repo's, when developing). Commands that take a `deck.json` (`render`, `qa`, `deck:validate`, `deck:retheme`, `pnpm dev`) start from its folder; `deck:scaffold` and `design:preview` start from the story's folder (for scaffold, the folder of `-o` when given). `theme:lint`, `theme:qa`, `theme:check`, `theme:export`, `layouts` and `layout:gallery` only look at a deck folder when you pass `--deck <deck.json>`. Generic layouts always come from the repo's `layouts/`.

### Adding a layout

When no layout fits (a timeline, a four-quadrant grid), a layout is three files under `layouts/<id>/` or `themes/<theme>/layouts/<id>/`: `layout.json`, `layout.html` and `layout.css`. The spec and the list of roles are in `.agents/skills/slide-build/references/new-layout.md`; let the agent write the files from it, there is no separate skill. The rules are enforced by tools: `pnpm theme:lint` rejects colour and font CSS that does not belong in a layout, `pnpm layout:gallery --theme <theme> <id>` screenshots the sample and compares each text box's capacity with the slot hint, and `pnpm theme:qa --theme <theme> <id>` runs the full QA and the same hint check over every slot. Slot hints state their limits in a small grammar the capacity check reads ("up to 24 characters", "4 to 12 characters", "8 characters per line", "one line", "up to 2 lines", "3 to 5 items, one line each"); character counts are full-width units, so a CJK glyph counts as one and a Latin letter or digit as a half, and the QA density limit is counted the same way. An item count is checked against the box the way the items are really laid out: a list as items × lines each plus the margin between items, a flow of chips as the width of one chip, how many fit in a row and how many rows the box holds — so a hint that promises a bigger budget than the box has fails even when the sample happens to fit. Show the screenshot first, iterate until it looks right, then register the layout with `deck:scaffold --layouts s3=<id>`. An image slot declares `fit` in layout.json (`cover` crops to fill, the default for photos; `contain` shows a diagram whole), and QA warns when a cover picture's ratio is far from its box's. Layouts inside a theme pack are visible only to decks using that theme and travel with `theme:export`. Theme packs that ship a full layout set also ship a `generate-layouts.cjs`, a template for generating the three files from a compact spec; copy and adapt it, since running it as is rewrites that pack's layouts.

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

Releases go through npm's trusted publishing: bump `version` in `package.json`, commit, tag `v<version>` and push the tag, and [.github/workflows/publish.yml](.github/workflows/publish.yml) runs the checks and publishes with provenance; no npm token is stored anywhere (the package's Trusted Publisher on npmjs.com names this repository and that workflow file). Version 0.1.0 was published by hand.

The package ships `dist/`, built by `pnpm build` (tsc plus the editor and runtime files copied next to the compiled modules), because Node does not strip types under `node_modules`. `npm pack` and `npm publish` build it first (`prepack`); the tarball is a few hundred files and about a quarter of a megabyte (the end-to-end transcript below records the exact numbers of the last run). `node tools/e2e-package.mjs` packs the tarball, creates a workspace from it in a temp folder, installs it and runs the workspace scripts through the bin, writing a transcript to `artifacts/demo/npm-package/`.

## License

MIT, see [LICENSE](LICENSE). The sources and licences of the ported themes and icons are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
