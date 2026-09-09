import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck } from '../model/deck.ts'
import {
  CUE_UNITS,
  checkTalk,
  MIN_QUESTIONS,
  openQuestions,
  parseTalk,
  type TalkDiagnostic,
} from '../talk/talk.ts'

const args = process.argv.slice(2)
const deckIndex = args.indexOf('--deck')
const target = args.find((a, i) => !a.startsWith('-') && !(deckIndex !== -1 && i === deckIndex + 1))
if (!target || args.includes('--help') || args.includes('-h')) {
  console.error(
    [
      'Usage: pnpm talk:check <talk.md> [--deck <deck.json>]',
      '  Holds the talk notes against their deck (the `deck:` line of the frontmatter, or --deck): every played slide has a',
      '  section in playback order with at least one must: cue, no cue left empty and no prose under a slide; the questions',
      '  are scored high / medium / low for likely and costly and sorted by the product; the checklist has items. A cue over',
      `  ${CUE_UNITS} full-width units, fewer than ${MIN_QUESTIONS} questions and a slide's story comment left in place are warnings. Exit code 1 on errors.`,
    ].join('\n'),
  )
  process.exit(2)
}

const rel = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/')
const file = resolve(target)
const { talk, diagnostics } = parseTalk(readFileSync(file, 'utf8'))
const deckPath =
  deckIndex !== -1
    ? resolve(args[deckIndex + 1] ?? '')
    : talk.deck
      ? resolve(dirname(file), talk.deck)
      : null
if (!deckPath || !existsSync(deckPath)) {
  console.log(
    deckPath
      ? `✖ deck ${rel(deckPath)} not found; the frontmatter's \`deck:\` line is relative to the talk file`
      : '✖ the talk names no deck: add `deck: deck.json` to its frontmatter, or pass --deck <deck.json>',
  )
  process.exit(1)
}
const parsed = parseDeck(readFileSync(deckPath, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${rel(deckPath)} ${e.path}  ${e.message}`)
  process.exit(1)
}
const all: TalkDiagnostic[] = [...diagnostics, ...checkTalk(talk, parsed.deck)].sort(
  (a, b) => a.line - b.line || a.rule.localeCompare(b.rule),
)

const open = openQuestions(talk)
console.log(
  `${talk.title || parsed.deck.title} · ${talk.slides.length} slide sections · ${talk.questions.length} questions${
    open.length ? ` (${open.length} open)` : ''
  } · ${talk.checklist.length} checklist items`,
)
for (const s of talk.slides) {
  const must = s.cues.filter((c) => c.tag === 'must').length
  const may = s.cues.length - must
  console.log(
    `${s.id.padEnd(6)} must ${must}  may ${may}${s.draft ? '  draft' : '       '}  ${s.title}`,
  )
}
if (open.length > 0) {
  console.log('')
  console.log('questions nobody can answer yet:')
  for (const q of open) console.log(`  ${q.n}. ${q.question}`)
}
console.log('')
for (const d of all)
  console.log(`${d.severity === 'error' ? '✖' : '⚠'} ${target}:${d.line}  [${d.rule}] ${d.message}`)
const errors = all.filter((d) => d.severity === 'error').length
console.log(
  `${errors === 0 ? 'passed' : 'failed'}: ${errors} errors, ${all.length - errors} warnings`,
)
process.exit(errors === 0 ? 0 : 1)
