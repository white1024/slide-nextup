import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Deck, normaliseDeck, parseDeck, type Slide, type Slot } from '../src/model/deck.ts'
import { sampleDeck } from '../src/qa/theme-qa.ts'
import { loadLayout } from '../src/render/assets.ts'
import { checkSlideAgainstLayout, renderDeckDocument, resolveAsset } from '../src/render/deck.ts'
import { overrideToInlineStyle } from '../src/render/slide.ts'

const deckFile = resolve('examples/deck.sample.json')
const deckDir = resolve('examples')
const outDir = resolve('artifacts', 'preflight', 'render-test')

function sample(): Deck {
  const r = parseDeck(readFileSync(deckFile, 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.deck
}

describe('renderDeckDocument', () => {
  const deck = sample()
  const { html, warnings } = renderDeckDocument(deck, { deckDir, outDir })

  it('produces one section per slide with the layout css included once each', () => {
    expect(warnings).toEqual([])
    expect(html.match(/<section class="slide"/g)).toHaveLength(8)
    expect(html.match(/\[data-layout="cards"\] \[data-el="title"\]/g)).toHaveLength(1)
    expect(html).toContain('data-slide="s8"')
  })

  it('embeds the normalised model', () => {
    const m = /<script type="application\/json" id="deck-model">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    expect(JSON.parse(m?.[1] ?? '')).toEqual(normaliseDeck(deck))
  })

  it('applies overrides inline', () => {
    expect(html).toContain('data-el="title" style="top:360px;font-size:128px"')
    expect(html).toContain('data-el="card-3" data-hidden="true"')
  })

  it('writes italic and underline overrides as font-style and text-decoration', () => {
    expect(
      overrideToInlineStyle({ style: { fontStyle: 'italic', textDecoration: 'underline' } }),
    ).toBe('font-style:italic;text-decoration:underline')
  })

  it('contains no process chatter', () => {
    for (const banned of ['{{', 'Option A', 'preview', 'TODO', 'lorem']) {
      expect(html.toLowerCase()).not.toContain(banned.toLowerCase())
    }
  })

  it('rejects a deck whose slide no longer matches its layout', () => {
    const broken = structuredClone(deck)
    ;(broken.slides[0] as Slide).elements.push({ id: 'ghost', kind: 'shape' })
    expect(() => renderDeckDocument(broken, { deckDir, outDir })).toThrow(/ghost/)
    const problems = checkSlideAgainstLayout(
      { ...(deck.slides[1] as Slide), slots: { title: { type: 'list', items: ['x'] } } },
      loadLayout('cards'),
    )
    expect(problems.some((p) => p.includes('title') && p.includes('list'))).toBe(true)
    expect(problems.some((p) => p.includes('card-1'))).toBe(true)
  })

  it('lets content expand only behind a boxed role', () => {
    const slide = deck.slides[1] as Slide
    const cards = loadLayout('cards')
    const more: Slot = { type: 'text', value: '更多' }
    const titled = checkSlideAgainstLayout(
      { ...slide, slots: { ...slide.slots, title: { type: 'text', value: 'x', details: more } } },
      cards,
    ).filter((p) => p.includes('details'))
    expect(titled).toHaveLength(1)
    expect(titled[0]).toMatch(/`title`.*role is title.*card/)
    // overrides too, on this slide only; a card is fine
    const overridden = checkSlideAgainstLayout(slide, cards, {
      [`${slide.id}/title`]: { details: '更多' },
      [`${slide.id}/card-1`]: { details: '可以' },
      's99/title': { details: '別頁' },
    }).filter((p) => p.includes('details'))
    expect(overridden).toHaveLength(1)
    expect(overridden[0]).toContain('`title`')
  })

  it('rewrites relative image paths against the output directory and can inline them', () => {
    // a picture of our own, so the test does not lean on what pnpm preflight leaves behind
    mkdirSync(outDir, { recursive: true })
    writeFileSync(
      join(outDir, 'smoke.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    const warnings: string[] = []
    const opts = { deckDir: resolve('layouts'), outDir: resolve('dist', 'nested') }
    expect(resolveAsset('../artifacts/preflight/render-test/smoke.png', opts, warnings)).toBe(
      '../../artifacts/preflight/render-test/smoke.png',
    )
    expect(resolveAsset('https://example.com/a.png', opts, warnings)).toBe(
      'https://example.com/a.png',
    )
    expect(
      resolveAsset(
        '../artifacts/preflight/render-test/smoke.png',
        { ...opts, inlineAssets: true },
        warnings,
      ),
    ).toMatch(/^data:image\/png;base64,iVBOR/)
    expect(warnings).toEqual([])
    expect(resolveAsset('missing.png', opts, warnings)).toBe('missing.png')
    expect(warnings[0]).toContain('image missing.png not found')
  })
})

describe('steps, transitions and the presenter view', () => {
  let browser: Browser
  let page: Page
  let htmlFile: string

  beforeAll(async () => {
    const deck = sample()
    deck.transition = 'fade'
    const s2 = deck.slides[1] as Slide
    for (const el of s2.elements) {
      const m = /^card-(\d)$/.exec(el.id)
      if (m) el.step = Number(m[1])
    }
    mkdirSync(outDir, { recursive: true })
    htmlFile = join(outDir, 'deck-steps.html')
    writeFileSync(htmlFile, renderDeckDocument(deck, { deckDir, outDir }).html, 'utf8')
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(pathToFileURL(htmlFile).href)
  })
  afterAll(async () => {
    await browser?.close()
  })

  const vis = (el: string) =>
    page.evaluate(
      (id) =>
        getComputedStyle(document.querySelector(`.slide.is-active [data-el="${id}"]`) as Element)
          .visibility,
      el,
    )
  const hash = () => page.evaluate(() => location.hash)

  it('reveals step elements one press at a time, then moves on; the hash records page.step', async () => {
    await page.keyboard.press('ArrowRight')
    expect(await hash()).toBe('#2')
    expect(await vis('card-1')).toBe('hidden')
    expect(await vis('card-3')).toBe('hidden')
    await page.keyboard.press('ArrowRight')
    expect(await hash()).toBe('#2.1')
    expect(await vis('card-1')).toBe('visible')
    expect(await vis('card-2')).toBe('hidden')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    expect(await hash()).toBe('#2.3')
    expect(await vis('card-3')).toBe('visible')
    await page.keyboard.press('ArrowRight')
    expect(await hash()).toBe('#3')
    await page.keyboard.press('ArrowLeft')
    expect(await hash()).toBe('#2.3')
    await page.keyboard.press('ArrowLeft')
    expect(await hash()).toBe('#2.2')
    expect(await vis('card-3')).toBe('hidden')
    await page.goto(`${pathToFileURL(htmlFile).href}#2.1`)
    expect(await hash()).toBe('#2.1')
    expect(await vis('card-1')).toBe('visible')
    expect(await vis('card-2')).toBe('hidden')
    expect(await page.evaluate(() => window.__deck.steps(1))).toBe(3)
    expect(await page.evaluate(() => window.__deck.step)).toBe(1)
  })

  it('crossfades: the page being left stays opaque underneath until the new page has covered it', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#1`)
    await page.waitForFunction(() => window.__deck.current === 0)
    // sampled in the same task as the change: two pages on the stage, the old one opaque and below
    const mid = await page.evaluate(() => {
      window.__deck.next()
      const active = document.querySelector('.slide.is-active') as HTMLElement
      const leaving = document.querySelector('.slide.is-leaving') as HTMLElement
      const a = getComputedStyle(active)
      const l = getComputedStyle(leaving)
      return {
        activeId: active.dataset.slide,
        leavingId: leaving.dataset.slide,
        animation: a.animationName,
        activeStarting: Number(a.opacity) < 1,
        leavingVisible: l.visibility === 'visible' && l.opacity === '1',
        leavingBelow: Number(l.zIndex) < Number(a.zIndex),
      }
    })
    expect(mid).toEqual({
      activeId: 's2',
      leavingId: 's1',
      animation: 'deck-fade',
      activeStarting: true,
      leavingVisible: true,
      leavingBelow: true,
    })
    await page.waitForFunction(() => !document.querySelector('.slide.is-leaving'))
    expect(
      await page.evaluate(() => {
        const active = document.querySelectorAll('.slide.is-active')
        return { count: active.length, opacity: getComputedStyle(active[0] as Element).opacity }
      }),
    ).toEqual({ count: 1, opacity: '1' })
    // going back reuses the same mechanism; a quick second change settles the first
    const back = await page.evaluate(() => {
      window.__deck.prev()
      window.__deck.next()
      return {
        leaving: Array.from(document.querySelectorAll('.slide.is-leaving')).map(
          (s) => (s as HTMLElement).dataset.slide,
        ),
        active: (document.querySelector('.slide.is-active') as HTMLElement).dataset.slide,
      }
    })
    expect(back).toEqual({ leaving: ['s1'], active: 's2' })
    await page.waitForFunction(() => !document.querySelector('.slide.is-leaving'))
  })

  it('static mode shows everything and disables transitions', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}?static=1#2`)
    expect(await hash()).toBe('#2')
    expect(await vis('card-1')).toBe('visible')
    expect(await vis('card-3')).toBe('visible')
    expect(
      await page.evaluate(() =>
        document.querySelector('.deck-stage')?.getAttribute('data-transition'),
      ),
    ).toBe('fade')
    expect(
      await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.slide.is-active') as Element)
        return { transition: cs.transitionDuration, animation: cs.animationDuration }
      }),
    ).toEqual({ transition: '0s', animation: '0s' })
    // a page change in static mode is a plain switch: nothing is left behind
    expect(
      await page.evaluate(() => {
        window.__deck.next()
        return document.querySelectorAll('.slide.is-leaving').length
      }),
    ).toBe(0)
    const staticHtml = renderDeckDocument(sample(), { deckDir, outDir, staticMode: true }).html
    expect(staticHtml).toContain('<html lang="en" data-static="true">')
  })

  it('opens a presenter window with P that follows the main window and shows the notes', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#1`)
    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
    await presenter.waitForFunction(() => Boolean(window.__deck?.isPresenter))
    expect(await presenter.evaluate(() => document.body.classList.contains('deck-presenter'))).toBe(
      true,
    )
    await page.keyboard.press('ArrowRight')
    await presenter.waitForFunction(() => window.__deck.current === 1)
    const notes = (sample().slides[1] as Slide).notes ?? ''
    expect(notes.length).toBeGreaterThan(0)
    expect(
      await presenter.evaluate(() => document.querySelector('.presenter-notes')?.textContent),
    ).toBe(notes)
    expect(
      await presenter.evaluate(() =>
        document.querySelector('.presenter-next-stage .slide')?.getAttribute('data-slide'),
      ),
    ).toBe('s3')
    await presenter.keyboard.press('ArrowRight')
    await page.waitForFunction(() => window.__deck.current === 1 && window.__deck.step === 1)
    await presenter.close()
  })
})

