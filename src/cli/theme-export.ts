import { relative } from 'node:path'
import { exportTheme } from '../model/theme-pack.ts'
import { formatThemeCheck } from '../qa/theme-check.ts'
import { deckDirOfPath } from '../render/assets.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(
    [
      '用法：pnpm theme:export <id> [-o <dir|file.zip>] [--deck <deck.json|dir>] [--force]',
      '  把主題包資料夾（theme.json、theme.css、layouts/、產生器）原樣複製成資料夾，或壓成一個 zip（預設 artifacts/themes/<id>.zip）。',
      '  匯出前跑一次 theme:check 並印出報告；有錯誤仍會匯出，但對方匯入時會被擋下。',
      '  主題從 deck 資料夾（--deck）、使用者目錄與 repo 依序找。',
    ].join('\n'),
  )
  process.exit(args.length === 0 ? 2 : 0)
}
const outIndex = args.indexOf('-o')
const deckIndex = args.indexOf('--deck')
const isValueOf = (idx: number, i: number) => idx !== -1 && i === idx + 1
const id = args.find(
  (a, i) => !a.startsWith('-') && !isValueOf(outIndex, i) && !isValueOf(deckIndex, i),
)
if (!id) {
  console.error('缺少主題 id')
  process.exit(2)
}

try {
  const result = exportTheme(id, {
    out: outIndex === -1 ? undefined : args[outIndex + 1],
    force: args.includes('--force'),
    lookup: { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') },
  })
  console.log(formatThemeCheck(result.check))
  for (const f of result.files) console.log(`  ${f}`)
  console.log(
    `${result.files.length} 個檔案 → ${relative(process.cwd(), result.out).replace(/\\/g, '/')}（${result.kind === 'zip' ? 'zip' : '資料夾'}）`,
  )
  if (result.check.errors > 0)
    console.log('⚠ theme:check 有錯誤：對方匯入時會被擋下，建議先修好再分享')
  process.exit(0)
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
