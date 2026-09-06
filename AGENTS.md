# slide-nextup

Narrative-first slide decks: the agent (Claude Code or Codex) confirms the story with the user first, then generates an HTML deck that can be fully edited in the browser.

> 🗣️ Reply in the language the user writes in.
> 📇 This file is the entry point for every agent platform: Claude Code reads `CLAUDE.md` (a one-line `@AGENTS.md`), Codex reads this file directly.

## The deck workflow

Fixed order: **brief → story (the user confirms) → visual direction → build → edit in the browser**. Each deck lives in `decks/<id>/` (brief.md, story.md, story.confirmed.json, design.json, deck.json, assets/, deck.html).

| Skill (canonical copy in `.agents/skills/`) | What it does | Output |
|---|---|---|
| `slide-brief` | Asks four questions in one go (purpose and audience, length and page count, content readiness, density) | `decks/<id>/brief.md` |
| `slide-story` | Writes the story, runs `pnpm story:check`, shows a per-slide summary, **stops and waits for the user's confirmation**, then `pnpm story:confirm` | `story.md`, `story.confirmed.json` |
| `slide-design` | Three visual directions, each as a real cover preview; the user picks one | `themes/<id>/`, `design.json` |
| `slide-build` | Gate `story:check --require-confirmed` → `pnpm layouts` → `pnpm deck:scaffold` → fix slots → `deck:validate` → `render` → `qa` → hand over | `deck.json`, `deck.html` |

The gate is enforced by the tools: `deck:scaffold` refuses an unconfirmed story or one that changed after confirmation. `.claude/skills/` is a mirror; after editing the canonical copy run `pnpm skills:sync`, and `pnpm skills:check` catches drift. Codex finds the skills through this file and follows `.agents/skills/<name>/SKILL.md` directly.

## Do what the user asks

- "Make me a deck", "prepare a pitch, a talk, a report" with no brief yet → `slide-brief`.
- "Work out the storyline first", "change the story", "reorder", "rewrite the message of page N" → `slide-story`; never generate slides before the user confirms.
- "Change the style", "theme", "colours", "it looks too AI" → `slide-design`.
- "Redo page 3", "change this layout", "regenerate" → `slide-build`; only that page is redone and manual overrides are kept.
- "I need a timeline layout", "no layout fits this page" → there is no separate skill: at the layout-per-page step of `slide-build`, read `.agents/skills/slide-build/references/new-layout.md` and add one (three files; `theme:lint` and `theme:qa` enforce the rules). Screenshot it first with `pnpm layout:gallery --theme <theme> <id>` and show the user; once approved, register it with `deck:scaffold --layouts sN=<id>`. A layout placed in a theme pack's `layouts/` travels with `theme:export` but is visible only to decks using that theme.

## Boundaries

- Rules live in code and tests (`src/`, `tests/`); the skills describe the process and do not repeat the details.
- The first phase outputs HTML only; `pnpm qa` checks overflow, overlap, minimum font sizes and density in headless Chromium.
- Examples: `examples/tidewatch-progress/` (a confirmed story with its generated deck.json, design.json and assets), `examples/story.sample.md`.