describe('rendered deck in a real browser', () => {
  let browser: Browser
  let page: Page
  let deck: Deck
  let htmlFile: string

  beforeAll(async () => {
    deck = sample()
    mkdirSync(outDir, { recursive: true })
    htmlFile = join(outDir, 'deck.html')
    writeFileSync(htmlFile, renderDeckDocument(deck, { deckDir, outDir }).html, 'utf8')
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(pathToFileURL(htmlFile).href)
  })
  afterAll(async () => {
    await browser?.close()
  })

  const activeId = () =>
    page.evaluate(() => document.querySelector('.slide.is-active')?.getAttribute('data-slide'))
  const visibleCount = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('.deck-stage > .slide')].filter(
          (s) => getComputedStyle(s).visibility === 'visible',
        ).length,
    )

  it('shows exactly one slide, starting from page 1, and exposes the model', async () => {
    expect(
      await page.evaluate(() => (window as unknown as { __deck: { count: number } }).__deck.count),
    ).toBe(8)
    expect(await activeId()).toBe('s1')
    expect(await visibleCount()).toBe(1)
    expect(await page.evaluate(() => location.hash)).toBe('#1')
    const model = await page.evaluate(
      () => (window as unknown as { __deck: { model: unknown } }).__deck.model,
    )
    expect(model).toEqual(normaliseDeck(deck))
  })

  it('navigates with the keyboard and keeps the url hash as the source of truth', async () => {
    await page.keyboard.press('ArrowRight')
    expect(await activeId()).toBe('s2')
    expect(await page.evaluate(() => location.hash)).toBe('#2')
    await page.keyboard.press('End')
    expect(await activeId()).toBe('s8')
    await page.keyboard.press('ArrowRight')
    expect(await activeId()).toBe('s8')
    await page.keyboard.press('Home')
    expect(await activeId()).toBe('s1')
    await page.keyboard.press('ArrowLeft')
    expect(await activeId()).toBe('s1')
    await page.keyboard.type('6')
    await page.waitForFunction(() => location.hash === '#6')
    expect(await activeId()).toBe('s6')
    await page.goto(`${pathToFileURL(htmlFile).href}#s4`)
    expect(await activeId()).toBe('s4')
    expect(await page.evaluate(() => location.hash)).toBe('#4')
    // a hash-only goto is a page change, not a reload: the theme's fade keeps s6 underneath for a moment
    await page.waitForFunction(() => !document.querySelector('.slide.is-leaving'))
    expect(await visibleCount()).toBe(1)
  })

  it('reflects overrides in the live DOM', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#6`)
    const card3 = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-slide="s6"] [data-el="card-3"]') as Element)
          .visibility,
    )
    expect(card3).toBe('hidden')
    const card1 = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-slide="s6"] [data-el="card-1"]') as Element)
          .color,
    )
    expect(card1).toBe('rgb(200, 16, 46)')
    await page.goto(`${pathToFileURL(htmlFile).href}#1`)
    const title = await page.evaluate(() => {
      const el = document.querySelector('[data-slide="s1"] [data-el="title"]') as HTMLElement
      return { top: el.style.top, fontSize: getComputedStyle(el).fontSize }
    })
    expect(title).toEqual({ top: '360px', fontSize: '128px' })
  })

  it.each([
    [800, 600],
    [2560, 1440],
    [1920, 1080],
  ])('fits and centres the 1920×1080 stage in a %i×%i window without scrollbars', async (w, h) => {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(50)
    const m = await page.evaluate(() => {
      const stage = document.querySelector('.deck-stage') as HTMLElement
      const r = stage.getBoundingClientRect()
      const doc = document.scrollingElement as Element
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        scrollH: doc.scrollHeight,
        clientH: doc.clientHeight,
      }
    })
    const s = Math.min(w / 1920, h / 1080)
    expect(m.width).toBeCloseTo(1920 * s, 0)
    expect(m.height).toBeCloseTo(1080 * s, 0)
    expect(m.left).toBeCloseTo((w - 1920 * s) / 2, 0)
    expect(m.top).toBeCloseTo((h - 1080 * s) / 2, 0)
    expect(m.scrollW).toBeLessThanOrEqual(m.clientW)
    expect(m.scrollH).toBeLessThanOrEqual(m.clientH)
    await page.screenshot({ path: join(outDir, `fit-${w}x${h}.png`) })
  })
})

