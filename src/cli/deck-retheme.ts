import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck, stringifyDeck, validateDeck } from '../model/deck.ts'
import { rethemeDeck } from '../model/retheme.ts'
import { loadTheme } from '../render/assets.ts'

const args = process.argv.slice(2)
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
const dryRun = args.includes('--dry-run')
const resetPositions = args.includes('--reset-positions')
const target = args.find((a, i) => !a.startsWith('-') && i !== themeIndex + 1)

if (!target || !themeId) {
  console.error('Usage: pnpm deck:retheme <deck.json> --theme <id> [--reset-positions] [--dry-run]')
  process.exit(2)
}

const file = resolve(target)
const parsed = parseDeck(readFileSync(file, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  process.exit(1)
}
const deckDir = dirname(file)
try {
  loadTheme(themeId, { deckDir })
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}

const { deck, report } = rethemeDeck(parsed.deck, themeId, { resetPositions, deckDir })
const check = validateDeck(deck)
if (!check.ok) {
  for (const e of check.errors) console.log(`✖ ${e.path}  ${e.message}`)
  console.log('the rethemed deck failed validation, not written')
  process.exit(1)
}

const rel = relative(process.cwd(), file).replace(/\\/g, '/')
console.log(`${parsed.deck.theme} → ${themeId} (${deck.slides.length} slides)`)
for (const s of deck.slides) {
  console.log(
    `  ${s.id.padEnd(6)} ${s.layout.padEnd(14)} ${report.layoutSource[s.id] === 'pack' ? 'pack layout' : 'generic layout'}`,
  )
}
const line = (label: string, items: string[]) => {
  if (items.length > 0) console.log(`${label}: ${items.join(', ')}`)
}
line('dropped content (the new layout has no such slot)', report.droppedSlots)
line('required slots filled with blanks (please fill them in)', report.filledRequired)
line('kept overrides', report.keptOverrides)
line('orphaned overrides (the new layout has no such element, removed)', report.orphanedOverrides)
line('overrides with positions reset', report.resetPositions)

if (dryRun) {
  console.log('(--dry-run, nothing written)')
  process.exit(0)
}
writeFileSync(file, stringifyDeck(deck), 'utf8')
console.log(`wrote ${rel}; next: pnpm render ${rel}`)
