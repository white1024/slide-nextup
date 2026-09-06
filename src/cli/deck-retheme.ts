import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseDeck, stringifyDeck, validateDeck } from '../model/deck.ts'
import { rethemeDeck } from '../model/retheme.ts'
import { loadTheme } from '../render/assets.ts'

const args = process.argv.slice(2)
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
const dryRun = args.includes('--dry-run')
const resetPositions = args.includes('--reset-positions')
const target = args.find((a, i) => !a.startsWith('-') && i !== themeIndex + 1)

if (!target || !themeId) {
  console.error('用法：pnpm deck:retheme <deck.json> --theme <id> [--reset-positions] [--dry-run]')
  process.exit(2)
}

const file = resolve(target)
const parsed = parseDeck(readFileSync(file, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  process.exit(1)
}
const deckDir = dirname(file)
try {
  loadTheme(themeId, { deckDir })
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}

const { deck, report } = rethemeDeck(parsed.deck, themeId, { resetPositions, deckDir })
const check = validateDeck(deck)
if (!check.ok) {
  for (const e of check.errors) console.log(`✖ ${e.path}  ${e.message}`)
  console.log('換主題後的 deck 沒有通過驗證，未寫入')
  process.exit(1)
}

const rel = relative(process.cwd(), file).replace(/\\/g, '/')
console.log(`${parsed.deck.theme} → ${themeId}（${deck.slides.length} 頁）`)
for (const s of deck.slides) {
  console.log(
    `  ${s.id.padEnd(6)} ${s.layout.padEnd(14)} ${report.layoutSource[s.id] === 'pack' ? '主題包版型' : '通用版型'}`,
  )
}
const line = (label: string, items: string[]) => {
  if (items.length > 0) console.log(`${label}：${items.join('、')}`)
}
line('丟掉的內容（新版型沒有這個槽位）', report.droppedSlots)
line('補了空白的必要槽位（請填內容）', report.filledRequired)
line('保留的覆寫', report.keptOverrides)
line('孤兒覆寫（新版型沒有該元件，已移除）', report.orphanedOverrides)
line('重設位置的覆寫', report.resetPositions)

if (dryRun) {
  console.log('（--dry-run，未寫入）')
  process.exit(0)
}
writeFileSync(file, stringifyDeck(deck), 'utf8')
console.log(`已寫入 ${rel}；接著 pnpm render ${rel}`)
