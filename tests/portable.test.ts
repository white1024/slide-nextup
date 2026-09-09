import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Deck, parseDeck } from '../src/model/deck.ts'
import { type ElementBox, measureSlide, waitForFit } from '../src/qa/measure.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const outDir = resolve('artifacts', 'preflight', 'portable-test')

interface DeckApi {
  model: Deck
  motion: boolean
  setMotion: (on: boolean, remember: boolean) => void
  steps: (i?: number) => number
  exportModel: () => Deck
  editor: {
    active: boolean
    select: (elId: string | null) => void
    set: (elId: string, patch: Record<string, unknown>) => void
    portableHtml: () => string | null
  }
}
/** the page's globals, as this test reads them (editor.test.ts declares its own shape) */
type W = { __deck: DeckApi; __pristine?: string }

let browser: Browser

beforeAll(async () => {
  mkdirSync(outDir, { recursive: true })
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
})

function sample(): Deck {
  const r = parseDeck(readFileSync(resolve('examples/deck.sample.json'), 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.deck
}

async function open(file: string, query = ''): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`${pathToFileURL(file).href}${query}`)
  await page.waitForFunction(() => Boolean((window as unknown as Partial<W>).__deck))
  return page
}

const byKey = (boxes: ElementBox[]) => new Map(boxes.map((b) => [`${b.slide}/${b.el}`, b]))