describe('entrance motion', () => {
  let browser: Browser
  let page: Page
  let htmlFile: string

  beforeAll(async () => {
    const deck = sample()
    deck.transition = 'fade'
    const s2 = deck.slides[1] as Slide
    for (const el of s2.elements) {
      if (el.id === 'card-1') el.step = 1
      if (el.id === 'card-2') {
        el.step = 2
        el.enter = 'scale-in'
      }
      if (el.id === 'card-3') el.step = 2
    }
    mkdirSync(outDir, { recursive: true })
    htmlFile = join(outDir, 'deck-motion.html')
    writeFileSync(htmlFile, renderDeckDocument(deck, { deckDir, outDir }).html, 'utf8')
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  })
  afterAll(async () => {
    await browser?.close()
  })

  const attr = (el: string, name: string) =>
    page.evaluate(
      ([id, n]) =>
        document.querySelector(`.slide.is-active [data-el="${id}"]`)?.getAttribute(n) ?? null,
      [el, name] as const,
    )
  const css = (el: string, prop: string) =>
    page.evaluate(
      ([id, p]) =>
        getComputedStyle(document.querySelector(`.slide.is-active [data-el="${id}"]`) as Element)
          .getPropertyValue(p)
          .split(', ')[0],
      [el, prop] as const,
    )

  it('stamps data-enter on step elements: the explicit value or the theme default for the role', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#2`)
    expect(await attr('card-1', 'data-enter')).toBe('fade-up')
    expect(await attr('card-2', 'data-enter')).toBe('scale-in')
    expect(await attr('title', 'data-enter')).toBeNull()
    const html = readFileSync(htmlFile, 'utf8')
    expect(html).toContain('--motion-stagger: 70ms')
    expect(html).toContain('--motion-duration: 350ms')
    expect(html).toContain('data-enter="scale-in"')
  })

  it('staggers the elements one press reveals and leaves the earlier ones alone', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#2`)
    await page.keyboard.press('ArrowRight')
    expect(await css('card-1', 'visibility')).toBe('visible')
    expect(await css('card-1', 'transition-delay')).toBe('0s')
    await page.keyboard.press('ArrowRight')
    expect(await css('card-2', 'transition-delay')).toBe('0s')
    expect(await css('card-3', 'transition-delay')).toBe('0.07s')
    expect(await css('card-1', 'transition-delay')).toBe('0s')
    expect(await css('card-2', 'transition-duration')).toBe('0.35s')
    await page.keyboard.press('ArrowLeft')
    expect(await css('card-3', 'visibility')).toBe('hidden')
    expect(await css('card-3', 'transition-delay')).toBe('0s')
  })

  it('static mode and reduced motion turn the transitions off', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}?static=1#2`)
    expect(await css('card-3', 'visibility')).toBe('visible')
    expect(await css('card-2', 'transition-duration')).toBe('0s')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${pathToFileURL(htmlFile).href}#2`)
    expect(await css('card-2', 'transition-duration')).toBe('0s')
    await page.emulateMedia({ reducedMotion: null })
  })
})

