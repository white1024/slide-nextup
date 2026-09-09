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
    expect(html).toContain('data-el="title" style="top:360px;font-size:80px"')
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
      loadLayout('cards', 'blue-professional'),
    )
    expect(problems.some((p) => p.includes('title') && p.includes('list'))).toBe(true)
    expect(problems.some((p) => p.includes('card-1'))).toBe(true)
  })

  it('lets content expand only behind a boxed role', () => {
    const slide = deck.slides[1] as Slide
    const cards = loadLayout('cards', 'blue-professional')
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
    // the talk's cues for s2: one for the page, two pinned to its presses
    const talk = {
      s2: [
        { tag: 'must' as const, text: 'three things, one at a time' },
        { tag: 'may' as const, step: 1, text: 'the first card: why the layout keeps changing' },
        { tag: 'must' as const, step: 3, text: 'the trial plan, then the bridge to the numbers' },
      ],
    }
    writeFileSync(htmlFile, renderDeckDocument(deck, { deckDir, outDir, talk }).html, 'utf8')
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
      const stage = document.querySelector('.deck-stage') as HTMLElement
      return {
        activeId: active.dataset.slide,
        leavingId: leaving.dataset.slide,
        animation: a.animationName,
        activeStarting: Number(a.opacity) < 1,
        leavingVisible: l.visibility === 'visible' && l.opacity === '1',
        leavingBelow: Number(l.zIndex) < Number(a.zIndex),
        // the stage carries the leaving page's own background for the duration of the change
        backdrop: getComputedStyle(stage).backgroundColor === l.backgroundColor,
      }
    })
    expect(mid).toEqual({
      activeId: 's2',
      leavingId: 's1',
      animation: 'deck-fade',
      activeStarting: true,
      leavingVisible: true,
      leavingBelow: true,
      backdrop: true,
    })
    await page.waitForFunction(() => !document.querySelector('.slide.is-leaving'))
    expect(
      await page.evaluate(() => {
        const active = document.querySelectorAll('.slide.is-active')
        return {
          count: active.length,
          opacity: getComputedStyle(active[0] as Element).opacity,
          backdrop: (document.querySelector('.deck-stage') as HTMLElement).style.background,
        }
      }),
    ).toEqual({ count: 1, opacity: '1', backdrop: '' })
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
    // the talk's cues: the page cue lit, the pinned ones waiting for their press
    const cues = () =>
      presenter.evaluate(() =>
        [...document.querySelectorAll('.presenter-cue')].map((c) => ({
          tag: c.getAttribute('data-tag'),
          step: c.getAttribute('data-step'),
          due: c.classList.contains('is-due'),
          current: c.classList.contains('is-current'),
          text: c.textContent,
        })),
      )
    expect(readFileSync(htmlFile, 'utf8')).toContain('id="deck-talk"')
    expect(await cues()).toEqual([
      {
        tag: 'must',
        step: null,
        due: false,
        current: false,
        text: 'mustthree things, one at a time',
      },
      {
        tag: 'may',
        step: '1',
        due: false,
        current: false,
        text: 'may @1the first card: why the layout keeps changing',
      },
      {
        tag: 'must',
        step: '3',
        due: false,
        current: false,
        text: 'must @3the trial plan, then the bridge to the numbers',
      },
    ])
    await presenter.keyboard.press('ArrowRight')
    await page.waitForFunction(() => window.__deck.current === 1 && window.__deck.step === 1)
    await presenter.waitForFunction(() => window.__deck.step === 1)
    expect((await cues()).map((c) => [c.due, c.current])).toEqual([
      [false, false],
      [true, true],
      [false, false],
    ])
    await presenter.keyboard.press('ArrowRight')
    await presenter.keyboard.press('ArrowRight')
    await presenter.waitForFunction(() => window.__deck.step === 3)
    expect((await cues()).map((c) => [c.due, c.current])).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ])
    // a page without cues hides the block
    await presenter.keyboard.press('ArrowRight')
    await presenter.waitForFunction(() => window.__deck.current === 2)
    expect(
      await presenter.evaluate(
        () => (document.querySelector('.presenter-cues') as HTMLElement).hidden,
      ),
    ).toBe(true)
    await presenter.close()
  })

  it('in static mode a press turns the page, since every step already shows', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}?static=1#1`)
    await page.waitForFunction(() => window.__deck.current === 0)
    await page.keyboard.press('ArrowRight')
    expect(await hash()).toBe('#2')
    expect(await vis('card-1')).toBe('visible')
    expect(await vis('card-3')).toBe('visible')
    await page.keyboard.press('ArrowRight')
    expect(await hash()).toBe('#3')
    // back lands on the last step, where a page turn lands in playback too
    await page.keyboard.press('ArrowLeft')
    expect(await hash()).toBe('#2.3')
    expect(await vis('card-3')).toBe('visible')
    await page.evaluate(() => window.__deck.prev())
    expect(await hash()).toBe('#1')
    await page.evaluate(() => window.__deck.next())
    expect(await hash()).toBe('#2')
  })

  it('F fills the screen and F again leaves it', async () => {
    await page.goto(`${pathToFileURL(htmlFile).href}#1`)
    await page.waitForFunction(() => window.__deck.current === 0)
    expect(await page.evaluate(() => window.__deck.isFullscreen)).toBe(false)
    await page.keyboard.press('f')
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement)
    expect(await page.evaluate(() => window.__deck.isFullscreen)).toBe(true)
    await page.keyboard.press('F')
    await page.waitForFunction(() => document.fullscreenElement === null)
    expect(await page.evaluate(() => window.__deck.isFullscreen)).toBe(false)
    // a modifier or a text field never toggles it
    await page.keyboard.press('Control+f')
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => window.__deck.isFullscreen)).toBe(false)
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
    expect(card1).toBe('rgb(30, 43, 250)')
    await page.goto(`${pathToFileURL(htmlFile).href}#1`)
    const title = await page.evaluate(() => {
      const el = document.querySelector('[data-slide="s1"] [data-el="title"]') as HTMLElement
      return { top: el.style.top, fontSize: getComputedStyle(el).fontSize }
    })
    expect(title).toEqual({ top: '360px', fontSize: '80px' })
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
  let url: string

  beforeAll(async () => {
    const deck = sample()
    deck.transition = 'fade'
    const s2 = deck.slides[1] as Slide
    for (const el of s2.elements) {
      if (el.id === 'card-1') {
        el.step = 1
        el.enter = 'pop'
      }
      if (el.id === 'card-2') {
        el.step = 2
        el.enter = 'scale-in'
      }
      if (el.id === 'card-3') el.step = 2
    }
    // s3: a one-line text has nothing to cascade and plays fade-up instead; s4: a list cascades its entries
    const s3 = deck.slides[2] as Slide
    for (const el of s3.elements) {
      if (el.id === 'body') {
        el.step = 1
        el.enter = 'cascade'
      }
    }
    const s4 = deck.slides[3] as Slide
    for (const el of s4.elements) {
      if (el.id === 'left-items') {
        el.step = 1
        el.enter = 'cascade'
      }
      if (el.id === 'right-items') {
        el.step = 1
        el.enter = 'blur'
      }
    }
    mkdirSync(outDir, { recursive: true })
    htmlFile = join(outDir, 'deck-motion.html')
    writeFileSync(htmlFile, renderDeckDocument(deck, { deckDir, outDir }).html, 'utf8')
    url = pathToFileURL(htmlFile).href
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
  const css = (el: string, prop: string, sel = '.slide.is-active') =>
    page.evaluate(
      ([id, p, s]) =>
        getComputedStyle(
          document.querySelector(`${s} [data-el="${id}"]`) as Element,
        ).getPropertyValue(p),
      [el, prop, sel] as const,
    )
  const goto = async (hash: string) => {
    await page.goto(`${url}${hash}`)
    await page.waitForFunction(() => Boolean(window.__deck))
  }

  it('stamps data-enter on step elements: the explicit value or the theme default for the role; the pace is the theme family', async () => {
    await goto('#2')
    expect(await attr('card-1', 'data-enter')).toBe('pop')
    expect(await attr('card-2', 'data-enter')).toBe('scale-in')
    expect(await attr('card-3', 'data-enter')).toBe('scale-in')
    expect(await attr('title', 'data-enter')).toBeNull()
    const html = readFileSync(htmlFile, 'utf8')
    // blue-professional is the crisp family: 300ms, 60ms between siblings, a strong ease-out
    expect(html).toContain('--motion-stagger: 60ms')
    expect(html).toContain('--motion-duration: 300ms')
    expect(html).toContain('--motion-ease: cubic-bezier(0.23, 1, 0.32, 1)')
    expect(html).toContain('data-enter="pop"')
  })

  it('the press plays one keyframe run on what it reveals, staggered; earlier elements rest and a step back replays nothing', async () => {
    await goto('#2')
    await page.keyboard.press('ArrowRight')
    expect(await css('card-1', 'visibility')).toBe('visible')
    expect(await css('card-1', 'animation-name')).toBe('deck-enter-pop')
    expect(await css('card-1', 'animation-timing-function')).toBe(
      'cubic-bezier(0.34, 1.56, 0.64, 1)',
    )
    expect(await css('card-1', 'animation-fill-mode')).toBe('both')
    expect(await css('card-1', 'animation-duration')).toBe('0.3s')
    expect(await css('card-1', 'animation-delay')).toBe('0s')
    await page.keyboard.press('ArrowRight')
    expect(await css('card-2', 'animation-name')).toBe('deck-enter-scale-in')
    expect(await css('card-2', 'animation-timing-function')).toBe('cubic-bezier(0.23, 1, 0.32, 1)')
    expect(await css('card-2', 'animation-delay')).toBe('0s')
    expect(await css('card-3', 'animation-delay')).toBe('0.06s')
    expect(await css('card-1', 'animation-name')).toBe('none')
    expect(await css('card-1', 'opacity')).toBe('1')
    await page.keyboard.press('ArrowLeft')
    expect(await css('card-3', 'visibility')).toBe('hidden')
    expect(await css('card-2', 'visibility')).toBe('hidden')
    expect(await css('card-1', 'visibility')).toBe('visible')
    expect(await css('card-1', 'animation-name')).toBe('none')
  })

  it('pop overshoots on the way in and every run ends on the resting state static mode shows', async () => {
    await goto('#2')
    await page.keyboard.press('ArrowRight')
    const seek = (at: number) =>
      page.evaluate((ms) => {
        const el = document.querySelector('.slide.is-active [data-el="card-1"]') as HTMLElement
        const anim = el.getAnimations()[0]
        if (!anim) throw new Error('no animation')
        anim.pause()
        anim.currentTime = ms
        const m = /matrix\(([^)]*)\)/.exec(getComputedStyle(el).transform)
        return {
          scale: m ? Number.parseFloat(m[1] ?? '1') : 1,
          opacity: getComputedStyle(el).opacity,
          transform: getComputedStyle(el).transform,
        }
      }, at)
    expect((await seek(0)).scale).toBeCloseTo(0.62, 2)
    expect((await seek(180)).scale).toBeGreaterThan(1)
    // the last frame holds (fill both): the identity matrix, which is what static mode's `none` also is
    const end = await seek(300)
    expect(end.transform).toBe('matrix(1, 0, 0, 1, 0, 0)')
    expect(end.opacity).toBe('1')
    const rest = await page.evaluate(() => {
      const r = (
        document.querySelector('.slide.is-active [data-el="card-1"]') as HTMLElement
      ).getBoundingClientRect()
      return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2)
    })
    await goto('?static=1#2')
    const still = await page.evaluate(() => {
      const el = document.querySelector('.slide.is-active [data-el="card-1"]') as HTMLElement
      const r = el.getBoundingClientRect()
      return {
        rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2),
        transform: getComputedStyle(el).transform,
        opacity: getComputedStyle(el).opacity,
      }
    })
    expect(still).toEqual({ rect: rest, transform: 'none', opacity: '1' })
  })

  it("cascade plays fade-up on a list's entries 50ms apart; an element with nothing to cascade fades up itself", async () => {
    await goto('#4')
    await page.keyboard.press('ArrowRight')
    const list = await page.evaluate(() => {
      const el = document.querySelector('.slide.is-active [data-el="left-items"]') as HTMLElement
      const items = Array.from(el.querySelectorAll('li'))
      return {
        cascading: el.classList.contains('is-cascading'),
        own: getComputedStyle(el).animationName,
        names: items.map((li) => getComputedStyle(li).animationName),
        delays: items.map((li) => getComputedStyle(li).animationDelay),
      }
    })
    expect(list.cascading).toBe(true)
    expect(list.own).toBe('none')
    expect(list.names).toEqual(Array(5).fill('deck-enter-fade-up'))
    expect(list.delays).toEqual(['0s', '0.05s', '0.1s', '0.15s', '0.2s'])
    // the second element of the same step starts after the first (the stagger), its blur run on itself
    expect(await css('right-items', 'animation-name')).toBe('deck-enter-blur')
    expect(await css('right-items', 'animation-delay')).toBe('0.06s')
    await goto('#3')
    await page.keyboard.press('ArrowRight')
    expect(await css('body', 'animation-name')).toBe('deck-enter-fade-up')
    expect(
      await page.evaluate(() =>
        document
          .querySelector('.slide.is-active [data-el="body"]')
          ?.classList.contains('is-cascading'),
      ),
    ).toBe(false)
  })

  it('the page being left never replays an entrance, and neither does a hash jump or going back', async () => {
    await goto('#2')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    // the next press turns the page: s2 keeps .is-leaving under the fade and its entrances are frozen
    const leaving = await page.evaluate(() => {
      window.__deck.next()
      const old = document.querySelector('.slide.is-leaving') as HTMLElement
      return {
        id: old?.dataset.slide,
        names: Array.from(old.querySelectorAll('[data-step]')).map(
          (el) => getComputedStyle(el).animationName,
        ),
        opacity: Array.from(old.querySelectorAll('[data-step]')).map(
          (el) => getComputedStyle(el).opacity,
        ),
      }
    })
    expect(leaving.id).toBe('s2')
    expect(leaving.names).toEqual(['none', 'none', 'none'])
    expect(leaving.opacity).toEqual(['1', '1', '1'])
    await page.waitForFunction(() => !document.querySelector('.slide.is-leaving'))
    // going back lands on the page fully revealed, nothing entering
    await page.evaluate(() => window.__deck.prev())
    expect(await page.evaluate(() => window.__deck.current)).toBe(1)
    expect(await css('card-3', 'visibility')).toBe('visible')
    expect(await css('card-3', 'animation-name')).toBe('none')
    // a hash jump straight into a step shows it at rest
    await goto('#2.2')
    expect(await css('card-2', 'visibility')).toBe('visible')
    expect(await css('card-2', 'animation-name')).toBe('none')
    expect(
      await page.evaluate(() => document.querySelectorAll('.slide.is-active .is-entering').length),
    ).toBe(0)
  })

  it('static mode and reduced motion play nothing, the cascade items included', async () => {
    await goto('?static=1#2')
    expect(await css('card-3', 'visibility')).toBe('visible')
    expect(await css('card-2', 'animation-duration')).toBe('0s')
    await goto('?static=1#4')
    expect(await css('left-items', 'animation-name')).toBe('none')
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('.slide.is-active [data-el="left-items"] li')).map(
          (li) => getComputedStyle(li).animationName,
        ),
      ),
    ).toEqual(Array(5).fill('none'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await goto('#2')
    await page.keyboard.press('ArrowRight')
    expect(await css('card-1', 'animation-duration')).toBe('0s')
    expect(await css('card-1', 'animation-name')).toBe('none')
    expect(await css('card-1', 'visibility')).toBe('visible')
    await goto('#4')
    await page.keyboard.press('ArrowRight')
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('.slide.is-active [data-el="left-items"] li')).map(
          (li) => getComputedStyle(li).animationDuration,
        ),
      ),
    ).toEqual(Array(5).fill('0s'))
    await page.emulateMedia({ reducedMotion: null })
  })

  it('every entrance keyframe travels at most 64px and each pack plays inside its family band', async () => {
    await goto('#1')
    const frames = await page.evaluate(() => {
      const out: Record<string, number> = {}
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (!(rule instanceof CSSKeyframesRule) || !rule.name.startsWith('deck-enter-')) continue
          let travel = 0
          for (const frame of Array.from(rule.cssRules) as CSSKeyframeRule[]) {
            for (const m of frame.style.transform.matchAll(/translate[XY]?\(([^)]*)\)/g))
              for (const n of (m[1] ?? '').split(','))
                travel = Math.max(travel, Math.abs(Number.parseFloat(n)) || 0)
          }
          out[rule.name] = travel
        }
      }
      return out
    })
    expect(Object.keys(frames).sort()).toEqual([
      'deck-enter-blur',
      'deck-enter-draw-line',
      'deck-enter-fade',
      'deck-enter-fade-up',
      'deck-enter-grow-ring',
      'deck-enter-grow-x',
      'deck-enter-pop',
      'deck-enter-scale-in',
      'deck-enter-slide-left',
      'deck-enter-slide-right',
      'deck-enter-wipe',
    ])
    for (const [name, travel] of Object.entries(frames))
      expect(travel, name).toBeLessThanOrEqual(64)
    for (const [id, family, duration, band] of [
      ['blue-professional', 'crisp', 300, [150, 400]],
      ['warm-keynote', 'soft', 450, [300, 800]],
      ['technical-brief', 'minimal', 220, [150, 320]],
    ] as const) {
      const deck = sampleDeck(id)
      const { html } = renderDeckDocument(deck, { deckDir, outDir })
      expect(html, family).toContain(`--motion-duration: ${duration}ms`)
      expect(duration, family).toBeGreaterThanOrEqual(band[0])
      expect(duration, family).toBeLessThanOrEqual(band[1])
    }
  })
})

