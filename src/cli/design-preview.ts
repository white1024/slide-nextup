import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { deckIdFromStoryPath, slotsFor } from '../model/scaffold.ts'
import { loadStory } from '../model/story.ts'
import { measureSlide, summariseOverflow, waitForFit } from '../qa/measure.ts'
import { loadLayout, loadTheme, PROJECT_ROOT } from '../render/assets.ts'
import { renderPreviewDocument } from '../render/preview.ts'

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const skip = new Set<number>()
for (const name of ['--theme', '--layout', '-o']) {
  const i = args.indexOf(name)
  if (i !== -1) {
    skip.add(i)
    skip.add(i + 1)
  }
}
const target = args.find((a, i) => !a.startsWith('-') && !skip.has(i))
const themeId = opt('--theme')
if (!target || !themeId) {
  console.error('用法：pnpm design:preview <story.md> --theme <id> [--layout cover] [-o dir]')
  process.exit(2)
}

const storyFile = resolve(target)
const loaded = loadStory(readFileSync(storyFile, 'utf8'))
if (loaded.hasErrors || !loaded.story) {
  console.log('敘事文件未通過檢查，先修正再預覽')
  process.exit(1)
}
const story = loaded.story
const first = story.slides[0]
if (!first) {
  console.log('敘事沒有任何頁面')
  process.exit(1)
}
const layoutId = opt('--layout') ?? 'cover'
const lookup = { deckDir: dirname(storyFile) }
let theme: ReturnType<typeof loadTheme>
try {
  theme = loadTheme(themeId, lookup)
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
const layout = loadLayout(layoutId, themeId, lookup)
const slots = slotsFor(first, layout.json, story)
const outDir = resolve(
  opt('-o') ?? join(PROJECT_ROOT, 'artifacts', 'design', deckIdFromStoryPath(storyFile)),
)
mkdirSync(outDir, { recursive: true })

const html = renderPreviewDocument({ theme, layout, slideId: first.id, slots })
const htmlFile = join(outDir, `${themeId}.html`)
const pngFile = join(outDir, `${themeId}.png`)
writeFileSync(htmlFile, html, 'utf8')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(pathToFileURL(htmlFile).href)
await waitForFit(page)
await page.screenshot({ path: pngFile })
const problems = summariseOverflow(await measureSlide(page))
await browser.close()

console.log(
  `${theme.json.name}（${themeId}）× ${layout.json.name} → ${relative(process.cwd(), pngFile).replace(/\\/g, '/')}`,
)
for (const p of problems) console.log(`⚠ ${p}`)
process.exit(0)