describe('page-level overrides in the player', () => {
  let browser: Browser
  let page: Page
  let htmlFile: string

  beforeAll(async () => {
    const deck = sample()
    // two extra slides on a layout that carries a page chip, numbered the way the scaffold does
    const section = loadLayout('section')
    for (const [id, n] of [
      ['s9', 9],
      ['s10', 10],
    ] as const) {
      deck.slides.push({
        id,
        layout: 'section',
        slots: {
          ...section.json.sample,
          page: { type: 'text', value: `${String(n).padStart(2, '0')} / 10` },
        },
        elements: section.json.elements,
      })
    }
    deck.pages = { order: ['s1', 's3', 's2'], hidden: ['s4'] }
    mkdirSync(outDir, { recursive: true })
    htmlFile = join(outDir, 'deck-pages.html')
    writeFileSync(htmlFile, renderDeckDocument(deck, { deckDir, outDir }).html, 'utf8')
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(pathToFileURL(htmlFile).href)
  })
  afterAll(async () => {
    await browser?.close()
  })

  const chip = (id: string) =>
    page.evaluate(
      (s) => document.querySelector(`[data-slide="${s}"] [data-el="page"]`)?.textContent ?? null,
      id,
    )

  it('plays in the override order, skips hidden slides and renumbers the page chips', async () => {
    expect(await page.evaluate(() => window.__deck.ids)).toEqual([
      's1',
      's3',
      's5',
      's6',
      's7',
      's8',
      's9',
      's10',
      's2',
    ])
    expect(await page.evaluate(() => window.__deck.count)).toBe(9)
    await page.keyboard.press('ArrowRight')
    expect(
      await page.evaluate(() =>
        document.querySelector('.slide.is-active')?.getAttribute('data-slide'),
      ),
    ).toBe('s3')
    expect(await page.evaluate(() => location.hash)).toBe('#2')
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-slide="s4"]')?.getAttribute('data-hidden-slide'),
      ),
    ).toBe('true')
    expect(await chip('s9')).toBe('07 / 09')
    expect(await chip('s10')).toBe('08 / 09')
  })

  it('re-sequences live through deck.setPages and keeps the current slide when it survives', async () => {
    await page.evaluate(() => window.__deck.go('s5'))
    await page.evaluate(() => window.__deck.setPages({ hidden: ['s2', 's3'] }))
    expect(await page.evaluate(() => window.__deck.ids)).toEqual([
      's1',
      's4',
      's5',
      's6',
      's7',
      's8',
      's9',
      's10',
    ])
    expect(
      await page.evaluate(() =>
        document.querySelector('.slide.is-active')?.getAttribute('data-slide'),
      ),
    ).toBe('s5')
    expect(await page.evaluate(() => location.hash)).toBe('#3')
    expect(await chip('s10')).toBe('08 / 08')
    await page.evaluate(() => window.__deck.setPages(undefined))
    expect(await page.evaluate(() => window.__deck.count)).toBe(10)
    expect(await chip('s10')).toBe('10 / 10')
  })
})