describe('data-driven chart entrances', () => {
  let browser: Browser
  let page: Page
  let url: string
  let html: string

  beforeAll(async () => {
    const r = parseDeck(readFileSync(resolve('examples/deck.components.json'), 'utf8'))
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const deck = r.deck
    const set = (
      id: string,
      el: string,
      step: number,
      enter?: Slide['elements'][number]['enter'],
    ) => {
      const e = deck.slides.find((s) => s.id === id)?.elements.find((x) => x.id === el)
      if (!e) throw new Error(`${id}/${el}`)
      e.step = step
      if (enter) e.enter = enter
    }
    // s1: three stats count (stat-1 through the theme's default for the stat role), one decimal, one grouped
    const s1 = deck.slides[0] as Slide
    s1.slots['stat-2'] = { type: 'metric', value: '0.8x', label: 'decimal' }
    s1.slots['stat-3'] = { type: 'metric', value: '104,411', label: 'grouped' }
    set('s1', 'stat-1', 1)
    set('s1', 'stat-2', 1, 'count')
    set('s1', 'stat-3', 1, 'count')
    // s2: the bar chart grows (the theme's default for the chart role) and the aside metric counts
    set('s2', 'chart', 1)
    set('s2', 'aside', 1, 'count')
    // s3: the line draws, then the donut grows
    set('s3', 'chart', 1, 'draw')
    set('s3', 'aside', 2, 'grow')
    mkdirSync(outDir, { recursive: true })
    const file = join(outDir, 'deck-charts.html')
    html = renderDeckDocument(deck, { deckDir, outDir }).html
    writeFileSync(file, html, 'utf8')
    url = pathToFileURL(file).href
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  })
  afterAll(async () => {
    await browser?.close()
  })

  const goto = async (hash: string) => {
    await page.goto(`${url}${hash}`)
    await page.waitForFunction(() => Boolean(window.__deck))
  }
  // pause every animation inside the active page's step elements and seek to `ms`
  const seek = (ms: number) =>
    page.evaluate((at) => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target
        if (t instanceof Element && t.closest('.slide.is-active [data-step]')) {
          a.pause()
          a.currentTime = at
        }
      }
    }, ms)
  const finish = () =>
    page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target
        if (t instanceof Element && t.closest('.slide.is-active [data-step]')) a.finish()
      }
    })
  const text = (sel: string) =>
    page.evaluate((s) => document.querySelector(`.slide.is-active ${s}`)?.textContent ?? '', sel)
  const widths = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.slide.is-active [data-el="chart"] .chart-fill')].map(
        (r) => Math.round(r.getBoundingClientRect().width * 2) / 2,
      ),
    )

  it('renders the hooks the entrances play from: pathLength, the point positions, the ring shares and the numbers', () => {
    expect(html).toContain('pathLength="1"/>')
    expect(html).toContain('style="--t:0"')
    expect(html).toContain('style="--t:1"')
    expect(html).toContain(
      'pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" transform="rotate(-90 300 300)" style="--share:1"',
    )
    expect(html).toContain('data-count="69">69%<')
    expect(html).toContain('data-count="104411">104,411<')
    expect(html).toContain('data-count="0.8">0.8x<')
    expect(html).toContain('data-el="stat-1" data-enter="count"')
    expect(html).toContain('data-el="chart" data-enter="grow"')
  })

  it('bars grow from the left to their real width and a number counts up; both end where static mode puts them', async () => {
    await goto('#2')
    await page.keyboard.press('ArrowRight')
    expect(await text('[data-el="aside"] .metric-value')).toBe('0%')
    await seek(120)
    const mid = await page.evaluate(() =>
      [...document.querySelectorAll('.slide.is-active [data-el="chart"] .chart-fill')].map((r) => ({
        scale: Number.parseFloat(getComputedStyle(r).transform.replace('matrix(', '')),
        origin: getComputedStyle(r).transformOrigin,
        name: getComputedStyle(r).animationName,
      })),
    )
    expect(mid.length).toBeGreaterThanOrEqual(3)
    for (const m of mid) {
      expect(m.name).toBe('deck-enter-grow-x')
      expect(m.scale).toBeGreaterThan(0)
      expect(m.scale).toBeLessThan(1)
    }
    await finish()
    const rest = await widths()
    await page.waitForFunction(
      () =>
        document.querySelector('.slide.is-active [data-el="aside"] .metric-value')?.textContent ===
        '69%',
      undefined,
      { timeout: 2000 },
    )
    await goto('?static=1#2')
    expect(await widths()).toEqual(rest)
    expect(rest[0]).toBeGreaterThan(rest[1] ?? 0)
    expect(await text('[data-el="aside"] .metric-value')).toBe('69%')
  })

  it('a count keeps the number’s own format and puts the exact text back the moment anything interrupts it', async () => {
    await goto('#1')
    await page.keyboard.press('ArrowRight')
    expect(await text('[data-el="stat-3"] .metric-value')).toBe('0')
    expect(await text('[data-el="stat-2"] .metric-value')).toBe('0.0x')
    await page.waitForTimeout(150)
    expect(await text('[data-el="stat-3"] .metric-value')).toMatch(/^\d{1,3}(,\d{3})*$/)
    expect(await text('[data-el="stat-2"] .metric-value')).toMatch(/^\d\.\dx$/)
    await page.waitForFunction(
      () =>
        document.querySelector('.slide.is-active [data-el="stat-3"] .metric-value')?.textContent ===
        '104,411',
      undefined,
      { timeout: 2000 },
    )
    expect(await text('[data-el="stat-2"] .metric-value')).toBe('0.8x')
    expect(await text('[data-el="stat-1"] .metric-value')).toBe('4')
    await goto('#1')
    await page.keyboard.press('ArrowRight')
    expect(await text('[data-el="stat-3"] .metric-value')).toBe('0')
    await page.keyboard.press('ArrowLeft')
    expect(await text('[data-el="stat-3"] .metric-value')).toBe('104,411')
    await goto('?static=1#1')
    expect(await text('[data-el="stat-3"] .metric-value')).toBe('104,411')
  })

  it('a line draws itself along its real points, each point popping as the line arrives, and a ring grows to its share', async () => {
    await goto('#3')
    await page.keyboard.press('ArrowRight')
    await seek(120)
    const line = await page.evaluate(() => {
      const l = document.querySelector(
        '.slide.is-active [data-el="chart"] .chart-line',
      ) as SVGElement
      const pts = [...document.querySelectorAll('.slide.is-active [data-el="chart"] .chart-point')]
      return {
        name: getComputedStyle(l).animationName,
        offset: Number.parseFloat(getComputedStyle(l).strokeDashoffset),
        delays: pts.map((p) => getComputedStyle(p).animationDelay),
        names: [...new Set(pts.map((p) => getComputedStyle(p).animationName))],
      }
    })
    expect(line.name).toBe('deck-enter-draw-line')
    expect(line.offset).toBeGreaterThan(0)
    expect(line.offset).toBeLessThan(1)
    expect(line.delays[0]).toBe('0s')
    expect(line.delays[line.delays.length - 1]).toBe('0.3s')
    expect(line.names).toEqual(['deck-enter-pop'])
    await finish()
    await page.keyboard.press('ArrowRight')
    await seek(0)
    const ring = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.slide.is-active [data-el="aside"] .chart-ring-fill')].map(
          (c) => Number.parseFloat(getComputedStyle(c).strokeDasharray),
        ),
      )
    expect(await ring()).toEqual([0])
    await finish()
    expect(await ring()).toEqual([1])
  })
})

