import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Deck, parseDeck } from '../src/model/deck.ts'
import { HOVER_ROLES, lintCss, lintThemeHover } from '../src/qa/css-ownership.ts'
import { waitForFit } from '../src/qa/measure.ts'
import { listThemeIds, loadTheme } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'
import { inlineMarkup, renderSlot } from '../src/render/slot-render.js'

const outDir = resolve('artifacts', 'preflight', 'interaction')

function load(file: string): Deck {
  const r = parseDeck(readFileSync(resolve(file), 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.deck
}

function publish(deck: Deck, deckDir: string, name: string): string {
  mkdirSync(outDir, { recursive: true })
  const { html } = renderDeckDocument(deck, { deckDir, outDir, inlineAssets: true })
  const file = join(outDir, name)
  writeFileSync(file, html, 'utf8')
  return pathToFileURL(file).href
}

describe('link markup in text slots', () => {
  it('turns [text](url) into a link for http(s), mailto and #slide targets only', () => {
    expect(inlineMarkup('看[官方說明](https://example.com/a?b=1&c=2)')).toBe(
      '看<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener">官方說明</a>',
    )
    expect(inlineMarkup('跳到[第三頁](#s3)')).toBe('跳到<a href="#s3">第三頁</a>')
    expect(inlineMarkup('[寫信](mailto:a@b.c)')).toContain('href="mailto:a@b.c"')
    expect(inlineMarkup('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))')
    expect(inlineMarkup('\\[不是連結](x)')).toBe('[不是連結](x)')
    expect(inlineMarkup('*[強調的連結](https://a.b)*')).toBe(
      '<em><a href="https://a.b" target="_blank" rel="noopener">強調的連結</a></em>',
    )
    expect(renderSlot({ type: 'list', items: ['[a](https://a.b)', 'b'] })).toContain(
      '<li><a href="https://a.b"',
    )
  })
})

describe('theme hover contract', () => {
  it.each(listThemeIds({ userThemesDir: null }))(
    '%s defines a hover state for every hover-able role it styles',
    (id) => {
      const css = loadTheme(id).css
      expect(lintThemeHover(css)).toEqual([])
      expect(lintCss(css, 'theme').filter((i) => i.severity === 'error')).toEqual([])
      expect(css).toMatch(/\[data-interactive\] \[data-role="card"\]:hover/)
    },
  )

  it('requires the [data-interactive] gate, a data-role, and a hover for every styled hover-able role', () => {
    expect(HOVER_ROLES).toEqual(['card', 'pill', 'cta', 'photo', 'table'])
    const bare = '[data-role="card"] { color: red; }\n[data-role="card"]:hover { color: blue; }'
    expect(lintThemeHover(bare).map((i) => i.message)).toEqual([
      expect.stringContaining('[data-interactive]'),
    ])
    const noRole =
      '[data-role="card"] { color: red; }\n[data-interactive] [data-role="card"]:hover { color: blue; }\n[data-interactive] .card:hover { color: blue; }'
    expect(lintThemeHover(noRole).map((i) => i.message)).toEqual([
      expect.stringContaining('data-role'),
    ])
    const missing =
      '[data-role="card"] { color: red; }\n[data-role="photo"] { color: red; }\n[data-interactive] [data-role="card"]:hover { color: blue; }'
    expect(lintThemeHover(missing).map((i) => i.selector)).toEqual(['[data-role="photo"]'])
    expect(lintThemeHover('[data-role="title"] { color: red; }')).toEqual([])
  })

  it('lets a hover rule lift or scale, and nothing else move', () => {
    const ok =
      '[data-interactive] [data-role="card"]:hover { transform: translateY(-4px); box-shadow: 0 0 0 red; }'
    expect(lintCss(ok, 'theme')).toEqual([])
    const resting = '[data-role="card"] { transform: translateY(-4px); }'
    expect(lintCss(resting, 'theme').map((i) => i.property)).toEqual(['transform'])
    const geometry = '[data-interactive] [data-role="card"]:hover { width: 10px; }'
    expect(lintCss(geometry, 'theme').map((i) => i.property)).toEqual(['width'])
  })
})

describe('playback micro-interactions in a real browser', () => {
  let browser: Browser
  let demoUrl: string
  let componentsUrl: string
  let linksUrl: string

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    demoUrl = publish(
      load('examples/tidewatch-progress/deck.json'),
      resolve('examples/tidewatch-progress'),
      'demo.html',
    )
    componentsUrl = publish(
      load('examples/deck.components.json'),
      resolve('examples'),
      'components.html',
    )
    const linked = load('examples/deck.sample.json')
    const s1 = linked.slides[0]
    if (!s1) throw new Error('sample deck has no slides')
    s1.slots.subtitle = {
      type: 'text',
      value: '先看[說明](https://example.com)，再翻到[第三頁](#s3)就好',
    }
    linksUrl = publish(linked, resolve('examples'), 'links.html')
  })
  afterAll(async () => {
    await browser?.close()
  })

  async function open(url: string): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.goto(url)
    await waitForFit(page)
    return page
  }
  const computed = (page: Page, selector: string, property: string) =>
    page.evaluate(
      ([sel, prop]) => {
        const el = document.querySelector(sel as string)
        if (!el) throw new Error(`no ${sel}`)
        return getComputedStyle(el).getPropertyValue(prop as string)
      },
      [selector, property],
    )
  const go = (page: Page, id: string, step = 0) =>
    page.evaluate(
      ([i, s]) =>
        (window as unknown as { __deck: { go: (n: string, st?: number) => void } }).__deck.go(
          i as string,
          s as number,
        ),
      [id, step],
    )
  const interactive = (page: Page) =>
    page.evaluate(() => document.documentElement.hasAttribute('data-interactive'))

  it('lifts a card on hover while playing, but not in static mode or while editing', async () => {
    const page = await open(demoUrl)
    expect(await interactive(page)).toBe(true)
    await go(page, 's4', 9)
    const card = '[data-slide="s4"] [data-el="card-1"]'
    const restingShadow = await computed(page, card, 'box-shadow')
    expect(await computed(page, card, 'transform')).toBe('none')
    await page.hover(card)
    await page.waitForFunction(
      (sel) =>
        getComputedStyle(document.querySelector(sel) as Element).transform ===
        'matrix(1, 0, 0, 1, 0, -5)',
      card,
    )
    expect(await computed(page, card, 'box-shadow')).not.toBe(restingShadow)
    await page.mouse.move(5, 5)
    await page.waitForFunction(
      (sel) => getComputedStyle(document.querySelector(sel) as Element).transform === 'none',
      card,
    )
    // the editor's class drops the gate, so dragging never meets a lifted card
    await page.evaluate(() => document.body.classList.add('ed-active'))
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-interactive'))
    await page.hover(card)
    await page.waitForTimeout(300)
    expect(await computed(page, card, 'transform')).toBe('none')
    expect(await computed(page, card, 'box-shadow')).toBe(restingShadow)
    await page.evaluate(() => document.body.classList.remove('ed-active'))
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-interactive'))
    await page.close()
    // static mode is what QA measures: no gate, no hover
    const still = await open(`${demoUrl}?static=1`)
    expect(await interactive(still)).toBe(false)
    await go(still, 's4')
    await still.hover(card)
    await still.waitForTimeout(300)
    expect(await computed(still, card, 'transform')).toBe('none')
    expect(await computed(still, card, 'box-shadow')).toBe(restingShadow)
    await still.close()
  })

  it('highlights a process step pill on hover', async () => {
    const page = await open(demoUrl)
    await go(page, 's6', 9)
    const pill = '[data-slide="s6"] [data-el="step-2"]'
    const restingBorder = await computed(page, pill, 'border-color')
    await page.hover(pill)
    await page.waitForFunction(
      (sel) =>
        getComputedStyle(document.querySelector(sel) as Element).transform ===
        'matrix(1.04, 0, 0, 1.04, 0, 0)',
      pill,
    )
    expect(await computed(page, pill, 'border-color')).not.toBe(restingBorder)
    await page.close()
  })

  it('opens the picture in a lightbox on click, closes it with Esc or a click, and stays quiet in static mode', async () => {
    const page = await open(demoUrl)
    await go(page, 's3', 9)
    // the top-left corner of the picture: the system map's hotspots (T-0026) cover its middle
    const img = '[data-slide="s3"] [data-el="photo"] > img'
    const src = await page.$eval(img, (el) => (el as HTMLImageElement).currentSrc)
    expect(await computed(page, img, 'cursor')).toBe('zoom-in')
    await page.click(img, { position: { x: 30, y: 30 } })
    await page.waitForSelector('.deck-lightbox img')
    expect(await page.$eval('.deck-lightbox img', (el) => (el as HTMLImageElement).src)).toBe(src)
    await page.keyboard.press('Escape')
    await page.waitForSelector('.deck-lightbox', { state: 'detached' })
    await page.click(img, { position: { x: 30, y: 30 } })
    await page.waitForSelector('.deck-lightbox')
    await page.click('.deck-lightbox')
    await page.waitForSelector('.deck-lightbox', { state: 'detached' })
    await page.close()
    const still = await open(`${demoUrl}?static=1`)
    await go(still, 's3', 9)
    await still.click(img, { position: { x: 30, y: 30 } })
    await still.waitForTimeout(200)
    expect(await still.locator('.deck-lightbox').count()).toBe(0)
    await still.close()
  })

  it('shows the value in a tooltip inside the svg when hovering a chart', async () => {
    const page = await open(componentsUrl)
    const chartSlide = await page.evaluate(() => {
      const model = (
        window as unknown as {
          __deck: {
            model: { slides: Array<{ id: string; slots: Record<string, { type: string }> }> }
          }
        }
      ).__deck.model
      const s = model.slides.find((x) => Object.values(x.slots).some((v) => v.type === 'chart'))
      return s ? s.id : ''
    })
    expect(chartSlide).not.toBe('')
    await go(page, chartSlide, 9)
    const parts = `[data-slide="${chartSlide}"] svg.chart :is(.chart-row, .chart-point, .chart-ring-fill)`
    const first = page.locator(parts).first()
    const expected = await first.getAttribute('data-text')
    expect(expected).toBeTruthy()
    await first.hover()
    await page.waitForSelector(`[data-slide="${chartSlide}"] svg.chart.has-hover .chart-tip text`)
    const tip = await page.$eval(
      `[data-slide="${chartSlide}"] svg.chart .chart-tip text`,
      (el) => el.textContent,
    )
    expect(tip).toContain(expected as string)
    expect(await page.locator(`[data-slide="${chartSlide}"] .is-hover`).count()).toBe(1)
    await page.mouse.move(5, 5)
    await page.waitForSelector('.chart-tip', { state: 'detached' })
    await page.close()
    const still = await open(`${componentsUrl}?static=1`)
    await go(still, chartSlide)
    await still.locator(parts).first().hover()
    await still.waitForTimeout(200)
    expect(await still.locator('.chart-tip').count()).toBe(0)
    await still.close()
  })

  it('renders [text](url) as anchors that work while playing and are inert otherwise', async () => {
    const page = await open(linksUrl)
    const ext = '[data-slide="s1"] [data-el="subtitle"] a[href="https://example.com"]'
    expect(await page.$eval(ext, (a) => a.getAttribute('target'))).toBe('_blank')
    expect(await computed(page, ext, 'pointer-events')).toBe('auto')
    await page.click('[data-slide="s1"] [data-el="subtitle"] a[href="#s3"]')
    await page.waitForFunction(() => location.hash === '#3')
    await page.close()
    const still = await open(`${linksUrl}?static=1`)
    expect(await computed(still, ext, 'pointer-events')).toBe('none')
    await still.close()
  })

  it('keeps a link when the text is edited in place', async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.goto(`${linksUrl}?edit=1#1`)
    await page.waitForFunction(
      () =>
        (window as unknown as { __deck?: { editor?: { active?: boolean } } }).__deck?.editor
          ?.active === true,
    )
    expect(await interactive(page)).toBe(false)
    const sel = '.deck-stage > [data-slide="s1"] [data-el="subtitle"]'
    const box = await page.locator(sel).boundingBox()
    if (!box) throw new Error('subtitle not visible')
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForSelector(`${sel}[contenteditable="true"]`)
    await page.keyboard.press('End')
    await page.keyboard.type('。')
    await page.keyboard.press('Escape')
    const text = await page.evaluate(
      () =>
        (
          window as unknown as {
            __deck: { exportModel: () => { overrides: Record<string, { text?: string }> } }
          }
        ).__deck.exportModel().overrides['s1/subtitle']?.text,
    )
    expect(text).toBe('先看[說明](https://example.com)，再翻到[第三頁](#s3)就好。')
    expect(await page.locator(`${sel} a`).count()).toBe(2)
    await page.close()
  })
})
