import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type Deck,
  ENTERS,
  mergeSlides,
  normaliseDeck,
  overrideKey,
  parseDeck,
  replaceSlide,
  type Slide,
  sha256,
  stringifyDeck,
  validateDeck,
} from '../src/model/deck.ts'
import { effectiveOrder, followsStory, prunePages } from '../src/model/pages.js'

const sampleText = readFileSync(new URL('../examples/deck.sample.json', import.meta.url), 'utf8')
const brokenText = readFileSync(new URL('../examples/deck.broken.json', import.meta.url), 'utf8')

function sample(): Deck {
  const r = parseDeck(sampleText)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return structuredClone(r.deck)
}

function errorsOf(input: unknown): string[] {
  const r = validateDeck(input)
  return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.message}`)
}

describe('reveal steps and transitions', () => {
  it('accepts element.step ≥ 1 and a transition, keeps them through normalisation, rejects step 0', () => {
    const deck = sample()
    deck.transition = 'fade'
    const s = deck.slides[1] as Slide
    const card = s.elements.find((e) => e.id === 'card-2') as Slide['elements'][number]
    card.step = 2
    expect(errorsOf(deck)).toEqual([])
    const out = normaliseDeck(deck)
    expect(out.transition).toBe('fade')
    expect(out.slides[1]?.elements.find((e) => e.id === 'card-2')?.step).toBe(2)
    expect(Object.keys(out)).toEqual([
      'schemaVersion',
      'id',
      'title',
      'theme',
      'canvas',
      'transition',
      'story',
      'slides',
      'overrides',
    ])
    card.step = 0
    expect(errorsOf(deck).some((e) => e.includes('/slides/1/elements'))).toBe(true)
    ;(deck as unknown as { transition: string }).transition = 'zoom'
    expect(errorsOf(deck).some((e) => e.startsWith('/transition'))).toBe(true)
  })

  it('accepts every page transition family, the legacy slide-left included', () => {
    for (const t of [
      'none',
      'fade',
      'rise',
      'settle',
      'dissolve',
      'breath',
      'push',
      'lift',
      'slide-left',
    ] as const) {
      const deck = sample()
      deck.transition = t
      expect(errorsOf(deck), t).toEqual([])
      expect(normaliseDeck(deck).transition).toBe(t)
    }
  })

  it("accepts a slide's own transition after its layout in the key order, and rejects other values", () => {
    const deck = sample()
    const s2 = deck.slides[1] as { transition?: string }
    s2.transition = 'breath'
    expect(errorsOf(deck)).toEqual([])
    const out = normaliseDeck(deck).slides[1] as { transition?: string }
    expect(out.transition).toBe('breath')
    expect(Object.keys(out).slice(0, 3)).toEqual(['id', 'layout', 'transition'])
    s2.transition = 'zoom'
    expect(errorsOf(deck).some((e) => e.startsWith('/slides/1/transition'))).toBe(true)
  })

  it('accepts the deck-wide motion switch after transition and rejects other values', () => {
    const deck = sample()
    deck.transition = 'fade'
    deck.motion = 'off'
    expect(errorsOf(deck)).toEqual([])
    const out = normaliseDeck(deck)
    expect(out.motion).toBe('off')
    expect(Object.keys(out).slice(4, 8)).toEqual(['canvas', 'transition', 'motion', 'story'])
    ;(deck as unknown as { motion: string }).motion = 'sometimes'
    expect(errorsOf(deck).some((e) => e.startsWith('/motion'))).toBe(true)
    expect(normaliseDeck(sample()).motion).toBeUndefined()
  })
})

describe('composite slots', () => {
  it('accepts chart, table, code and icon slots and rejects a chart without series', () => {
    const deck = sample()
    const s = deck.slides[0] as Slide
    s.slots.title = { type: 'chart', kind: 'bar', series: [{ label: 'a', value: 1 }] }
    expect(errorsOf(deck)).toEqual([])
    s.slots.title = { type: 'table', header: ['a'], rows: [['1']] }
    expect(errorsOf(deck)).toEqual([])
    s.slots.title = { type: 'code', value: 'x' }
    expect(errorsOf(deck)).toEqual([])
    s.slots.title = { type: 'icon', name: 'check' }
    expect(errorsOf(deck)).toEqual([])
    ;(s.slots as Record<string, unknown>).title = { type: 'chart', kind: 'bar', series: [] }
    expect(errorsOf(deck).some((e) => e.startsWith('/slides/0/slots/title'))).toBe(true)
    ;(s.slots as Record<string, unknown>).title = { type: 'icon', name: 'Not Valid' }
    expect(errorsOf(deck).some((e) => e.startsWith('/slides/0/slots/title'))).toBe(true)
  })
})

describe('deck.sample.json', () => {
  it('validates and exposes the model', () => {
    const deck = sample()
    expect(deck.slides).toHaveLength(8)
    expect(deck.slides[1]?.layout).toBe('cards')
    expect(deck.slides[5]?.slots['card-1']).toMatchObject({ type: 'metric', value: '0' })
    expect(Object.keys(deck.overrides)).toEqual(['s1/title', 's6/card-1', 's6/card-3'])
  })

  it('round-trips byte for byte through stringifyDeck', () => {
    expect(stringifyDeck(sample())).toBe(sampleText)
  })

  it('normalises override key order and drops undefined fields', () => {
    const deck = sample()
    deck.overrides = {
      'zz/title': { style: { fontSize: 10 } },
      'aa/title': { x: 1 },
      ...deck.overrides,
    }
    ;(deck.slides[0] as Slide).slots.title = { type: 'text', value: 'x' }
    const out = normaliseDeck(deck)
    expect(Object.keys(out.overrides)[0]).toBe('aa/title')
    expect(stringifyDeck(deck)).toBe(stringifyDeck(out))
  })
})

describe('schema-level validation', () => {
  it('rejects invalid JSON with a path of /', () => {
    const r = parseDeck('{ nope')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]?.path).toBe('/')
  })

  it('reports a missing slide id with its JSON pointer', () => {
    const deck = sample() as unknown as { slides: Array<Record<string, unknown>> }
    delete deck.slides[2]?.id
    const errs = errorsOf(deck)
    expect(errs.some((e) => e.startsWith('/slides/2 ') && e.includes('`id`'))).toBe(true)
  })

  it('rejects a wrong canvas, an unknown slot type and an unknown style key', () => {
    const deck = sample()
    ;(deck.canvas as { width: number }).width = 1280
    ;(deck.slides[0] as Slide).slots.title = {
      type: 'video',
    } as unknown as Slide['slots'][string]
    ;(deck.overrides['s1/title'] as { style: Record<string, unknown> }).style.zIndex = 3
    const errs = errorsOf(deck)
    expect(errs.some((e) => e.startsWith('/canvas/width'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/slides/0/slots/title'))).toBe(true)
    expect(
      errs.some((e) => e.startsWith('/overrides/s1~1title/style') || e.includes('zIndex')),
    ).toBe(true)
  })

  it('rejects an override key that is not slideId/elementId', () => {
    const deck = sample()
    deck.overrides.s1 = { x: 1 }
    expect(errorsOf(deck).some((e) => e.includes('s1') && e.includes('pattern'))).toBe(true)
  })

  it('accepts italic and underline style overrides and rejects other values', () => {
    const deck = sample()
    deck.overrides['s1/title'] = { style: { fontStyle: 'italic', textDecoration: 'underline' } }
    expect(validateDeck(deck).ok).toBe(true)
    expect(normaliseDeck(deck).overrides['s1/title']?.style).toEqual({
      fontStyle: 'italic',
      textDecoration: 'underline',
    })
    ;(deck.overrides['s1/title'] as { style: Record<string, unknown> }).style.fontStyle = 'oblique'
    expect(errorsOf(deck).some((e) => e.startsWith('/overrides/s1/title/style/fontStyle'))).toBe(
      true,
    )
  })
})

describe('cross-reference validation', () => {
  it('rejects duplicate slide ids', () => {
    const deck = sample()
    ;(deck.slides[3] as Slide).id = 's2'
    expect(errorsOf(deck)).toContain('/slides/3/id duplicate slide id `s2` (first at /slides/1)')
  })

  it('rejects duplicate element ids and slots without an element', () => {
    const deck = sample()
    const s = deck.slides[0] as Slide
    s.elements.push({ id: 'title', kind: 'text' })
    s.slots.orphan = { type: 'text', value: 'x' }
    const errs = errorsOf(deck)
    expect(errs.some((e) => e.startsWith('/slides/0/elements/9/id'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/slides/0/slots/orphan'))).toBe(true)
  })

  it('rejects overrides that point at a missing slide or element', () => {
    const deck = sample()
    deck.overrides['s9/title'] = { x: 1 }
    deck.overrides['s1/nothing'] = { y: 1 }
    const errs = errorsOf(deck)
    expect(errs).toContain('/overrides/s9/title override points to non-existent slide `s9`')
    expect(errs).toContain(
      '/overrides/s1/nothing override points to non-existent element `nothing` in slide `s1`',
    )
  })

  it('rejects text overrides on shapes and src overrides on text', () => {
    const deck = sample()
    deck.overrides['s1/panel'] = { text: 'no' }
    deck.overrides['s1/title'] = { src: 'a.png' }
    const errs = errorsOf(deck)
    expect(errs.some((e) => e.startsWith('/overrides/s1/panel/text'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/overrides/s1/title/src'))).toBe(true)
  })

  it('the shipped broken example fails on every intended defect', () => {
    const r = parseDeck(brokenText)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const paths = r.errors.map((e) => e.path)
    expect(paths).toContain('/slides/2')
    const msgs = r.errors.map((e) => e.message)
    expect(msgs.some((m) => m.includes('`id`'))).toBe(true)
  })

  it('the shipped broken example also fails the cross checks once the schema errors are fixed', () => {
    const json = JSON.parse(brokenText) as Deck
    ;(json.slides[2] as Slide).id = 's3'
    const errs = errorsOf(json)
    expect(errs.some((e) => e.startsWith('/slides/1/id') && e.includes('duplicate'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/slides/0/slots/ghost'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/overrides/s1/missing'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/overrides/s9/title'))).toBe(true)
    expect(errs.some((e) => e.startsWith('/overrides/s1/title/src'))).toBe(true)
  })
})

describe('merging generated slides with manual overrides', () => {
  it('keeps overrides whose elements still exist and reports the rest', () => {
    const deck = sample()
    const regenerated = deck.slides.map((s) =>
      s.id === 's6'
        ? { ...s, layout: 'statement', elements: [{ id: 'title', kind: 'text' as const }] }
        : s,
    )
    const report = mergeSlides(deck, regenerated)
    expect(report.kept).toEqual(['s1/title'])
    expect(report.orphaned).toEqual(['s6/card-1', 's6/card-3'])
    expect(Object.keys(report.deck.overrides)).toHaveLength(3)
    expect(report.deck.slides[5]?.layout).toBe('statement')
    expect(deck.slides[5]?.layout).toBe('cards')
  })

  it('replaceSlide swaps one slide in place and appends unknown ids', () => {
    const deck = sample()
    const s6 = deck.slides[5] as Slide
    const fresh: Slide = {
      ...s6,
      slots: { ...s6.slots, title: { type: 'text', value: '改寫後的標題' } },
    }
    const r = replaceSlide(deck, fresh)
    expect(r.deck.slides[5]?.slots.title).toEqual({ type: 'text', value: '改寫後的標題' })
    expect(r.orphaned).toEqual([])
    expect(r.deck.overrides['s6/card-1']).toEqual(deck.overrides['s6/card-1'])
    const appended = replaceSlide(deck, { ...fresh, id: 's9' })
    expect(appended.deck.slides).toHaveLength(9)
    expect(validateDeck(appended.deck).ok).toBe(true)
  })

  it('exposes a stable override key helper and a sha256 helper', () => {
    expect(overrideKey('s1', 'title')).toBe('s1/title')
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('page-level overrides (playback order and hidden slides)', () => {
  it('validates ids, normalises after overrides and prunes stale ids on merge', () => {
    const deck = sample()
    deck.pages = { order: ['s3', 's1'], hidden: ['s2'] }
    expect(errorsOf(deck)).toEqual([])
    const out = normaliseDeck(deck)
    expect(Object.keys(out).slice(-2)).toEqual(['overrides', 'pages'])
    expect(out.pages).toEqual({ order: ['s3', 's1'], hidden: ['s2'] })
    deck.pages = { order: ['s3', 'nope'] }
    expect(errorsOf(deck)).toEqual([
      '/pages/order/1 page arrangement points to non-existent slide `nope`',
    ])
    deck.pages = { order: ['s1', 's1'] }
    expect(errorsOf(deck).some((e) => e.startsWith('/pages/order'))).toBe(true)
    deck.pages = { hidden: [] }
    expect(normaliseDeck(deck).pages).toBeUndefined()
    // a regenerate that lost a slide prunes it from pages and reports it
    const withPages = sample()
    withPages.pages = { order: ['s2', 's1'], hidden: ['s3'] }
    const merged = mergeSlides(
      withPages,
      withPages.slides.filter((s) => s.id !== 's3'),
    )
    expect(merged.pagesDropped).toEqual(['hidden:s3'])
    expect(merged.deck.pages).toEqual({ order: ['s2', 's1'] })
  })

  it('effectiveOrder slots unlisted ids back after their story predecessor and ignores unknown ones', () => {
    const ids = ['s1', 's2', 's3', 's4']
    expect(effectiveOrder(ids, undefined)).toEqual({ order: ids, hidden: [], visible: ids })
    expect(effectiveOrder(ids, { order: ['s4', 's1'] }).order).toEqual(['s4', 's1', 's2', 's3'])
    expect(effectiveOrder(ids, { order: ['s3', 's1', 's2'] }).order).toEqual([
      's3',
      's4',
      's1',
      's2',
    ])
    expect(effectiveOrder(ids, { order: ['s2', 'zz', 's2'], hidden: ['s1', 'zz'] })).toEqual({
      order: ['s1', 's2', 's3', 's4'],
      hidden: ['s1'],
      visible: ['s2', 's3', 's4'],
    })
    expect(followsStory(ids, { order: ids })).toBe(true)
    expect(followsStory(ids, { hidden: ['s2'] })).toBe(false)
    expect(prunePages({ order: ['s1', 'x'], hidden: ['y'] }, ids)).toEqual({
      pages: { order: ['s1'] },
      dropped: ['order:x', 'hidden:y'],
    })
  })
})

describe('entrances', () => {
  it('accepts every entrance, from pop, blur and cascade to grow, draw and count, and rejects other values', () => {
    const deck = sample()
    const card = (deck.slides[1] as Slide).elements.find(
      (e) => e.id === 'card-1',
    ) as Slide['elements'][number]
    card.step = 1
    for (const enter of ENTERS) {
      card.enter = enter
      expect(errorsOf(deck), enter).toEqual([])
    }
    expect(ENTERS).toEqual([
      'fade-up',
      'fade',
      'scale-in',
      'slide-left',
      'slide-right',
      'wipe',
      'pop',
      'blur',
      'cascade',
      'grow',
      'draw',
      'count',
    ])
    ;(card as { enter: string }).enter = 'bounce'
    expect(errorsOf(deck).some((e) => e.includes('/slides/1/elements/'))).toBe(true)
  })
})
