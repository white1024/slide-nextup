/**
 * Talk notes: what the speaker can say on every slide, the questions to expect and the lines
 * not to cross, in decks/<id>/talk.md. The story's notes are the raw material; the talk never
 * writes back to the story or the deck. `scaffoldTalk` writes the skeleton, `parseTalk` reads a
 * talk and `checkTalk` holds it against the deck it is for.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Deck } from '../model/deck.ts'
import { effectiveOrder } from '../model/pages.js'
import { textUnits } from '../model/scaffold.ts'
import type { Story } from '../model/story.ts'
import { slotText } from '../render/slot-render.js'

export type Severity = 'error' | 'warning'

export interface TalkDiagnostic {
  severity: Severity
  rule: string
  line: number
  message: string
}

export const LEVELS = ['high', 'medium', 'low'] as const
export type Level = (typeof LEVELS)[number]
const SCORE: Record<Level, number> = { high: 3, medium: 2, low: 1 }

/** a cue longer than this (full-width units: a CJK glyph 1, a Latin letter ½) reads like a script */
export const CUE_UNITS = 80
/** fewer questions than this is a warning: a real audience asks more */
export const MIN_QUESTIONS = 3
/** an answer that starts with this is a question nobody can answer yet */
export const OPEN_PREFIX = /^open:/i
/** the comment the scaffold leaves under every slide; a talk still carrying it is a draft */
export const DRAFT_MARK = '<!-- from the story'
export const SLIDES_HEADING = '## Slides'
export const QUESTIONS_HEADING = '## Questions to expect'
export const CHECKLIST_HEADING = '## Before you go on'

export interface TalkCue {
  tag: 'must' | 'may'
  /** `must@2:` / `may@2:` — spoken when the slide's second press reveals its elements; absent means the whole slide */
  step?: number
  text: string
  line: number
}

/** the cues per slide id as the rendered deck carries them (the presenter window reads them) */
export type TalkCues = Record<string, { tag: 'must' | 'may'; step?: number; text: string }[]>

/** the number of reveal steps each slide of the deck builds in */
export function deckSteps(deck: Deck): Map<string, number> {
  return new Map(deck.slides.map((s) => [s.id, Math.max(0, ...s.elements.map((e) => e.step ?? 0))]))
}

