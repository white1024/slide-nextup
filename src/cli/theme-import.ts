import { relative } from 'node:path'
import { chromium } from 'playwright'
import { importTheme, parseImportTarget } from '../model/theme-pack.ts'
import { formatQaReport } from '../qa/run.ts'
import { formatThemeCheck } from '../qa/theme-check.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(
    [
      'Usage: pnpm theme:import <dir|file.zip> [--to user|repo|deck:<deck.json|dir>] [--force]',
      '  Unpack into a temp directory → theme:check (including lint) → theme:qa (Playwright) → copy to the target only when everything passes; if any gate fails nothing is written.',
      "  --to user (default) puts it in $SLIDE_NEXTUP_HOME/themes or ~/.slide-nextup/themes; repo puts it in this repo's themes/;",
      "  deck:<deck.json> puts it in that deck's own themes/. An existing pack with the same id is refused; --force overwrites it.",
      '  Importing does not download fonts (web fonts referenced by theme.css are kept as is); when theme.json has a source you are reminded to add a THIRD_PARTY_NOTICES.md entry.',
    ].join('\n'),
  )
  process.exit(args.length === 0 ? 2 : 0)
}
const toIndex = args.indexOf('--to')
const source = args.find((a, i) => !a.startsWith('-') && !(toIndex !== -1 && i === toIndex + 1))
if (!source) {
  console.error('missing source (folder or zip)')
  process.exit(2)
}

const STAGE_LABEL = {
  unpack: 'unpack',
  exists: 'target',
  check: 'theme:check',
  qa: 'theme:qa',
  copy: 'copy to',
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
    console.log(`✖ ${STAGE_LABEL[result.stage]}: ${result.message}; nothing written`)
    process.exit(1)
  }
  console.log(formatThemeCheck(result.check))
  console.log(
    `theme:qa ${result.qa.slides.length} slides with zero errors and zero warnings; ${result.files.length} files → ${relative(process.cwd(), result.dest).replace(/\\/g, '/')}`,
  )
  if (result.source) {
    console.log(
      `ℹ this theme was ported from ${result.source.name} (${result.source.author}, ${result.source.license}): ${result.source.url}; add an entry to THIRD_PARTY_NOTICES.md before sharing or open-sourcing`,
    )
  }
  process.exit(0)
} finally {
  await browser.close()
}
