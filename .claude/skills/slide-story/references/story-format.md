# story.md format reference

The source of truth is `src/model/story.ts` (`pnpm story:check` checks against it). This is a summary for writing.

## File structure

```markdown
---
title: <deck title>
audience: <audience: who, how many, background>
occasion: <occasion and purpose>
duration_minutes: <number of minutes, greater than 0>
density: minimal | light | standard | dense
narrative_pattern: problem-solution | timeline | contrast | pyramid | journey
core_message: <the core message in one sentence>
lang: <optional: a BCP 47 tag such as en or zh-Hant>
---

## Goal and audience
<prose: the goal, where the audience stands now, what they should do at the end>

## Core message
<one to three sentences: what the claim is and why the audience should care>

## Narrative skeleton
1. <chapter: what this chapter has to make the audience believe>
2. ...

## Slides

### s1 | <title>
- scene_role: hero | map | evidence | relationship | pause | close
- intensity: 1-5
- content_relation: statement | comparison | sequence | hierarchy | evidence | list | closing
- message: <one sentence>
- evidence: <one item, or several as an indented list>
- notes: <speaker prompts>
- chapter: <optional: the chapter of the skeleton this slide belongs to, e.g. "Skeleton">
```

The frontmatter and the `- key: value` fields are YAML: a value that itself contains `: ` (a colon followed by a space) must be quoted, e.g. `title: "Tidewatch: progress and direction"` or `- "Now: open the app, lay it out"`, or it is read as a nested mapping and rejected. Chinese full-width colons do not have this problem.

The four section headings above are the canonical ones. The original Chinese headings are still accepted as aliases, case-insensitively; new documents use the English ones.

`lang` is optional: a BCP 47 tag for the language of the content. The scaffold copies it into deck.json as `lang`; without it the language is guessed from the text when the deck is built.

A slide id starts with a letter and uses only letters, digits, underscores and hyphens (by convention `s1`, `s2`, ...); a `|` separates the id from the title (`：`, `:`, `·`, an en or em dash and `-` are accepted too).

## How to fill the fields

| Field | Meaning | How to decide |
|---|---|---|
| `scene_role` | the slide's role in the overall rhythm | hero: the opening claim; map: a map or agenda; evidence: proof; relationship: relations, processes, comparisons; pause: a pause, a question, white space; close: the wrap-up and the action |
| `intensity` | visual and emotional intensity | 1 almost blank, 2 quiet, 3 ordinary content, 4 a highlight, 5 the peak of the whole deck |
| `content_relation` | the structure of the content | statement: a single claim; comparison: two sides; sequence: steps or time; hierarchy: levels or priorities; evidence: data and facts; list: several parallel things; closing: the call to action |
| `message` | the one thing this slide says | one sentence, with a verb, supportable by evidence |
| `evidence` | the facts that go on the slide | see the conventions below |
| `notes` | speaker notes | transitions, pauses, questions, caveats |
| `chapter` | optional: the chapter of the narrative skeleton this slide belongs to | use the chapter's name from the skeleton ("Skeleton", "Deliverables"); at build time the chapters are numbered in order of first appearance and written as a label (`01`, an em dash, the chapter name) into layouts that carry a chapter label, and slides of the same chapter share the number. The cover and the closing slide usually leave it out |

## Default mapping from content relation to layout (at build time)

| scene_role / content_relation | Default layout |
|---|---|
| hero | cover |
| close, or closing | closing |
| comparison | comparison (the first two evidence items become the left and right columns) |
| list, hierarchy | cards (one card per evidence item, at most three) |
| evidence, with at least two items and every one written as `number \| label \| change` | cards (big-number cards) |
| anything else | statement (title, message, the evidence as a list) |

A slide that needs a picture can be given the `photo` layout at build time.

## Conventions for evidence

- A big number: `72% | name of the main metric | +11pp on last year` (the third part is optional; the pipe may be `|` or its full-width form, U+FF5C)
- A comparison: two items, each starting with `<name>:`, the entries separated by commas, semicolons (ASCII or full-width) or the right-arrow character (U+2192), e.g. `Now: open the software, lay it out, talk it through` (a plain `->` is not recognised as a separator)
- A process: one item, the steps joined with the right-arrow character (U+2192). The scaffold does not fill process layouts from it: pin the layout with `deck:scaffold --layouts sN=process` and write the steps into the slots by hand
- An ordinary fact: a complete short sentence, with a year, a base or a source

## Rhythm rules (errors, they block)

- At least one slide with `intensity` <= 2; at least one with >= 4
- The same `scene_role` never runs for more than 3 slides in a row
- Exactly one `message` per slide, on a single line

Warnings: the first slide is not a hero, the last slide is not a close, an evidence slide has no evidence, a message looks like more than one sentence, the slide count does not match the duration (1 to 2 minutes per slide).
