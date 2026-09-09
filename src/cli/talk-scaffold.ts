import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseDeck, sha256 } from '../model/deck.ts'
import { loadStory } from '../model/story.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'
import { scaffoldTalk } from '../talk/talk.ts'

const args = process.argv.slice(2)
const outIndex = args.indexOf('-o')
const force = args.includes('--force')
const target = args.find((a, i) => !a.startsWith('-') && !(outIndex !== -1 && i === outIndex + 1))
if (!target || args.includes('--help') || args.includes('-h')) {
  console.error(
    [
      'Usage: pnpm talk:scaffold <deck.json> [-o <talk.md>] [--force]',
      '  Writes the skeleton of the talk notes next to the deck (decks/<id>/talk.md): one section per played slide in playback',
      "  order, each with the story's message, evidence and notes and the text on the slide as a comment, then the questions",
      '  table and the checklist. The story is read through the deck (its `story` field). An existing talk is kept unless --force.',
    ].join('\n'),
  )
  process.exit(2)
}

const rel = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/')
const deckFile = resolve(target)
const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  process.exit(1)
}
const deck = parsed.deck
if (!deck.story) {
  console.log(
    '✖ this deck records no story (no `story` field), and the talk is drafted from the story; deck:scaffold writes that field',
  )
  process.exit(1)
}
const storyFile = resolve(dirname(deckFile), deck.story.path)
if (!existsSync(storyFile)) {
  console.log(`✖ story file ${deck.story.path} not found next to the deck`)
  process.exit(1)
}
const storyText = readFileSync(storyFile, 'utf8')
const loaded = loadStory(storyText)
if (loaded.hasErrors || !loaded.story) {
  for (const d of loaded.diagnostics)
    console.log(`✖ ${rel(storyFile)}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('the story file failed its checks; fix it before drafting the talk')
  process.exit(1)
}
const status = confirmationStatus(storyFile, storyText)
if (status.state !== 'confirmed') {
  console.log(`⚠ ${describeStatus(status)}`)
  console.log('  the talk is drafted from the story on disk; the cues follow whatever it says now')
}
if (deck.story.sha256 !== sha256(storyText)) {
  console.log(
    `⚠ the deck lags the story: ${deck.story.path} changed after deck.json was generated, so the story material here and the text on the slides differ`,
  )
  console.log(
    '  finish slide-build first: pnpm deck:sync-story <deck.json>, then pnpm deck:scaffold <story.md> --slide <id> for the slides whose text changed',
  )
}

const outFile =
  outIndex === -1 ? join(dirname(deckFile), 'talk.md') : resolve(args[outIndex + 1] ?? '')
if (existsSync(outFile) && !force) {
  console.log(
    `✖ ${rel(outFile)} exists; the talk is hand-written, so it is not overwritten without --force`,
  )
  process.exit(1)
}
const outDir = dirname(outFile)
const text = scaffoldTalk({
  deck,
  story: loaded.story,
  deckRel: relative(outDir, deckFile).replace(/\\/g, '/'),
  storyRel: relative(outDir, storyFile).replace(/\\/g, '/'),
})
writeFileSync(outFile, text, 'utf8')
const played = text.split('\n').filter((l) => l.startsWith('### ')).length
console.log(
  `wrote ${rel(outFile)}: ${played} slide sections, the questions table and the checklist`,
)
console.log(
  'next: write the cues (must: / may:) per slide, the questions sorted by likely × costly, the checklist; then pnpm talk:check',
)
