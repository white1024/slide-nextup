import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseDeck, stringifyDeck } from '../model/deck.ts'
import { effectiveOrder, followsStory } from '../model/pages.js'
import { loadLayout } from '../render/assets.ts'
import { checkSlideAgainstLayout } from '../render/deck.ts'

const args = process.argv.slice(2)
const write = args.includes('--write')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error('Usage: pnpm deck:validate <deck.json> [--write]')
  process.exit(2)
}

const file = resolve(target)
const text = readFileSync(file, 'utf8')
const result = parseDeck(text)

if (!result.ok) {
  for (const e of result.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  console.log(`failed: ${result.errors.length} errors`)
  process.exit(1)
}

const deck = result.deck
const canonical = stringifyDeck(deck)
const overrideCount = Object.keys(deck.overrides).length
console.log(`${deck.title} (${deck.id} · theme ${deck.theme})`)
console.log(
  `${deck.slides.length} slides, ${overrideCount} overrides${deck.story ? `, story ${deck.story.path} ${deck.story.sha256.slice(0, 8)}` : ''}`,
)
for (const s of deck.slides) {
  const slots = Object.keys(s.slots).length
  console.log(
    `  ${s.id.padEnd(6)} ${s.layout.padEnd(12)} ${slots} slots / ${s.elements.length} elements`,
  )
}

// the same layout consistency check the renderer runs, so a deck that validates also renders
const problems: string[] = []
for (const s of deck.slides) {
  try {
    const layout = loadLayout(s.layout, deck.theme, { deckDir: dirname(file) })
    problems.push(...checkSlideAgainstLayout(s, layout, deck.overrides))
  } catch (err) {
    problems.push((err as Error).message)
  }
}
if (problems.length > 0) {
  for (const p of problems) console.log(`✖ ${p}`)
  console.log(`failed: ${problems.length} mismatches with the layouts`)
  process.exit(1)
}

const ids = deck.slides.map((s) => s.id)
if (deck.pages && !followsStory(ids, deck.pages)) {
  const eff = effectiveOrder(ids, deck.pages)
  console.log(
    `⚠ page arrangement differs from the story: playback order ${eff.visible.join(' → ')}${eff.hidden.length ? `; hidden ${eff.hidden.join(', ')}` : ''} (story.md is still the source of truth; the arrangement is kept when slides are redone)`,
  )
}

if (canonical !== text) {
  if (write) {
    writeFileSync(file, canonical, 'utf8')
    console.log('written back in canonical format')
  } else {
    console.log(
      '⚠ the file is not in canonical format (key order or indentation differs); add --write to write it back canonically',
    )
  }
}
console.log('passed')
