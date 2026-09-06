import { formatThemeCheck, runThemeCheck } from '../qa/theme-check.ts'
import { deckDirOfPath, describeOrigin, listThemes } from '../render/assets.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'Usage: pnpm theme:check [--theme <id>] [--deck <deck.json|dir>]',
      '  Check in one go whether a theme pack is fit to share: schemaVersion and engine in theme.json, schema and CSS ownership (same as theme:lint),',
      '  elements/slots/html of every pack layout consistent, the ten core layouts and core slots all present (only for packs with their own layouts),',
      '  theme.css has at least one rule for every role the layouts use (missing ones are warnings). Exits with status 1 on any error.',
      '  Themes are searched in the deck folder (--deck), the user directory ($SLIDE_NEXTUP_HOME/themes or ~/.slide-nextup/themes) and the repo, in that order.',
    ].join('\n'),
  )
  process.exit(0)
}
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
const deckIndex = args.indexOf('--deck')
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const known = listThemes(lookup)
if (themeId !== undefined && !known.some((t) => t.id === themeId)) {
  console.log(`✖ no theme \`${themeId}\`; available: ${known.map((t) => t.id).join(', ')}`)
  process.exit(2)
}

let errors = 0
let warnings = 0
for (const t of known.filter((t) => themeId === undefined || t.id === themeId)) {
  if (t.origin !== 'repo') console.log(`theme ${t.id} from ${describeOrigin(t.origin)}: ${t.dir}`)
  const report = runThemeCheck(t.id, lookup)
  console.log(formatThemeCheck(report))
  errors += report.errors
  warnings += report.warnings
}
console.log(
  `${errors === 0 ? 'passed' : 'failed'}: ${themeId ? 1 : known.length} themes, ${errors} errors, ${warnings} warnings`,
)
process.exit(errors === 0 ? 0 : 1)