describe('Download deck.html without a dev server', () => {
  it('saves the page with its edits as a file that opens the same way, and can be saved again', async () => {
    const deck = sample()
    const first = deck.slides[0]
    if (!first) throw new Error('the sample deck has no slides')
    const texts = first.elements.filter((e) => e.kind === 'text').map((e) => e.id)
    const moved = texts[0]
    const hidden = texts[1]
    if (!moved || !hidden) throw new Error('the first slide needs two text elements')
    const stepped: string =
      first.elements.find((e) => e.id !== moved && e.id !== hidden)?.id ?? moved

    const original = join(outDir, 'deck.html')
    writeFileSync(
      original,
      renderDeckDocument(deck, { deckDir: resolve('examples'), outDir }).html,
      'utf8',
    )
    const editing = await open(original, '?edit=1#1')
    await editing.waitForFunction(() => (window as unknown as W).__deck.editor.active)
    // the renderer kept the untouched document for the export
    expect(await editing.evaluate(() => typeof (window as unknown as W).__pristine)).toBe('string')

    // edits of every kind the file has to carry: an override, a hidden element, a reveal step,
    // the page transition and the motion switch
    await editing.evaluate(
      ([m, h, s]) => {
        const d = (window as unknown as W).__deck
        d.editor.set(m, { x: 240, y: 300, w: 1200, style: { color: '#ff0000' } })
        d.editor.set(h, { hidden: true })
        d.editor.select(null)
        const el = d.model.slides[0]?.elements.find((e) => e.id === s)
        if (el) el.step = 1
        d.model.transition = 'lift'
        const second = d.model.slides[1]
        if (second) second.transition = 'breath'
        d.model.motion = 'off'
      },
      [moved, hidden, stepped] as const,
    )
    // the button is there without a dev server, and hands the file to the browser as a download
    const button = editing.locator('.ed-topbar [data-action="download-html"]')
    await expect.poll(() => button.isHidden()).toBe(false)
    const [download] = await Promise.all([editing.waitForEvent('download'), button.click()])
    expect(download.suggestedFilename()).toBe(`${deck.id}.html`)
    await expect
      .poll(() => editing.locator('.ed-topbar [data-status]').textContent())
      .toContain('Saved with your edits')

    const html = await editing.evaluate(() => (window as unknown as W).__deck.editor.portableHtml())
    expect(html).not.toBeNull()
    expect(html?.startsWith('<!doctype html>\n<html')).toBe(true)
    expect(html).toContain('id="deck-model" data-edited="true"')
    expect(html).toContain('id="deck-pristine"')
    expect(html).toContain('data-motion="off"')
    // the editor's chrome never reaches the page markup (its stylesheet in the head and its source
    // further down name their own classes, so only the body up to the model is looked at)
    const text = html ?? ''
    const markup = text.slice(
      text.indexOf('<body'),
      text.indexOf('<script type="application/json"'),
    )
    expect(markup).toContain('<section class="slide"')
    expect(markup).not.toContain('ed-topbar')
    expect(markup).not.toContain('ed-active')
    expect(markup).not.toContain('contenteditable')

    const saved = join(outDir, 'saved.html')
    writeFileSync(saved, html ?? '', 'utf8')
    const reopened = await open(saved)
    const state = await reopened.evaluate(
      ([m, h, s]) => {
        const w = window as unknown as W
        const el = (id: string) =>
          document.querySelector(`[data-slide="s1"] [data-el="${id}"]`) as HTMLElement
        const script = document.getElementById('deck-model') as HTMLElement
        // the file opens with motion off (every step shows at once, so the player counts none);
        // switching it on for this browser shows whether the step was rescanned
        const motionAttr = document.documentElement.dataset.motion
        const motion = w.__deck.motion
        w.__deck.setMotion(true, false)
        return {
          left: el(m).style.left,
          top: el(m).style.top,
          width: el(m).style.width,
          color: el(m).style.color,
          hidden: el(h).getAttribute('data-hidden'),
          step: el(s).getAttribute('data-step'),
          steps: w.__deck.steps(0),
          transition: (document.querySelector('.deck-stage') as HTMLElement).dataset.transition,
          pageTransition: (document.querySelector('[data-slide="s2"]') as HTMLElement).dataset
            .transition,
          motionAttr,
          motion,
          modelOverride: JSON.parse(script.textContent ?? '{}').overrides[`s1/${m}`],
          pristine: typeof w.__pristine,
        }
      },
      [moved, hidden, stepped] as const,
    )
    expect(state.left).toBe('240px')
    expect(state.top).toBe('300px')
    expect(state.width).toBe('1200px')
    expect(state.color).toBe('rgb(255, 0, 0)')
    expect(state.hidden).toBe('true')
    expect(state.step).toBe('1')
    expect(state.steps).toBe(1)
    expect(state.transition).toBe('lift')
    expect(state.pageTransition).toBe('breath')
    expect(state.motionAttr).toBe('off')
    expect(state.motion).toBe(false)
    expect(state.modelOverride).toMatchObject({ x: 240, y: 300, w: 1200 })
    expect(state.pristine).toBe('string')

    // the page the file opens to is the page the renderer would make from the same model
    const exported = await reopened.evaluate(() => (window as unknown as W).__deck.exportModel())
    const fresh = join(outDir, 'fresh.html')
    writeFileSync(
      fresh,
      renderDeckDocument(exported, { deckDir: resolve('examples'), outDir }).html,
      'utf8',
    )
    // measured in the static state (no page transition in flight), the way QA measures
    const measured = await open(saved, '?static=1')
    const reference = await open(fresh, '?static=1')
    await waitForFit(measured)
    await waitForFit(reference)
    const got = byKey(await measureSlide(measured))
    const want = byKey(await measureSlide(reference))
    expect(got.size).toBe(want.size)
    const drift: string[] = []
    for (const [key, w] of want) {
      const g = got.get(key)
      if (!g) {
        drift.push(`${key}: missing`)
        continue
      }
      const d = Math.max(
        Math.abs(g.x - w.x),
        Math.abs(g.y - w.y),
        Math.abs(g.w - w.w),
        Math.abs(g.h - w.h),
      )
      if (d > 1.5 || g.hasText !== w.hasText) drift.push(`${key}: ${d.toFixed(1)}px`)
    }
    expect(drift).toEqual([])

    // a saved file can be edited and saved again
    const again = await reopened.evaluate(() =>
      (window as unknown as W).__deck.editor.portableHtml(),
    )
    expect(again).not.toBeNull()
    expect(again).toContain('id="deck-model" data-edited="true"')
    // exactly one pristine script (the editor's source mentions the tag too, but never whole)
    expect((again ?? '').split('document.documentElement.outerHTML;</script>').length).toBe(2)
    await Promise.all([editing.close(), reopened.close(), measured.close(), reference.close()])
  }, 120_000)
})
