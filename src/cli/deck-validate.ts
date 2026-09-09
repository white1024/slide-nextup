import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck, sha256, stringifyDeck } from '../model/deck.ts'
import { readDesign } from '../model/design.ts'
import { effectiveOrder, followsStory } from '../model/pages.js'
import { loadStory } from '../model/story.ts'
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

// the deck folder's design.json (the recorded visual direction) goes through its schema too
const design = readDesign(dirname(file))
if (design && !design.ok) {
  for (const e of design.errors) console.log(`✖ ${relative(process.cwd(), design.path)} ${e}`)
  console.log('failed: design.json does not match schemas/design.schema.json')
  process.exit(1)
}
if (design?.ok && design.design.theme !== deck.theme) {
  console.log(
    `⚠ design.json chooses ${design.design.theme} but the deck is on ${deck.theme} (pnpm deck:retheme moves the deck, pnpm design:set records the deck's theme)`,
  )
}

// the story the deck was generated from: the story is the source of the notes, so notes that differ
// are listed whether or not the story's hash moved on
if (deck.story) {
  const storyFile = resolve(dirname(file), deck.story.path)
  if (existsSync(storyFile)) {
    const storyText = readFileSync(storyFile, 'utf8')
    if (sha256(storyText) !== deck.story.sha256) {
      console.log(
        `⚠ story ${deck.story.path} has changed since the deck was generated; confirm it, then pnpm deck:sync-story for the notes and the hash, or pnpm deck:scaffold --slide for a slide whose text changed`,
      )
    }
    const story = loadStory(storyText).story
    if (story) {
      const notes = new Map(story.slides.map((s) => [s.id, s.notes || undefined]))
      const drifted = deck.slides
        .filter((s) => notes.has(s.id) && notes.get(s.id) !== (s.notes ?? undefined))
        .map((s) => s.id)
      if (drifted.length > 0) {
        console.log(
          `⚠ notes differ from the story on ${drifted.join(', ')}; the story is the source of the notes, pnpm deck:sync-story copies them over`,
        )
      }
    }
  }
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
