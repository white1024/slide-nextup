import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sampleDeck } from '../src/qa/theme-qa.ts'
import { listLayoutIdsFor, loadLayout } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const outDir = resolve('artifacts', 'preflight', 'progress-test')
const THEME = 'warm-keynote'

describe('progress ticks (warm-keynote)', () => {
  let browser: Browser
  let page: Page
  let html: string
  let htmlFile: string
  let ids: string[]

  // the pack's own layouts; the global layouts a theme may also use carry no progress element
  const packIds = () =>
    listLayoutIdsFor(THEME).filter((id) => loadLayout(id, THEME).dir.includes('themes'))

  beforeAll(async () => {
    const deck = sampleDeck(THEME, undefined, packIds())
    ids = deck.slides.map((s) => s.id)
    mkdirSync(outDir, { recursive: true })
    html = renderDeckDocument(deck, { deckDir: resolve('themes', THEME), outDir }).html
    htmlFile = join(outDir, 'deck.html')
    writeFileSync(htmlFile, html, 'utf8')
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  })
  afterAll(async () => {
    await browser?.close()
  })

  it('every pack layout carries the progress shape right before its page chip; the cover lost its fake ticks', () => {
    expect(packIds().length).toBeGreaterThanOrEqual(16)
    for (const id of packIds()) {
      const layout = loadLayout(id, THEME)
      const els = layout.json.elements.map((e) => e.id)
      expect(els, id).toContain('progress')
      expect(els.indexOf('progress'), id).toBe(els.indexOf('page') - 1)
      expect(layout.json.elements.find((e) => e.id === 'progress')?.kind, id).toBe('shape')
      expect(layout.html, id).toContain('data-el="progress" data-role="progress"')
      expect(layout.css, id).toMatch(/\[data-el="progress"\] \{\s*left: 31px;\s*top: 1050px;/)
      expect(els.length, id).toBeLessThanOrEqual(layout.json.density.max_elements)
    }
    expect(loadLayout('cover', THEME).html).not.toMatch(/tick-on|data-role="ticks"/)
  })

  it('the renderer stamps --page-index / --page-count on every section in story order', () => {
    ids.forEach((id, i) => {
      expect(html).toContain(
        `data-slide="${id}" style="--page-index:${i + 1};--page-count:${ids.length}"`,
      )
    })
  })

  it('the player lights the current tick and renumbers when a page is hidden', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#3`)
    await page.waitForFunction(() => window.__deck?.current === 2)
    const read = () =>
      page.evaluate(() => {
        const d = window.__deck
        const s = document.querySelector(`[data-slide="${d.ids[d.current]}"]`) as HTMLElement
        const bar = s.querySelector('[data-el="progress"]') as HTMLElement
        const cs = getComputedStyle(bar)
        const pct = (v: string) => Number.parseFloat(v)
        return {
          index: s.style.getPropertyValue('--page-index'),
          count: s.style.getPropertyValue('--page-count'),
          // the lit layer: one pitch wide, moved (index-1)/(count-1) of the way along
          litWidthPct: pct(cs.backgroundSize.split(',')[0] ?? ''),
          litPositionPct: pct(cs.backgroundPositionX.split(',')[0] ?? ''),
          layers: cs.backgroundImage.split('gradient(').length - 1,
        }
      })
    const n = ids.length
    const third = await read()
    expect(third.index).toBe('3')
    expect(third.count).toBe(String(n))
    expect(third.layers).toBe(2)
    expect(third.litWidthPct).toBeCloseTo(100 / n, 3)
    expect(third.litPositionPct).toBeCloseTo((2 / (n - 1)) * 100, 3)
    // hide the first page: the same slide is now second of n-1
    const first = ids[0] as string
    await page.evaluate((id) => window.__deck.setPages({ hidden: [id] }), first)
    const second = await read()
    expect(second.index).toBe('2')
    expect(second.count).toBe(String(n - 1))
    expect(second.litPositionPct).toBeCloseTo((1 / (n - 2)) * 100, 3)
    await page.evaluate(() => window.__deck.setPages(undefined))
    expect((await read()).count).toBe(String(n))
  })
})
