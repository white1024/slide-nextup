import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Deck, type Override, parseDeck, validateDeck } from '../src/model/deck.ts'
import { loadLayout } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const outDir = resolve('artifacts', 'preflight', 'editor-test')
const pixel = resolve('tests', 'fixtures', 'pixel.png')

interface DeckApi {
  model: Deck
  count: number
  current: number
  step: number
  steps: (i?: number) => number
  isPresenter: boolean
  ids: string[]
  go: (n: number | string, step?: number) => void
  next: () => void
  prev: () => void
  motion: boolean
  setMotion: (on: boolean, remember: boolean) => void
  transition: string
  setTransition: (value: string) => void
  scale: () => number
  exportModel: () => Deck
  storyIds: () => string[]
  pages: () => { order: string[]; hidden: string[]; visible: string[] }
  setPages: (pages?: { order?: string[]; hidden?: string[] }) => void
  editor: {
    active: boolean
    selected: { slideId: string; elId: string } | null
    editingText: { slideId: string; elId: string } | null
    canUndo: boolean
    canRedo: boolean
    moreOpen: boolean
    selection: Array<{ slideId: string; elId: string }>
    copiedStyle: Record<string, unknown> | null
    draftKey: string
    enter: () => void
    exit: () => void
    select: (elId: string | null) => void
    selectMany: (elIds: string[]) => void
    set: (elId: string, patch: Record<string, unknown>) => void
    reset: (elId: string) => void
    undo: () => void
    redo: () => void
    setSnap: (on: boolean) => void
    setRevealHidden: (on: boolean) => void
    setMore: (on: boolean) => void
    themeColors: () => Array<{ name: string; value: string; use: string }>
    docked: boolean
    setDocked: (on: boolean) => void
    paletteOpen: string | null
    openPalette: (prop: string) => void
    closePalette: () => void
    setDetailsOpen: (on: boolean) => void
    hotspots: {
      enter: (elId: string, slideId?: string) => void
      leave: () => void
      select: (index: number | null) => void
      remove: () => void
      active: { slideId: string; elId: string; index: number | null } | null
    }
  }
}
declare global {
  interface Window {
    __deck: DeckApi
  }
}

function buildDeck(): Deck {
  const r = parseDeck(readFileSync(resolve('examples/deck.sample.json'), 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  const photo = loadLayout('photo')
  // the sample's hotspot points at a layout id (theme:qa decks use those as slide ids); here it jumps to s1
  const pic = photo.json.sample.photo
  const picture =
    pic?.type === 'image' && pic.hotspots
      ? { ...pic, hotspots: pic.hotspots.map((h) => ({ ...h, target: 's1' })) }
      : pic
  const deck: Deck = {
    ...r.deck,
    slides: [
      ...r.deck.slides,
      {
        id: 's9',
        layout: 'photo',
        slots: picture ? { ...photo.json.sample, photo: picture } : photo.json.sample,
        elements: photo.json.elements,
        notes: '換圖測試用',
      },
    ],
  }
  const v = validateDeck(deck)
  if (!v.ok) throw new Error(JSON.stringify(v.errors))
  return deck
}

let browser: Browser
let page: Page
let deck: Deck
let url: string

const overridesOf = () => page.evaluate(() => window.__deck.exportModel().overrides)
const overrideOf = async (key: string): Promise<Override | undefined> => (await overridesOf())[key]
const selected = () => page.evaluate(() => window.__deck.editor.selected)

async function centerOf(slideId: string, elId: string) {
  return page.evaluate(
    ([s, e]) => {
      const el = document.querySelector(`[data-slide="${s}"] [data-el="${e}"]`) as HTMLElement
      const r = el.getBoundingClientRect()
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
        top: r.top,
      }
    },
    [slideId, elId] as const,
  )
}

async function goTo(slideId: string) {
  await page.evaluate((id) => window.__deck.go(id), slideId)
  await page.evaluate(() => window.__deck.editor.select(null))
}

/** The floating toolbar keeps position, size, step and entrance behind its "more" button. */
async function openMore() {
  if (!(await page.evaluate(() => window.__deck.editor.moreOpen)))
    await page.locator('.ed-float [data-action="more"]').click()
}

beforeAll(async () => {
  deck = buildDeck()
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, 'deck.html')
  writeFileSync(
    file,
    renderDeckDocument(deck, { deckDir: resolve('examples'), outDir }).html,
    'utf8',
  )
  url = pathToFileURL(file).href
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`${url}?edit=1#1`)
  await page.waitForFunction(() => window.__deck?.editor?.active === true)
})

afterAll(async () => {
  await browser?.close()
})

