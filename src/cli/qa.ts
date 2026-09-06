import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { type Deck, parseDeck } from '../model/deck.ts'
import { formatQaReport, runDeckQa, writeQaReport } from '../qa/run.ts'

const target = process.argv.slice(2).find((a) => !a.startsWith('-'))
if (!target) {
  console.error('用法：pnpm qa <deck.json | deck.html>')
  process.exit(2)
}

const file = resolve(target)
const text = readFileSync(file, 'utf8')
let deck: Deck
if (file.endsWith('.html')) {
  const m = /<script type="application\/json" id="deck-model">([\s\S]*?)<\/script>/.exec(text)
  if (!m?.[1]) {
    console.log('✖ 這份 HTML 沒有內嵌 deck 模型；請用 pnpm render 產生的檔案，或直接給 deck.json')
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
console.log(`報告：${relative(process.cwd(), out).replace(/\\/g, '/')}`)
process.exit(report.errors === 0 ? 0 : 1)
