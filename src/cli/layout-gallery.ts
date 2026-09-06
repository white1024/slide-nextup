import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { checkHint, measureCapacity, type TextCapacity } from '../qa/capacity.ts'
import { measureSlide, summariseOverflow, waitForFit } from '../qa/measure.ts'
import {
  deckDirOfPath,
  listLayoutIdsFor,
  loadLayout,
  loadTheme,
  PROJECT_ROOT,
} from '../render/assets.ts'
import { renderPreviewDocument } from '../render/preview.ts'

const args = process.argv.slice(2)
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? 'ink-paper' : (args[themeIndex + 1] ?? 'ink-paper')
const outIndex = args.indexOf('-o')
const deckIndex = args.indexOf('--deck')
const showCapacity = args.includes('--capacity')
const isValueOf = (idx: number, i: number) => idx !== -1 && i === idx + 1
const isOptionValue = (i: number) =>
  isValueOf(themeIndex, i) || isValueOf(outIndex, i) || isValueOf(deckIndex, i)
const only = args.filter((a, i) => !a.startsWith('-') && !isOptionValue(i))

// --deck <deck.json|dir>: the theme may live in that deck's own themes/ folder
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const theme = loadTheme(themeId, lookup)
const outDir =
  outIndex === -1
    ? join(PROJECT_ROOT, 'artifacts', 'layout-gallery')
    : resolve(args[outIndex + 1] ?? join(PROJECT_ROOT, 'artifacts', 'layout-gallery'))
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
let failures = 0
let hintProblems = 0
const capacities: Array<TextCapacity & { layout: string; hint?: string }> = []

for (const id of only.length > 0 ? only : listLayoutIdsFor(themeId, lookup)) {
  const layout = loadLayout(id, themeId, lookup)
  const html = renderPreviewDocument({ theme, layout, slideId: id, slots: layout.json.sample })
  const htmlFile = join(outDir, `${id}.html`)
  writeFileSync(htmlFile, html, 'utf8')
  await page.goto(pathToFileURL(htmlFile).href)
  await waitForFit(page)
  const shot = join(outDir, `${id}.png`)
  await page.screenshot({ path: shot })
  const boxes = await measureSlide(page)
  const problems = summariseOverflow(boxes)
  // what each text slot really holds, against the numbers its hint promises
  const textEls = new Set(layout.json.elements.filter((e) => e.kind === 'text').map((e) => e.id))
  const rows: string[] = []
  for (const cap of await measureCapacity(page)) {
    if (!textEls.has(cap.el)) continue
    const hint = layout.json.slots[cap.el]?.hint
    capacities.push({ layout: id, ...cap, hint })
    rows.push(
      `${cap.el.padEnd(12)} ${cap.contentW}×${cap.contentH}px @${cap.fontSize}px ≈ ${cap.charsPerLine} chars/line × ${cap.lines} lines${hint ? `  "${hint}"` : ''}`,
    )
    const bad = hint ? checkHint(hint, cap) : null
    if (bad) {
      hintProblems++
      problems.push(`the hint "${hint}" of ${cap.el} does not fit: ${bad}`)
    }
  }
  failures += problems.length
  console.log(
    `${problems.length === 0 ? '✓' : '✖'} ${id.padEnd(12)} ${boxes.length} elements  → ${shot}`,
  )
  for (const p of problems) console.log(`    ${p}`)
  if (showCapacity) for (const r of rows) console.log(`      ${r}`)
}

await browser.close()
const capacityFile = join(outDir, `capacity-${themeId}.json`)
writeFileSync(capacityFile, `${JSON.stringify(capacities, null, 2)}\n`, 'utf8')
console.log(
  failures === 0
    ? `no layout overflows and every hint fits (capacity table → ${capacityFile})`
    : `${failures - hintProblems} overflow problems, ${hintProblems} hints that do not fit (capacity table → ${capacityFile})`,
)
process.exit(failures === 0 ? 0 : 1)
