import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Deck, validateDeck } from '../src/model/deck.ts'
import { rethemeDeck } from '../src/model/retheme.ts'
import { scaffoldDeck } from '../src/model/scaffold.ts'
import { loadStory, type Story } from '../src/model/story.ts'
import { type LayoutJson, listLayoutIdsFor, loadLayout } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const storyText = readFileSync(resolve('examples/story.sample.md'), 'utf8')
const story = loadStory(storyText).story as Story

function scaffoldWith(theme: string): Deck {
  const layouts = new Map<string, LayoutJson>(
    listLayoutIdsFor(theme).map((id) => [id, loadLayout(id, theme).json]),
  )
  return scaffoldDeck({
    story,
    storyText,
    storyRelativePath: 'story.sample.md',
    deckId: 'retheme',
    theme,
    layouts,
  }).deck
}

describe('deck:retheme — switching a finished deck to another theme pack', () => {
  const base = scaffoldWith('ink-paper')
  const withEdits: Deck = {
    ...base,
    overrides: {
      's1/title': { text: '手改過的標題', x: 40, style: { color: '#ff0000' } },
      's1/backdrop': { hidden: true },
    },
  }

  it('keeps the layout ids, resolves them in the new pack and rebuilds the element lists', () => {
    const { deck, report } = rethemeDeck(withEdits, 'warm-keynote')
    expect(deck.theme).toBe('warm-keynote')
    expect(deck.slides.map((s) => s.layout)).toEqual(base.slides.map((s) => s.layout))
    expect(report.layoutSource.s1).toBe('pack')
    const cover = loadLayout('cover', 'warm-keynote').json
    expect(deck.slides[0]?.elements.map((e) => e.id)).toEqual(cover.elements.map((e) => e.id))
    expect(validateDeck(deck).ok).toBe(true)
  })

  it('keeps the wording the new layout can hold and reports what it drops or fills', () => {
    const { deck, report } = rethemeDeck(withEdits, 'warm-keynote')
    const s1 = deck.slides[0] as Deck['slides'][number]
    expect(s1.slots.title).toEqual(base.slides[0]?.slots.title)
    expect(report.droppedSlots).toContain('s1/kicker')
    for (const key of report.filledRequired) {
      const [sid, slotId] = key.split('/') as [string, string]
      const slot = deck.slides.find((s) => s.id === sid)?.slots[slotId]
      expect(slot).toBeDefined()
    }
  })

  it('keeps overrides whose element survives, orphans the rest, and can reset positions', () => {
    const { deck, report } = rethemeDeck(withEdits, 'warm-keynote')
    expect(report.keptOverrides).toContain('s1/title')
    expect(report.orphanedOverrides).toContain('s1/backdrop')
    expect(deck.overrides['s1/title']).toEqual({
      text: '手改過的標題',
      x: 40,
      style: { color: '#ff0000' },
    })
    const reset = rethemeDeck(withEdits, 'warm-keynote', { resetPositions: true })
    expect(reset.deck.overrides['s1/title']).toEqual({
      text: '手改過的標題',
      style: { color: '#ff0000' },
    })
    expect(reset.report.resetPositions).toContain('s1/title')
  })

  it('renders after the switch without a deck/layout mismatch, and switches back', () => {
    const { deck } = rethemeDeck(withEdits, 'warm-keynote')
    expect(() =>
      renderDeckDocument(deck, {
        deckDir: resolve('examples'),
        outDir: resolve('examples'),
        staticMode: true,
      }),
    ).not.toThrow()
    const back = rethemeDeck(deck, 'ink-paper')
    expect(back.deck.theme).toBe('ink-paper')
    expect(validateDeck(back.deck).ok).toBe(true)
    expect(() =>
      renderDeckDocument(back.deck, {
        deckDir: resolve('examples'),
        outDir: resolve('examples'),
        staticMode: true,
      }),
    ).not.toThrow()
  })
})