describe('page-level overrides in the player', () => {
  let browser: Browser
  let page: Page
  let htmlFile: string

  beforeAll(async () => {
    const deck = sample()
    // two extra slides on a layout that carries a page chip, numbered the way the scaffold does
    const section = loadLayout('section', 'blue-professional')
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
      '<div class="deck-stage" data-transition="push" data-transition-default="rise">',
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
    expect(await change(lift, 'next')).toMatchObject({
      active: 'deck-lift-in',
      leaving: 'deck-lift-out',
    })
    await settled(lift)
    await lift.close()

    const legacy = sample()
    legacy.transition = 'slide-left'
    expect(build('deck-slide-left.html', legacy).html).toContain(
      'data-transition="push" data-transition-default="rise"',
    )
  })

  it('a deck without a transition follows its theme; none switches at once; the editor API goes back to the default', async () => {
    const blue = sampleDeck('blue-professional')
    blue.transition = undefined
    expect(build('deck-theme-rise.html', blue).html).toContain(
      'data-transition="rise" data-transition-default="rise"',
    )
    const warm = sampleDeck('warm-keynote')
    warm.transition = undefined
    expect(build('deck-theme-settle.html', warm).html).toContain(
      'data-transition="settle" data-transition-default="settle"',
    )
    const brief = sampleDeck('technical-brief')
    brief.transition = undefined
    expect(build('deck-theme-dissolve.html', brief).html).toContain(
      'data-transition="dissolve" data-transition-default="dissolve"',
    )
    const noneDeck = sample()
    noneDeck.transition = 'none'
    const none = build('deck-none.html', noneDeck)
    expect(none.html).toContain('<div class="deck-stage" data-transition-default="rise">')
    const page = await open(none.url)
    const attr = () =>
      page.evaluate(() => document.querySelector('.deck-stage')?.getAttribute('data-transition'))
    expect(await change(page, 'next')).toMatchObject({ active: 'none', leaving: null })
    await page.evaluate(() => window.__deck.setTransition('lift'))
    expect(await attr()).toBe('lift')
    await page.evaluate(() => window.__deck.setTransition(''))
    expect(await attr()).toBe('rise')
    await page.evaluate(() => window.__deck.setTransition('slide-left'))
    expect(await attr()).toBe('push')
    await page.close()
  })

  it("a page's own transition plays when it comes in, going back too; none is a cut; the editor API changes it live", async () => {
    const deck = sample()
    deck.transition = 'rise'
    ;(deck.slides[1] as Slide).transition = 'breath'
    ;(deck.slides[2] as Slide).transition = 'none'
    const built = build('deck-page-transition.html', deck)
    expect(built.html).toContain('data-slide="s2" data-transition="breath"')
    expect(built.html).toContain('data-slide="s3" data-transition="none"')
    const page = await open(built.url)
    expect(await change(page, 'next')).toMatchObject({
      active: 'deck-breath-in',
      leaving: 'deck-breath-out',
    })
    expect(
      await page.evaluate(() => [window.__deck.transition, window.__deck.pageTransition()]),
    ).toEqual(['rise', 'breath'])
    await settled(page)
    // s3 asks for a cut; back into s2 plays s2's own again; back into s1 plays the deck's rise
    expect(await change(page, 'next')).toMatchObject({ active: 'none', leaving: null })
    expect(await change(page, 'prev')).toMatchObject({ active: 'deck-breath-in' })
    await settled(page)
    expect(await change(page, 'prev')).toMatchObject({
      active: 'deck-rise-in',
      leaving: 'deck-rise-out',
    })
    await settled(page)
    await page.evaluate(() => window.__deck.setPageTransition('s2', 'lift'))
    expect(await change(page, 'next')).toMatchObject({ active: 'deck-lift-in' })
    await settled(page)
    await page.evaluate(() => window.__deck.setPageTransition('s2', ''))
    expect(await page.evaluate(() => window.__deck.pageTransition('s2'))).toBe('')
    expect(
      await page.evaluate(() =>
        document.querySelector('.deck-stage')?.getAttribute('data-transition'),
      ),
    ).toBe('rise')
    await page.close()
  })

  it('every family stays inside the band: exits under 200ms, entrances under 540ms, 12px and 3% at most, opacity always', async () => {
    const deck = sample()
    deck.transition = 'none'
    const page = await open(build('deck-families.html', deck).url)
    // the keyframes themselves, read off the stylesheet
    const frames = await page.evaluate(() => {
      const out: Record<string, { travel: number; scale: number[]; opacity: boolean }> = {}
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (
            !(rule instanceof CSSKeyframesRule) ||
            !rule.name.startsWith('deck-') ||
            rule.name.startsWith('deck-enter-')
          )
            continue
          let travel = 0
          const scale: number[] = []
          let opacity = false
          for (const frame of Array.from(rule.cssRules) as CSSKeyframeRule[]) {
            if (frame.style.opacity !== '') opacity = true
            const transform = frame.style.transform
            for (const m of transform.matchAll(/translate[XY]?\(([^)]*)\)/g))
              for (const n of (m[1] ?? '').split(','))
                travel = Math.max(travel, Math.abs(Number.parseFloat(n)) || 0)
            for (const m of transform.matchAll(/scale\(([^)]*)\)/g))
              for (const n of (m[1] ?? '').split(',')) scale.push(Number.parseFloat(n))
          }
          out[rule.name] = { travel, scale, opacity }
        }
      }
      return out
    })
    expect(Object.keys(frames).sort()).toEqual([
      'deck-breath-in',
      'deck-breath-out',
      'deck-dissolve-in',
      'deck-dissolve-out',
      'deck-fade',
      'deck-lift-in',
      'deck-lift-out',
      'deck-push-in',
      'deck-push-in-back',
      'deck-push-out',
      'deck-push-out-back',
      'deck-rise-in',
      'deck-rise-out',
      'deck-settle-in',
      'deck-settle-out',
    ])
    for (const [name, f] of Object.entries(frames)) {
      expect(f.travel, name).toBeLessThanOrEqual(12)
      for (const s of f.scale) expect(Math.abs(s - 1), name).toBeLessThanOrEqual(0.03)
      expect(f.opacity, name).toBe(true)
    }
    // the timing as the player reads it: the entrance is its delay plus its duration
    const families = ['rise', 'settle', 'dissolve', 'breath', 'fade', 'push', 'lift'] as const
    for (const family of families) {
      const t = await page.evaluate((fam) => {
        window.__deck.setTransition(fam)
        window.__deck.next()
        const ms = (el: Element | null, prop: 'animationDelay' | 'animationDuration') =>
          el ? (Number.parseFloat(getComputedStyle(el)[prop]) || 0) * 1000 : 0
        const active = document.querySelector('.slide.is-active')
        const leaving = document.querySelector('.slide.is-leaving')
        return {
          enter: ms(active, 'animationDelay') + ms(active, 'animationDuration'),
          exit: ms(leaving, 'animationDuration'),
          held: leaving !== null,
          backdrop: (document.querySelector('.deck-stage') as HTMLElement).style.background !== '',
        }
      }, family)
      expect(t.held, family).toBe(true)
      expect(t.backdrop, family).toBe(true)
      expect(t.enter, family).toBeGreaterThanOrEqual(200)
      expect(t.enter, family).toBeLessThanOrEqual(540)
      expect(t.exit, family).toBeLessThanOrEqual(200)
      await settled(page)
      await page.evaluate(() => window.__deck.go(0))
      await settled(page)
    }
    await page.close()
  })
})
