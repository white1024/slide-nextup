import { relative } from 'node:path'
import { exportTheme } from '../model/theme-pack.ts'
import { formatThemeCheck } from '../qa/theme-check.ts'
import { deckDirOfPath } from '../render/assets.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(
    [
      'Usage: pnpm theme:export <id> [-o <dir|file.zip>] [--deck <deck.json|dir>] [--force]',
      '  Copy the theme pack folder (theme.json, theme.css, layouts/, generators) as is into a folder, or pack it into one zip (default artifacts/themes/<id>.zip).',
      "  Runs theme:check first and prints its report; errors do not stop the export, but the recipient's import will be blocked.",
      '  Themes are searched in the deck folder (--deck), the user directory and the repo, in that order.',
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
  console.error('missing theme id')
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
    `${result.files.length} files → ${relative(process.cwd(), result.out).replace(/\\/g, '/')} (${result.kind === 'zip' ? 'zip' : 'folder'})`,
  )
  if (result.check.errors > 0)
    console.log(
      "⚠ theme:check reported errors: the recipient's import will be blocked; fix them before sharing",
    )
  process.exit(0)
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
