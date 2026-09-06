import { readFileSync } from 'node:fs'
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
const asIndex = args.indexOf('--as')
const owner = asIndex === -1 ? null : (args[asIndex + 1] as CssOwner | undefined)
// --deck <deck.json|dir>: lint that deck's own themes/ too (the user directory is always included)
const deckIndex = args.indexOf('--deck')
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const isValueOf = (idx: number, i: number) => idx !== -1 && i === idx + 1
const files = args.filter(
  (a, i) => !a.startsWith('--') && !isValueOf(asIndex, i) && !isValueOf(deckIndex, i),
)

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
    console.error('對單一 CSS 檔案 lint 時必須指定 --as theme 或 --as layout')
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
    if (t.origin !== 'repo') console.log(`主題 ${t.id} 來自${describeOrigin(t.origin)}：${t.dir}`)
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

console.log(`${errors === 0 ? '通過' : '未通過'}：檢查 ${checked} 項，${errors} 個錯誤`)
process.exit(errors === 0 ? 0 : 1)
