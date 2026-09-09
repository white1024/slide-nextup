import type { Browser } from 'playwright'
import type { Deck, Slide } from '../model/deck.ts'
import { autoSteps } from '../model/scaffold.ts'
import { type Lookup, listLayoutIdsFor, loadLayout, themeDir } from '../render/assets.ts'
import { type QaReport, runDeckQa, type SlackLevel } from './run.ts'

/**
 * Content QA for a theme pack: every layout the pack offers, filled with the layout's own
 * `sample`, rendered as one deck and put through the full deck QA (overflow, overlap, font
 * floors, density, geometry invariant). The gallery only looks for overflow, which is how
 * warm-keynote's 24px cover brand and 26px pill row reached a real deck before QA saw them.
 */

/**
 * One deck per theme pack: a slide per layout (slide id = layout id), each filled with its sample,
 * stepped the way the scaffold steps a page of that layout (so the motion checks play the theme's
 * own entrances per role), on the theme's default page transition.
 */
export function sampleDeck(themeId: string, lookup?: Lookup, only?: string[]): Deck {
  const ids = only?.length ? only : listLayoutIdsFor(themeId, lookup)
  const slides: Slide[] = ids.map((id) => {
    const layout = loadLayout(id, themeId, lookup)
    const steps = autoSteps(id, layout.json.elements)
    return {
      id,
      layout: id,
      slots: layout.json.sample,
      elements: layout.json.elements.map((e) => {
        const step = steps.get(e.id)
        return step ? { id: e.id, kind: e.kind, step } : { id: e.id, kind: e.kind }
      }),
    }
  })
  return {
    schemaVersion: 1,
    id: `theme-${themeId}`,
    title: `layout samples of theme pack ${themeId}`,
    theme: themeId,
    canvas: { width: 1920, height: 1080 },
    slides,
    overrides: {},
  }
}

export interface ThemeQaOptions {
  root?: string
  /** the deck folder whose themes/ may hold the theme (and where relative assets resolve) */
  deckDir?: string
  /** the user directory's themes folder; undefined reads the environment, null turns it off */
  userThemesDir?: string | null
  /** an already running browser to reuse across themes */
  browser?: Browser
  /** only these layout ids (default: every layout the theme offers) */
  only?: string[]
  /** how a painted box far taller than its sample is reported (default info: a sample shows one filling, not the worst case) */
  slack?: SlackLevel
}

export async function runThemeQa(themeId: string, opts: ThemeQaOptions = {}): Promise<QaReport> {
  const lookup = { root: opts.root, deckDir: opts.deckDir, userThemesDir: opts.userThemesDir }
  const deck = sampleDeck(themeId, lookup, opts.only)
  return runDeckQa(deck, {
    deckDir: opts.deckDir ?? themeDir(themeId, lookup),
    root: opts.root,
    userThemesDir: opts.userThemesDir,
    browser: opts.browser,
    // the theme author is the one who can fix a hint, so this is where the hints are checked
    checkHints: true,
    slack: opts.slack,
  })
}

/** Every finding that counts, as `layout/element:rule` — errors and warnings alike, because a sample is the layout's own demonstration; notices are not failures. */
export function themeQaProblems(report: QaReport): string[] {
  return report.slides.flatMap((s) =>
    s.findings
      .filter((f) => f.severity !== 'info')
      .map(
        (f) =>
          `${s.id}/${f.element ?? ''}:${f.rule}${f.severity === 'warning' ? ' (warning)' : ''}`,
      ),
  )
}