describe('element motion switch', () => {
  let browser: Browser
  let page: Page
  let htmlFile: string

  beforeAll(async () => {
    const deck = sample()
    deck.transition = 'fade'
    deck.motion = 'off'
    const s2 = deck.slides[1] as Slide
    for (const el of s2.elements) {
      const m = /^card-(\d)$/.exec(el.id)
      if (m) el.step = Number(m[1])
    }
    mkdirSync(outDir, { recursive: true })
    htmlFile = join(outDir, 'deck-motion-off.html')
    const { html } = renderDeckDocument(deck, { deckDir, outDir })
    expect(html).toContain('<html lang="en" data-motion="off">')
    writeFileSync(htmlFile, html, 'utf8')
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  })
  afterAll(async () => {
    await browser?.close()
  })

  const open = async (suffix: string) => {
    await page.goto(`${pathToFileURL(htmlFile).href}${suffix}`)
    await page.waitForFunction(() => window.__deck?.current === 1)
  }
  const state = () =>
    page.evaluate(() => ({
      motion: window.__deck.motion,
      steps: window.__deck.steps(1),
      pending: document.querySelectorAll('[data-slide="s2"] .is-pending').length,
      attr: document.documentElement.getAttribute('data-motion'),
      stored: localStorage.getItem(`deck:${window.__deck.model.id}:motion`),
    }))

  it('deck.motion off reveals every step at once; ?motion=1, M and the API override it per browser', async () => {
    await open('#2')
    expect(await state()).toEqual({
      motion: false,
      steps: 0,
      pending: 0,
      attr: 'off',
      stored: null,
    })
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => location.hash)).toBe('#3')
    // the url wins for this load; M flips it and remembers the choice for this browser
    await open('?motion=1#2')
    expect(await state()).toMatchObject({ motion: true, steps: 3, pending: 3, attr: null })
    await page.keyboard.press('m')
    expect(await state()).toMatchObject({
      motion: false,
      steps: 0,
      pending: 0,
      attr: 'off',
      stored: 'off',
    })
    expect(await page.locator('.deck-toast').textContent()).toContain('off')
    await page.keyboard.press('m')
    expect(await state()).toMatchObject({
      motion: true,
      steps: 3,
      pending: 3,
      attr: null,
      stored: 'on',
    })
    // the remembered choice beats the deck's own setting on the next load
    await open('#2')
    expect(await state()).toMatchObject({ motion: true, stored: 'on' })
    // the editor's way: back to what the file says, forgetting the browser's choice
    await page.evaluate(() => window.__deck.setMotion(false, false))
    expect(await state()).toMatchObject({ motion: false, steps: 0, pending: 0, stored: null })
    // static mode reveals everything anyway and ignores M
    await open('?static=1&motion=1#2')
    expect(await state()).toMatchObject({ motion: true, pending: 0 })
    await page.keyboard.press('m')
    expect(await state()).toMatchObject({ motion: true })
  })
})

