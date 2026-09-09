import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { type Deck, parseDeck } from '../model/deck.ts'
import { effectiveOrder } from '../model/pages.js'
import { launchChromium } from '../qa/browser.ts'
import { waitForFit } from '../qa/measure.ts'
import { renderDeckDocument } from '../render/deck.ts'

/**
 * One PNG per slide, as the deck plays in its static state (every step shown, no motion, the same
 * state QA measures), plus a contact sheet. QA measures boxes; a box that is far taller than its
 * content, an empty callout that still paints its ground, an image cropped by object-fit: none of
 * that is a box problem, so it only shows up when someone looks at the page. This is for looking.
 */
const args = process.argv.slice(2)
const outIndex = args.indexOf('-o')
const showHidden = args.includes('--hidden')
const positional = args.filter(
  (a, i) => !a.startsWith('-') && !(outIndex !== -1 && i === outIndex + 1),
)
const target = positional[0]
const only = positional.slice(1)
if (!target || args.includes('--help') || args.includes('-h')) {
  console.error(
    [
      'Usage: pnpm deck:gallery <deck.json | deck.html> [-o dir] [--hidden] [sN…]',
      '  Screenshots every slide of the deck in its static state (every step shown, no motion: what QA measures and what',
      '  ?static=1 shows) as 1920×1080 PNGs into artifacts/deck-gallery/<deck-id>/, with an index.html contact sheet.',
      '  Hidden pages are skipped unless --hidden; trailing slide ids restrict the run. QA measures boxes; this is for looking.',
    ].join('\n'),
  )
  process.exit(2)
}

const file = resolve(target)
const text = readFileSync(file, 'utf8')
let deck: Deck
if (file.endsWith('.html')) {
  const m = /<script type="application\/json" id="deck-model">([\s\S]*?)<\/script>/.exec(text)
  if (!m?.[1]) {
    console.log(
      '✖ this HTML has no embedded deck model; use a file produced by pnpm render, or pass deck.json directly',
    )
    process.exit(1)
  }
  const parsed = parseDeck(m[1])
  if (!parsed.ok) {
    for (const e of parsed.errors) console.log(`✖ ${e.path}  ${e.message}`)
    process.exit(1)
  }
  deck = parsed.deck
} else {
  const parsed = parseDeck(text)
  if (!parsed.ok) {
    for (const e of parsed.errors) console.log(`✖ ${target} ${e.path}  ${e.message}`)
    process.exit(1)
  }
  deck = parsed.deck
}

const order = effectiveOrder(
  deck.slides.map((s) => s.id),
  deck.pages,
)
const known = new Set(deck.slides.map((s) => s.id))
for (const id of only) {
  if (!known.has(id)) {
    console.log(`✖ the deck has no slide \`${id}\`; it has ${[...known].join(', ')}`)
    process.exit(2)
  }
}
const wanted = new Set(
  only.length > 0 ? only : [...order.visible, ...(showHidden ? order.hidden : [])],
)
const position = new Map(order.visible.map((id, i) => [id, i + 1]))
const layoutOf = new Map(deck.slides.map((s) => [s.id, s.layout]))
const outDir =
  outIndex === -1
    ? resolve('artifacts', 'deck-gallery', deck.id)
    : resolve(args[outIndex + 1] ?? join('artifacts', 'deck-gallery', deck.id))
mkdirSync(outDir, { recursive: true })
const rel = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/')

// the deck as it plays, images inlined so the document needs no base URL
const deckDir = dirname(file)
const rendered = renderDeckDocument(deck, {
  deckDir,
  outDir: deckDir,
  inlineAssets: true,
  staticMode: true,
})
for (const w of rendered.warnings) console.log(`⚠ ${w}`)

const browser = await launchChromium()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.setContent(rendered.html)
await waitForFit(page)

interface Shot {
  id: string
  file: string
  label: string
}
const shots: Shot[] = []
const sequence = [...order.visible, ...order.hidden].filter((id) => wanted.has(id))
for (const id of sequence) {
  const n = position.get(id)
  const name = n === undefined ? `hidden-${id}` : `${String(n).padStart(2, '0')}-${id}`
  // the runtime shows one section at a time; switching the class directly reaches hidden pages too
  await page.evaluate((slideId) => {
    for (const s of document.querySelectorAll<HTMLElement>('section.slide')) {
      s.classList.toggle('is-active', s.dataset.slide === slideId)
      s.classList.remove('is-leaving')
    }
  }, id)
  const shot = join(outDir, `${name}.png`)
  await page.screenshot({ path: shot })
  const label = `${n === undefined ? 'hidden' : String(n).padStart(2, '0')} · ${id} · ${layoutOf.get(id)}`
  shots.push({ id, file: `${name}.png`, label })
  console.log(
    `✓ ${(n === undefined ? 'hidden' : String(n).padStart(2, '0')).padEnd(6)} ${id.padEnd(6)} ${(layoutOf.get(id) ?? '').padEnd(14)} → ${rel(shot)}`,
  )
}
await browser.close()

// the contact sheet: every shot at a glance, nothing external
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const sheet = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${esc(deck.title)} — deck gallery</title>
<style>
  body { margin: 0; padding: 24px; background: #1c1c1c; color: #ddd; font: 14px system-ui, sans-serif; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 20px; }
  figure { margin: 0; }
  img { display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; border: 1px solid #333; }
  figcaption { margin-top: 6px; color: #aaa; font-family: ui-monospace, monospace; font-size: 13px; }
</style>
<h1>${esc(deck.title)} · ${shots.length} of ${deck.slides.length} slides · static state</h1>
<div class="grid">
${shots.map((s) => `  <figure><a href="${s.file}"><img src="${s.file}" alt="${esc(s.id)}"></a><figcaption>${esc(s.label)}</figcaption></figure>`).join('\n')}
</div>
`
const sheetFile = join(outDir, 'index.html')
writeFileSync(sheetFile, sheet, 'utf8')
console.log(
  `${shots.length} slides → ${rel(sheetFile)}${order.hidden.length > 0 && !showHidden && only.length === 0 ? ` (${order.hidden.length} hidden page${order.hidden.length === 1 ? '' : 's'} skipped; --hidden includes them)` : ''}`,
)
process.exit(0)
