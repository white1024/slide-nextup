import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { type Deck, parseDeck } from '../model/deck.ts'
import { formatQaReport, runDeckQa, writeQaReport } from '../qa/run.ts'

const target = process.argv.slice(2).find((a) => !a.startsWith('-'))
if (!target) {
  console.error('Usage: pnpm qa <deck.json | deck.html>')
  process.exit(2)
}

const file = resolve(target)
const text = readFileSync(file, 'utf8')
let deck: Deck
if (file.endsWith('.html')) {
  const m = /<script type="application\/json" id="deck-model">([\s\S]*?)<\/script>/.exec(text)
  if (!m?.[1]) {
    console.log(
      '✖ this HTML has no embedded deck model; use a file produced by pnpm render, or pass deck.json directly',
    )
    process.exit(1)
  }
  const parsed = parseDeck(m[1])
  if (!parsed.ok) {
    for (const e of parsed.errors) console.log(`✖ ${e.path}  ${e.message}`)
    process.exit(1)
  }
  deck = parsed.deck
} else {
  const parsed = parseDeck(text)
  if (!parsed.ok) {
    for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
    process.exit(1)
  }
  deck = parsed.deck
}

const report = await runDeckQa(deck, { deckDir: dirname(file) })
console.log(formatQaReport(report))
const out = writeQaReport(report)
console.log(`report: ${relative(process.cwd(), out).replace(/\\/g, '/')}`)
process.exit(report.errors === 0 ? 0 : 1)
