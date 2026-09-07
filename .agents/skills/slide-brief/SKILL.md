---
name: slide-brief
description: The first step of a new deck. One round of questions settles the purpose and audience, duration and slide count, how ready the content is, and the density, written to decks/<id>/brief.md. Use it when the user says "make me a deck", "build a presentation", "prepare a pitch / talk / report" and there is no brief yet; with a brief in place go straight to slide-story.
---

# slide-brief - one round of questions, written up as a brief

The workflow has a fixed order: **brief -> story (confirmed by the user) -> visual direction -> build -> edit in the browser**. The brief is the first step and has one purpose: to let the next step write the story correctly. It does not collect every detail.

## Steps

### 1. Sort out what the user has already said

List the information already in the user's message (topic, audience, occasion, time, existing material). **Do not ask again what has already been answered**; for the questions you intend to skip, restate your assumption so the user can correct it.

Decide the deck id: kebab-case letters, digits and hyphens (e.g. `q3-roadmap`, `team-offsite-2026`), and check that `decks/` has no folder of that name yet.

### 2. Ask four questions in one go

Use the multi-question mode of `AskUserQuestion` to ask all four at once; without that tool, list the four questions in one message. Give options for each and mark the one you recommend.

1. **Purpose and audience**: who has to make what decision or take what action after this deck? (win approval for a proposal / progress report / teaching or sharing / fundraising or sales / other)
2. **Duration and slide count**: how many minutes? Slide range 3-5 (short talk) / 6-10 (standard) / 11-20 (deep dive). About 1 to 2 minutes per slide.
3. **Content readiness**: material exists (ask the user to paste it or point at the files) / needs research from me / only an idea so far.
4. **Density**: `minimal` (one sentence or one number per slide) / `light` (a headline plus two or three points) / `standard` (a headline plus four or five points, or a short paragraph) / `dense` (several columns, lots of detail). Most talks are `light` or `standard`.

Do not ask about visual style, animation or theme colours at this step: the style is chosen from real covers in slide-design, and the first pass has no animation.

### 3. Write `decks/<id>/brief.md`

```markdown
# Brief: <working title of the deck>

- deck_id: <id>
- Purpose: <one sentence>
- Audience: <who, how many, background, what they care about>
- Occasion and duration: <occasion>, <N> minutes, aiming for <a-b> slides
- What the audience should do at the end: <one sentence>
- Content readiness: <material exists / needs research / only an idea>, material at: <path or "none">
- Density: <minimal|light|standard|dense>
- Known constraints: <brand, taboos, things that must be mentioned; "none" if there are none>
```

`Purpose`, `Audience` and `What the audience should do at the end` are the raw material of the story: make them concrete, not empty phrases like "help everyone understand the project".

### 4. Hand over

Tell the user where the brief is, then **go straight into slide-story in the same turn**; do not ask "shall I continue?" again.

## What this skill does not do

- It generates no slides, picks no theme and writes no script.
- It does not split the four questions into four rounds, and it does not ask about things the user can look up themselves (e.g. the contents of an existing file).
