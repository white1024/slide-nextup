import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck, sha256 } from '../model/deck.ts'
import { deckDirOf, defaultOutputPath, renderDeckDocument } from '../render/deck.ts'
import { loadTalkCues } from '../talk/talk.ts'

const args = process.argv.slice(2)
const outIndex = args.indexOf('-o')
const outArg = outIndex === -1 ? undefined : args[outIndex + 1]
const inlineAssets = args.includes('--inline-assets')
const target = args.find((a, i) => !a.startsWith('-') && (outIndex === -1 || i !== outIndex + 1))

if (!target) {
  console.error('Usage: pnpm render <deck.json> [-o out.html] [--inline-assets]')
  process.exit(2)
}

const deckFile = resolve(target)
const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  console.log(`failed: ${parsed.errors.length} errors`)
  process.exit(1)
}
const deck = parsed.deck
const deckDir = deckDirOf(deckFile)
const outFile = outArg ? resolve(outArg) : defaultOutputPath(deck)

if (deck.story) {
  const storyFile = resolve(deckDir, deck.story.path)
  if (!existsSync(storyFile)) {
    console.log(`⚠ story file ${deck.story.path} not found`)
  } else if (sha256(readFileSync(storyFile, 'utf8')) !== deck.story.sha256) {
    console.log(
      `⚠ story file ${deck.story.path} has changed and no longer matches the hash recorded in the deck; slide content may have diverged from the story`,
    )
  }
}

// the talk next to the deck rides along for the presenter window
const talk = loadTalkCues(deckDir)
if (talk?.problems)
  console.log(
    `⚠ talk.md has ${talk.problems} problem${talk.problems === 1 ? '' : 's'}; the cues that parsed are embedded, run pnpm talk:check ${relative(process.cwd(), talk.file).replace(/\\/g, '/')}`,
  )
let result: ReturnType<typeof renderDeckDocument>
try {
  result = renderDeckDocument(deck, {
    deckDir,
    outDir: dirname(outFile),
    inlineAssets,
    talk: talk?.cues,
  })
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
for (const w of result.warnings) console.log(`⚠ ${w}`)
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, result.html, 'utf8')
console.log(
  `${deck.title}: ${deck.slides.length} slides → ${relative(process.cwd(), outFile).replace(/\\/g, '/')} (${(result.html.length / 1024).toFixed(0)} KB)`,
)
