import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateDeck } from '../src/model/deck.ts'
import { runThemeQa, sampleDeck, themeQaProblems } from '../src/qa/theme-qa.ts'
import { listLayoutIdsFor, listThemeIds } from '../src/render/assets.ts'

// The gallery only catches overflow; this is the full QA (font floors, overlap, density,
// geometry invariant) on every layout's own sample, so a layout that forgets a role or sets a
// furniture size below the floor fails here instead of on the first real deck.
describe('every theme pack’s layouts pass full QA on their own samples', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  it('builds one deck per theme with a slide per layout', () => {
    const deck = sampleDeck('warm-keynote')
    expect(deck.theme).toBe('warm-keynote')
    expect(deck.slides.map((s) => s.layout)).toEqual(listLayoutIdsFor('warm-keynote'))
    expect(deck.slides.map((s) => s.id)).toEqual(listLayoutIdsFor('warm-keynote'))
    expect(
      sampleDeck('ink-paper', undefined, ['cover', 'closing']).slides.map((s) => s.id),
    ).toEqual(['cover', 'closing'])
  })

  it.each(listThemeIds({ userThemesDir: null }))(
    '%s: zero errors and zero warnings',
    async (theme) => {
      const deck = sampleDeck(theme)
      expect(validateDeck(deck)).toMatchObject({ ok: true })
      const report = await runThemeQa(theme, { browser })
      expect(report.slides).toHaveLength(listLayoutIdsFor(theme).length)
      expect(themeQaProblems(report)).toEqual([])
      expect(report.errors + report.warnings).toBe(0)
    },
    120_000,
  )
})
