import type { Page } from 'playwright'
import type { QaFinding } from './run.ts'

/**
 * The motion rules, measured in the player rather than promised by a prompt. The deck is opened
 * interactive (not static), every page is played to its last step and the checks are:
 *
 * - `motion-rest`: once every entrance has finished, each element sits exactly where static
 *   mode (`?static=1`, what QA measures and what an export shows) puts it: same box within
 *   0.5px, same opacity, visibility, transform, filter and clip. A keyframe run without `both`,
 *   a transform that never returns to identity or a theme rule gated on playback all show here.
 * - `motion-leaving`: the moment a page turns, nothing inside the page on its way out is
 *   animating (only the page's own exit is): the old layer never replays an entrance under the
 *   new page.
 * - `motion-reduced`: with prefers-reduced-motion, no step element, none of its children and
 *   no page has any animation or transition left (0s), and a page change is a cut.
 * - `motion-band`: an entrance's duration sits inside the theme family's band, a page exit
 *   under 200ms and a page entrance (delay plus duration) within 200–540ms (a warning).
 *
 * Every function handed to page.evaluate is self-contained: Playwright serialises its source,
 * so nothing from this module's scope is reachable inside it.
 */

export type MotionRule = 'motion-rest' | 'motion-leaving' | 'motion-reduced' | 'motion-band'

/** the box tolerance between the played rest state and static mode */
export const REST_TOL = 0.5
/** the page transition band (T-0080): the exit is short, the entrance overlaps it */
export const PAGE_EXIT_MAX = 200
export const PAGE_ENTER_MIN = 200
export const PAGE_ENTER_MAX = 540

export interface MotionSummary {
  /** pages played to their last step */
  pages: number
  /** elements that played an entrance */
  entrances: number
  /** page changes observed with a page on its way out */
  changes: number
}

export interface MotionOptions {
  /** the entrance durations the theme's family allows, in ms */
  band: readonly [number, number]
}

interface RestState {
  el: string
  rect: number[]
  opacity: string
  innerOpacity: string
  visibility: string
  transform: string
  filter: string
  clip: string
}

interface Entrance {
  el: string
  step: number
  name: string
  duration: number
  fill: string
}

interface PageChange {
  family: string
  /** the page on its way out, or null when the change was a cut */
  leaving: { id: string; duration: number; replaying: string[] } | null
  /** the new page's delay plus duration in ms */
  enter: number
}

/** the slice of the player's API these checks drive */
interface DeckApi {
  ids: string[]
  steps: (i?: number) => number
  go: (n: number | string, step?: number) => void
  next: () => void
  refresh: () => void
}

function restDiff(played: RestState, still: RestState): string | null {
  const box = played.rect.map((v, i) => Math.abs(v - (still.rect[i] ?? 0)))
  const drift = Math.max(...box)
  if (drift > REST_TOL)
    return `the box ends ${drift.toFixed(1)}px away from where static mode puts it`
  for (const key of [
    'opacity',
    'innerOpacity',
    'visibility',
    'transform',
    'filter',
    'clip',
  ] as const) {
    if (played[key] !== still[key])
      return `${key === 'innerOpacity' ? 'a child’s opacity' : key} ends at ${played[key]} but static mode shows ${still[key]}`
  }
  return null
}

/** play page i to its last step, reading each entrance the moment it starts */
const playPage = (i: number): Entrance[] => {
  const d = (window as unknown as { __deck: DeckApi }).__deck
  d.go(i, 0)
  const out: Entrance[] = []
  for (let s = 1; s <= d.steps(i); s++) {
    d.next()
    for (const el of document.querySelectorAll<HTMLElement>(
      '.slide.is-active [data-step].is-entering',
    )) {
      // the run that plays: the element's own, else the first animated descendant (a cascade's
      // item, a chart's bar, ring or line)
      let cs = getComputedStyle(el)
      if (cs.animationName === 'none') {
        for (const n of el.querySelectorAll<HTMLElement>('*')) {
          const inner = getComputedStyle(n)
          if (inner.animationName !== 'none') {
            cs = inner
            break
          }
        }
      }
      out.push({
        el: el.dataset.el ?? '',
        step: s,
        name: cs.animationName,
        duration: (Number.parseFloat(cs.animationDuration) || 0) * 1000,
        fill: cs.animationFillMode,
      })
    }
  }
  return out
}

