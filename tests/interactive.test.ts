import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type Deck,
  normaliseDeck,
  type Override,
  parseDeck,
  type Slide,
  type Slot,
  validateDeck,
} from '../src/model/deck.ts'
import { scaffoldDeck, slotChars } from '../src/model/scaffold.ts'
import { loadStory, type Story } from '../src/model/story.ts'
import { runDeckQa } from '../src/qa/run.ts'
import { type LayoutJson, layoutRoles, listLayoutIds, loadLayout } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'
import {
  applyTextOverride,
  chartSvg,
  effectiveSlot,
  renderSlot,
  slotText,
} from '../src/render/slot-render.js'

const outDir = resolve('artifacts', 'preflight', 'interactive')

function load(file: string): Deck {
  const r = parseDeck(readFileSync(resolve(file), 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.deck
}

function errorsOf(input: unknown): string[] {
  const r = validateDeck(input)
  return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.message}`)
}

const chart: Extract<Slot, { type: 'chart' }> = {
  type: 'chart',
  kind: 'bar',
  toggle: true,
  unit: '%',
  series: [
    { label: '請假單', value: 40 },
    { label: '加班單', value: 20 },
    { label: '忘刷單', value: 10 },
  ],
}
const tabs: Extract<Slot, { type: 'tabs' }> = {
  type: 'tabs',
  panels: [
    { label: 'operator', content: { type: 'list', items: ['整備', '量測'] } },
    { label: 'viewer', content: { type: 'text', value: '只看 result.json' } },
    { label: '數字', content: { type: 'table', header: ['a', 'b'], rows: [['1', '2']] } },
  ],
}
const card: Extract<Slot, { type: 'metric' }> = {
  type: 'metric',
  value: 'v1',
  label: 'Result Schema',
  delta: '三份角色文件',
  details: { type: 'list', items: ['operator', 'viewer', 'new-platform'] },
}
const spot = { target: 's4', x: 25, y: 10.7, w: 25, h: 78.6, label: '兩條路徑' }
const image: Extract<Slot, { type: 'image' }> = {
  type: 'image',
  src: 'assets/map.svg',
  hotspots: [spot],
}

describe('interactive slots in the shared renderer', () => {
  it('keeps details in an inert template and flags nothing else', () => {
    const html = renderSlot(card)
    expect(html).toMatch(/^<div class="metric">/)
    expect(html).toContain('<template class="details"><ul class="list"><li>operator</li>')
    expect(renderSlot({ type: 'metric', value: 'v1', label: 'x' })).not.toContain('<template')
  })

  it('renders tabs as a strip plus panels, the first one shown', () => {
    const html = renderSlot(tabs)
    expect(html.match(/<button type="button" class="tab/g)).toHaveLength(3)
    expect(html).toContain('class="tab is-active" role="tab" aria-selected="true" data-tab="0"')
    expect(html).toContain('<div class="tab-panel" role="tabpanel" data-tab="0">')
    expect(html).toContain('<div class="tab-panel" role="tabpanel" data-tab="1" hidden>')
    expect(html).toContain('<table class="table">')
  })

  it('draws a legend for toggle charts and rescales when an item is off', () => {
    const on = chartSvg(chart)
    expect(on).toContain('class="chart chart-bar chart-toggle"')
    expect(on.match(/class="chart-key"/g)).toHaveLength(3)
    expect(on).toContain('<rect class="chart-fill" x="320" y="40" width="560"')
    expect(chartSvg({ ...chart, toggle: undefined })).not.toContain('chart-legend')
    const off = chartSvg(chart, { off: [0] })
    expect(off).toContain('class="chart-key is-off" data-index="0"')
    expect(off).toContain('<g class="chart-row is-off" data-index="0"')
    expect(off).toContain('<rect class="chart-fill" x="320" y="40" width="0"')
    // the 20% item is now the largest and fills the track
    expect(off).toContain('<rect class="chart-fill" x="320" y="136" width="560"')
    const line = chartSvg({ ...chart, kind: 'line' }, { off: [1] })
    expect(line).toContain('<g class="chart-point is-off" data-index="1"')
    expect(line.match(/class="chart-dot"/g)).toHaveLength(2)
  })

  it('renders hotspots as inert anchors positioned in percent, label as an attribute', () => {
    const html = renderSlot(image)
    expect(html).toContain(
      '<a class="hotspot" href="#s4" data-hotspot="0" data-target="s4" data-label="兩條路徑" aria-label="兩條路徑" tabindex="-1" style="left:25%;top:10.7%;width:25%;height:78.6%"></a>',
    )
    expect(html).not.toContain('>兩條路徑<')
  })

  it('round-trips tabs and details through the editor text forms', () => {
    const text = slotText(tabs)
    expect(text).toBe('## operator\n整備\n量測\n## viewer\n只看 result.json\n## 數字\na | b\n1 | 2')
    expect(applyTextOverride(tabs, text)).toEqual(tabs)
    const edited = applyTextOverride(tabs, '## 新標籤\n一\n二\n## viewer\n改了')
    expect(edited).toEqual({
      type: 'tabs',
      panels: [
        { label: '新標籤', content: { type: 'list', items: ['一', '二'] } },
        { label: 'viewer', content: { type: 'text', value: '改了' } },
      ],
    })
    // a text override on the summary keeps the details
    expect(applyTextOverride(card, 'v2\nSchema\n三份')).toEqual({
      ...card,
      value: 'v2',
      label: 'Schema',
      delta: '三份',
    })
  })

  it('applies details and hotspots overrides on top of the slot', () => {
    const o: Override = { details: 'a\nb' }
    const eff = effectiveSlot(card, o, 'text') as Extract<Slot, { type: 'metric' }>
    expect(eff.details).toEqual({ type: 'list', items: ['a', 'b'] })
    expect(effectiveSlot(card, { details: '' }, 'text')).not.toHaveProperty('details')
    expect(
      effectiveSlot({ type: 'text', value: 'x' }, { details: '更多' }, 'text') as never as Slot,
    ).toEqual({ type: 'text', value: 'x', details: { type: 'text', value: '更多' } })
    expect(effectiveSlot(image, { hotspots: [] }, 'image')).not.toHaveProperty('hotspots')
    const moved = effectiveSlot(
      image,
      { hotspots: [{ target: 's6', x: 1, y: 1, w: 2, h: 2 }] },
      'image',
    ) as Extract<Slot, { type: 'image' }>
    expect(moved.hotspots?.[0]?.target).toBe('s6')
  })
})

describe('interactive slots in the deck model', () => {
  const base = load('examples/deck.sample.json')

  it('accepts details, tabs, toggle and hotspots and keeps them through normalisation', () => {
    const deck = structuredClone(base)
    const s2 = deck.slides[1] as Slide
    s2.slots['card-1'] = card
    const photo = loadLayout('photo')
    deck.slides.push({
      id: 's9',
      layout: 'photo',
      slots: {
        ...photo.json.sample,
        photo: { ...image, hotspots: [{ ...spot, target: 's2' }] },
      },
      elements: photo.json.elements,
    })
    deck.overrides['s2/card-1'] = { details: 'x\ny', text: 'v9\nL' }
    deck.overrides['s9/photo'] = { hotspots: [{ target: 's3', x: 1, y: 2, w: 3, h: 4 }] }
    expect(errorsOf(deck)).toEqual([])
    const out = normaliseDeck(deck)
    expect(Object.keys(out.slides[1]?.slots['card-1'] as object)).toEqual([
      'type',
      'value',
      'label',
      'delta',
      'details',
    ])
    expect(Object.keys(out.overrides['s2/card-1'] as object)).toEqual(['text', 'details'])
    expect(out.overrides['s9/photo']).toEqual({
      hotspots: [{ target: 's3', x: 1, y: 2, w: 3, h: 4 }],
    })
    const ok = validateDeck({
      ...deck,
      slides: deck.slides.map((s) =>
        s.id === 's2' ? { ...s, slots: { ...s.slots, 'card-2': tabs, 'card-3': chart } } : s,
      ),
    })
    expect(ok.ok).toBe(true)
  })

  it('rejects hotspots that point nowhere and overrides on the wrong element kind', () => {
    const deck = structuredClone(base)
    const photo = loadLayout('photo')
    deck.slides.push({
      id: 's9',
      layout: 'photo',
      slots: {
        ...photo.json.sample,
        photo: { ...image, hotspots: [{ ...spot, target: 'nope' }] },
      },
      elements: photo.json.elements,
    })
    deck.overrides['s9/photo'] = { hotspots: [{ target: 'gone', x: 1, y: 2, w: 3, h: 4 }] }
    deck.overrides['s9/title'] = { hotspots: [] }
    deck.overrides['s1/backdrop'] = { details: 'x' }
    const errors = errorsOf(deck)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '/slides/8/slots/photo/hotspots/0/target hotspot points to non-existent slide `nope`',
        ),
        expect.stringContaining(
          '/overrides/s9/photo/hotspots/0/target hotspot points to non-existent slide `gone`',
        ),
        expect.stringContaining(
          '/overrides/s9/title/hotspots a `hotspots` override can only apply to an element of kind image',
        ),
        expect.stringContaining(
          '/overrides/s1/backdrop/details a `details` override can only apply to an element of kind text',
        ),
      ]),
    )
    expect(
      errorsOf({
        ...base,
        slides: [{ ...base.slides[0], slots: { title: { type: 'tabs', panels: [] } } }],
      }),
    ).not.toEqual([])
  })
})

describe('scaffold suggests details before a split', () => {
  it('flags a slide whose story text exceeds the layout density', () => {
    const storyText = readFileSync(resolve('examples/story.sample.md'), 'utf8')
    const story = structuredClone(loadStory(storyText).story as Story)
    const listSlide = story.slides.find((s) => s.content_relation === 'list')
    if (!listSlide) throw new Error('sample story has no list slide')
    listSlide.evidence = [
      `01｜第一件事｜${'細節'.repeat(60)}`,
      `02｜第二件事｜${'細節'.repeat(60)}`,
      `03｜第三件事｜${'細節'.repeat(60)}`,
    ]
    const layouts = new Map<string, LayoutJson>(
      listLayoutIds().map((id) => [id, loadLayout(id).json]),
    )
    const roles = new Map(listLayoutIds().map((id) => [id, layoutRoles(loadLayout(id))]))
    const input = {
      story,
      storyText,
      storyRelativePath: 'story.sample.md',
      deckId: 'story-first',
      theme: 'ink-paper',
      layouts,
      roles,
    }
    const result = scaffoldDeck(input)
    expect(result.detailsSuggested).toEqual([listSlide.id])
    // a layout without a boxed role gets no details suggestion, only the advice to split
    const plain = scaffoldDeck({ ...input, choices: { [listSlide.id]: 'statement' } })
    expect(plain.detailsSuggested).toEqual([])
    expect(
      plain.warnings.some((w) => w.includes(listSlide.id) && w.includes('split the slide')),
    ).toBe(true)
    expect(result.warnings.some((w) => w.includes(listSlide.id) && w.includes('details'))).toBe(
      true,
    )
    const slide = result.deck.slides.find((s) => s.id === listSlide.id) as Slide
    expect(slotChars(slide.slots)).toBeGreaterThan(
      layouts.get(slide.layout)?.density.max_chars ?? 0,
    )
    // a suggestion only: the slots are exactly what the story gave
    expect(slide.slots['card-1']).toMatchObject({ type: 'metric', value: '01' })
  })
})

// ---- the real browser ------------------------------------------------------------------------

interface DeckWindow {
  __deck: {
    go: (n: string | number, step?: number) => void
    details: { slideId: string; elId: string } | null
    chartOff: (slideId: string, elId: string) => number[]
    editor: {
      active: boolean
      select: (elId: string | null) => void
      undo: () => void
    }
    exportModel: () => Deck
  }
}
declare const window: DeckWindow & Window

function tabsDeck(): Deck {
  const deck = load('examples/deck.sample.json')
  const tabsLayout = loadLayout('tabs')
  const chartLayout = loadLayout('chart-aside')
  deck.slides.push(
    {
      id: 's9',
      layout: 'tabs',
      slots: tabsLayout.json.sample,
      elements: tabsLayout.json.elements,
    },
    {
      id: 's10',
      layout: 'chart-aside',
      slots: { ...chartLayout.json.sample, chart },
      elements: chartLayout.json.elements,
    },
  )
  const v = validateDeck(deck)
  if (!v.ok) throw new Error(JSON.stringify(v.errors))
  return deck
}

function publish(deck: Deck, deckDir: string, name: string): string {
  mkdirSync(outDir, { recursive: true })
  const { html } = renderDeckDocument(deck, { deckDir, outDir, inlineAssets: true })
  const file = join(outDir, name)
  writeFileSync(file, html, 'utf8')
  return pathToFileURL(file).href
}

describe('interactive slots while playing, and their default state elsewhere', () => {
  let browser: Browser
  let demoUrl: string
  let tabsUrl: string

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    demoUrl = publish(
      load('examples/tidewatch-progress/deck.json'),
      resolve('examples/tidewatch-progress'),
      'demo.html',
    )
    tabsUrl = publish(tabsDeck(), resolve('examples'), 'tabs.html')
  })
  afterAll(async () => {
    await browser?.close()
  })

  async function open(url: string, hash = ''): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.goto(url + hash)
    await page.waitForFunction(() => Boolean(window.__deck))
    return page
  }
  const go = (page: Page, id: string, step = 9) =>
    page.evaluate(([i, s]) => window.__deck.go(i as string, s as number), [id, step])

  it('opens a card’s details in a panel over the card, closes on Esc, click or slide change', async () => {
    const page = await open(demoUrl)
    await go(page, 's5')
    const cardSel = '[data-slide="s5"] [data-el="card-1"]'
    expect(await page.getAttribute(cardSel, 'data-details')).toBe('true')
    expect(await page.getAttribute(cardSel, 'tabindex')).toBe('0')
    await page.click(cardSel)
    await page.waitForSelector('[data-slide="s5"] .deck-details')
    const panel = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement
      const p = document.querySelector('[data-slide="s5"] .deck-details') as HTMLElement
      return {
        role: p.dataset.role,
        left: p.offsetLeft,
        top: p.offsetTop,
        width: p.offsetWidth,
        height: p.offsetHeight,
        elLeft: el.offsetLeft,
        elTop: el.offsetTop,
        elWidth: el.offsetWidth,
        taller: p.offsetHeight > el.offsetHeight,
        items: p.querySelectorAll('.details li').length,
        summary: p.querySelector('.metric-label')?.textContent,
        open: el.classList.contains('is-open'),
      }
    }, cardSel)
    expect(panel).toMatchObject({
      role: 'card',
      items: 3,
      summary: 'Result Schema',
      open: true,
      taller: true,
    })
    expect(panel.left).toBe(panel.elLeft)
    // same column as the card; it slides up only as far as the slide's bottom margin needs
    expect(panel.top).toBeLessThanOrEqual(panel.elTop)
    expect(panel.top + panel.height).toBeLessThanOrEqual(1040)
    expect(panel.width).toBe(panel.elWidth)
    expect(await page.evaluate(() => window.__deck.details)).toEqual({
      slideId: 's5',
      elId: 'card-1',
    })
    // the source is faded out while the panel is up (nothing shows through a translucent theme
    // surface) yet keeps focus; the panel carries no close glyph
    const covered = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement
      const p = document.querySelector('.deck-details') as HTMLElement
      return { source: getComputedStyle(el).opacity, glyph: getComputedStyle(p, '::after').content }
    }, cardSel)
    expect(covered).toEqual({ source: '0', glyph: 'none' })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.deck-details', { state: 'detached' })
    expect(
      await page.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel) as HTMLElement).opacity,
        cardSel,
      ),
    ).toBe('1')
    // a click on the panel itself closes it; a link inside the panel does not
    await page.click(cardSel)
    await page.waitForSelector('.deck-details')
    await page.evaluate(() => {
      const body = document.querySelector('.deck-details .details') as HTMLElement
      const a = document.createElement('a')
      a.href = 'https://example.com/'
      a.target = '_blank'
      a.className = 'test-link'
      a.textContent = 'link'
      body.appendChild(a)
      document.addEventListener(
        'click',
        (e) => {
          if ((e.target as Element).closest('a.test-link')) e.preventDefault()
        },
        true,
      )
    })
    await page.click('.deck-details a.test-link')
    expect(await page.locator('.deck-details').count()).toBe(1)
    await page.click('.deck-details .deck-details-summary')
    await page.waitForSelector('.deck-details', { state: 'detached' })
    // the keyboard: focus the card, Enter opens, Enter closes
    await page.focus(cardSel)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.deck-details')
    // Enter on the card did not turn the page
    expect(await page.evaluate(() => location.hash)).toMatch(/^#5(\.\d+)?$/)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.deck-details', { state: 'detached' })
    // clicking elsewhere closes; changing slide closes
    await page.click(cardSel)
    await page.waitForSelector('.deck-details')
    await page.click('[data-slide="s5"] [data-el="title"]')
    await page.waitForSelector('.deck-details', { state: 'detached' })
    await page.click(cardSel)
    await page.waitForSelector('.deck-details')
    await go(page, 's6')
    await page.waitForSelector('.deck-details', { state: 'detached' })
    // entering the editor drops the panel with the gate
    await go(page, 's5')
    await page.click(cardSel)
    await page.waitForSelector('.deck-details')
    await page.evaluate(() => document.body.classList.add('ed-active'))
    await page.waitForSelector('.deck-details', { state: 'detached' })
    expect(await page.getAttribute(cardSel, 'tabindex')).toBe('-1')
    await page.close()
    // static mode: the template is there, nothing opens, the card is not in the tab order
    const still = await open(`${demoUrl}?static=1`)
    await go(still, 's5')
    expect(await still.locator(`${cardSel} > template.details`).count()).toBe(1)
    expect(await still.getAttribute(cardSel, 'tabindex')).toBe('-1')
    await still.click(cardSel)
    await still.waitForTimeout(200)
    expect(await still.locator('.deck-details').count()).toBe(0)
    await still.close()
  })

  it('jumps to the target slide from an image hotspot, by click and by keyboard', async () => {
    const page = await open(demoUrl)
    await go(page, 's3')
    const spots = '[data-slide="s3"] [data-el="photo"] > a.hotspot'
    expect(await page.locator(spots).count()).toBe(3)
    expect(
      await page.$eval(`${spots}[data-hotspot="2"]`, (a) => getComputedStyle(a).pointerEvents),
    ).toBe('auto')
    await page.click(`${spots}[data-hotspot="2"]`)
    await page.waitForFunction(() => location.hash === '#6')
    await go(page, 's3')
    await page.focus(`${spots}[data-hotspot="0"]`)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.hash === '#4')
    // no lightbox opened along the way
    expect(await page.locator('.deck-lightbox').count()).toBe(0)
    await page.close()
    const still = await open(`${demoUrl}?static=1`)
    await go(still, 's3')
    expect(
      await still.$eval(`${spots}[data-hotspot="2"]`, (a) => getComputedStyle(a).pointerEvents),
    ).toBe('none')
    expect(await still.getAttribute(`${spots}[data-hotspot="2"]`, 'tabindex')).toBe('-1')
    await still.close()
  })

  it('switches tab panels by click and arrow keys; static mode shows the first panel only', async () => {
    const page = await open(tabsUrl)
    await go(page, 's9')
    const host = '[data-slide="s9"] [data-el="panels"]'
    const shown = () =>
      page.$$eval(`${host} > .tab-panel`, (ps) => ps.map((p) => !(p as HTMLElement).hidden))
    expect(await shown()).toEqual([true, false, false])
    await page.click(`${host} .tab[data-tab="1"]`)
    expect(await shown()).toEqual([false, true, false])
    expect(await page.getAttribute(`${host} .tab[data-tab="1"]`, 'aria-selected')).toBe('true')
    await page.focus(`${host} .tab[data-tab="1"]`)
    await page.keyboard.press('ArrowRight')
    expect(await shown()).toEqual([false, false, true])
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.tab)).toBe('2')
    await page.keyboard.press('ArrowRight')
    expect(await shown()).toEqual([true, false, false])
    // the arrows on a tab do not turn the page
    expect(await page.evaluate(() => location.hash)).toBe('#9')
    await page.close()
    const still = await open(`${tabsUrl}?static=1`)
    await go(still, 's9')
    await still.click(`${host} .tab[data-tab="2"]`)
    await still.waitForTimeout(150)
    expect(
      await still.$$eval(`${host} > .tab-panel`, (ps) => ps.map((p) => !(p as HTMLElement).hidden)),
    ).toEqual([true, false, false])
    await still.close()
  })

  it('toggles chart items from the legend and rescales the rest; one item always stays', async () => {
    const page = await open(tabsUrl)
    await go(page, 's10')
    const svg = '[data-slide="s10"] [data-el="chart"] svg.chart'
    const fillWidths = () =>
      page.$$eval(`${svg} .chart-fill`, (rs) => rs.map((r) => r.getAttribute('width')))
    expect(await fillWidths()).toEqual(['560', '280', '140'])
    await page.click(`${svg} .chart-key[data-index="0"]`)
    await page.waitForSelector(`${svg} .chart-row.is-off[data-index="0"]`)
    expect(await fillWidths()).toEqual(['0', '560', '280'])
    expect(await page.evaluate(() => window.__deck.chartOff('s10', 'chart'))).toEqual([0])
    // keyboard on the legend key that the re-render focused again
    expect(
      await page.evaluate(() => (document.activeElement as SVGElement).getAttribute('data-index')),
    ).toBe('0')
    await page.focus(`${svg} .chart-key[data-index="1"]`)
    await page.keyboard.press('Enter')
    await page.waitForSelector(`${svg} .chart-row.is-off[data-index="1"]`)
    expect(await fillWidths()).toEqual(['0', '0', '560'])
    // the last item cannot be switched off
    await page.click(`${svg} .chart-key[data-index="2"]`)
    await page.waitForTimeout(100)
    expect(await fillWidths()).toEqual(['0', '0', '560'])
    await page.click(`${svg} .chart-key[data-index="0"]`)
    await page.waitForSelector(`${svg} .chart-row:not(.is-off)[data-index="0"]`)
    expect(await fillWidths()).toEqual(['560', '0', '140'])
    // leaving playback restores the default drawing
    await page.evaluate(() => document.body.classList.add('ed-active'))
    await page.waitForFunction(() => window.__deck.chartOff('s10', 'chart').length === 0)
    expect(await fillWidths()).toEqual(['560', '280', '140'])
    await page.close()
    const still = await open(`${tabsUrl}?static=1`)
    await go(still, 's10')
    await still.click(`${svg} .chart-key[data-index="0"]`)
    await still.waitForTimeout(150)
    expect(
      await still.$$eval(`${svg} .chart-fill`, (rs) => rs.map((r) => r.getAttribute('width'))),
    ).toEqual(['560', '280', '140'])
    await still.close()
  })

  it('edits details and hotspots from the floating toolbar as overrides', async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    await page.goto(`${demoUrl}?edit=1#5`)
    await page.waitForFunction(() => window.__deck?.editor?.active === true)
    await page.evaluate(() => window.__deck.editor.select('card-1'))
    const detailsBox = page.locator('.ed-float [data-details]')
    await detailsBox.waitFor({ state: 'visible' })
    expect(await detailsBox.inputValue()).toMatch(/^operator: .*\nviewer: .*\nnew-platform: /s)
    await detailsBox.fill('operator\nviewer')
    await detailsBox.dispatchEvent('change')
    const model = () => page.evaluate(() => window.__deck.exportModel())
    expect((await model()).overrides['s5/card-1']?.details).toBe('operator\nviewer')
    const card = '.deck-stage > [data-slide="s5"] [data-el="card-1"]'
    expect(
      await page.$eval(
        `${card} > template.details`,
        (t) => (t as HTMLTemplateElement).content.querySelectorAll('li').length,
      ),
    ).toBe(2)
    await detailsBox.fill('')
    await detailsBox.dispatchEvent('change')
    expect((await model()).overrides['s5/card-1']?.details).toBe('')
    expect(await page.getAttribute(card, 'data-details')).toBeNull()
    await page.evaluate(() => window.__deck.editor.undo())
    expect((await model()).overrides['s5/card-1']?.details).toBe('operator\nviewer')
    expect(await page.getAttribute(card, 'data-details')).toBe('true')
    await page.evaluate(() => window.__deck.editor.undo())
    expect((await model()).overrides['s5/card-1']).toBeUndefined()
    // only a boxed role can expand: the title gets no "add details" button at all, while the
    // second card (no details yet) keeps the toolbar small and gets the row from "more" on request
    await page.evaluate(() => window.__deck.editor.select('title'))
    expect(await detailsBox.isHidden()).toBe(true)
    await page.locator('.ed-float [data-action="more"]').click()
    expect(await page.locator('.ed-float [data-action="add-details"]').isHidden()).toBe(true)
    await page.evaluate(() => window.__deck.editor.select('card-2'))
    expect(await detailsBox.isHidden()).toBe(true)
    await page.locator('.ed-float [data-action="add-details"]').click()
    await detailsBox.waitFor({ state: 'visible' })
    await detailsBox.fill('補充一句')
    await detailsBox.dispatchEvent('change')
    expect((await model()).overrides['s5/card-2']?.details).toBe('補充一句')
    expect(
      await page.getAttribute('.deck-stage > [data-slide="s5"] [data-el="card-2"]', 'data-details'),
    ).toBe('true')
    await page.evaluate(() => window.__deck.editor.undo())
    await page.evaluate(() => window.__deck.editor.setMore(false))
    // hotspots are edited on the picture: draw one, retarget and label it, move it, delete it
    await page.evaluate(() => window.__deck.go('s3'))
    await page.evaluate(() => window.__deck.editor.select('photo'))
    const photo = '.deck-stage > [data-slide="s3"] [data-el="photo"]'
    expect(await page.locator(`${photo} > a.hotspot`).count()).toBe(3)
    expect(await page.$eval(`${photo} > a.hotspot`, (a) => getComputedStyle(a).outlineStyle)).toBe(
      'dashed',
    )
    // while editing every region says where it jumps
    expect(
      await page.$eval(`${photo} > a.hotspot`, (a) => getComputedStyle(a, '::after').content),
    ).toContain('→ s4')
    await page.locator('.ed-float [data-action="hotspots"]').click()
    const mode = () => page.evaluate(() => window.__deck.editor.hotspots.active)
    expect(await mode()).toEqual({ slideId: 's3', elId: 'photo', index: null })
    const box = await page.$eval(photo, (el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    })
    const at = (fx: number, fy: number): [number, number] => [
      box.left + box.width * fx,
      box.top + box.height * fy,
    ]
    const drag = async (from: [number, number], to: [number, number]) => {
      await page.mouse.move(...from)
      await page.mouse.down()
      await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 3 })
      await page.mouse.move(...to, { steps: 3 })
      await page.mouse.up()
    }
    const spots = async () => (await model()).overrides['s3/photo']?.hotspots
    // a drag over the empty top-left corner draws a fourth region, selected, aimed at the next page
    await drag(at(0.05, 0.05), at(0.25, 0.25))
    let list = await spots()
    expect(list).toHaveLength(4)
    expect(list?.[3]).toMatchObject({ target: 's4', x: 5, y: 5, w: 20, h: 20 })
    expect(await mode()).toEqual({ slideId: 's3', elId: 'photo', index: 3 })
    expect(await page.locator(`${photo} > a.hotspot`).count()).toBe(4)
    const bar = page.locator('.ed-spot-bar')
    await bar.waitFor({ state: 'visible' })
    await bar.locator('[data-spot-target]').selectOption('s6')
    await bar.locator('[data-spot-label]').fill('六步')
    await bar.locator('[data-spot-label]').dispatchEvent('change')
    list = await spots()
    expect(list?.[3]).toMatchObject({ target: 's6', label: '六步' })
    // dragging inside the region moves it; the picture itself stays put
    await drag(at(0.15, 0.15), at(0.25, 0.15))
    list = await spots()
    expect(list?.[3]).toMatchObject({ x: 15, y: 5, w: 20, h: 20, target: 's6', label: '六步' })
    expect((await model()).overrides['s3/photo']?.x).toBeUndefined()
    // Esc leaves the mode and keeps the picture selected; the button brings the mode back
    await page.keyboard.press('Escape')
    expect(await mode()).toBeNull()
    expect(await page.evaluate(() => window.__deck.editor.selected)).toEqual({
      slideId: 's3',
      elId: 'photo',
    })
    expect(await page.locator('.ed-spot-bar').isHidden()).toBe(true)
    await page.locator('.ed-float [data-action="hotspots"]').click()
    // a click on a region selects it; Delete removes the region, not the picture, and with the
    // slot's own three regions back the override itself is gone; undo restores it (and, like every
    // undo, clears the selection, which ends the mode)
    await page.mouse.click(...at(0.2, 0.1))
    expect(await mode()).toEqual({ slideId: 's3', elId: 'photo', index: 3 })
    await page.keyboard.press('Delete')
    expect(await spots()).toBeUndefined()
    expect(await page.locator(`${photo} > a.hotspot`).count()).toBe(3)
    expect(await page.getAttribute(photo, 'data-hidden')).toBeNull()
    await page.evaluate(() => window.__deck.editor.undo())
    expect(await spots()).toHaveLength(4)
    expect(await mode()).toBeNull()
    // the whole edit unwinds to the three regions the slot had
    for (let i = 0; i < 4; i++) await page.evaluate(() => window.__deck.editor.undo())
    expect((await model()).overrides['s3/photo']?.hotspots).toBeUndefined()
    expect(await page.locator(`${photo} > a.hotspot`).count()).toBe(3)
    await page.close()
  })

  it('QA counts only the shown panel of a tabs slot and passes the demo deck', async () => {
    const deck = tabsDeck()
    const s9 = deck.slides.find((s) => s.id === 's9') as Slide
    const panels = s9.slots.panels as Extract<Slot, { type: 'tabs' }>
    const first = panels.panels[0]
    if (!first) throw new Error('tabs sample has no panel')
    const long = {
      type: 'list' as const,
      items: Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 條，${'很長的內容'.repeat(6)}`),
    }
    s9.slots.panels = {
      type: 'tabs',
      panels: [first, { label: '長', content: long }, { label: '更長', content: long }],
    }
    const report = await runDeckQa(deck, { deckDir: resolve('examples'), browser })
    expect(report.slides.find((s) => s.id === 's9')?.findings).toEqual([])
    expect(report.errors).toBe(0)
    // the same text on the first panel is what QA sees, and it is too much
    s9.slots.panels = { type: 'tabs', panels: [{ label: '長', content: long }, first] }
    const dense = await runDeckQa(deck, { deckDir: resolve('examples'), browser })
    expect(dense.slides.find((s) => s.id === 's9')?.findings.map((f) => f.rule)).toContain(
      'density',
    )
    const demo = await runDeckQa(load('examples/tidewatch-progress/deck.json'), {
      deckDir: resolve('examples/tidewatch-progress'),
      browser,
    })
    expect(demo.errors + demo.warnings).toBe(0)
  }, 120_000)
})
