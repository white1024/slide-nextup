import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { type Deck, parseDeck, type Slide, stringifyDeck, validateDeck } from '../model/deck.ts'
import { deckIdFromStoryPath, scaffoldDeck } from '../model/scaffold.ts'
import { loadStory } from '../model/story.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'
import {
  type LayoutJson,
  layoutRoles,
  listLayoutIdsFor,
  loadLayout,
  loadTheme,
} from '../render/assets.ts'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const consumed = new Set<number>()
for (const name of ['--theme', '--layouts', '--slide', '--from', '-o', '--id']) {
  const i = args.indexOf(name)
  if (i !== -1) {
    consumed.add(i)
    consumed.add(i + 1)
  }
}
const target = args.find((a, i) => !a.startsWith('-') && !consumed.has(i))

if (!target) {
  console.error(
    [
      '用法：pnpm deck:scaffold <story.md> [--theme id] [--layouts s1=cover,s4=comparison] [--slide s3] [--from slide.json] [--reset-overrides] [--force] [-o deck.json]',
      '  --layouts        指定某幾頁的版型，其餘依敘事自動選',
      '  --slide          只重新生成這一頁，其他頁沿用既有 deck.json；手動覆寫一律保留',
      '  --from           用 agent 寫好的單頁 JSON 取代該頁（需與 --slide 同用）',
      '  --reset-overrides 清掉重新生成頁面的手動覆寫',
      '  --force          跳過「敘事已確認」的關卡（只在使用者明確要求時使用）',
    ].join('\n'),
  )
  process.exit(2)
}

const storyFile = resolve(target)
const storyText = readFileSync(storyFile, 'utf8')
const loaded = loadStory(storyText)
if (loaded.hasErrors || !loaded.story) {
  for (const d of loaded.diagnostics) console.log(`✖ ${target}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('敘事文件未通過檢查，先修正再生成')
  process.exit(1)
}
const status = confirmationStatus(storyFile, storyText)
if (status.state !== 'confirmed' && !flag('--force')) {
  console.log(`✖ ${describeStatus(status)}`)
  console.log('未確認的敘事不能生成頁面；這是流程的關卡，不是提醒')
  process.exit(1)
}

const outFile = resolve(opt('-o') ?? join(dirname(storyFile), 'deck.json'))
let existing: Deck | undefined
if (existsSync(outFile)) {
  const parsed = parseDeck(readFileSync(outFile, 'utf8'))
  if (!parsed.ok) {
    for (const e of parsed.errors) console.log(`✖ ${outFile} ${e.path}  ${e.message}`)
    console.log('既有的 deck.json 無法解析；修好它或換一個輸出路徑')
    process.exit(1)
  }
  existing = parsed.deck
}

const theme = opt('--theme') ?? existing?.theme ?? 'ink-paper'
// the deck's own folder may carry the theme (decks/<id>/themes/<theme>/), so look from there
const lookup = { deckDir: dirname(outFile) }
try {
  loadTheme(theme, lookup)
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
const layouts = new Map<string, LayoutJson>()
const roles = new Map<string, Map<string, string>>()
for (const id of listLayoutIdsFor(theme, lookup)) {
  const layout = loadLayout(id, theme, lookup)
  layouts.set(id, layout.json)
  roles.set(id, layoutRoles(layout))
}

const choices: Record<string, string> = {}
for (const pair of (opt('--layouts') ?? '').split(',').filter(Boolean)) {
  const [slideId, layoutId] = pair.split('=')
  if (!slideId || !layoutId) {
    console.log(`✖ --layouts 的格式是 s1=cover,s2=cards，看不懂 \`${pair}\``)
    process.exit(2)
  }
  choices[slideId] = layoutId
}

const only = opt('--slide')?.split(',').filter(Boolean)
const replacements: Record<string, Slide> = {}
const from = opt('--from')
if (from) {
  if (only?.length !== 1) {
    console.log('✖ --from 需要搭配單一 --slide <id>')
    process.exit(2)
  }
  const slide = JSON.parse(readFileSync(resolve(from), 'utf8')) as Slide
  if (slide.id !== only[0]) {
    console.log(`✖ ${from} 裡的 id 是 \`${slide.id}\`，與 --slide ${only[0]} 不同`)
    process.exit(2)
  }
  replacements[slide.id] = slide
}

let result: ReturnType<typeof scaffoldDeck>
try {
  result = scaffoldDeck({
    story: loaded.story,
    storyText,
    storyRelativePath: relative(dirname(outFile), storyFile).replace(/\\/g, '/'),
    deckId: opt('--id') ?? existing?.id ?? deckIdFromStoryPath(storyFile),
    theme,
    layouts,
    roles,
    choices,
    existing,
    only,
    replacements,
  })
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}

if (flag('--reset-overrides')) {
  const targets = new Set(only ?? loaded.story.slides.map((s) => s.id))
  for (const key of Object.keys(result.deck.overrides)) {
    if (targets.has(key.split('/')[0] as string)) delete result.deck.overrides[key]
  }
}

const validation = validateDeck(result.deck)
if (!validation.ok) {
  for (const e of validation.errors) console.log(`✖ ${e.path}  ${e.message}`)
  console.log('生成的 deck 沒有通過驗證（通常是必要 slot 還沒有內容）；已寫出檔案供修正')
}
writeFileSync(outFile, stringifyDeck(result.deck), 'utf8')

console.log(
  `${result.deck.title}：${result.deck.slides.length} 頁 → ${relative(process.cwd(), outFile).replace(/\\/g, '/')}`,
)
for (const [id, layout] of Object.entries(result.chosen)) console.log(`  ${id.padEnd(6)} ${layout}`)
const overrideCount = Object.keys(result.deck.overrides).length
if (existing) {
  console.log(
    `覆寫：保留 ${result.kept.length} 筆，孤兒 ${result.orphaned.length} 筆，共 ${overrideCount} 筆`,
  )
  for (const k of result.orphaned)
    console.log(`  ⚠ ${k} 指向的元件已不存在（保留在檔案裡；--reset-overrides 可清除）`)
  if (result.overridesDropped.length > 0)
    console.log(
      `  ⚠ ${result.overridesDropped.join('、')} 指向的頁面已不在敘事裡，覆寫已隨頁面移除`,
    )
  if (result.pagesDropped.length > 0)
    console.log(`  ⚠ 頁面編排裡的 ${result.pagesDropped.join('、')} 已不在敘事裡，已移除`)
  if (result.pagesCleared.length > 0)
    console.log(
      `  頁面編排的 ${result.pagesCleared.join('、')} 已與敘事一致，已清空${result.deck.pages ? '' : '（pages 已移除，播放順序不變）'}`,
    )
  if (result.stepsKept.length > 0 || result.stepsDropped.length > 0) {
    console.log(
      `逐步顯示：保留 ${result.stepsKept.length} 筆，丟棄 ${result.stepsDropped.length} 筆`,
    )
    for (const k of result.stepsDropped) console.log(`  ⚠ ${k} 的元件在新版型裡不存在，step 已丟棄`)
  }
}
if (result.stepsAuto.length > 0) {
  const pages = new Set(result.stepsAuto.map((k) => k.split('/')[0]))
  console.log(
    `逐步顯示：自動替 ${pages.size} 頁排了 ${result.stepsAuto.length} 個元件（編輯器面板可改；重做該頁時保留你改過的）`,
  )
}
for (const w of result.warnings) console.log(`⚠ ${w}`)
process.exit(validation.ok ? 0 : 1)
