import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { type Deck, parseDeck } from '../model/deck.ts'
import {
  formatQaReport,
  runDeckQa,
  SLACK_LEVELS,
  SLACK_PX,
  SLACK_SHARE,
  type SlackLevel,
  writeQaReport,
} from '../qa/run.ts'

const args = process.argv.slice(2)
const optIndex = (name: string) => args.indexOf(name)
const isOptionValue = (i: number) =>
  ['--min-font', '--min-inner-font', '--slack'].some(
    (name) => optIndex(name) !== -1 && i === optIndex(name) + 1,
  )
const target = args.find((a, i) => !a.startsWith('-') && !isOptionValue(i))
if (!target || args.includes('--help') || args.includes('-h')) {
  console.error(
    [
      'Usage: pnpm qa <deck.json | deck.html> [--min-font <px>] [--min-inner-font <px>] [--slack off|info|warning]',
      '  Overflow, overlap, minimum font sizes, density, image fit and theme geometry, measured in headless Chromium.',
      '  The font floors (32px content, graded lower for page furniture) are deliberate for a projected deck; the two flags',
      '  lower them for this run only, for a deck read up close. Report in artifacts/qa/<deck-id>.json.',
      `  slack: a box that paints its ground (a card, a callout) but is more than ${SLACK_PX}px or ${Math.round(SLACK_SHARE * 100)}% taller than its content, or holds nothing,`,
      '  is listed as a notice (info, the default; it never fails the run); --slack warning makes it count, --slack off hides it.',
      '  The deck is also played: every page to its last step. Each element must end where static mode puts it (motion-rest),',
      '  nothing may still animate on the page leaving under the next (motion-leaving), prefers-reduced-motion must leave',
      '  nothing moving (motion-reduced), and entrances and page transitions stay in their duration bands (motion-band, a warning).',
    ].join('\n'),
  )
  process.exit(2)
}
const slackIndex = optIndex('--slack')
const slack = slackIndex === -1 ? undefined : (args[slackIndex + 1] as SlackLevel | undefined)
if (slack !== undefined && !SLACK_LEVELS.includes(slack)) {
  console.error(`--slack takes ${SLACK_LEVELS.join(', ')}, got \`${slack ?? ''}\``)
  process.exit(2)
}
const px = (name: string): number | undefined => {
  const i = optIndex(name)
  if (i === -1) return undefined
  const value = Number(args[i + 1])
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} takes a positive number of pixels, got \`${args[i + 1] ?? ''}\``)
    process.exit(2)
  }
  return value
}
const minFont = px('--min-font')
const minInnerFont = px('--min-inner-font')

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

const report = await runDeckQa(deck, { deckDir: dirname(file), minFont, minInnerFont, slack })
console.log(formatQaReport(report))
const out = writeQaReport(report)
console.log(`report: ${relative(process.cwd(), out).replace(/\\/g, '/')}`)
process.exit(report.errors === 0 ? 0 : 1)
