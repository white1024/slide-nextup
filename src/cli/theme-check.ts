import { formatThemeCheck, runThemeCheck } from '../qa/theme-check.ts'
import { deckDirOfPath, describeOrigin, listThemes } from '../render/assets.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      '用法：pnpm theme:check [--theme <id>] [--deck <deck.json|dir>]',
      '  一次檢查主題包能不能分享出去：theme.json 的 schemaVersion 與 engine、schema 與 CSS ownership（等同 theme:lint）、',
      '  主題內每個版型的元件／槽位／html 一致、十個核心版型與核心槽位齊全（有主題內版型的包才查）、',
      '  theme.css 對版型用到的每個 role 至少有一條規則（缺的列成警告）。有錯誤就以狀態 1 結束。',
      '  主題從 deck 資料夾（--deck）、使用者目錄（$SLIDE_NEXTUP_HOME/themes 或 ~/.slide-nextup/themes）與 repo 依序找。',
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
  console.log(`✖ 沒有主題 \`${themeId}\`；可用：${known.map((t) => t.id).join('、')}`)
  process.exit(2)
}

let errors = 0
let warnings = 0
for (const t of known.filter((t) => themeId === undefined || t.id === themeId)) {
  if (t.origin !== 'repo') console.log(`主題 ${t.id} 來自${describeOrigin(t.origin)}：${t.dir}`)
  const report = runThemeCheck(t.id, lookup)
  console.log(formatThemeCheck(report))
  errors += report.errors
  warnings += report.warnings
}
console.log(
  `${errors === 0 ? '通過' : '未通過'}：${themeId ? 1 : known.length} 套主題，${errors} 個錯誤，${warnings} 個警告`,
)
process.exit(errors === 0 ? 0 : 1)
