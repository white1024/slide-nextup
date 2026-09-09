---
name: slide-talk
description: After the deck is built, turns the story's notes into what the speaker can say on every slide (cues marked must or may, not a script), the questions to expect ranked by how likely they are and how much a wrong answer costs, and a checklist for the moment before going on, written to decks/<id>/talk.md and checked with pnpm talk:check. Use it when the user says "what do I say on each slide", "prepare me for questions", "speaker notes", "talk notes", "rehearse" or "I present this tomorrow".
---

# slide-talk - from the finished deck to the person who presents it

A finished deck is not a finished presentation: the speaker still needs to know what to say on each slide and what they will be asked. The story's `notes` are the raw material (the presenter window shows them), and preparing the answers is a second review of the facts: to answer in detail you go back to the sources, and that is where a wrong number on a slide gets caught, which neither `story:check` nor `qa` can do.

## Gate

The deck exists and follows the story. `pnpm deck:validate decks/<id>/deck.json` still says `passed` when the story has moved on; it prints a `⚠ story ... has changed` line, and `pnpm talk:scaffold` prints `⚠ the deck lags the story` for the same case. Either line means: finish slide-build first (`pnpm deck:sync-story`, then `pnpm deck:scaffold ... --slide <id>` for the slides whose text changed), because a talk drafted from a deck that lags the story cues the wrong text.

## Steps

### 1. Scaffold

```bash
pnpm talk:scaffold decks/<id>/deck.json    # writes decks/<id>/talk.md; --force starts over
```

One section per played slide, in playback order (hidden pages are left out), each with the story's message, evidence and notes and the text that is on the slide as a comment; then the questions table and the checklist. The cues, questions, answers and checklist are written in the language of the story; the structure stays as the scaffold wrote it, because `talk:check` reads it literally: the three `##` headings, the `### <id> · <title>` lines, the `must:` / `may:` tags, the `high` / `medium` / `low` levels and the `open:` prefix.

### 2. What to say on each slide: cues, not a script

Two to five lines per slide, each starting with `must:` or `may:`:

- `must:` the one thing the slide is there to say (the story's message, in the speaker's own words) and the bridge to the next slide. At least one per slide; `talk:check` insists.
- `may:` colour the speaker can drop when short of time: the example behind a number, the anecdote, the aside, the question to ask the room.

Hold the register: **slides are tight and formal; speech is short sentences, spoken words and repetition**, because the audience cannot rewind. A cue is what the speaker glances at, not what they read out: no paragraphs, no sentence that restates the slide's text, no "Good morning, today I will". A first draft written as prose was judged "not how anyone talks"; keep every line to a cue (`talk:check` warns above 80 full-width units, and refuses any line under a slide that is not a `must:` or `may:` cue). Say what the slide cannot say: why it matters, what happened, what comes next. The notes are prompts to work from, not text to copy.

A slide that builds in steps (its story comment lists them: `steps: 1: card-1 · 2: card-2 …`) can pin a cue to a press: `- may@2: …` or `- must@2: …` is what to say when the second press reveals its elements, and the scaffold leaves one empty `may@n:` line per step. The presenter window shows page cues at once and keeps a pinned cue dimmed until its press, highlighted at that step. `talk:check` refuses a step the slide does not have and warns when a stepped slide pins nothing.

Write the first two slides, show them to the user in one message and carry on unless they ask for a different voice; do not stop and wait. Delete a slide's story comment once its cues are written (`talk:check` warns while it is still there).

### 3. The questions to expect

Eight to twelve questions, asked by the audience the brief describes, not by the speaker. Score each for `Likely` (will it be asked) and `Costly` (what a wrong answer costs: credibility, a decision, money) with high, medium or low, and keep the table sorted by the product, highest first; `talk:check` refuses any other order. The last column holds the answer in one or two sentences **with its source** (the file, the figure, the person). When nobody has the answer yet, start the column with `open:` so the check counts it as a question that would stump the speaker, and say so in the delivery.

While answering, check every number and claim on the slides against its source. This is the point of the step: a figure that does not survive the check is a story error, not a talk note. Do not correct it quietly in talk.md: tell the user, fix it in story.md with slide-story, confirm again, then `pnpm deck:sync-story` and `pnpm deck:scaffold ... --slide <id>` for the slides whose text changed, and only then finish the talk.

### 4. Before you go on

The checklist: the lines that must not be crossed, as `- [ ]` items. The figures that have to be exact, what is not to be promised, the names and dates to get right, the one sentence to close on, and the time plan (minutes per chapter within the brief's duration).

### 5. Check and deliver

```bash
pnpm talk:check decks/<id>/talk.md
```

Fix until it reports zero errors: every played slide has a section in deck order with at least one `must:` and no empty cue, the questions are scored and sorted, the checklist has items. Then render the deck once more (`pnpm render decks/<id>/deck.json -o decks/<id>/deck.html`; the dev server does it on its own): the render embeds the cues of the talk.md next to the deck, and the presenter window (`P` while playing) shows them above the story's notes, page cues at once and pinned cues as their press comes. Tell the user: the path, how many questions there are and which are `open:`, what the fact review found and what it changed in the story, and that the questions and the checklist stay in talk.md, printed or on a second screen.

## What this skill does not do

- It does not write a word-for-word script, and it does not change deck.json, story.md or the notes; a wrong fact goes back through slide-story.
- It does not invent sources: an answer nobody can back is marked `open:`, not made up.
- It does not run before the deck is built; the cues are for the slides as they are.