/** wait until every animation on or inside the active page (its own arrival included) has run out */
const settleEntrances = async (): Promise<void> => {
  const active = document.querySelector('.slide.is-active') as Element
  await Promise.all(
    document
      .getAnimations()
      .filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target
        return t instanceof Element && active.contains(t)
      })
      .map((a) => a.finished.catch(() => undefined)),
  )
}

/**
 * The played rest state of the active page and what static mode shows for it, read the same
 * way: the runtime reads html[data-static] live, so static mode is applied in place and taken
 * off again. Identity transforms, a zero blur and an open inset are all written as none.
 */
const measurePair = (): { played: RestState[]; still: RestState[] } => {
  const measure = (): RestState[] => {
    const identity = (t: string) => (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)' ? 'none' : t)
    const noFilter = (f: string) => (f === 'none' || /^blur\(0(?:px)?\)$/.test(f) ? 'none' : f)
    const noClip = (c: string) =>
      c === 'none' || /^inset\(0(?:px|%)?(?: 0(?:px|%)?){0,3}\)$/.test(c) ? 'none' : c
    const active = document.querySelector('.slide.is-active') as HTMLElement
    return [...active.querySelectorAll<HTMLElement>('[data-el]')].map((el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      let inner = 1
      for (const child of el.querySelectorAll('*')) {
        const o = Number.parseFloat(getComputedStyle(child).opacity)
        if (o < inner) inner = o
      }
      return {
        el: el.dataset.el ?? '',
        rect: [r.x, r.y, r.width, r.height],
        opacity: s.opacity,
        innerOpacity: String(inner),
        visibility: s.visibility,
        transform: identity(s.transform),
        filter: noFilter(s.filter),
        clip: noClip(s.clipPath),
      }
    })
  }
  const d = (window as unknown as { __deck: DeckApi }).__deck
  const played = measure()
  document.documentElement.dataset.static = 'true'
  d.refresh()
  const still = measure()
  delete document.documentElement.dataset.static
  d.refresh()
  return { played, still }
}

/** turn the page and read the layer on its way out the moment it starts leaving */
const turnPage = (): PageChange => {
  const ms = (el: Element | null, prop: 'animationDuration' | 'animationDelay') =>
    el ? (Number.parseFloat(getComputedStyle(el)[prop]) || 0) * 1000 : 0
  const d = (window as unknown as { __deck: DeckApi }).__deck
  d.next()
  const leaving = document.querySelector<HTMLElement>('.slide.is-leaving')
  const active = document.querySelector('.slide.is-active')
  const stage = document.querySelector<HTMLElement>('.deck-stage')
  const replaying = new Set<string>()
  if (leaving) {
    for (const n of leaving.querySelectorAll<HTMLElement>('*')) {
      if (getComputedStyle(n).animationName === 'none') continue
      replaying.add(n.closest<HTMLElement>('[data-el]')?.dataset.el ?? n.tagName.toLowerCase())
    }
  }
  return {
    family: stage?.dataset.transition ?? 'none',
    leaving: leaving
      ? {
          id: leaving.dataset.slide ?? '',
          duration: ms(leaving, 'animationDuration'),
          replaying: [...replaying],
        }
      : null,
    enter: ms(active, 'animationDelay') + ms(active, 'animationDuration'),
  }
}

/** under prefers-reduced-motion: press once on page i and read what is still animating */
const reducedPage = (i: number): { moving: string[]; pageMs: number; cut: boolean } => {
  const seconds = (v: string) => Number.parseFloat(v) || 0
  const d = (window as unknown as { __deck: DeckApi }).__deck
  d.go(i, 0)
  if (d.steps(i) > 0) d.next()
  const active = document.querySelector('.slide.is-active') as HTMLElement
  const moving = new Set<string>()
  for (const el of active.querySelectorAll<HTMLElement>('[data-step]')) {
    for (const n of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
      const cs = getComputedStyle(n)
      if (seconds(cs.animationDuration) > 0 || seconds(cs.transitionDuration) > 0)
        moving.add(el.dataset.el ?? '')
    }
  }
  const page = getComputedStyle(active)
  const pageMs = (seconds(page.animationDuration) + seconds(page.transitionDuration)) * 1000
  d.next()
  const cut = !document.querySelector('.slide.is-leaving')
  return { moving: [...moving], pageMs, cut }
}

