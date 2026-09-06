import type { Browser } from 'playwright'
import type { Deck, Slide } from '../model/deck.ts'
import { listLayoutIdsFor, loadLayout, PROJECT_ROOT, themeDir } from '../render/assets.ts'
import { type QaReport, runDeckQa } from './run.ts'

/**
 * Content QA for a theme pack: every layout the pack offers, filled with the layout's own
 * `sample`, rendered as one deck and put through the full deck QA (overflow, overlap, font
 * floors, density, geometry invariant). The gallery only looks for overflow, which is how
 * warm-keynote's 24px cover brand and 26px pill row reached a real deck before QA saw them.
 */

/** One deck per theme pack: a slide per layout (slide id = layout id), each filled with its sample. */
export function sampleDeck(themeId: string, root = PROJECT_ROOT, only?: string[]): Deck {
  const ids = only?.length ? only : listLayoutIdsFor(themeId, root)
  const slides: Slide[] = ids.map((id) => {
    const layout = loadLayout(id, themeId, root)
    return {
      id,
      layout: id,
      slots: layout.json.sample,
      elements: layout.json.elements.map((e) => ({ id: e.id, kind: e.kind })),
    }
  })
  return {
    schemaVersion: 1,
    id: `theme-${themeId}`,
    title: `主題包 ${themeId} 的版型範例`,
    theme: themeId,
    canvas: { width: 1920, height: 1080 },
    transition: 'none',
    slides,
    overrides: {},
  }
}

export interface ThemeQaOptions {
  root?: string
  /** an already running browser to reuse across themes */
  browser?: Browser
  /** only these layout ids (default: every layout the theme offers) */
  only?: string[]
}

export async function runThemeQa(themeId: string, opts: ThemeQaOptions = {}): Promise<QaReport> {
  const deck = sampleDeck(themeId, opts.root, opts.only)
  return runDeckQa(deck, {
    deckDir: themeDir(themeId, opts.root),
    root: opts.root,
    browser: opts.browser,
  })
}

/** Every finding as `layout/element:rule` — errors and warnings alike, because a sample is the layout's own demonstration. */
export function themeQaProblems(report: QaReport): string[] {
  return report.slides.flatMap((s) =>
    s.findings.map(
      (f) => `${s.id}/${f.element ?? ''}:${f.rule}${f.severity === 'warning' ? ' (warning)' : ''}`,
    ),
  )
}
