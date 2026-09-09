import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { confinedFile, createDevServer, type DevServer } from '../src/dev/server.ts'
import {
  type Deck,
  parseDeck,
  type Slide,
  sha256,
  stringifyDeck,
  validateDeck,
} from '../src/model/deck.ts'
import { loadLayout } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const outDir = resolve('artifacts', 'preflight', 'dev-test')
const deckFile = join(outDir, 'deck.json')

interface DeckWindow {
  __deck: {
    exportModel: () => Deck
    current: number
    editor: {
      active: boolean
      select: (id: string | null) => void
      set: (elId: string, patch: Record<string, unknown>) => void
      setMore: (on: boolean) => void
    }
  }
  __dev: { save: () => Promise<boolean>; dirty: boolean; base: string }
}
declare const window: DeckWindow & Window

let server: DevServer
let browser: Browser
let page: Page

const readDeck = (): Deck => {
  const r = parseDeck(readFileSync(deckFile, 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.deck
}

async function waitFor(pred: () => boolean, ms = 5000): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('timed out waiting for condition')
}

beforeAll(async () => {
  mkdirSync(outDir, { recursive: true })
  copyFileSync(resolve('examples/deck.sample.json'), deckFile)
  copyFileSync(resolve('examples/story.sample.md'), join(outDir, 'story.sample.md'))
  server = await createDevServer({ deckFile })
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('dialog', (d) => d.dismiss())
  await page.goto(`${server.url}/?edit=1#2`)
  await page.waitForFunction(() => window.__deck?.editor?.active === true && Boolean(window.__dev))
})

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

describe('dev server', () => {
  it('autosaves overrides to deck.json without touching slides[]', async () => {
    const before = readDeck()
    const slidesBefore = JSON.stringify(before.slides)
    await page.evaluate(() => window.__deck.editor.select('card-1'))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await waitFor(() => readDeck().overrides['s2/card-1']?.x === 79, 6000)
    const after = readDeck()
    expect(JSON.stringify(after.slides)).toBe(slidesBefore)
    expect(after.overrides['s1/title']).toEqual(before.overrides['s1/title'])
    expect(readFileSync(deckFile, 'utf8')).toBe(stringifyDeck(after))
    await page.waitForFunction(() =>
      document.querySelector('.dev-status')?.textContent?.startsWith('Saved'),
    )
  })

  it('reloads when deck.json changes on disk, keeping page, edit mode and overrides', async () => {
    const deck = readDeck()
    const s2 = deck.slides[1]
    if (!s2) throw new Error('missing s2')
    s2.slots.title = { type: 'text', value: '外部修改的標題' }
    writeFileSync(deckFile, stringifyDeck(deck), 'utf8')
    await page.waitForFunction(
      () =>
        document.querySelector('[data-slide="s2"] [data-el="title"]')?.textContent ===
        '外部修改的標題',
      undefined,
      { timeout: 8000 },
    )
    await page.waitForFunction(
      () => window.__deck?.editor?.active === true && Boolean(window.__dev),
    )
    expect(await page.evaluate(() => location.hash)).toBe('#2')
    expect(await page.evaluate(() => location.search)).toBe('?edit=1')
    expect(
      await page.evaluate(() => window.__deck.exportModel().overrides['s2/card-1']),
    ).toMatchObject({ x: 79 })
  })

  it('rejects cross-origin and malformed saves without touching the file', async () => {
    const bytes = () => sha256(readFileSync(deckFile, 'utf8'))
    const before = bytes()
    const evil = await fetch(`${server.url}/__save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.test' },
      body: JSON.stringify({ overrides: {}, base: server.overridesHash() }),
    })
    expect(evil.status).toBe(403)
    const bad = await fetch(`${server.url}/__save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ overrides: { 's1/nothing': { x: 1 } }, base: server.overridesHash() }),
    })
    expect(bad.status).toBe(400)
    const stale = await fetch(`${server.url}/__save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ overrides: {}, base: 'deadbeef' }),
    })
    expect(stale.status).toBe(409)
    expect(bytes()).toBe(before)
    const forced = await fetch(`${server.url}/__save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ overrides: readDeck().overrides, base: 'deadbeef', force: true }),
    })
    expect(forced.status).toBe(200)
  })

  it('saves reveal steps into slides[].elements and leaves slots and overrides alone', async () => {
    const before = readDeck()
    const res = await fetch(`${server.url}/__save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({
        overrides: before.overrides,
        steps: { 's2/card-1': 2, 's2/card-3': 'nonsense' },
        base: server.overridesHash(),
      }),
    })
    expect(res.status).toBe(200)
    const after = readDeck()
    const s2 = after.slides[1] as Deck['slides'][number]
    expect(s2.elements.find((e) => e.id === 'card-1')?.step).toBe(2)
    expect(s2.elements.find((e) => e.id === 'card-3')?.step).toBeUndefined()
    expect(s2.slots).toEqual((before.slides[1] as Deck['slides'][number]).slots)
    expect(after.overrides).toEqual(before.overrides)

    // and through the editor panel: the change autosaves like any override
    await page.reload()
    await page.waitForFunction(
      () => window.__deck?.editor?.active === true && Boolean(window.__dev),
    )
    // with a dev server the editor never offers a localStorage draft: autosave already covers it
    expect(await page.locator('.ed-draft').count()).toBe(0)
    await page.evaluate(() => window.__deck.editor.select('card-2'))
    // the step field sits behind the floating toolbar's "more" button
    await page.evaluate(() => window.__deck.editor.setMore(true))
    await page.locator('[data-el-step]').fill('3')
    await page.locator('[data-el-step]').press('Tab')
    await waitFor(
      () => readDeck().slides[1]?.elements.find((e) => e.id === 'card-2')?.step === 3,
      8000,
    )
    expect(readDeck().slides[1]?.elements.find((e) => e.id === 'card-1')?.step).toBe(2)
  })

  it('accepts a follow-up save whose base is the hash it returned, whatever the key order', async () => {
    const post = (body: unknown) =>
      fetch(`${server.url}/__save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.url },
        body: JSON.stringify(body),
      })
    // the editor sends keys in edit order; normaliseDeck writes them as x, y, style
    const first = await post({
      overrides: {
        ...readDeck().overrides,
        's3/title': { style: { color: '#00aa00' }, x: 120, y: 200 },
      },
      base: server.overridesHash(),
    })
    expect(first.status).toBe(200)
    const { overridesHash } = (await first.json()) as { overridesHash: string }
    expect(overridesHash).toBe(server.overridesHash())
    const second = await post({
      overrides: {
        ...readDeck().overrides,
        's3/title': { style: { color: '#00aa00' }, x: 121, y: 200 },
      },
      base: overridesHash,
    })
    expect(second.status).toBe(200)
    expect(readDeck().overrides['s3/title']).toMatchObject({ x: 121, y: 200 })
  })

  it('saves an edit that arrives while a save is in flight', async () => {
    await page.reload()
    await page.waitForFunction(
      () => window.__deck?.editor?.active === true && Boolean(window.__dev),
    )
    await page.evaluate(() => {
      window.__deck.editor.set('card-1', { x: 120 })
      const first = window.__dev.save()
      window.__deck.editor.set('card-1', { x: 130 })
      const second = window.__dev.save()
      return Promise.all([first, second])
    })
    await waitFor(() => readDeck().overrides['s2/card-1']?.x === 130, 8000)
    await page.waitForFunction(() => window.__dev.dirty === false)
  })

  it('saves entrances next to steps and drops values outside the vocabulary', async () => {
    const before = readDeck()
    const s2Before = before.slides[1] as Deck['slides'][number]
    const res = await fetch(`${server.url}/__save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({
        overrides: before.overrides,
        enters: { 's2/card-1': 'scale-in', 's2/card-3': 'bogus' },
        base: server.overridesHash(),
      }),
    })
    expect(res.status).toBe(200)
    const after = readDeck()
    const s2 = after.slides[1] as Deck['slides'][number]
    expect(s2.elements.find((e) => e.id === 'card-1')?.enter).toBe('scale-in')
    expect(s2.elements.find((e) => e.id === 'card-3')?.enter).toBeUndefined()
    // a request without steps leaves the steps on disk alone
    expect(s2.elements.find((e) => e.id === 'card-1')?.step).toBe(
      s2Before.elements.find((e) => e.id === 'card-1')?.step,
    )
    expect(s2.slots).toEqual(s2Before.slots)
    expect(after.overrides).toEqual(before.overrides)
  })

  it('saves page-level overrides, rejects unknown ids and clears them on null', async () => {
    const post = (body: unknown) =>
      fetch(`${server.url}/__save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.url },
        body: JSON.stringify(body),
      })
    const ok = await post({
      overrides: readDeck().overrides,
      pages: { hidden: ['s2'], order: ['s3', 's1'] },
      base: server.overridesHash(),
    })
    expect(ok.status).toBe(200)
    expect(readDeck().pages).toEqual({ order: ['s3', 's1'], hidden: ['s2'] })
    const bad = await post({
      overrides: readDeck().overrides,
      pages: { hidden: ['nope'] },
      base: server.overridesHash(),
    })
    expect(bad.status).toBe(400)
    expect(readDeck().pages).toEqual({ order: ['s3', 's1'], hidden: ['s2'] })
    const clear = await post({
      overrides: readDeck().overrides,
      pages: null,
      base: server.overridesHash(),
    })
    expect(clear.status).toBe(200)
    expect(readDeck().pages).toBeUndefined()
  })

  it('saves the deck-wide motion switch: off is written, on removes the field', async () => {
    const post = (body: unknown) =>
      fetch(`${server.url}/__save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.url },
        body: JSON.stringify(body),
      })
    const off = await post({
      overrides: readDeck().overrides,
      motion: 'off',
      base: server.overridesHash(),
    })
    expect(off.status).toBe(200)
    expect(readDeck().motion).toBe('off')
    // a request without the field leaves the disk value alone
    const keep = await post({ overrides: readDeck().overrides, base: server.overridesHash() })
    expect(keep.status).toBe(200)
    expect(readDeck().motion).toBe('off')
    const on = await post({
      overrides: readDeck().overrides,
      motion: 'on',
      base: server.overridesHash(),
    })
    expect(on.status).toBe(200)
    expect(readDeck().motion).toBeUndefined()
  })

  it('saves the page transition: a family is written, the theme default (empty) removes the field', async () => {
    const post = (body: unknown) =>
      fetch(`${server.url}/__save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.url },
        body: JSON.stringify(body),
      })
    const push = await post({
      overrides: readDeck().overrides,
      transition: 'push',
      base: server.overridesHash(),
    })
    expect(push.status).toBe(200)
    expect(readDeck().transition).toBe('push')
    const keep = await post({ overrides: readDeck().overrides, base: server.overridesHash() })
    expect(keep.status).toBe(200)
    expect(readDeck().transition).toBe('push')
    const def = await post({
      overrides: readDeck().overrides,
      transition: '',
      base: server.overridesHash(),
    })
    expect(def.status).toBe(200)
    expect(readDeck().transition).toBeUndefined()
  })

  it("saves a page's own transition: a family is written on the slide, empty clears it, other slides keep theirs", async () => {
    const post = (body: unknown) =>
      fetch(`${server.url}/__save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.url },
        body: JSON.stringify(body),
      })
    const before = readDeck()
    const own = (id: string) => readDeck().slides.find((s) => s.id === id)?.transition
    const set = await post({
      overrides: before.overrides,
      pageTransitions: { s2: 'breath', s3: 'bogus' },
      base: server.overridesHash(),
    })
    expect(set.status).toBe(200)
    expect(own('s2')).toBe('breath')
    expect(own('s3')).toBeUndefined()
    // a slide missing from the map keeps its disk value; the deck-wide field is untouched
    const keep = await post({
      overrides: before.overrides,
      pageTransitions: { s1: 'lift' },
      base: server.overridesHash(),
    })
    expect(keep.status).toBe(200)
    expect(own('s1')).toBe('lift')
    expect(own('s2')).toBe('breath')
    expect(readDeck().transition).toBe(before.transition)
    const clear = await post({
      overrides: before.overrides,
      pageTransitions: { s1: '', s2: '' },
      base: server.overridesHash(),
    })
    expect(clear.status).toBe(200)
    expect(own('s1')).toBeUndefined()
    expect(own('s2')).toBeUndefined()
    expect(readDeck().slides.map((s) => s.slots)).toEqual(before.slides.map((s) => s.slots))
  })

  it('serves deck assets but nothing outside the deck directory', async () => {
    expect(confinedFile(outDir, '/story.sample.md')).toBe(join(outDir, 'story.sample.md'))
    expect(confinedFile(outDir, '/../package.json')).toBeNull()
    expect(confinedFile(outDir, '/..%2f..%2fpackage.json')).toBeNull()
    expect(confinedFile(outDir, '/')).toBeNull()
    expect((await fetch(`${server.url}/story.sample.md`)).status).toBe(200)
    expect((await fetch(`${server.url}/deck.json`)).status).toBe(404)
    expect((await fetch(`${server.url}/..%2f..%2fpackage.json`)).status).toBe(404)
    expect((await fetch(`${server.url}/__deck`)).status).toBe(200)
  })

  it('exports the deck on disk as one portable HTML, and the top bar downloads it', async () => {
    // give the deck a picture so the inlining is observable
    const original = readFileSync(deckFile, 'utf8')
    writeFileSync(
      join(outDir, 'pic.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    const deck = readDeck()
    const s5 = deck.slides.find((s) => s.id === 's5') as Slide
    s5.layout = 'photo'
    s5.slots = {
      title: { type: 'text', value: '一張圖' },
      photo: { type: 'image', src: 'pic.png' },
    }
    s5.elements = loadLayout('photo', 'blue-professional').json.elements.map((e) => ({
      id: e.id,
      kind: e.kind,
    }))
    writeFileSync(deckFile, stringifyDeck(deck), 'utf8')
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-slide="s5"] [data-el="photo"] img')),
      undefined,
      { timeout: 8000 },
    )
    const res = await fetch(`${server.url}/__export`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="story-first.html"')
    const html = await res.text()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('src="data:image/png;base64,')
    expect(html).toContain('id="deck-model"')
    expect(html).not.toContain('window.__devConfig=')
    expect(html).not.toContain('/__events')
    // the editor's top bar offers the same file (the button exists only with a dev server)
    const p = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true,
    })
    await p.goto(`${server.url}/?edit=1`)
    await p.waitForFunction(() => window.__deck?.editor?.active === true && Boolean(window.__dev))
    const button = p.locator('.ed-topbar [data-action="download-html"]')
    await button.waitFor({ state: 'visible' })
    const [download] = await Promise.all([p.waitForEvent('download'), button.click()])
    expect(download.suggestedFilename()).toBe('story-first.html')
    const saved = join(outDir, 'exported.html')
    await download.saveAs(saved)
    expect(readFileSync(saved, 'utf8')).toBe(html)
    await p.close()
    writeFileSync(deckFile, original, 'utf8')
    // the server ignores a file that equals what it last wrote itself, so reload by hand
    await page.reload()
    await page.waitForFunction(
      () => window.__deck?.editor?.active === true && Boolean(window.__dev),
    )
    expect(await page.locator('[data-slide="s5"] [data-el="photo"]').count()).toBe(0)
  })
})

describe('file:// fallback', () => {
  it('downloads a valid deck.json from the editor panel', async () => {
    const deck = readDeck()
    const file = join(outDir, 'static.html')
    writeFileSync(file, renderDeckDocument(deck, { deckDir: outDir, outDir }).html, 'utf8')
    const p = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true,
    })
    await p.goto(`${pathToFileURL(file).href}?edit=1`)
    await p.waitForFunction(() => window.__deck?.editor?.active === true)
    // no dev server, but the page keeps its pristine copy: the portable-HTML button stays and saves the page itself
    expect(await p.locator('.ed-panel [data-action="download-html"]').isHidden()).toBe(false)
    const [download] = await Promise.all([
      p.waitForEvent('download'),
      p.click('.ed-panel button[data-action="download"]'),
    ])
    const saved = join(outDir, 'downloaded.json')
    await download.saveAs(saved)
    const parsed = parseDeck(readFileSync(saved, 'utf8'))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const model = await p.evaluate(() => window.__deck.exportModel())
      expect(parsed.deck).toEqual(model)
      expect(validateDeck(parsed.deck).ok).toBe(true)
    }
    await p.close()
  })
})
