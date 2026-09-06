import { relative } from 'node:path'
import { chromium } from 'playwright'
import { formatQaReport, writeQaReport } from '../qa/run.ts'
import { runThemeQa } from '../qa/theme-qa.ts'
import { deckDirOfPath, listThemeIds } from '../render/assets.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      '用法：pnpm theme:qa [--theme <id>] [--deck <deck.json|dir>] [layout…]',
      '  每個版型用它自己的 sample 填滿、組成一份 deck，跑完整 QA（溢出、重疊、字級下限、密度、幾何不變）。',
      '  不給 --theme 就跑全部主題包；後面接版型 id 可只看那幾個。任何 error 或 warning 都算失敗。',
      '  主題從 deck 資料夾（--deck）、使用者目錄（$SLIDE_NEXTUP_HOME/themes 或 ~/.slide-nextup/themes）與 repo 依序找。',
      '  報告寫到 artifacts/qa/theme-<id>.json。',
    ].join('\n'),
  )
  process.exit(0)
}
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
const deckIndex = args.indexOf('--deck')
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const isValueOf = (idx: number, i: number) => idx !== -1 && i === idx + 1
const only = args.filter(
  (a, i) => !a.startsWith('-') && !isValueOf(themeIndex, i) && !isValueOf(deckIndex, i),
)
const known = listThemeIds(lookup)
if (themeId !== undefined && !known.includes(themeId)) {
  console.log(`✖ 沒有主題包 \`${themeId ?? ''}\`；可用：${known.join('、')}`)
  process.exit(2)
}
const themes = themeId ? [themeId] : known

const browser = await chromium.launch({ headless: true })
let failed = 0
for (const id of themes) {
  const report = await runThemeQa(id, { browser, only, deckDir: lookup.deckDir })
  console.log(formatQaReport(report))
  const out = writeQaReport(report)
  console.log(`報告：${relative(process.cwd(), out).replace(/\\/g, '/')}\n`)
  if (report.errors > 0 || report.warnings > 0) failed++
}
await browser.close()

console.log(
  failed === 0
    ? `${themes.length} 套主題包的版型範例全部通過：零錯誤、零警告`
    : `${failed} 套主題包的版型範例有錯誤或警告；警告在這裡也算失敗，因為 sample 是版型自己的示範`,
)
process.exit(failed === 0 ? 0 : 1)
