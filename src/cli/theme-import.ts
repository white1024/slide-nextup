import { relative } from 'node:path'
import { chromium } from 'playwright'
import { importTheme, parseImportTarget } from '../model/theme-pack.ts'
import { formatQaReport } from '../qa/run.ts'
import { formatThemeCheck } from '../qa/theme-check.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(
    [
      '用法：pnpm theme:import <dir|file.zip> [--to user|repo|deck:<deck.json|dir>] [--force]',
      '  解開到暫存目錄 → theme:check（含 lint）→ theme:qa（Playwright）→ 全過才複製到目標；任一關失敗就不寫任何東西。',
      '  --to user（預設）放進 $SLIDE_NEXTUP_HOME/themes 或 ~/.slide-nextup/themes；repo 放進這個 repo 的 themes/；',
      '  deck:<deck.json> 放進那份 deck 自己的 themes/。同 id 已存在會拒絕，--force 才覆蓋。',
      '  匯入不下載字型（theme.css 引用的網路字型照放）；theme.json 有 source 時會提醒補 THIRD_PARTY_NOTICES.md。',
    ].join('\n'),
  )
  process.exit(args.length === 0 ? 2 : 0)
}
const toIndex = args.indexOf('--to')
const source = args.find((a, i) => !a.startsWith('-') && !(toIndex !== -1 && i === toIndex + 1))
if (!source) {
  console.error('缺少來源（資料夾或 zip）')
  process.exit(2)
}

const STAGE_LABEL = {
  unpack: '解開',
  exists: '目標',
  check: 'theme:check',
  qa: 'theme:qa',
  copy: '複製到',
} as const

let to: ReturnType<typeof parseImportTarget>
try {
  to = parseImportTarget(toIndex === -1 ? undefined : args[toIndex + 1])
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(2)
}

const browser = await chromium.launch({ headless: true })
try {
  const result = await importTheme(source, {
    to,
    force: args.includes('--force'),
    browser,
    onStage: (stage, detail) => console.log(`… ${STAGE_LABEL[stage]} ${detail}`),
  })
  if (!result.ok) {
    if (result.check) console.log(formatThemeCheck(result.check))
    if (result.qa) console.log(formatQaReport(result.qa))
    console.log(`✖ ${STAGE_LABEL[result.stage]}：${result.message}；沒有寫入任何東西`)
    process.exit(1)
  }
  console.log(formatThemeCheck(result.check))
  console.log(
    `theme:qa ${result.qa.slides.length} 頁零錯誤零警告；${result.files.length} 個檔案 → ${relative(process.cwd(), result.dest).replace(/\\/g, '/')}`,
  )
  if (result.source) {
    console.log(
      `ℹ 這套主題移植自 ${result.source.name}（${result.source.author}，${result.source.license}）：${result.source.url}；分享或開源時請在 THIRD_PARTY_NOTICES.md 補一條`,
    )
  }
  process.exit(0)
} finally {
  await browser.close()
}
