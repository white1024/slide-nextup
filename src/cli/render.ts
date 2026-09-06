import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck, sha256 } from '../model/deck.ts'
import { deckDirOf, defaultOutputPath, renderDeckDocument } from '../render/deck.ts'

const args = process.argv.slice(2)
const outIndex = args.indexOf('-o')
const outArg = outIndex === -1 ? undefined : args[outIndex + 1]
const inlineAssets = args.includes('--inline-assets')
const target = args.find((a, i) => !a.startsWith('-') && (outIndex === -1 || i !== outIndex + 1))

if (!target) {
  console.error('用法：pnpm render <deck.json> [-o out.html] [--inline-assets]')
  process.exit(2)
}

const deckFile = resolve(target)
const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  console.log(`未通過：${parsed.errors.length} 個錯誤`)
  process.exit(1)
}
const deck = parsed.deck
const deckDir = deckDirOf(deckFile)
const outFile = outArg ? resolve(outArg) : defaultOutputPath(deck)

if (deck.story) {
  const storyFile = resolve(deckDir, deck.story.path)
  if (!existsSync(storyFile)) {
    console.log(`⚠ 找不到敘事文件 ${deck.story.path}`)
  } else if (sha256(readFileSync(storyFile, 'utf8')) !== deck.story.sha256) {
    console.log(
      `⚠ 敘事文件 ${deck.story.path} 已變更，與 deck 記錄的 hash 不同；頁面內容可能已與敘事分歧`,
    )
  }
}

let result: ReturnType<typeof renderDeckDocument>
try {
  result = renderDeckDocument(deck, { deckDir, outDir: dirname(outFile), inlineAssets })
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
for (const w of result.warnings) console.log(`⚠ ${w}`)
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, result.html, 'utf8')
console.log(
  `${deck.title}：${deck.slides.length} 頁 → ${relative(process.cwd(), outFile).replace(/\\/g, '/')}（${(result.html.length / 1024).toFixed(0)} KB）`,
)