const settledPage = () => !document.querySelector('.slide.is-leaving')

/**
 * Run the motion checks on a page that already holds the interactive deck (`window.__deck`
 * present, fonts and fit ready). Findings carry the played slide ids.
 */
export async function checkMotion(
  page: Page,
  opts: MotionOptions,
): Promise<{ findings: QaFinding[]; summary: MotionSummary }> {
  const findings: QaFinding[] = []
  const summary: MotionSummary = { pages: 0, entrances: 0, changes: 0 }
  const ids = await page.evaluate(() =>
    (window as unknown as { __deck: DeckApi }).__deck.ids.slice(),
  )
  const count = ids.length

  for (let i = 0; i < count; i++) {
    const id = ids[i] ?? ''
    const entrances = await page.evaluate(playPage, i)
    summary.pages++
    summary.entrances += entrances.length
    const slow = entrances.filter((e) => e.duration < opts.band[0] || e.duration > opts.band[1])
    if (slow[0]) {
      findings.push({
        rule: 'motion-band',
        severity: 'warning',
        slide: id,
        element: slow[0].el,
        message: `entrance ${slow[0].name} runs ${Math.round(slow[0].duration)}ms, outside the theme family’s band ${opts.band[0]}–${opts.band[1]}ms${slow.length > 1 ? ` (${slow.length} elements)` : ''}`,
      })
    }
    await page.evaluate(settleEntrances)
    const { played, still } = await page.evaluate(measurePair)
    for (const p of played) {
      const s = still.find((x) => x.el === p.el)
      if (!s) continue
      const diff = restDiff(p, s)
      if (diff) {
        findings.push({
          rule: 'motion-rest',
          severity: 'error',
          slide: id,
          element: p.el,
          message: `after its entrance ${diff}; an entrance must end on the resting state (keyframes with fill both, transform back to none)`,
        })
      }
    }
    if (i < count - 1) {
      const change = await page.evaluate(turnPage)
      if (change.leaving) {
        summary.changes++
        if (change.leaving.replaying.length > 0) {
          findings.push({
            rule: 'motion-leaving',
            severity: 'error',
            slide: id,
            element: change.leaving.replaying[0],
            message: `still animating while the page leaves (${change.leaving.replaying.join(', ')}); the layer on its way out must be frozen so it never replays under the next page`,
          })
        }
        if (change.leaving.duration > PAGE_EXIT_MAX) {
          findings.push({
            rule: 'motion-band',
            severity: 'warning',
            slide: id,
            message: `page exit (${change.family}) runs ${Math.round(change.leaving.duration)}ms, over ${PAGE_EXIT_MAX}ms`,
          })
        }
        if (change.enter < PAGE_ENTER_MIN || change.enter > PAGE_ENTER_MAX) {
          findings.push({
            rule: 'motion-band',
            severity: 'warning',
            slide: ids[i + 1] ?? '',
            message: `page entrance (${change.family}) takes ${Math.round(change.enter)}ms with its delay, outside ${PAGE_ENTER_MIN}–${PAGE_ENTER_MAX}ms`,
          })
        }
        await page.waitForFunction(settledPage, undefined, { timeout: 5000 })
      }
    }
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (let i = 0; i < count; i++) {
    const id = ids[i] ?? ''
    const r = await page.evaluate(reducedPage, i)
    if (r.moving.length > 0 || r.pageMs > 0 || !r.cut) {
      const what = [
        r.moving.length > 0 ? `${r.moving.join(', ')} still animate` : '',
        r.pageMs > 0 ? `the page still animates (${Math.round(r.pageMs)}ms)` : '',
        r.cut ? '' : 'the page change is not a cut',
      ].filter(Boolean)
      findings.push({
        rule: 'motion-reduced',
        severity: 'error',
        slide: id,
        element: r.moving[0],
        message: `with prefers-reduced-motion ${what.join('; ')}; every animation and transition must be 0s`,
      })
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  return { findings, summary }
}
