import { relative } from 'node:path'
import { launchChromium } from '../qa/browser.ts'
import { formatQaReport, SLACK_LEVELS, type SlackLevel, writeQaReport } from '../qa/run.ts'
import { runThemeQa } from '../qa/theme-qa.ts'
import { deckDirOfPath, listThemeIds } from '../render/assets.ts'
import { refusePathArgs } from './args.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'Usage: pnpm theme:qa [--theme <id>] [--deck <deck.json|dir>] [--slack off|info|warning] [layout…]',
      '  Fill every layout with its own sample, assemble them into one deck and run the full QA (overflow, overlap, minimum font size, density, geometry unchanged, image fit).',
      '  Every slot hint is checked against its box too: characters, lines, a list as items × lines each including the margin between items, chips as the rows they need (`hint-capacity`).',
      '  Without --theme every theme pack is run; trailing layout ids restrict the run to those. Any error or warning counts as a failure.',
      '  A painted box far taller than its sample (`slack`) is a notice by default, because a sample shows one filling and the box is sized for the hint; --slack warning makes it count.',
      '  Themes are searched in the deck folder (--deck), the workspace (the current folder), the user directory ($SLIDE_NEXTUP_HOME/themes or ~/.slide-nextup/themes) and the repo, in that order.',
      '  The report is written to artifacts/qa/theme-<id>.json.',
    ].join('\n'),
  )
  process.exit(0)
}
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
const deckIndex = args.indexOf('--deck')
const slackIndex = args.indexOf('--slack')
const slack = slackIndex === -1 ? undefined : (args[slackIndex + 1] as SlackLevel | undefined)
if (slack !== undefined && !SLACK_LEVELS.includes(slack)) {
  console.error(`--slack takes ${SLACK_LEVELS.join(', ')}, got \`${slack ?? ''}\``)
  process.exit(2)
}
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const isValueOf = (idx: number, i: number) => idx !== -1 && i === idx + 1
const only = args.filter(
  (a, i) =>
    !a.startsWith('-') &&
    !isValueOf(themeIndex, i) &&
    !isValueOf(deckIndex, i) &&
    !isValueOf(slackIndex, i),
)
const known = listThemeIds(lookup)
refusePathArgs(
  [themeId, ...only],
  'theme:qa',
  'Use `--theme <id>` for the pack and layout ids for the positional arguments.',
  known,
)
if (themeId !== undefined && !known.includes(themeId)) {
  console.log(`✖ no theme pack \`${themeId ?? ''}\`; available: ${known.join(', ')}`)
  process.exit(2)
}
const themes = themeId ? [themeId] : known

const browser = await launchChromium()
let failed = 0
for (const id of themes) {
  const report = await runThemeQa(id, { browser, only, deckDir: lookup.deckDir, slack })
  console.log(formatQaReport(report))
  const out = writeQaReport(report)
  console.log(`report: ${relative(process.cwd(), out).replace(/\\/g, '/')}\n`)
  if (report.errors > 0 || report.warnings > 0) failed++
}
await browser.close()

console.log(
  failed === 0
    ? `layout samples of all ${themes.length} theme packs passed: zero errors, zero warnings`
    : `layout samples of ${failed} theme packs have errors or warnings; warnings count as failures here because the sample is the layout's own showcase`,
)
process.exit(failed === 0 ? 0 : 1)
