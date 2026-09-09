import { existsSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { type CssOwner, lintCss } from '../qa/css-ownership.ts'
import { type CheckIssue, checkLayout, checkTheme } from '../qa/layout-check.ts'
import {
  deckDirOfPath,
  describeOrigin,
  listLayoutIds,
  listThemeLayoutIds,
  listThemes,
  loadLayout,
  loadTheme,
  PROJECT_ROOT,
} from '../render/assets.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'Usage: pnpm theme:lint [--deck <deck.json|dir>]',
      '       pnpm theme:lint <file.css…> --as theme|layout',
      '  With no file, lints every theme pack and every layout it can see: theme.json and theme.css against the',
      '  schema and the CSS ownership rules, and each layout triple for consistency. --deck adds that deck folder’s',
      '  own themes/ to the search (the workspace, the user directory and the package are always included).',
      '  With one or more CSS files, lints exactly those, and then --as says which half of the contract they belong to:',
      '    --as theme   a theme.css: colour, font and effect rules only — geometry (left/top/width/height) is refused',
      '    --as layout  a layout.css: geometry only — colour, font and effect rules are refused',
      '  There is no auto-detection for a single file, because the file name does not decide the contract.',
    ].join('\n'),
  )
  process.exit(0)
}
const asIndex = args.indexOf('--as')
const owner = asIndex === -1 ? null : (args[asIndex + 1] as CssOwner | undefined)
// --deck <deck.json|dir>: lint that deck's own themes/ too (the user directory is always included)
const deckIndex = args.indexOf('--deck')
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const isValueOf = (idx: number, i: number) => idx !== -1 && i === idx + 1
const files = args.filter(
  (a, i) => !a.startsWith('--') && !isValueOf(asIndex, i) && !isValueOf(deckIndex, i),
)
// a pack folder is not a CSS file: say where a whole pack is checked instead of dying on EISDIR
const folder = files.find((f) => existsSync(f) && statSync(f).isDirectory())
if (folder !== undefined) {
  console.error(
    [
      `✖ \`${folder}\` is a folder; theme:lint takes CSS files (each needs --as theme|layout) or no file at all.`,
      '  A whole theme pack is linted by leaving the file out: `theme:lint` covers every pack it can see',
      "  (the workspace's themes/, `--deck <deck.json>` for a deck's own, the user directory, the package),",
      '  and `theme:check --theme <id>` adds the fitness report. A pack that lives elsewhere goes through',
      '  `theme:import <dir|zip>`, which checks it before installing.',
    ].join('\n'),
  )
  process.exit(2)
}

function print(issues: CheckIssue[]): number {
  let errors = 0
  for (const i of issues) {
    if (i.severity === 'error') errors++
    const where = `${relative(PROJECT_ROOT, i.file).replace(/\\/g, '/')}${i.line ? `:${i.line}` : ''}`
    console.log(`${i.severity === 'error' ? '✖' : '⚠'} ${where}  ${i.message}`)
  }
  return errors
}

let errors = 0
let checked = 0

if (files.length > 0) {
  if (owner !== 'theme' && owner !== 'layout') {
    console.error(
      [
        `linting a CSS file needs --as theme or --as layout: \`${files[0]}\` could be either half of the contract.`,
        '  --as theme   colour, font and effect rules only; geometry is refused',
        '  --as layout  geometry only; colour, font and effect rules are refused',
        '  With no file at all, theme:lint checks every pack and layout it can see.',
      ].join('\n'),
    )
    process.exit(2)
  }
  for (const f of files) {
    const file = resolve(f)
    const issues = lintCss(readFileSync(file, 'utf8'), owner).map((i) => ({
      severity: i.severity,
      file,
      line: i.line,
      message: `${i.selector} { ${i.property ? `${i.property}: … ` : ''}}  ${i.message}`,
    }))
    errors += print(issues)
    checked++
  }
} else {
  for (const t of listThemes(lookup)) {
    if (t.origin !== 'repo') console.log(`theme ${t.id} from ${describeOrigin(t.origin)}: ${t.dir}`)
    errors += print(checkTheme(loadTheme(t.id, lookup)))
    checked++
    for (const layoutId of listThemeLayoutIds(t.id, lookup)) {
      errors += print(checkLayout(loadLayout(layoutId, t.id, lookup)))
      checked++
    }
  }
  for (const id of listLayoutIds()) {
    errors += print(checkLayout(loadLayout(id)))
    checked++
  }
}

console.log(`${errors === 0 ? 'passed' : 'failed'}: ${checked} checked, ${errors} errors`)
process.exit(errors === 0 ? 0 : 1)