describe('editor mode', () => {
  it('enters through ?edit=1 and shows its chrome outside the model', async () => {
    expect(await page.locator('.ed-panel').count()).toBe(1)
    expect(await page.locator('.ed-topbar').count()).toBe(1)
    expect(await page.locator('.ed-pages').count()).toBe(1)
    expect(await page.locator('.ed-overlay').count()).toBe(1)
    // the floating toolbar exists but waits for a selection
    expect(await page.locator('.ed-float').count()).toBe(1)
    expect(await page.locator('.ed-float').isHidden()).toBe(true)
    // undo/redo follow the (empty) history
    expect(await page.locator('.ed-topbar [data-action="undo"]').isDisabled()).toBe(true)
    expect(await page.locator('.ed-topbar [data-action="redo"]').isDisabled()).toBe(true)
    // the stage moved out from under the toolbar and the rail
    const stage = await page.evaluate(() =>
      document.querySelector('.deck-stage')?.getBoundingClientRect().toJSON(),
    )
    expect(stage.top).toBeGreaterThanOrEqual(48)
    expect(stage.left).toBeGreaterThanOrEqual(220)
    const model = await page.evaluate(() => window.__deck.exportModel())
    expect(JSON.stringify(model)).not.toContain('ed-')
  })

  it('can select every element of every slide by clicking it', async () => {
    await page.evaluate(() => window.__deck.editor.setRevealHidden(true))
    const misses: string[] = []
    for (const slide of deck.slides) {
      await goTo(slide.id)
      for (const el of slide.elements) {
        // the floating toolbar of the previous selection must not shadow the next click
        await page.evaluate(() => window.__deck.editor.select(null))
        const c = await centerOf(slide.id, el.id)
        await page.mouse.click(c.x, c.y)
        const sel = await selected()
        if (!sel || sel.slideId !== slide.id || sel.elId !== el.id)
          misses.push(`${slide.id}/${el.id} → ${JSON.stringify(sel)}`)
      }
    }
    expect(misses).toEqual([])
    await page.evaluate(() => window.__deck.editor.setRevealHidden(false))
  })

  it('moves an element by dragging and records x/y overrides', async () => {
    await goTo('s1')
    await page.evaluate(() => window.__deck.editor.setSnap(false))
    const before = await overrideOf('s1/title')
    expect(before).toEqual({ y: 360, style: { fontSize: 128 } })
    const c = await centerOf('s1', 'title')
    const s = await page.evaluate(() => window.__deck.scale())
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.move(c.x + 60, c.y + 30, { steps: 4 })
    await page.mouse.move(c.x + 120, c.y + 60, { steps: 4 })
    await page.mouse.up()
    const after = await overrideOf('s1/title')
    expect(after?.x).toBeCloseTo(176 + 120 / s, 0)
    expect(after?.y).toBeCloseTo(360 + 60 / s, 0)
    expect(after?.style).toEqual({ fontSize: 128 })
    const inline = await page.evaluate(
      () =>
        (document.querySelector('[data-slide="s1"] [data-el="title"]') as HTMLElement).style.left,
    )
    expect(inline).toBe(`${after?.x}px`)
    await page.evaluate(() => window.__deck.editor.setSnap(true))
  })

  it('resizes with the south-east handle', async () => {
    await goTo('s2')
    const c = await centerOf('s2', 'card-1')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's2', elId: 'card-1' })
    const s = await page.evaluate(() => window.__deck.scale())
    await page.mouse.move(c.right, c.bottom)
    await page.mouse.down()
    await page.mouse.move(c.right + 30, c.bottom + 15, { steps: 3 })
    await page.mouse.move(c.right + 60, c.bottom + 30, { steps: 3 })
    await page.mouse.up()
    const o = await overrideOf('s2/card-1')
    expect(o?.w).toBeCloseTo(544 + 60 / s, 0)
    expect(o?.h).toBeCloseTo(600 + 30 / s, 0)
    expect(o?.x).toBe(96)
    expect(o?.y).toBe(360)
  })

  it('edits text in place and stores it as a text override without touching slides[]', async () => {
    await goTo('s3')
    const c = await centerOf('s3', 'title')
    await page.mouse.dblclick(c.x, c.y)
    expect(await page.evaluate(() => window.__deck.editor.editingText)).toEqual({
      slideId: 's3',
      elId: 'title',
    })
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => window.__deck.editor.editingText)).toBeNull()
    expect((await overrideOf('s3/title'))?.text).toBe('The truth about revision rounds!')
    const model = await page.evaluate(() => window.__deck.exportModel())
    expect(model.slides[2]?.slots.title).toEqual({
      type: 'text',
      value: 'The truth about revision rounds',
    })
    const dom = await page.evaluate(
      () => document.querySelector('[data-slide="s3"] [data-el="title"]')?.textContent,
    )
    expect(dom).toBe('The truth about revision rounds!')
    expect(await page.locator('[contenteditable="true"]').count()).toBe(0)
  })

  it('changes colour from the panel, then undoes and redoes it', async () => {
    await goTo('s5')
    const c = await centerOf('s5', 'body')
    await page.mouse.click(c.x, c.y)
    await page.evaluate(() => {
      const input = document.querySelector('#ed-color') as HTMLInputElement
      input.value = '#00aa00'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect((await overrideOf('s5/body'))?.style?.color).toBe('#00aa00')
    const colour = () =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-slide="s5"] [data-el="body"]') as Element)
            .color,
      )
    expect(await colour()).toBe('rgb(0, 170, 0)')
    await page.keyboard.press('Control+z')
    expect(await overrideOf('s5/body')).toBeUndefined()
    expect(await colour()).not.toBe('rgb(0, 170, 0)')
    await page.keyboard.press('Control+Shift+z')
    expect((await overrideOf('s5/body'))?.style?.color).toBe('#00aa00')
    expect(await page.evaluate(() => window.__deck.editor.canRedo)).toBe(false)
  })

  it('replaces an image from a local file as a data url', async () => {
    await goTo('s9')
    const c = await centerOf('s9', 'photo')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's9', elId: 'photo' })
    await page.setInputFiles('#ed-image', pixel)
    await page.waitForFunction(() =>
      (window.__deck.exportModel().overrides['s9/photo']?.src ?? '').startsWith(
        'data:image/png;base64,',
      ),
    )
    const src = await page.evaluate(() =>
      document.querySelector('[data-slide="s9"] [data-el="photo"] img')?.getAttribute('src'),
    )
    expect(src).toMatch(/^data:image\/png;base64,/)
    expect(
      await page.evaluate(() => window.__deck.exportModel().slides[8]?.slots.photo),
    ).toMatchObject({ type: 'image' })
  })

  it('hides with Delete, nudges with arrows and keeps hidden elements selectable only when revealed', async () => {
    await goTo('s4')
    const c = await centerOf('s4', 'divider')
    await page.mouse.click(c.x, c.y)
    await page.keyboard.press('Delete')
    expect((await overrideOf('s4/divider'))?.hidden).toBe(true)
    expect(await selected()).toBeNull()
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toBeNull()
    await page.evaluate(() => window.__deck.editor.setRevealHidden(true))
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's4', elId: 'divider' })
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction(() => window.__deck.exportModel().overrides['s4/divider']?.x === 962)
    const o = await overrideOf('s4/divider')
    expect(o).toMatchObject({ x: 962, y: 341, hidden: true })
    await page.evaluate(() => window.__deck.editor.setRevealHidden(false))
  })

  it('has one eye button that hides, and shows again once everything selected is hidden', async () => {
    await goTo('s4')
    // s4/divider is hidden by the previous test; it is selectable only while revealed
    await page.evaluate(() => window.__deck.editor.setRevealHidden(true))
    const c = await centerOf('s4', 'divider')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's4', elId: 'divider' })
    // the toolbar carries a single hide control; the "more" row lost its checkbox
    expect(await page.locator('.ed-float [data-action="hide"]').count()).toBe(1)
    expect(await page.locator('.ed-float [data-prop="hidden"]').count()).toBe(0)
    const eye = page.locator('.ed-float [data-action="hide"]')
    expect(await eye.getAttribute('data-state')).toBe('hidden')
    await eye.click()
    expect((await overrideOf('s4/divider'))?.hidden).toBeUndefined()
    expect(await selected()).toEqual({ slideId: 's4', elId: 'divider' })
    expect(await eye.getAttribute('data-state')).toBe('visible')
    await eye.click()
    expect((await overrideOf('s4/divider'))?.hidden).toBe(true)
    expect(await selected()).toBeNull()
    await page.keyboard.press('Control+z')
    expect((await overrideOf('s4/divider'))?.hidden).toBeUndefined()
    await page.keyboard.press('Control+y')
    expect((await overrideOf('s4/divider'))?.hidden).toBe(true)
    await page.evaluate(() => window.__deck.editor.setRevealHidden(false))
  })

  it('keeps every override the schema accepts and leaves generated content untouched', async () => {
    const model = await page.evaluate(() => window.__deck.exportModel())
    expect(validateDeck(model).ok).toBe(true)
    expect(model.slides).toEqual(deck.slides)
    expect(Object.keys(model.overrides)).toEqual([...Object.keys(model.overrides)].sort())
  })

  it('sets a reveal step from the panel: it lands in slides[].elements, never in overrides', async () => {
    await goTo('s2')
    const c = await centerOf('s2', 'card-2')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's2', elId: 'card-2' })
    const before = JSON.stringify(await overridesOf())
    await openMore()
    await page.locator('[data-el-step]').fill('2')
    await page.locator('[data-el-step]').press('Tab')
    await page.waitForFunction(
      () =>
        window.__deck.exportModel().slides[1]?.elements.find((e) => e.id === 'card-2')?.step === 2,
    )
    expect(JSON.stringify(await overridesOf())).toBe(before)
    expect(await page.evaluate(() => window.__deck.steps(1))).toBe(2)
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-slide="s2"] [data-el="card-2"]')?.getAttribute('data-step'),
      ),
    ).toBe('2')
    // while editing, step elements stay visible (static mode)
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('[data-slide="s2"] [data-el="card-2"]') as Element,
          ).visibility,
      ),
    ).toBe('visible')
    await page.locator('[data-el-step]').fill('0')
    await page.locator('[data-el-step]').press('Tab')
    await page.waitForFunction(
      () =>
        window.__deck.exportModel().slides[1]?.elements.find((e) => e.id === 'card-2')?.step ===
        undefined,
    )
    // leave the panel: later tests type keys and expect them to reach the stage
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  })

  it('sets an entrance from the panel: it lands next to step in slides[].elements and stamps data-enter', async () => {
    await goTo('s2')
    await page.evaluate(() => window.__deck.editor.select('card-3'))
    await openMore()
    await page.locator('[data-el-enter]').selectOption('wipe')
    await page.waitForFunction(
      () =>
        window.__deck.exportModel().slides[1]?.elements.find((e) => e.id === 'card-3')?.enter ===
        'wipe',
    )
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-slide="s2"] [data-el="card-3"]')?.getAttribute('data-enter'),
      ),
    ).toBe('wipe')
    expect(await page.locator('[data-el-enter]').inputValue()).toBe('wipe')
    await page.locator('[data-el-enter]').selectOption('')
    await page.waitForFunction(
      () =>
        window.__deck.exportModel().slides[1]?.elements.find((e) => e.id === 'card-3')?.enter ===
        undefined,
    )
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-slide="s2"] [data-el="card-3"]')?.hasAttribute('data-enter'),
      ),
    ).toBe(false)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  })

  it('lists the pages in a sidebar: hide, reorder, hotkeys and undo write deck.pages, never slides[]', async () => {
    await goTo('s1')
    const storyIds = deck.slides.map((s) => s.id)
    // thumbnails are real slides and may contain lists of their own: count the rail rows only
    expect(await page.locator('.ed-pages li[data-page]').count()).toBe(storyIds.length)
    const slidesBefore = JSON.stringify(
      await page.evaluate(() => window.__deck.exportModel().slides),
    )
    await page.locator('.ed-pages li[data-page="s2"] button[data-page-action="toggle"]').click()
    await page.waitForFunction(
      () => window.__deck.exportModel().pages?.hidden?.includes('s2') === true,
    )
    expect(await page.evaluate(() => window.__deck.ids)).not.toContain('s2')
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-slide="s2"]')?.getAttribute('data-hidden-slide'),
      ),
    ).toBe('true')
    await page.locator('.ed-pages li[data-page="s3"] button[data-page-action="up"]').click()
    await page.waitForFunction(() => window.__deck.exportModel().pages?.order?.[1] === 's3')
    expect(await page.evaluate(() => window.__deck.exportModel().pages)).toEqual({
      order: ['s1', 's3', 's2', 's4', 's5', 's6', 's7', 's8', 's9'],
      hidden: ['s2'],
    })
    expect(await page.evaluate(() => window.__deck.ids.slice(0, 2))).toEqual(['s1', 's3'])
    expect(await page.locator('.ed-pages-note').isHidden()).toBe(false)
    // hotkeys act on the current slide
    await page.evaluate(() => window.__deck.go('s4'))
    await page.keyboard.press('Control+Shift+ArrowUp')
    await page.waitForFunction(() => window.__deck.exportModel().pages?.order?.indexOf('s4') === 2)
    await page.keyboard.press('Control+Shift+H')
    await page.waitForFunction(
      () => window.__deck.exportModel().pages?.hidden?.includes('s4') === true,
    )
    expect(await page.evaluate(() => window.__deck.ids)).not.toContain('s4')
    // undo walks back through the page changes too
    for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z')
    await page.waitForFunction(() => window.__deck.exportModel().pages === undefined)
    expect(await page.evaluate(() => window.__deck.ids)).toEqual(storyIds)
    expect(JSON.stringify(await page.evaluate(() => window.__deck.exportModel().slides))).toBe(
      slidesBefore,
    )
    expect(await page.locator('.ed-pages-note').isHidden()).toBe(true)
  })

  it('paints a live thumbnail for every page and greys out hidden ones', async () => {
    await goTo('s1')
    const ids = deck.slides.map((s) => s.id)
    const thumbs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ed-pages li[data-page]')).map((li) => {
        const clone = li.querySelector('.ed-thumb > .slide') as HTMLElement | null
        return {
          page: (li as HTMLElement).dataset.page,
          slide: clone?.getAttribute('data-slide') ?? null,
          width: clone?.getBoundingClientRect().width ?? 0,
        }
      }),
    )
    expect(thumbs.map((t) => t.page)).toEqual(ids)
    for (const t of thumbs) {
      expect(t.slide).toBe(t.page)
      expect(t.width).toBeGreaterThan(100)
      expect(t.width).toBeLessThan(220)
    }
    // the thumbnail is the real slide: an override shows up in it
    await goTo('s3')
    await page.evaluate(() => window.__deck.editor.set('title', { hidden: true }))
    await page.waitForFunction(
      () =>
        document
          .querySelector('.ed-pages li[data-page="s3"] .ed-thumb [data-el="title"]')
          ?.getAttribute('data-hidden') === 'true',
    )
    await page.evaluate(() => window.__deck.editor.reset('title'))
    await page.waitForFunction(
      () =>
        !document
          .querySelector('.ed-pages li[data-page="s3"] .ed-thumb [data-el="title"]')
          ?.hasAttribute('data-hidden'),
    )
    // hidden pages are marked in the rail and come back with undo
    await page.locator('.ed-pages li[data-page="s2"] button[data-page-action="toggle"]').click()
    await page.waitForFunction(() =>
      document.querySelector('.ed-pages li[data-page="s2"]')?.classList.contains('is-hidden'),
    )
    expect(await page.locator('.ed-pages li[data-page="s2"] .ed-page-no').textContent()).toBe('－')
    await page.keyboard.press('Control+z')
    await page.waitForFunction(() => window.__deck.exportModel().pages === undefined)
    expect(
      await page.evaluate(() =>
        document.querySelector('.ed-pages li[data-page="s2"]')?.classList.contains('is-hidden'),
      ),
    ).toBe(false)
  })

  it('shows the floating toolbar next to the selection and hides it when nothing is selected', async () => {
    await goTo('s1')
    expect(await page.locator('.ed-float').isHidden()).toBe(true)
    const c = await centerOf('s1', 'title')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's1', elId: 'title' })
    expect(await page.locator('.ed-float').isVisible()).toBe(true)
    const r = await page.evaluate(() => {
      const rect = (sel: string) => {
        const b = (document.querySelector(sel) as Element).getBoundingClientRect()
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
      }
      return {
        f: rect('.ed-float'),
        el: rect('[data-slide="s1"] [data-el="title"]'),
        barBottom: rect('.ed-topbar').bottom,
        railRight: rect('.ed-pages').right,
        vw: window.innerWidth,
        vh: window.innerHeight,
      }
    })
    // never over the element it edits, never under the toolbar or the rail, never off-screen
    expect(r.f.top >= r.el.bottom || r.f.bottom <= r.el.top).toBe(true)
    expect(r.f.top).toBeGreaterThanOrEqual(r.barBottom)
    expect(r.f.left).toBeGreaterThanOrEqual(r.railRight)
    expect(r.f.right).toBeLessThanOrEqual(r.vw)
    expect(r.f.bottom).toBeLessThanOrEqual(r.vh)
    // it names the element and shows the controls for its kind
    expect(await page.locator('.ed-float [data-field="key"]').textContent()).toBe('Page 1 · title')
    expect(await page.locator('.ed-float [data-palette="color"]').isVisible()).toBe(true)
    expect(
      await page
        .locator('.ed-float .ed-image-only')
        .evaluateAll((ns) => ns.every((n) => (n as HTMLElement).hidden)),
    ).toBe(true)
    // the field shows the effective size (the sample deck overrides this title to 128px) and −/＋ step it
    expect(await page.locator('.ed-float [data-style="fontSize"]').inputValue()).toBe('128')
    await page.locator('.ed-float [data-size-step="2"]').click()
    expect((await overrideOf('s1/title'))?.style?.fontSize).toBe(130)
    await page.keyboard.press('Control+z')
    await page.evaluate(() => window.__deck.editor.select(null))
    expect(await page.locator('.ed-float').isHidden()).toBe(true)
  })

  it('toggles italic, underline and bold; the result passes the schema and reaches the DOM', async () => {
    await goTo('s5')
    const c = await centerOf('s5', 'body')
    await page.mouse.click(c.x, c.y)
    await page.locator('.ed-float [data-toggle-style="fontStyle"]').click()
    await page.locator('.ed-float [data-toggle-style="textDecoration"]').click()
    await page.locator('.ed-float [data-toggle-style="fontWeight"]').click()
    // (an earlier test left a colour on this element; the toggles add to it)
    expect((await overrideOf('s5/body'))?.style).toMatchObject({
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontWeight: 700,
    })
    const cs = await page.evaluate(() => {
      const s = getComputedStyle(
        document.querySelector('[data-slide="s5"] [data-el="body"]') as Element,
      )
      return {
        fontStyle: s.fontStyle,
        textDecoration: s.textDecorationLine,
        fontWeight: s.fontWeight,
      }
    })
    expect(cs).toEqual({ fontStyle: 'italic', textDecoration: 'underline', fontWeight: '700' })
    expect(validateDeck(await page.evaluate(() => window.__deck.exportModel())).ok).toBe(true)
    expect(
      await page.locator('.ed-float [data-toggle-style="fontStyle"]').getAttribute('class'),
    ).toContain('is-on')
    // a second press clears each key
    await page.locator('.ed-float [data-toggle-style="fontStyle"]').click()
    await page.locator('.ed-float [data-toggle-style="textDecoration"]').click()
    await page.locator('.ed-float [data-toggle-style="fontWeight"]').click()
    const cleared = (await overrideOf('s5/body'))?.style ?? {}
    expect(cleared.fontStyle).toBeUndefined()
    expect(cleared.textDecoration).toBeUndefined()
    expect(cleared.fontWeight).toBeUndefined()
  })

  it('offers the theme colours as swatches and the theme fonts in the font menu', async () => {
    await goTo('s5')
    await page.evaluate(() => window.__deck.editor.select('body'))
    const colours = await page.evaluate(() => window.__deck.editor.themeColors())
    expect(colours.length).toBeGreaterThan(3)
    // one button per property shows the current colour; its palette lists every theme token by name
    const btn = page.locator('.ed-float [data-palette="color"]')
    expect(await btn.isVisible()).toBe(true)
    expect(await page.evaluate(() => window.__deck.editor.paletteOpen)).toBeNull()
    await btn.click()
    expect(await page.evaluate(() => window.__deck.editor.paletteOpen)).toBe('color')
    const pal = page.locator('.ed-palette[data-palette="color"]')
    expect(await pal.isVisible()).toBe(true)
    const chips = pal.locator('.ed-chip[data-swatch-for="color"][data-color]:not([data-color=""])')
    expect(await chips.count()).toBe(colours.length)
    const first = await chips.first().getAttribute('data-color')
    expect(first).toBe(colours[0]?.value)
    expect(await chips.first().locator('span').textContent()).toBe(colours[0]?.name)
    expect(await chips.first().locator('small').textContent()).toBe(colours[0]?.use)
    await chips.first().click()
    expect((await overrideOf('s5/body'))?.style?.color).toBe(first)
    expect(await chips.first().getAttribute('class')).toContain('is-on')
    expect(await btn.locator('.ed-colour-name').textContent()).toBe(colours[0]?.name)
    // the palette stays open for another pick; "theme default" removes the override
    expect(await page.evaluate(() => window.__deck.editor.paletteOpen)).toBe('color')
    await pal.locator('.ed-chip-clear[data-swatch-for="color"]').click()
    expect((await overrideOf('s5/body'))?.style?.color).toBeUndefined()
    // Esc closes it; the custom picker lives inside it (#ed-color, exercised above)
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => window.__deck.editor.paletteOpen)).toBeNull()
    expect(await pal.isHidden()).toBe(true)
    expect(await page.locator('#ed-color').count()).toBe(1)
    // fonts: the first option is the theme's display font, read from --font-display
    const display = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(),
    )
    const select = page.locator('.ed-float select[data-style="fontFamily"]')
    expect(await select.locator('option').nth(1).textContent()).toBe('Theme display font')
    await select.selectOption({ index: 1 })
    expect((await overrideOf('s5/body'))?.style?.fontFamily).toBe(display)
    await select.selectOption('')
    expect((await overrideOf('s5/body'))?.style?.fontFamily).toBeUndefined()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  })

  it('pairs a slider with every number field; opacity is shown as a percentage', async () => {
    await goTo('s5')
    await page.evaluate(() => window.__deck.editor.select('body'))
    await openMore()
    // the fields show what the page renders, so a slider starts from the real value
    const lh = page.locator('.ed-float [data-style="lineHeight"]')
    const lhRange = page.locator('.ed-float [data-style-range="lineHeight"]')
    expect(Number(await lh.inputValue())).toBeGreaterThan(0.5)
    expect(await lhRange.inputValue()).toBe(await lh.inputValue())
    await lhRange.fill('1.6')
    await lhRange.dispatchEvent('input')
    await lhRange.dispatchEvent('change')
    expect((await overrideOf('s5/body'))?.style?.lineHeight).toBe(1.6)
    expect(await lh.inputValue()).toBe('1.6')
    // opacity: the field and slider say 60, the override is 0.6
    const op = page.locator('.ed-float [data-style="opacity"]')
    expect(await op.inputValue()).toBe('100')
    await op.fill('60')
    await op.dispatchEvent('change')
    expect((await overrideOf('s5/body'))?.style?.opacity).toBe(0.6)
    expect(await page.locator('.ed-float [data-style-range="opacity"]').inputValue()).toBe('60')
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-slide="s5"] [data-el="body"]') as Element)
            .opacity,
      ),
    ).toBe('0.6')
    for (const prop of ['letterSpacing', 'borderRadius'])
      expect(await page.locator(`.ed-float [data-style-range="${prop}"]`).count()).toBe(1)
    // the toolbar names its groups and the element's page
    expect(await page.locator('.ed-float [data-field="key"]').textContent()).toBe('Page 5 · body')
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('.ed-float .ed-float-row[data-title]')).map(
          (r) => (r as HTMLElement).dataset.title,
        ),
      ),
    ).toEqual([
      'Text',
      'Text style',
      'Content',
      'Expandable content',
      'Element',
      'Arrange',
      'Position and size',
      'Appearance',
      'Animation',
      'Expandable content',
    ])
    await page.evaluate(() => window.__deck.editor.undo())
    await page.evaluate(() => window.__deck.editor.undo())
    expect((await overrideOf('s5/body'))?.style?.opacity).toBeUndefined()
    await page.evaluate(() => window.__deck.editor.setMore(false))
  })

  it('selects several elements with Shift, a marquee and Ctrl+A, then aligns and distributes them', async () => {
    await goTo('s2')
    await page.evaluate(() => window.__deck.editor.setSnap(false))
    const c1 = await centerOf('s2', 'card-1')
    const c2 = await centerOf('s2', 'card-2')
    const c3 = await centerOf('s2', 'card-3')
    await page.mouse.click(c1.x, c1.y)
    await page.keyboard.down('Shift')
    await page.mouse.click(c2.x, c2.y)
    await page.mouse.click(c3.x, c3.y)
    await page.keyboard.up('Shift')
    expect((await page.evaluate(() => window.__deck.editor.selection)).map((s) => s.elId)).toEqual([
      'card-1',
      'card-2',
      'card-3',
    ])
    expect(await selected()).toEqual({ slideId: 's2', elId: 'card-3' })
    expect(await page.locator('.ed-box.is-multi').count()).toBe(1)
    expect(await page.locator('.ed-box-thin').count()).toBe(3)
    expect(await page.locator('.ed-float [data-field="key"]').textContent()).toBe(
      'Page 2 · 3 elements',
    )
    // arrow keys move all three
    const ys = () =>
      page.evaluate(() =>
        ['card-1', 'card-2', 'card-3'].map(
          (id) =>
            (document.querySelector(`[data-slide="s2"] [data-el="${id}"]`) as HTMLElement)
              .offsetTop,
        ),
      )
    const before = await ys()
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction(() => window.__deck.exportModel().overrides['s2/card-3']?.y != null)
    expect(await ys()).toEqual(before.map((y) => y + 1))
    await page.waitForTimeout(300) // the nudge commits after a short pause; keep it its own history step
    // nudge card-2 down alone, then align the three to the top edge of their union
    await page.evaluate(() => window.__deck.editor.set('card-2', { y: 420 }))
    await page.evaluate(() => window.__deck.editor.selectMany(['card-1', 'card-2', 'card-3']))
    await page.locator('.ed-float [data-align="top"]').click()
    const aligned = await ys()
    expect(new Set(aligned).size).toBe(1)
    expect(aligned[0]).toBe((before[0] ?? 0) + 1)
    // push card-2 to the right, then distribute horizontally: equal gaps, outer two stay
    const xs = () =>
      page.evaluate(() =>
        ['card-1', 'card-2', 'card-3'].map((id) => {
          const el = document.querySelector(`[data-slide="s2"] [data-el="${id}"]`) as HTMLElement
          return { x: el.offsetLeft, w: el.offsetWidth }
        }),
      )
    const startXs = await xs()
    await page.evaluate((x) => window.__deck.editor.set('card-2', { x }), (startXs[1]?.x ?? 0) + 30)
    await page.evaluate(() => window.__deck.editor.selectMany(['card-1', 'card-2', 'card-3']))
    await page.locator('.ed-float [data-distribute="h"]').click()
    const after = await xs()
    expect(after[0]).toEqual(startXs[0])
    expect(after[2]).toEqual(startXs[2])
    const gap1 = (after[1]?.x ?? 0) - ((after[0]?.x ?? 0) + (after[0]?.w ?? 0))
    const gap2 = (after[2]?.x ?? 0) - ((after[1]?.x ?? 0) + (after[1]?.w ?? 0))
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1)
    // marquee: drag from empty stage space below-left of the cards across their lower edge
    await page.evaluate(() => window.__deck.editor.select(null))
    const toClient = (x: number, y: number) =>
      page.evaluate(
        ([sx, sy]) => {
          const r = (document.querySelector('.deck-stage') as HTMLElement).getBoundingClientRect()
          const s = window.__deck.scale()
          return { x: r.left + sx * s, y: r.top + sy * s }
        },
        [x, y] as const,
      )
    const empty = await toClient(60, 1000)
    expect(
      await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-el]') == null,
        [empty.x, empty.y] as const,
      ),
    ).toBe(true)
    const end = await toClient(1900, 900)
    await page.mouse.move(empty.x, empty.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 5 })
    await page.mouse.up()
    expect((await page.evaluate(() => window.__deck.editor.selection)).map((s) => s.elId)).toEqual([
      'card-1',
      'card-2',
      'card-3',
    ])
    // a plain click on empty space clears the selection
    await page.mouse.click(empty.x, empty.y)
    expect(await selected()).toBeNull()
    // Ctrl+A selects every visible element on the slide
    await page.keyboard.press('Control+a')
    const all = await page.evaluate(() => window.__deck.editor.selection.length)
    expect(all).toBe(deck.slides[1]?.elements.length)
    await page.evaluate(() => window.__deck.editor.select(null))
    // undo walks back: distribute, move, align, nudge, arrow
    for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z')
    expect(await ys()).toEqual(before)
    await page.evaluate(() => window.__deck.editor.setSnap(true))
  })

  it('brings to front and sends to back, and copies a style from one element to another', async () => {
    await goTo('s2')
    await page.evaluate(() => window.__deck.editor.select('card-1'))
    await page.evaluate(() => window.__deck.editor.setMore(true))
    await page.locator('.ed-float [data-z="front"]').click()
    expect((await overrideOf('s2/card-1'))?.z).toBe(1)
    await page.locator('.ed-float [data-z="back"]').click()
    expect((await overrideOf('s2/card-1'))?.z).toBe(-1)
    await page.evaluate(() => window.__deck.editor.set('card-1', { z: null }))
    await page.evaluate(() => window.__deck.editor.setMore(false))
    // copy style: colour body, copy, paste onto the title
    await goTo('s5')
    await page.evaluate(() => window.__deck.editor.reset('body'))
    await page.evaluate(() => window.__deck.editor.select('body'))
    await page.evaluate(() => window.__deck.editor.set('body', { style: { color: '#00aa00' } }))
    await page.keyboard.press('Control+Alt+c')
    expect(await page.evaluate(() => window.__deck.editor.copiedStyle)).toEqual({
      color: '#00aa00',
    })
    await page.evaluate(() => window.__deck.editor.select('title'))
    await page.keyboard.press('Control+Alt+v')
    expect((await overrideOf('s5/title'))?.style).toEqual({ color: '#00aa00' })
    await page.evaluate(() => window.__deck.editor.reset('title'))
    await page.evaluate(() => window.__deck.editor.reset('body'))
  })

  it('keeps a draft in localStorage without a dev server and offers to restore it', async () => {
    await goTo('s1')
    const edited = JSON.stringify(await overridesOf())
    expect(edited).not.toBe(JSON.stringify(deck.overrides))
    const key = await page.evaluate(() => window.__deck.editor.draftKey)
    expect(await page.evaluate((k) => localStorage.getItem(k) != null, key)).toBe(true)
    await page.reload()
    await page.waitForFunction(() => window.__deck?.editor?.active === true)
    await page.waitForSelector('.ed-draft')
    // the file itself is untouched: the reload shows the original overrides until we restore
    expect(await overridesOf()).toEqual(deck.overrides)
    await page.locator('.ed-draft [data-draft="restore"]').click()
    expect(await page.locator('.ed-draft').count()).toBe(0)
    expect(JSON.stringify(await overridesOf())).toBe(edited)
    expect(await page.evaluate(() => window.__deck.editor.canUndo)).toBe(true)
    await page.keyboard.press('Control+z')
    expect(JSON.stringify(await overridesOf())).not.toBe(edited)
    // back at the loaded state, the draft is gone: a reload offers nothing
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull()
    await page.reload()
    await page.waitForFunction(() => window.__deck?.editor?.active === true)
    await page.waitForTimeout(50)
    expect(await page.locator('.ed-draft').count()).toBe(0)
    // discard path
    await page.evaluate(() => window.__deck.editor.set('title', { x: 200 }))
    await page.reload()
    await page.waitForFunction(() => window.__deck?.editor?.active === true)
    await page.waitForSelector('.ed-draft')
    await page.locator('.ed-draft [data-draft="discard"]').click()
    expect(await page.locator('.ed-draft').count()).toBe(0)
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull()
    expect((await overrideOf('s1/title'))?.x).toBeUndefined()
  })

  it('leaves no chrome behind on exit and hands navigation back', async () => {
    await goTo('s1')
    await page.keyboard.press('e')
    await page.waitForFunction(() => window.__deck.editor.active === false)
    expect(
      await page
        .locator(
          '.ed-panel, .ed-topbar, .ed-float, .ed-pages, .ed-overlay, .ed-draft, .ed-hint, [contenteditable="true"], .ed-editing',
        )
        .count(),
    ).toBe(0)
    // the stage takes the whole viewport again
    expect(
      await page.evaluate(() => document.querySelector('.deck-stage')?.getBoundingClientRect().top),
    ).toBe(0)
    expect(await page.evaluate(() => document.body.className)).toBe('')
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => window.__deck.current)).toBe(1)
    await page.keyboard.press('e')
    await page.waitForFunction(() => window.__deck.editor.active === true)
    expect(await page.locator('.ed-panel').count()).toBe(1)
  })

  it('Esc leaves playback for the editor, but only once the runtime has nothing left to close', async () => {
    await page.evaluate(() => window.__deck.editor.exit())
    await page.waitForFunction(() => document.documentElement.dataset.interactive === 'true')
    await page.evaluate(() => window.__deck.go('s9'))
    const img = '[data-slide="s9"] [data-el="photo"] > img'
    await page.click(img, { position: { x: 8, y: 8 } })
    await page.waitForSelector('.deck-lightbox')
    // the runtime claims this Esc for the lightbox; the editor stays out
    await page.keyboard.press('Escape')
    await page.waitForSelector('.deck-lightbox', { state: 'detached' })
    expect(await page.evaluate(() => window.__deck.editor.active)).toBe(false)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.__deck.editor.active === true)
    // inside the editor Esc only clears the selection
    await goTo('s1')
    const c = await centerOf('s1', 'title')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's1', elId: 'title' })
    await page.keyboard.press('Escape')
    expect(await selected()).toBeNull()
    expect(await page.evaluate(() => window.__deck.editor.active)).toBe(true)
    // the presenter window only ever plays
    const presenter = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await presenter.goto(`${url}?presenter=1#1`)
    await presenter.waitForFunction(() => Boolean(window.__deck?.isPresenter))
    await presenter.keyboard.press('Escape')
    await presenter.waitForTimeout(100)
    expect(await presenter.evaluate(() => window.__deck.editor.active)).toBe(false)
    await presenter.close()
  })

  it('the toolbar switch writes deck.motion, tells the dev client and stays out of undo', async () => {
    await page.evaluate(() => {
      const w = window as unknown as { __edits: number }
      w.__edits = 0
      document.addEventListener('deck:edit', () => {
        w.__edits++
      })
    })
    const edits = () => page.evaluate(() => (window as unknown as { __edits: number }).__edits)
    // the native checkbox is visually hidden behind its label, so the label takes the click
    const box = page.locator('.ed-topbar [data-toggle="motion"]')
    const label = page.locator('.ed-topbar label:has([data-toggle="motion"])')
    expect(await box.isChecked()).toBe(true)
    expect(await page.evaluate(() => window.__deck.exportModel().motion)).toBeUndefined()
    await label.click()
    expect(await box.isChecked()).toBe(false)
    expect(await page.evaluate(() => window.__deck.exportModel().motion)).toBe('off')
    expect(await page.evaluate(() => window.__deck.motion)).toBe(false)
    expect(await edits()).toBe(1)
    await page.keyboard.press('Control+z')
    expect(await page.evaluate(() => window.__deck.exportModel().motion)).toBe('off')
    await page.keyboard.press('Control+y')
    await label.click()
    expect(await box.isChecked()).toBe(true)
    expect(await page.evaluate(() => window.__deck.exportModel().motion)).toBeUndefined()
    expect(await page.evaluate(() => window.__deck.motion)).toBe(true)
    expect(await edits()).toBe(2)
  })

  it('the toolbar picks the page transition: written to deck.transition, applied live, theme default clears it', async () => {
    await goTo('s1')
    const select = page.locator('.ed-topbar [data-transition]')
    const stageAttr = () =>
      page.evaluate(() => document.querySelector('.deck-stage')?.getAttribute('data-transition'))
    // the sample deck names no transition, so the menu shows the theme default and the stage plays fade
    expect(await select.inputValue()).toBe('')
    expect(await stageAttr()).toBe('fade')
    await select.selectOption('push')
    expect(await page.evaluate(() => window.__deck.exportModel().transition)).toBe('push')
    expect(await stageAttr()).toBe('push')
    expect(await page.evaluate(() => window.__deck.transition)).toBe('push')
    await select.selectOption('none')
    expect(await stageAttr()).toBeNull()
    expect(await page.evaluate(() => window.__deck.transition)).toBe('none')
    await select.selectOption('')
    expect(await page.evaluate(() => window.__deck.exportModel().transition)).toBeUndefined()
    expect(await stageAttr()).toBe('fade')
  })

  it('docks the element toolbar on the right as a column and remembers the choice', async () => {
    await goTo('s1')
    expect(await page.evaluate(() => window.__deck.editor.docked)).toBe(false)
    await page.locator('.ed-topbar label:has([data-toggle="dock"])').click()
    expect(await page.evaluate(() => window.__deck.editor.docked)).toBe(true)
    // the column is there with nothing selected, and the stage moved over to make room
    const empty = await page.evaluate(() => {
      const rect = (sel: string) => {
        const b = (document.querySelector(sel) as Element).getBoundingClientRect()
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width }
      }
      const f = document.querySelector('.ed-float') as HTMLElement
      return {
        hidden: f.hidden,
        empty: f.dataset.empty,
        float: rect('.ed-float'),
        stage: rect('.deck-stage'),
        barBottom: rect('.ed-topbar').bottom,
        vw: window.innerWidth,
      }
    })
    expect(empty.hidden).toBe(false)
    expect(empty.empty).toBe('true')
    expect(empty.float.right).toBe(empty.vw)
    expect(empty.float.width).toBeGreaterThanOrEqual(300)
    expect(Math.abs(empty.float.top - empty.barBottom)).toBeLessThanOrEqual(2)
    expect(empty.stage.right).toBeLessThanOrEqual(empty.vw - empty.float.width + 1)
    // with a selection every row is open, "more" is gone, and edits work as before
    const c = await centerOf('s1', 'title')
    await page.mouse.click(c.x, c.y)
    expect(await selected()).toEqual({ slideId: 's1', elId: 'title' })
    expect(await page.locator('.ed-float [data-field="key"]').textContent()).toBe('Page 1 · title')
    expect(await page.locator('.ed-float .ed-float-more').isVisible()).toBe(true)
    expect(await page.locator('.ed-float .ed-float-arrange').isVisible()).toBe(true)
    expect(await page.locator('.ed-float [data-action="more"]').isVisible()).toBe(false)
    expect(
      await page.evaluate(() => {
        const r = (document.querySelector('.ed-float') as HTMLElement).getBoundingClientRect()
        return r.right === window.innerWidth
      }),
    ).toBe(true)
    await page.locator('.ed-float [data-size-step="2"]').click()
    expect((await overrideOf('s1/title'))?.style?.fontSize).toBe(130)
    await page.keyboard.press('Control+z')
    // the preference is the browser's, not the deck's, and survives a reload
    expect(await page.evaluate(() => localStorage.getItem('slide-editor:toolbar'))).toBe('docked')
    expect(await page.evaluate(() => window.__deck.exportModel())).not.toHaveProperty('toolbar')
    await page.evaluate(() => localStorage.removeItem(window.__deck.editor.draftKey))
    await page.reload()
    await page.waitForFunction(() => window.__deck?.editor?.active === true)
    expect(await page.evaluate(() => window.__deck.editor.docked)).toBe(true)
    expect(await page.locator('.ed-topbar [data-toggle="dock"]').isChecked()).toBe(true)
    // floating again: the toolbar follows the selection and the stage gets the room back
    await page.evaluate(() => window.__deck.editor.setDocked(false))
    expect(await page.locator('.ed-float').isHidden()).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('slide-editor:toolbar'))).toBe('floating')
    const back = await page.evaluate(() => ({
      stageRight: (document.querySelector('.deck-stage') as HTMLElement).getBoundingClientRect()
        .right,
      vw: window.innerWidth,
    }))
    expect(back.stageRight).toBeGreaterThan(back.vw - 300)
    const c2 = await centerOf('s1', 'title')
    await page.mouse.click(c2.x, c2.y)
    expect(await page.locator('.ed-float').isVisible()).toBe(true)
    expect(await page.locator('.ed-float [data-action="more"]').isVisible()).toBe(true)
    expect(
      await page.evaluate(() =>
        document.querySelector('.ed-float')?.getAttribute('data-placement'),
      ),
    ).not.toBe('docked')
  })
})

describe('editor source', () => {
  it('knows nothing about themes or layouts', () => {
    const src = readFileSync(resolve('src/editor/editor.js'), 'utf8')
    for (const banned of [
      'ink-paper',
      'data-layout',
      'data-role',
      'cover',
      'closing',
      'comparison',
      'cards',
      'statement',
      'photo',
    ]) {
      expect(src).not.toContain(banned)
    }
  })
})
