import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseDeck } from '../model/deck.ts'
import { effectiveOrder, followsStory } from '../model/pages.js'
import { loadStory, SECTION_HEADINGS } from '../model/story.ts'
import { applyPagesToStory } from '../model/story-apply.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error(
    [
      '用法：pnpm story:apply-deck <deck.json> [--dry-run]',
      '  把 deck.json 的頁面編排（pages：播放順序與隱藏頁）寫回 story.md：逐頁段落依播放順序重排、隱藏的頁移除。',
      '  寫回後敘事需要重新確認（pnpm story:confirm），再重做頁面時 deck:scaffold 會清空對應的頁面編排。',
      '  --dry-run 只印出會改成什麼，不寫檔。',
    ].join('\n'),
  )
  process.exit(2)
}

const deckFile = resolve(target)
const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
  process.exit(1)
}
const deck = parsed.deck
const storyFile = resolve(dirname(deckFile), deck.story?.path ?? 'story.md')
if (!existsSync(storyFile)) {
  console.log(`✖ 找不到敘事文件 ${storyFile}（deck.json 的 story.path）`)
  process.exit(1)
}
const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, '/')
const storyText = readFileSync(storyFile, 'utf8')
const loaded = loadStory(storyText)
if (loaded.hasErrors || !loaded.story) {
  for (const d of loaded.diagnostics)
    console.log(`✖ ${rel(storyFile)}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('敘事文件本身沒有通過檢查，先修正再寫回')
  process.exit(1)
}
const story = loaded.story
const ids = story.slides.map((s) => s.id)
const deckIds = deck.slides.map((s) => s.id)
if (deckIds.join('\u0000') !== ids.join('\u0000')) {
  console.log(
    `⚠ deck.json 的頁面（${deckIds.join(', ')}）與敘事（${ids.join(', ')}）不同；以敘事為準，編排裡不存在的頁面會被忽略`,
  )
}
if (!deck.pages || followsStory(ids, deck.pages)) {
  console.log('頁面編排與敘事一致（沒有換序、沒有隱藏頁），沒有東西要寫回')
  process.exit(0)
}

const before = effectiveOrder(ids, undefined).order
const result = applyPagesToStory(storyText, story, deck.pages)
const titleOf = (id: string) => story.slides.find((s) => s.id === id)?.title ?? ''
console.log(`${story.meta.title}：${rel(storyFile)}`)
console.log(`  敘事順序  ${before.join(' → ')}`)
console.log(`  播放順序  ${result.order.join(' → ')}`)
for (const r of result.removed) console.log(`  － 移除隱藏頁 ${r.id}｜${r.title}`)
for (const id of result.unknown) console.log(`  ⚠ 編排裡的 ${id} 不在敘事裡，忽略`)
const moved = result.order.filter(
  (id, i) => before.filter((b) => !result.removed.some((r) => r.id === b))[i] !== id,
)
if (moved.length > 0)
  console.log(`  ↕ 換位的頁：${moved.map((id) => `${id}｜${titleOf(id)}`).join('、')}`)

if (dryRun) {
  console.log('（--dry-run：沒有寫檔）')
  process.exit(0)
}

writeFileSync(storyFile, result.text, 'utf8')
console.log(`已寫回 ${rel(storyFile)}`)
const after = loadStory(result.text)
for (const d of after.diagnostics)
  console.log(
    `${d.severity === 'error' ? '✖' : '⚠'} ${rel(storyFile)}:${d.line}  [${d.rule}] ${d.message}`,
  )
const errors = after.diagnostics.filter((d) => d.severity === 'error').length
console.log(
  `story:check ${errors === 0 ? '通過' : '未通過'}：${errors} 個錯誤，${after.diagnostics.length - errors} 個警告`,
)
console.log(
  `⚠ 「## ${SECTION_HEADINGS.skeleton}」沒有自動改：${result.removed.length > 0 ? '移除的頁若在骨架裡有對應章節，' : ''}請自行核對章節順序與內容`,
)
const status = confirmationStatus(storyFile, result.text)
console.log(`✖ ${describeStatus(status)}`)
console.log(
  [
    '下一步：',
    `  1. 把新的逐頁摘要拿給使用者看，同意後 pnpm story:confirm ${rel(storyFile)}`,
    `  2. pnpm deck:scaffold ${rel(storyFile)} --slide <重做的頁>（或整份）：敘事順序已等於播放順序，scaffold 會清空 pages.order，隱藏頁的 pages.hidden 因頁面不在敘事裡而移除`,
    `  3. pnpm render ${rel(join(dirname(deckFile), 'deck.json'))} 後播放順序不變`,
  ].join('\n'),
)
process.exit(errors === 0 ? 0 : 1)
