import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck, sha256, stringifyDeck } from '../model/deck.ts'
import { applyRhythm, type Rhythm, rhythmDiffers, storyRhythm } from '../model/scaffold.ts'
import { loadStory } from '../model/story.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
// --resequence alone takes every slide whose rhythm differs; --resequence s3,s5 only those
const resequenceAt = args.indexOf('--resequence')
const idsArg = resequenceAt === -1 ? undefined : args[resequenceAt + 1]
const idsGiven = idsArg !== undefined && !idsArg.startsWith('-') && !idsArg.endsWith('.json')
const resequence: string[] | null =
  resequenceAt === -1 ? null : idsGiven ? (idsArg as string).split(',').filter(Boolean) : []
const target = args.find((a, i) => !a.startsWith('-') && !(idsGiven && i === resequenceAt + 1))
if (!target || args.includes('--help') || args.includes('-h')) {
  console.error(
    [
      'Usage: pnpm deck:sync-story <deck.json> [--dry-run] [--resequence [s3,s5]]',
      "  After the story was edited and confirmed again: copies every slide's notes from the story into deck.json and records",
      "  the story's new hash. Slots, overrides and the page arrangement are not touched; a slide whose text changed is",
      '  redone with pnpm deck:scaffold <story.md> --slide <id>. The story has to be confirmed (pnpm story:confirm).',
      '  Reveal steps and page transitions follow the story too (scene_role and intensity decide what builds up and',
      '  which page breathes): a slide whose rhythm no longer matches is reported, and --resequence rewrites it',
      '  (every such slide, or only the ids given); hand-set steps on those slides are replaced.',
    ].join('\n'),
  )
  process.exit(2)
}

const rel = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/')
const deckFile = resolve(target)
const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  console.log(`failed: ${parsed.errors.length} errors`)
  process.exit(1)
}
const deck = parsed.deck
if (!deck.story) {
  console.log(
    '✖ this deck records no story (no `story` field), so there is nothing to sync from; deck:scaffold writes that field',
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
  console.log('the story file failed its checks; fix it before syncing')
  process.exit(1)
}
// the same gate deck:scaffold has, and deliberately without --force: an unconfirmed story is not a source
const status = confirmationStatus(storyFile, storyText)
if (status.state !== 'confirmed') {
  console.log(`✖ ${describeStatus(status)}`)
  console.log('the sync takes only a confirmed story; there is no --force')
  process.exit(1)
}

const byId = new Map(loaded.story.slides.map((s) => [s.id, s]))
const updated: string[] = []
const unchanged: string[] = []
const notInStory: string[] = []
for (const slide of deck.slides) {
  const s = byId.get(slide.id)
  if (!s) {
    notInStory.push(slide.id)
    continue
  }
  const next = s.notes || undefined
  if ((slide.notes ?? undefined) === next) {
    unchanged.push(slide.id)
    continue
  }
  if (next === undefined) delete slide.notes
  else slide.notes = next
  updated.push(slide.id)
}
const deckIds = new Set(deck.slides.map((s) => s.id))
const notInDeck = loaded.story.slides.filter((s) => !deckIds.has(s.id)).map((s) => s.id)

// the rhythm the story implies now (reveal steps from scene_role and intensity, a page's own
// transition): reported when the deck differs, rewritten only where --resequence asks
const describe = (r: Rhythm) => {
  const steps = [...r.steps].map(([id, n]) => `${id}=${n}`)
  return `${r.scene.scene_role}, intensity ${r.scene.intensity}: ${steps.length ? `steps ${steps.join(', ')}` : 'no steps'}, transition ${r.transition ?? "the deck's"}`
}
const outOfLine: string[] = []
const resequenced: string[] = []
for (const slide of deck.slides) {
  const rhythm = storyRhythm(slide, loaded.story)
  if (!rhythm || !rhythmDiffers(slide, rhythm)) continue
  if (resequence !== null && (resequence.length === 0 || resequence.includes(slide.id))) {
    applyRhythm(slide, rhythm)
    resequenced.push(`${slide.id} (${describe(rhythm)})`)
  } else outOfLine.push(`${slide.id} (${describe(rhythm)})`)
}
const unknownIds = (resequence ?? []).filter((id) => !deckIds.has(id))

const before = deck.story.sha256
const after = sha256(storyText)
deck.story = { path: deck.story.path, sha256: after }

console.log(
  `${deck.title}: notes ${updated.length} updated${updated.length ? ` (${updated.join(', ')})` : ''}, ${unchanged.length} unchanged; story hash ${before === after ? `${after.slice(0, 8)} unchanged` : `${before.slice(0, 8)} → ${after.slice(0, 8)}`}`,
)
for (const id of notInStory)
  console.log(
    `  ⚠ ${id} is in the deck but no longer in the story; left as it is (deck:scaffold removes the slides the story dropped)`,
  )
for (const id of notInDeck)
  console.log(
    `  ⚠ ${id} is in the story but not in the deck; pnpm deck:scaffold ${rel(storyFile)} --slide ${id} adds it`,
  )
for (const id of unknownIds) console.log(`  ⚠ --resequence ${id}: no such slide in the deck`)
for (const line of resequenced) console.log(`  ↻ resequenced ${line}`)
for (const line of outOfLine)
  console.log(
    `  ℹ rhythm ${line}; the deck differs — pnpm deck:sync-story ${rel(deckFile)} --resequence ${line.slice(0, line.indexOf(' '))} rewrites its steps and transition`,
  )
if (dryRun) {
  console.log('dry run: nothing written')
  process.exit(0)
}
if (updated.length === 0 && before === after && resequenced.length === 0) {
  console.log('nothing to sync; the deck already matches the story')
  process.exit(0)
}
writeFileSync(deckFile, stringifyDeck(deck), 'utf8')
console.log(
  `written → ${rel(deckFile)} (slots, overrides and pages untouched; reveal steps and page transitions only where --resequence asked; a slide whose text changed: pnpm deck:scaffold ${rel(storyFile)} --slide <id>)`,
)
process.exit(0)
