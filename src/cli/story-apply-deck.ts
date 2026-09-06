import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseDeck } from '../model/deck.ts'
import { effectiveOrder, followsStory } from '../model/pages.js'
import { loadStory, SECTION_HEADINGS } from '../model/story.ts'
import { applyPagesToStory } from '../model/story-apply.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error(
    [
      'Usage: pnpm story:apply-deck <deck.json> [--dry-run]',
      '  Write the page arrangement of deck.json (pages: playback order and hidden slides) back into story.md: the per-slide sections are reordered to the playback order and hidden slides are removed.',
      '  After writing back the story needs confirming again (pnpm story:confirm); the next deck:scaffold then clears the matching page arrangement.',
      '  --dry-run only prints what would change, without writing.',
    ].join('\n'),
  )
  process.exit(2)
}

const deckFile = resolve(target)
const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  process.exit(1)
}
const deck = parsed.deck
const storyFile = resolve(dirname(deckFile), deck.story?.path ?? 'story.md')
if (!existsSync(storyFile)) {
  console.log(`✖ story file ${storyFile} not found (story.path of deck.json)`)
  process.exit(1)
}
const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, '/')
const storyText = readFileSync(storyFile, 'utf8')
const loaded = loadStory(storyText)
if (loaded.hasErrors || !loaded.story) {
  for (const d of loaded.diagnostics)
    console.log(`✖ ${rel(storyFile)}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('the story file itself failed its checks; fix it before writing back')
  process.exit(1)
}
const story = loaded.story
const ids = story.slides.map((s) => s.id)
const deckIds = deck.slides.map((s) => s.id)
if (deckIds.join('\u0000') !== ids.join('\u0000')) {
  console.log(
    `⚠ the slides of deck.json (${deckIds.join(', ')}) differ from the story (${ids.join(', ')}); the story wins, slides in the arrangement that do not exist are ignored`,
  )
}
if (!deck.pages || followsStory(ids, deck.pages)) {
  console.log(
    'the page arrangement matches the story (no reordering, no hidden slides), nothing to write back',
  )
  process.exit(0)
}

const before = effectiveOrder(ids, undefined).order
const result = applyPagesToStory(storyText, story, deck.pages)
const titleOf = (id: string) => story.slides.find((s) => s.id === id)?.title ?? ''
console.log(`${story.meta.title}: ${rel(storyFile)}`)
console.log(`  story order     ${before.join(' → ')}`)
console.log(`  playback order  ${result.order.join(' → ')}`)
for (const r of result.removed) console.log(`  － removed hidden slide ${r.id}｜${r.title}`)
for (const id of result.unknown)
  console.log(`  ⚠ ${id} in the arrangement is not in the story, ignored`)
const moved = result.order.filter(
  (id, i) => before.filter((b) => !result.removed.some((r) => r.id === b))[i] !== id,
)
if (moved.length > 0)
  console.log(`  ↕ slides that moved: ${moved.map((id) => `${id}｜${titleOf(id)}`).join(', ')}`)

if (dryRun) {
  console.log('(--dry-run, nothing written)')
  process.exit(0)
}

writeFileSync(storyFile, result.text, 'utf8')
console.log(`written back to ${rel(storyFile)}`)
const after = loadStory(result.text)
for (const d of after.diagnostics)
  console.log(
    `${d.severity === 'error' ? '✖' : '⚠'} ${rel(storyFile)}:${d.line}  [${d.rule}] ${d.message}`,
  )
const errors = after.diagnostics.filter((d) => d.severity === 'error').length
console.log(
  `story:check ${errors === 0 ? 'passed' : 'failed'}: ${errors} errors, ${after.diagnostics.length - errors} warnings`,
)
console.log(
  `⚠ "## ${SECTION_HEADINGS.skeleton}" was not changed automatically: ${result.removed.length > 0 ? 'if a removed slide has a matching section in the skeleton, ' : ''}check the section order and content yourself`,
)
const status = confirmationStatus(storyFile, result.text)
console.log(`✖ ${describeStatus(status)}`)
console.log(
  [
    'next steps:',
    `  1. show the user the new per-slide summary; once approved, pnpm story:confirm ${rel(storyFile)}`,
    `  2. pnpm deck:scaffold ${rel(storyFile)} --slide <slides to redo> (or the whole deck): the story order now equals the playback order, so scaffold clears pages.order, and pages.hidden entries go because those slides are no longer in the story`,
    `  3. pnpm render ${rel(join(dirname(deckFile), 'deck.json'))}; the playback order stays the same`,
  ].join('\n'),
)
process.exit(errors === 0 ? 0 : 1)
