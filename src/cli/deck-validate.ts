import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDeck, stringifyDeck } from '../model/deck.ts'
import { effectiveOrder, followsStory } from '../model/pages.js'
import { loadLayout } from '../render/assets.ts'
import { checkSlideAgainstLayout } from '../render/deck.ts'

const args = process.argv.slice(2)
const write = args.includes('--write')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error('用法：pnpm deck:validate <deck.json> [--write]')
  process.exit(2)
}

const file = resolve(target)
const text = readFileSync(file, 'utf8')
const result = parseDeck(text)

if (!result.ok) {
  for (const e of result.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  console.log(`未通過：${result.errors.length} 個錯誤`)
  process.exit(1)
}

const deck = result.deck
const canonical = stringifyDeck(deck)
const overrideCount = Object.keys(deck.overrides).length
console.log(`${deck.title}（${deck.id} · theme ${deck.theme}）`)
console.log(
  `${deck.slides.length} 頁，${overrideCount} 筆覆寫${deck.story ? `，story ${deck.story.path} ${deck.story.sha256.slice(0, 8)}` : ''}`,
)
for (const s of deck.slides) {
  const slots = Object.keys(s.slots).length
  console.log(
    `  ${s.id.padEnd(6)} ${s.layout.padEnd(12)} ${slots} slots / ${s.elements.length} elements`,
  )
}

// the same layout consistency check the renderer runs, so a deck that validates also renders
const problems: string[] = []
for (const s of deck.slides) {
  try {
    problems.push(...checkSlideAgainstLayout(s, loadLayout(s.layout, deck.theme), deck.overrides))
  } catch (err) {
    problems.push((err as Error).message)
  }
}
if (problems.length > 0) {
  for (const p of problems) console.log(`✖ ${p}`)
  console.log(`未通過：與版型不一致 ${problems.length} 處`)
  process.exit(1)
}

const ids = deck.slides.map((s) => s.id)
if (deck.pages && !followsStory(ids, deck.pages)) {
  const eff = effectiveOrder(ids, deck.pages)
  console.log(
    `⚠ 頁面編排與敘事不同：播放順序 ${eff.visible.join(' → ')}${eff.hidden.length ? `；隱藏 ${eff.hidden.join('、')}` : ''}（story.md 仍是正本，重做頁面時會保留這份編排）`,
  )
}

if (canonical !== text) {
  if (write) {
    writeFileSync(file, canonical, 'utf8')
    console.log('已寫回標準格式')
  } else {
    console.log('⚠ 檔案不是標準格式（鍵順序或縮排不同）；加 --write 可寫回標準格式')
  }
}
console.log('通過')