/** what each press of a slide reveals: step → element ids, in element order */
function stepElements(slide: Deck['slides'][number]): Map<number, string[]> {
  const out = new Map<number, string[]>()
  for (const e of slide.elements) {
    if (!e.step) continue
    out.set(e.step, [...(out.get(e.step) ?? []), e.id])
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
}

export interface TalkSlide {
  id: string
  title: string
  line: number
  cues: TalkCue[]
  /** the scaffold's story comment is still in place */
  draft: boolean
}

export interface TalkQuestion {
  n: string
  question: string
  likely: string
  costly: string
  answer: string
  line: number
}

export interface Talk {
  /** frontmatter: the deck and story the talk is for, relative to talk.md */
  deck?: string
  story?: string
  title: string
  slides: TalkSlide[]
  questions: TalkQuestion[]
  checklist: string[]
  /** the line of each section heading, for diagnostics about a whole section */
  sections: { slides?: number; questions?: number; checklist?: number }
}

export interface ParsedTalk {
  talk: Talk
  diagnostics: TalkDiagnostic[]
}

// ---------------------------------------------------------------------------------------------
// scaffold

export interface ScaffoldInput {
  deck: Deck
  story: Story
  /** the deck.json path relative to the talk file, written to the frontmatter */
  deckRel: string
  /** the story.md path relative to the talk file */
  storyRel: string
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
const clip = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** The skeleton of a talk: one section per played slide with the story's material as a comment, the questions table, the checklist. */
export function scaffoldTalk(input: ScaffoldInput): string {
  const { deck, story } = input
  const played = effectiveOrder(
    deck.slides.map((s) => s.id),
    deck.pages,
  ).visible
  const byId = new Map(story.slides.map((s) => [s.id, s]))
  const m = story.meta
  const lines: string[] = [
    '---',
    `deck: ${input.deckRel}`,
    `story: ${input.storyRel}`,
    '---',
    '',
    `# Talk notes: ${deck.title}`,
    '',
    `- Audience: ${oneLine(m.audience)}`,
    `- Occasion: ${oneLine(m.occasion)}`,
    `- Time: ${m.duration_minutes} minutes for ${played.length} slides`,
    `- Core message: ${oneLine(m.core_message)}`,
    '',
    SLIDES_HEADING,
    '',
    '<!-- One section per played slide, in playback order. Two to five cues each, every line `- must:` (the one',
    'thing the slide is there to say, and the bridge to the next) or `- may:` (colour to drop when short of time);',
    'nothing else goes under a slide. Cues, not a script: short, spoken, in the language of the story (the headings,',
    `the must/may tags, high/medium/low and open: stay as they are); talk:check warns above ${CUE_UNITS} full-width units.`,
    'A slide that builds in steps lists them in its comment; `- may@2:` (or `must@2:`) is spoken when the second press',
    "reveals its elements, and the presenter window lights it up at that step. Delete each slide's story comment once",
    'its cues are written. -->',
    '',
  ]
  for (const id of played) {
    const slide = deck.slides.find((s) => s.id === id)
    const s = byId.get(id)
    const title = s?.title ?? slotText(slide?.slots.title) ?? id
    lines.push(`### ${id} · ${oneLine(title)}`, '')
    const material: string[] = [
      `${DRAFT_MARK} · ${slide?.layout ?? ''}${s ? ` · ${s.scene_role}` : ''}`,
    ]
    if (s) {
      material.push(`message: ${oneLine(s.message)}`)
      if (s.evidence.length > 0) material.push(`evidence: ${s.evidence.map(oneLine).join(' / ')}`)
      if (s.notes) material.push(`notes: ${oneLine(s.notes)}`)
    } else {
      material.push('(this slide is not in the story; its notes are what the deck holds)')
      if (slide?.notes) material.push(`notes: ${oneLine(slide.notes)}`)
    }
    const onSlide = slide
      ? Object.entries(slide.slots)
          .map(([name, slot]) => ({ name, text: oneLine(slotText(slot)) }))
          .filter((x) => x.text && !['page', 'meta', 'brand', 'kicker'].includes(x.name))
          .map((x) => clip(x.text))
          .join(' | ')
      : ''
    if (onSlide) material.push(`on the slide: ${clip(onSlide, 400)}`)
    // the reveal steps, so a cue can be pinned to the press that shows its elements
    const steps = slide ? stepElements(slide) : new Map<number, string[]>()
    if (steps.size > 0) {
      material.push(
        `steps: ${[...steps].map(([n, ids]) => `${n}: ${ids.join(', ')}`).join(' · ')} (a \`must@n:\` or \`may@n:\` cue is spoken when press n reveals them)`,
      )
    }
    material.push('-->')
    lines.push(...material, '- must: ', '- may: ')
    for (const n of steps.keys()) lines.push(`- may@${n}: `)
    lines.push('')
  }
  lines.push(
    QUESTIONS_HEADING,
    '',
    '<!-- Eight to twelve questions the audience would ask. Likely and Costly are high, medium or low; keep the rows',
    'sorted by likely × costly (high 3, medium 2, low 1), highest first, or talk:check refuses the table. The last',
    'column holds the answer with its source; start it with `open:` when nobody has the answer yet, so the check counts',
    'it as a question that would stump the speaker. -->',
    '',
    '| # | Question | Likely | Costly | Answer, or where it gets hard |',
    '|---|---|---|---|---|',
    '| 1 |  | high | high |  |',
    '',
    CHECKLIST_HEADING,
    '',
    '<!-- The lines that must not be crossed: the figures that have to be exact, what is not to be promised, the names',
    'and dates to get right, the one sentence to close on, the minutes per chapter. -->',
    '',
    '- [ ] ',
    '',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------
// parse

// the id grammar the story allows (a letter, then letters, digits, `_` and `-`), then ` · title`
const SLIDE_HEADING = /^###\s+([A-Za-z][A-Za-z0-9_-]*)(?:\s+[·|:-]\s*(.*))?\s*$/
const CUE = /^-\s+(must|may)(?:@(\d+))?\s*:\s*(.*)$/i
const BULLET = /^-\s+/
const CHECK_ITEM = /^-\s+\[( |x|X)\]\s*(.*)$/

/** Read a talk.md; structural problems (a cue without its tag, an empty cue) are reported here, the deck comparison in checkTalk. */
export function parseTalk(text: string): ParsedTalk {
  const diagnostics: TalkDiagnostic[] = []
  const talk: Talk = { title: '', slides: [], questions: [], checklist: [], sections: {} }
  const lines = text.split(/\r?\n/)
  let i = 0
  // frontmatter
  if (lines[0]?.trim() === '---') {
    for (i = 1; i < lines.length && lines[i]?.trim() !== '---'; i++) {
      const m = /^(\w+):\s*(.*)$/.exec(lines[i] ?? '')
      if (!m) continue
      if (m[1] === 'deck') talk.deck = m[2]?.trim()
      if (m[1] === 'story') talk.story = m[2]?.trim()
    }
    i++
  }
  let section: 'none' | 'slides' | 'questions' | 'checklist' | 'other' = 'none'
  let inComment = false
  let current: TalkSlide | null = null
  let headerSeen = false
  for (; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const line = raw.trim()
    const no = i + 1
    if (inComment) {
      if (line.includes(DRAFT_MARK) && current) current.draft = true
      if (line.includes('-->')) inComment = false
      continue
    }
    if (line.startsWith('<!--')) {
      if (line.startsWith(DRAFT_MARK) && current) current.draft = true
      if (!line.includes('-->')) inComment = true
      continue
    }
    if (line.startsWith('# ') && !talk.title) {
      talk.title = line
        .slice(2)
        .replace(/^Talk notes:\s*/i, '')
        .trim()
      continue
    }
    if (line.startsWith('## ')) {
      if (line === SLIDES_HEADING) {
        section = 'slides'
        talk.sections.slides = no
      } else if (line === QUESTIONS_HEADING) {
        section = 'questions'
        talk.sections.questions = no
        headerSeen = false
      } else if (line === CHECKLIST_HEADING) {
        section = 'checklist'
        talk.sections.checklist = no
      } else section = 'other'
      current = null
      continue
    }
    if (section === 'slides') {
      const h = SLIDE_HEADING.exec(line)
      if (line.startsWith('### ') && h) {
        current = { id: h[1] ?? '', title: (h[2] ?? '').trim(), line: no, cues: [], draft: false }
        talk.slides.push(current)
        continue
      }
      const cue = CUE.exec(line)
      if (cue) {
        const tag = (cue[1] ?? '').toLowerCase() as 'must' | 'may'
        const step = cue[2] === undefined ? undefined : Number.parseInt(cue[2], 10)
        const body = (cue[3] ?? '').trim()
        if (!current) {
          diagnostics.push({
            severity: 'error',
            rule: 'slides/heading',
            line: no,
            message: 'a cue before the first `### <slide id> · <title>` heading',
          })
          continue
        }
        if (!body) {
          diagnostics.push({
            severity: 'error',
            rule: 'slides/empty',
            line: no,
            message: `${current.id}: an empty ${tag}: cue; write it or remove the line`,
          })
          continue
        }
        current.cues.push(
          step === undefined ? { tag, text: body, line: no } : { tag, step, text: body, line: no },
        )
        continue
      }
      if (BULLET.test(line)) {
        diagnostics.push({
          severity: 'error',
          rule: 'slides/tag',
          line: no,
          message: `${current?.id ?? 'a slide'}: every cue starts with \`must:\` or \`may:\``,
        })
        continue
      }
      // prose under a slide is a script by another name; the section intro before the first slide is free
      if (line && current) {
        diagnostics.push({
          severity: 'error',
          rule: 'slides/prose',
          line: no,
          message: `${current.id}: a line that is not a cue; everything under a slide is a \`- must:\` or \`- may:\` line, not prose to read out`,
        })
      }
      continue
    }
    if (section === 'questions') {
      if (!line.startsWith('|')) continue
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
      if (!headerSeen) {
        // the header row and its rule line
        if (cells[0] === '#' || /^:?-+:?$/.test(cells[0] ?? '')) {
          if (/^:?-+:?$/.test(cells[0] ?? '')) headerSeen = true
          continue
        }
      }
      if (/^:?-+:?$/.test(cells[0] ?? '')) continue
      if (cells.length < 5) {
        diagnostics.push({
          severity: 'error',
          rule: 'questions/columns',
          line: no,
          message: `a question row has ${cells.length} columns; the table is \`| # | Question | Likely | Costly | Answer |\`, with a \`|\` at both ends`,
        })
        continue
      }
      talk.questions.push({
        n: cells[0] ?? '',
        question: cells[1] ?? '',
        likely: (cells[2] ?? '').toLowerCase(),
        costly: (cells[3] ?? '').toLowerCase(),
        answer: cells.slice(4).join(' | '),
        line: no,
      })
      continue
    }
    if (section === 'checklist') {
      const item = CHECK_ITEM.exec(line)
      if (item) {
        const body = (item[2] ?? '').trim()
        if (!body) {
          diagnostics.push({
            severity: 'error',
            rule: 'checklist/empty',
            line: no,
            message: 'an empty checklist item; write it or remove the line',
          })
        } else talk.checklist.push(body)
      } else if (BULLET.test(line)) {
        diagnostics.push({
          severity: 'error',
          rule: 'checklist/item',
          line: no,
          message: 'a checklist item is `- [ ] text`',
        })
      }
    }
  }
  return { talk, diagnostics }
}

// ---------------------------------------------------------------------------------------------
// check

/** Hold a talk against the deck it is for: sections, cues, the questions table, the checklist. */
export function checkTalk(talk: Talk, deck: Deck): TalkDiagnostic[] {
  const out: TalkDiagnostic[] = []
  const sectionLine = talk.sections.slides ?? 1

  if (talk.sections.slides === undefined) {
    out.push({
      severity: 'error',
      rule: 'slides/section',
      line: 1,
      message: `no \`${SLIDES_HEADING}\` section`,
    })
  }
  const played = effectiveOrder(
    deck.slides.map((s) => s.id),
    deck.pages,
  ).visible
  const seen = new Set<string>()
  for (const s of talk.slides) {
    if (seen.has(s.id)) {
      out.push({
        severity: 'error',
        rule: 'slides/duplicate',
        line: s.line,
        message: `${s.id} has two sections`,
      })
    }
    seen.add(s.id)
    if (!played.includes(s.id)) {
      out.push({
        severity: 'error',
        rule: 'slides/unknown',
        line: s.line,
        message: `${s.id} is not a played slide of the deck (hidden, or gone); remove the section`,
      })
    }
  }
  const missing = played.filter((id) => !seen.has(id))
  if (missing.length > 0) {
    out.push({
      severity: 'error',
      rule: 'slides/missing',
      line: sectionLine,
      message: `no section for ${missing.join(', ')}; every played slide gets one`,
    })
  }
  const got = talk.slides.map((s) => s.id).filter((id) => played.includes(id))
  const expected = played.filter((id) => seen.has(id))
  if (got.join(',') !== expected.join(',')) {
    out.push({
      severity: 'error',
      rule: 'slides/order',
      line: sectionLine,
      message: `the sections run ${got.join(', ')}; the deck plays ${expected.join(', ')}`,
    })
  }
  const steps = deckSteps(deck)
  for (const s of talk.slides) {
    if (!s.cues.some((c) => c.tag === 'must')) {
      out.push({
        severity: 'error',
        rule: 'slides/must',
        line: s.line,
        message: `${s.id} has no must: cue; what is this slide there to say?`,
      })
    }
    // a cue pinned to a press the slide does not have; a slide that builds in steps with nothing pinned to them
    const max = steps.get(s.id) ?? 0
    for (const c of s.cues) {
      if (c.step === undefined || (c.step >= 1 && c.step <= max)) continue
      out.push({
        severity: 'error',
        rule: 'slides/step',
        line: c.line,
        message:
          max === 0
            ? `${s.id}: a ${c.tag}@${c.step}: cue, but the slide has no reveal steps; drop the @${c.step}`
            : `${s.id}: a ${c.tag}@${c.step}: cue, but the slide builds in ${max} step${max === 1 ? '' : 's'} (@1 to @${max})`,
      })
    }
    if (max > 0 && played.includes(s.id) && !s.cues.some((c) => c.step !== undefined)) {
      out.push({
        severity: 'warning',
        rule: 'slides/steps',
        line: s.line,
        message: `${s.id} builds in ${max} step${max === 1 ? '' : 's'} but no cue says which press to speak at (must@n: / may@n:)`,
      })
    }
    for (const c of s.cues) {
      const units = textUnits(c.text)
      if (units > CUE_UNITS) {
        out.push({
          severity: 'warning',
          rule: 'slides/cue',
          line: c.line,
          message: `${s.id}: a ${c.tag}: cue of ${Math.ceil(units)} full-width units reads like a script; keep it to a cue (up to ${CUE_UNITS})`,
        })
      }
    }
    if (s.draft) {
      out.push({
        severity: 'warning',
        rule: 'slides/draft',
        line: s.line,
        message: `${s.id}: the story comment is still in place; delete it once the cues are written`,
      })
    }
  }

  const qLine = talk.sections.questions ?? sectionLine
  if (talk.sections.questions === undefined) {
    out.push({
      severity: 'error',
      rule: 'questions/section',
      line: 1,
      message: `no \`${QUESTIONS_HEADING}\` section`,
    })
  } else if (talk.questions.length === 0) {
    out.push({
      severity: 'error',
      rule: 'questions/none',
      line: qLine,
      message: 'no questions; the audience will have some',
    })
  } else if (talk.questions.length < MIN_QUESTIONS) {
    out.push({
      severity: 'warning',
      rule: 'questions/few',
      line: qLine,
      message: `${talk.questions.length} questions; a real audience asks more than ${MIN_QUESTIONS}, aim for eight to twelve`,
    })
  }
  const scores: number[] = []
  let levelsOk = true
  for (const q of talk.questions) {
    if (!q.question.trim()) {
      out.push({
        severity: 'error',
        rule: 'questions/empty',
        line: q.line,
        message: `question ${q.n || '?'} has no text`,
      })
    }
    const answer = q.answer.trim()
    if (!answer) {
      out.push({
        severity: 'error',
        rule: 'questions/empty',
        line: q.line,
        message: `question ${q.n || '?'} has no answer; write it with its source, or \`open:\` and why`,
      })
    } else if (OPEN_PREFIX.test(answer) && !answer.replace(OPEN_PREFIX, '').trim()) {
      out.push({
        severity: 'error',
        rule: 'questions/open',
        line: q.line,
        message: `question ${q.n || '?'} is open with no reason; say what is missing and who could answer it`,
      })
    }
    const likely = SCORE[q.likely as Level]
    const costly = SCORE[q.costly as Level]
    if (likely === undefined || costly === undefined) {
      out.push({
        severity: 'error',
        rule: 'questions/level',
        line: q.line,
        message: `question ${q.n || '?'}: Likely and Costly are ${LEVELS.join(', ')}, got \`${q.likely}\` and \`${q.costly}\``,
      })
      levelsOk = false
      scores.push(0)
    } else scores.push(likely * costly)
  }
  // the order is only judged once every row has a score
  for (let k = 1; levelsOk && k < scores.length; k++) {
    if ((scores[k] ?? 0) > (scores[k - 1] ?? 0)) {
      const order = talk.questions
        .map((q, idx) => ({ n: q.n || String(idx + 1), score: scores[idx] ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.n)
      out.push({
        severity: 'error',
        rule: 'questions/order',
        line: talk.questions[k]?.line ?? qLine,
        message: `the questions are sorted by likely × costly, highest first: question ${talk.questions[k]?.n} (${scores[k]}) sits below question ${talk.questions[k - 1]?.n} (${scores[k - 1]}); the order is ${order.join(', ')}`,
      })
      break
    }
  }

  if (talk.sections.checklist === undefined) {
    out.push({
      severity: 'error',
      rule: 'checklist/section',
      line: 1,
      message: `no \`${CHECKLIST_HEADING}\` section`,
    })
  } else if (talk.checklist.length === 0) {
    out.push({
      severity: 'error',
      rule: 'checklist/none',
      line: talk.sections.checklist,
      message: 'the checklist is empty; what must not go wrong on stage?',
    })
  }
  out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
  return out
}

/** The questions nobody can answer yet (`open:` answers). */
export function openQuestions(talk: Talk): TalkQuestion[] {
  return talk.questions.filter((q) => OPEN_PREFIX.test(q.answer.trim()))
}

// ---------------------------------------------------------------------------------------------
// into the deck

/** The cues per slide, the shape the rendered deck embeds for the presenter window. */
export function talkCues(talk: Talk): TalkCues {
  const out: TalkCues = {}
  for (const s of talk.slides) {
    if (s.cues.length === 0) continue
    out[s.id] = s.cues.map((c) =>
      c.step === undefined
        ? { tag: c.tag, text: c.text }
        : { tag: c.tag, step: c.step, text: c.text },
    )
  }
  return out
}

/**
 * The talk next to a deck (`<deck dir>/talk.md`), as cues for rendering; null when there is none.
 * A talk with problems still yields what parsed (a draft's empty cues are simply left out) and
 * says how many, so the render can point at talk:check.
 */
export function loadTalkCues(
  deckDir: string,
  read: (file: string) => string | null = readIfExists,
): { file: string; cues: TalkCues; problems: number } | null {
  const file = join(deckDir, 'talk.md')
  const text = read(file)
  if (text === null) return null
  const { talk, diagnostics } = parseTalk(text)
  return { file, cues: talkCues(talk), problems: diagnostics.length }
}

function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}