describe('page transition families', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  const build = (name: string, deck: Deck) => {
    mkdirSync(outDir, { recursive: true })
    const file = join(outDir, name)
    const { html } = renderDeckDocument(deck, { deckDir, outDir })
    writeFileSync(file, html, 'utf8')
    return { url: pathToFileURL(file).href, html }
  }
  const open = async (url: string) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(`${url}#1`)
    await page.waitForFunction(() => window.__deck?.current === 0)
    return page
  }
  const change = (page: Page, dir: 'next' | 'prev') =>
    page.evaluate((d) => {
      window.__deck[d]()
      const stage = document.querySelector('.deck-stage') as Element
      const active = document.querySelector('.slide.is-active') as HTMLElement
      const leaving = document.querySelector('.slide.is-leaving') as HTMLElement | null
      return {
        direction: stage.getAttribute('data-direction'),
        active: getComputedStyle(active).animationName,
        leaving: leaving ? getComputedStyle(leaving).animationName : null,
        clipped: getComputedStyle(stage).overflow,
      }
    }, dir)
  const settled = (page: Page) =>
    page.waitForFunction(() => !document.querySelector('.slide.is-leaving'))

  it('push moves both pages and reverses going back; lift floats the new page in; slide-left plays as push', async () => {
    const pushDeck = sample()
    pushDeck.transition = 'push'
    const push = build('deck-push.html', pushDeck)
    expect(push.html).toContain(
      '<div class="deck-stage" data-transition="push" data-transition-default="fade">',
    )
    const page = await open(push.url)
    expect(await change(page, 'next')).toEqual({
      direction: 'forward',
      active: 'deck-push-in',
      leaving: 'deck-push-out',
      clipped: 'hidden',
    })
    await settled(page)
    expect(await change(page, 'prev')).toEqual({
      direction: 'back',
      active: 'deck-push-in-back',
      leaving: 'deck-push-out-back',
      clipped: 'hidden',
    })
    await settled(page)
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector('.deck-stage') as Element).overflow,
      ),
    ).toBe('visible')
    await page.close()

    const liftDeck = sample()
    liftDeck.transition = 'lift'
    const lift = await open(build('deck-lift.html', liftDeck).url)
    expect(await change(lift, 'next')).toMatchObject({ active: 'deck-lift', leaving: 'none' })
    await settled(lift)
    await lift.close()

    const legacy = sample()
    legacy.transition = 'slide-left'
    expect(build('deck-slide-left.html', legacy).html).toContain(
      'data-transition="push" data-transition-default="fade"',
    )
  })

  it('a deck without a transition follows its theme; none switches at once; the editor API goes back to the default', async () => {
    const blue = sampleDeck('blue-professional')
    blue.transition = undefined
    expect(build('deck-theme-push.html', blue).html).toContain(
      'data-transition="push" data-transition-default="push"',
    )
    const ink = sample()
    ink.transition = undefined
    expect(build('deck-theme-fade.html', ink).html).toContain(
      'data-transition="fade" data-transition-default="fade"',
    )
    const noneDeck = sample()
    noneDeck.transition = 'none'
    const none = build('deck-none.html', noneDeck)
    expect(none.html).toContain('<div class="deck-stage" data-transition-default="fade">')
    const page = await open(none.url)
    const attr = () =>
      page.evaluate(() => document.querySelector('.deck-stage')?.getAttribute('data-transition'))
    expect(await change(page, 'next')).toMatchObject({ active: 'none', leaving: null })
    await page.evaluate(() => window.__deck.setTransition('lift'))
    expect(await attr()).toBe('lift')
    await page.evaluate(() => window.__deck.setTransition(''))
    expect(await attr()).toBe('fade')
    await page.evaluate(() => window.__deck.setTransition('slide-left'))
    expect(await attr()).toBe('push')
    await page.close()
  })
})
