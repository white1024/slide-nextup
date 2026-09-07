---
name: slide-story
description: Writes the story document decks/<id>/story.md from the brief (core message, narrative skeleton, the role and intensity of every slide), checks it with pnpm story:check, and shows the user a per-slide summary for confirmation; no slide is generated before the user confirms. Also use it when the user wants to "work out the storyline first", "change the narrative", "reorder the slides" or "rewrite the message of slide N".
---

# slide-story - story before layout, confirmation before build

This is the only step of the workflow where a person has to stop. Layouts get reworked over and over mostly because the story changed halfway through, so the story is confirmed explicitly by the user before any slide is generated. **The confirmation is enforced by the tools**: `pnpm story:confirm` records a hash of story.md, and `pnpm deck:scaffold` refuses to run while the story is unconfirmed or has changed since (`pnpm story:check --require-confirmed` fails the same way; `render` only warns when the deck no longer matches the story).

## Steps

### 1. Read the brief

Read `decks/<id>/brief.md`. If there is no brief, run slide-brief first. If the user supplied material, read all of it before writing.

### 2. Choose a narrative pattern

| narrative_pattern | Suits | Skeleton |
|---|---|---|
| `problem-solution` | proposals, winning approval | pain -> diagnosis -> solution -> evidence -> action |
| `timeline` | progress reports, retrospectives | starting point -> milestones -> where we are -> next steps |
| `contrast` | decisions, comparing options | now vs target -> the gap -> the choice |
| `pyramid` | executive reports, conclusion first | conclusion -> three supports -> detail -> action |
| `journey` | teaching, sharing, stories | situation -> turning point -> what was learnt -> what to take away |

### 3. Write `decks/<id>/story.md`

The format and the fields are in [references/story-format.md](references/story-format.md). Use the canonical headings `## Goal and audience`, `## Core message`, `## Narrative skeleton`, `## Slides` (the original Chinese headings are still accepted as aliases). While writing, hold these lines:

- **One message per slide**: one sentence the speaker could say out loud. The title is a claim, not a topic.
- **Intensity has a rhythm**: at least one slide pauses at intensity <= 2, at least one peaks at >= 4, and the same scene_role never runs for more than three slides in a row. Put the peak on the most important evidence or on the conclusion.
- **Evidence is fact**: numbers, comparisons, cases, sources, not adjectives. Use the agreed forms so the build can fill the layouts automatically: a number as `72% | name of the metric | +11pp on last year`, a comparison as two items, `Now: a, b, c` and `Target: x, y, z`.
- **First slide hero, last slide close**; the slide count lands in the brief's range, checked against the duration at 1 to 2 minutes per slide.
- notes are speaker prompts (transitions, pauses, questions to ask), not the slide read out again.

### 4. Check

```bash
pnpm story:check decks/<id>/story.md
```

Fix until it reports zero errors. Judge the warnings: `pacing/pages` outside the duration is a real problem; `message/single` usually means the slide carries two things and should be split.

### 5. Present and stop

Show the user: the summary table and the rhythm bar that `story:check` prints, the core message in one sentence, the narrative skeleton in three to five lines, and one sentence on how you arranged the rhythm. Then end with this line and **do nothing further**:

> Reply "confirm" or tell me what to change; I will not start on the slides before you confirm.

Only an explicit confirmation counts ("confirm", "OK", "looks good", "go ahead"); silence, a follow-up question or "just try it" do not.

### 6. Revise or confirm

- The user wants changes: edit story.md, go back to step 4 and present again. However small the change, re-present the affected slides.
- The user has reordered playback or hidden slides in the editor (deck.json has `pages`) and wants that to become the source of truth: `pnpm story:apply-deck decks/<id>/deck.json` reorders the per-slide sections and removes the hidden slides for you (the skeleton is not updated automatically; check it yourself), then go back to step 4 to present and confirm again.
- The user confirms:

```bash
pnpm story:confirm decks/<id>/story.md
```

Then move to slide-design (if `decks/<id>/design.json` already exists and the user has not asked for a new style, go straight to slide-build).

## What this skill does not do

- It does not call `pnpm deck:scaffold` or `pnpm render` before confirmation, and it does not hand-write deck.json.
- It does not use `--force` to get past the gate; that is only for when the user explicitly asks for it.
- If the user changes the story after confirming, it has to be confirmed again (the tools block it; do not work around them).
