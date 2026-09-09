import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import type { Deck } from '../model/deck.ts'
import { effectiveOrder } from '../model/pages.js'
import { loadLayout, loadTheme, motionFor, PROJECT_ROOT } from '../render/assets.ts'
import { renderDeckDocument } from '../render/deck.ts'
import { launchChromium } from './browser.ts'
import { checkHint, measureCapacity, type TextCapacity } from './capacity.ts'
import { DEFAULT_MIN_FONT, DEFAULT_MIN_INNER_FONT, floorExit, minFontFor } from './font-floors.ts'
import { type ElementBox, measureSlide, waitForFit } from './measure.ts'
import { checkMotion, type MotionRule, type MotionSummary } from './motion-check.ts'

export type QaRule =
  | 'overflow'
  | 'overlap'
  | 'min-font'
  | 'min-font-inner'
  | 'density'
  | 'geometry-invariant'
  | 'image-fit'
  | 'hint-capacity'
  | 'slack'
  | MotionRule

/** info is a notice: printed and written to the report, never counted as a failure */
export type QaSeverity = 'error' | 'warning' | 'info'

export interface QaFinding {
  rule: QaRule
  severity: QaSeverity
  slide: string
  element?: string
  message: string
}

export interface QaSlideReport {
  id: string
  layout: string
  findings: QaFinding[]
}

export interface QaReport {
  deck: string
  title: string
  checkedAt: string
  slides: QaSlideReport[]
  /** hidden slides (deck.pages.hidden): rendered but not played, so not checked */
  skipped: string[]
  errors: number
  warnings: number
  /** info findings (the `slack` rule at its default level); absent in reports written before the rule existed */
  notices?: number
  /** what the motion checks played: absent in reports written before they existed */
  motion?: MotionSummary
  durationMs: number
}

/** how the `slack` rule reports: off, as a notice (the default), or as a warning that counts */
export type SlackLevel = 'off' | 'info' | 'warning'
export const SLACK_LEVELS: readonly SlackLevel[] = ['off', 'info', 'warning']
export const DEFAULT_SLACK: SlackLevel = 'info'
/** a painted text box is reported when it is taller than its content by more than this many pixels… */
export const SLACK_PX = 40
/** …or by more than this share of its inner height (the box minus its padding)… */
export const SLACK_SHARE = 0.15
/** …but never for less than this: page furniture (a 40px meta line) is not what the rule is for */
export const SLACK_MIN_PX = 24

/**
 * How much taller a painted text box is than what it holds, as a message; null for a box that
 * paints nothing (its blank is invisible; that is the hug question, not this rule) or for a fair
 * fit. QA is exact about content taller than its box; this is the same measurement the other way.
 * Shapes are the caller's to leave out: a rule or a backdrop holds nothing by design.
 */
export function slackProblem(
  b: Pick<ElementBox, 'h' | 'padY' | 'contentH' | 'paints'>,
): string | null {
  if (!b.paints) return null
  const inner = Math.max(0, b.h - b.padY)
  const slack = inner - b.contentH
  if (slack <= SLACK_PX && (slack <= inner * SLACK_SHARE || slack <= SLACK_MIN_PX)) return null
  if (b.contentH <= 0) {
    return `the box paints its ground (${Math.round(b.h)}px tall) but holds nothing: fill the slot, or use a layout that leaves it out`
  }
  const share = inner > 0 ? Math.round((slack / inner) * 100) : 100
  return `the box is ${Math.round(slack)}px (${share}%) taller than its content: shorten the box in the layout, or give the slot more to say`
}

export interface QaOptions {
  deckDir: string
  root?: string
  /** the user directory's themes folder; undefined reads the environment, null turns it off */
  userThemesDir?: string | null
  /** minimum computed font-size of a text element itself */
  minFont?: number
  /** minimum computed font-size of any text node inside an element */
  minInnerFont?: number
  /** an already running browser to reuse (the caller closes it); launching one costs seconds */
  browser?: Browser
  /**
   * check every text slot's hint against what its box really holds (`theme:qa`). Off for
   * `pnpm qa`: a deck cannot change the hint of the layout it uses, so the finding would be
   * addressed to somebody who is not there.
   */
  checkHints?: boolean
  /** how a painted box far taller than its content is reported (default info) */
  slack?: SlackLevel
}

const CANVAS_W = 1920
const CANVAS_H = 1080
const TOL = 1

interface InnerFont {
  slide: string
  el: string
  minInner: number
  chars: number
}

async function measureInner(page: Page): Promise<InnerFont[]> {
  return page.evaluate(() => {
    const out: InnerFont[] = []
    // density counts full-width units, the same rule as the scaffold's textUnits and the slot
    // hints: a CJK glyph (Hangul, kana, the unified block, fullwidth forms, dashes) is 1, anything else ½
    const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦–—]/
    for (const section of document.querySelectorAll<HTMLElement>('section.slide')) {
      for (const node of section.querySelectorAll<HTMLElement>('[data-el]')) {
        let minInner = Number.POSITIVE_INFINITY
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        let chars = 0
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const text = (t.textContent ?? '').trim()
          if (!text) continue
          const parent = t.parentElement
          // only what is on screen counts: a hidden tab panel is not part of the default state
          if (!parent || parent.getClientRects().length === 0) continue
          for (const ch of text) chars += WIDE.test(ch) ? 1 : 0.5
          const size = Number.parseFloat(getComputedStyle(parent).fontSize)
          if (size < minInner) minInner = size
        }
        out.push({
          slide: section.dataset.slide ?? '',
          el: node.dataset.el ?? '',
          minInner: Number.isFinite(minInner) ? minInner : 0,
          chars,
        })
      }
    }
    return out
  })
}

export interface ImageBox {
  slide: string
  el: string
  naturalW: number
  naturalH: number
  boxW: number
  boxH: number
  /** the computed object-fit of the picture */
  fit: string
}

/** Every image element's picture size against its box, once the pictures have loaded. */
export async function measureImages(page: Page): Promise<ImageBox[]> {
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? null
          : new Promise<void>((done) => {
              img.addEventListener('load', () => done(), { once: true })
              img.addEventListener('error', () => done(), { once: true })
            }),
      ),
    ),
  )
  return page.evaluate(() => {
    const out: ImageBox[] = []
    for (const section of document.querySelectorAll<HTMLElement>('section.slide')) {
      for (const node of section.querySelectorAll<HTMLElement>('[data-el]')) {
        const img = node.querySelector('img')
        if (!img) continue
        const r = node.getBoundingClientRect()
        out.push({
          slide: section.dataset.slide ?? '',
          el: node.dataset.el ?? '',
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          boxW: r.width,
          boxH: r.height,
          fit: getComputedStyle(img).objectFit,
        })
      }
    }
    return out
  })
}

/** cover may cut off up to this share of a picture before QA says so */
export const IMAGE_CROP_LIMIT = 0.25

/** What cover would cut off, as a message; null for contain, for a picture that did not load, or a fair crop. */
export function imageFitProblem(im: ImageBox): string | null {
  if (im.fit !== 'cover' || !im.naturalW || !im.naturalH || !im.boxW || !im.boxH) return null
  const picture = im.naturalW / im.naturalH
  const box = im.boxW / im.boxH
  const crop = 1 - Math.min(picture, box) / Math.max(picture, box)
  if (crop <= IMAGE_CROP_LIMIT) return null
  return `image is ${picture.toFixed(2)}:1 but the box is ${box.toFixed(2)}:1; cover crops ${Math.round(crop * 100)}% of it (a diagram wants \`fit: contain\` on the slot in layout.json, a photo a crop that matches the box)`
}

function intersects(a: ElementBox, b: ElementBox): boolean {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ix > TOL && iy > TOL
}

export async function runDeckQa(deck: Deck, opts: QaOptions): Promise<QaReport> {
  const started = Date.now()
  const root = opts.root ?? PROJECT_ROOT
  const lookup = { root, deckDir: opts.deckDir, userThemesDir: opts.userThemesDir }
  const minFont = opts.minFont ?? DEFAULT_MIN_FONT
  const minInnerFont = opts.minInnerFont ?? DEFAULT_MIN_INNER_FONT
  const slackLevel = opts.slack ?? DEFAULT_SLACK
  const themed = renderDeckDocument(deck, {
    deckDir: opts.deckDir,
    outDir: opts.deckDir,
    root,
    userThemesDir: opts.userThemesDir,
    staticMode: true,
    // pictures have to load for the image-fit rule to see their size
    inlineAssets: true,
  }).html
  const bare = renderDeckDocument(deck, {
    deckDir: opts.deckDir,
    outDir: opts.deckDir,
    root,
    userThemesDir: opts.userThemesDir,
    staticMode: true,
    omitThemeCss: true,
  }).html

  const browser = opts.browser ?? (await launchChromium())
  const page = await browser.newPage({ viewport: { width: CANVAS_W, height: CANVAS_H } })
  await page.setContent(themed)
  await waitForFit(page)
  const boxes = await measureSlide(page)
  const inner = await measureInner(page)
  const images = await measureImages(page)
  const caps: TextCapacity[] = opts.checkHints ? await measureCapacity(page) : []
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('section.slide [data-el][data-hidden="true"]')].map(
      (n) => `${n.closest('section')?.getAttribute('data-slide')}/${n.dataset.el}`,
    ),
  )
  await page.setContent(bare)
  await waitForFit(page)
  const bareBoxes = await measureSlide(page)
  // the motion rules are measured in the player itself: the deck opened interactive, every page played
  const interactive = renderDeckDocument(deck, {
    deckDir: opts.deckDir,
    outDir: opts.deckDir,
    root,
    userThemesDir: opts.userThemesDir,
    inlineAssets: true,
  }).html
  await page.setContent(interactive)
  await waitForFit(page)
  await page.waitForFunction(() => Boolean((window as unknown as { __deck?: unknown }).__deck))
  const motion = await checkMotion(page, {
    band: motionFor(loadTheme(deck.theme, lookup).json).band,
  })
  await page.close()
  if (!opts.browser) await browser.close()

  const hiddenSet = new Set(hidden)
  const pages = effectiveOrder(
    deck.slides.map((s) => s.id),
    deck.pages,
  )
  const played = deck.slides.filter((s) => !pages.hidden.includes(s.id))
  const slides: QaSlideReport[] = played.map((slide) => {
    const findings: QaFinding[] = []
    const layout = loadLayout(slide.layout, deck.theme, lookup)
    const kind = new Map(slide.elements.map((e) => [e.id, e.kind]))
    const mine = boxes.filter((b) => b.slide === slide.id && !hiddenSet.has(`${slide.id}/${b.el}`))

    for (const b of mine) {
      if (b.x < -TOL || b.y < -TOL || b.x + b.w > CANVAS_W + TOL || b.y + b.h > CANVAS_H + TOL) {
        findings.push({
          rule: 'overflow',
          severity: 'error',
          slide: slide.id,
          element: b.el,
          message: `outside the canvas: ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`,
        })
      }
      if (b.hasText && (b.scrollH > b.h + TOL || b.scrollW > b.w + TOL)) {
        findings.push({
          rule: 'overflow',
          severity: 'error',
          slide: slide.id,
          element: b.el,
          message: `text overflows the element box: content ${b.scrollW}×${b.scrollH}, box ${Math.round(b.w)}×${Math.round(b.h)}`,
        })
      }
      // the same measurement the other way: a painted text box far taller than what it holds.
      // Shapes hold nothing by design (a rule, a backdrop, a progress bar), and page furniture
      // (the roles with a lower font floor: meta, chips, pills, a call to action) is sized by the
      // theme, not by its text, so neither is measured.
      const furniture = minFontFor(b.role, DEFAULT_MIN_FONT) < DEFAULT_MIN_FONT
      const slack =
        slackLevel === 'off' || kind.get(b.el) !== 'text' || furniture ? null : slackProblem(b)
      if (slack) {
        findings.push({
          rule: 'slack',
          severity: slackLevel === 'warning' ? 'warning' : 'info',
          slide: slide.id,
          element: b.el,
          message: slack,
        })
      }
      const floor = minFontFor(b.role, minFont)
      if (b.hasText && kind.get(b.el) === 'text' && b.fontSize < floor) {
        findings.push({
          rule: 'min-font',
          severity: 'error',
          slide: slide.id,
          element: b.el,
          message: `font size ${b.fontSize}px below the minimum ${floor}px; ${floorExit('--min-font', floor < minFont ? b.role : undefined)}`,
        })
      }
    }

    for (const i of inner.filter(
      (x) => x.slide === slide.id && !hiddenSet.has(`${slide.id}/${x.el}`),
    )) {
      const role = mine.find((b) => b.el === i.el)?.role ?? ''
      const innerFloor = minFontFor(role, minInnerFont)
      if (i.chars > 0 && i.minInner > 0 && i.minInner < innerFloor) {
        findings.push({
          rule: 'min-font-inner',
          severity: 'warning',
          slide: slide.id,
          element: i.el,
          message: `smallest inner text ${i.minInner}px below ${innerFloor}px; ${floorExit('--min-inner-font', innerFloor < minInnerFont ? role : undefined)}`,
        })
      }
    }

    for (const im of images.filter(
      (x) => x.slide === slide.id && !hiddenSet.has(`${slide.id}/${x.el}`),
    )) {
      const problem = imageFitProblem(im)
      if (problem) {
        findings.push({
          rule: 'image-fit',
          severity: 'warning',
          slide: slide.id,
          element: im.el,
          message: problem,
        })
      }
    }

    // what the layout promises a slot holds, against what the box measured out at
    for (const cap of caps.filter(
      (x) => x.slide === slide.id && !hiddenSet.has(`${slide.id}/${x.el}`),
    )) {
      if (kind.get(cap.el) !== 'text') continue
      const hint = layout.json.slots[cap.el]?.hint
      const problem = hint ? checkHint(hint, cap) : null
      if (problem) {
        findings.push({
          rule: 'hint-capacity',
          severity: 'warning',
          slide: slide.id,
          element: cap.el,
          message: `the hint "${hint}" promises more than the box holds: ${problem}`,
        })
      }
    }

    const texts = mine.filter((b) => b.hasText && kind.get(b.el) === 'text')
    for (let a = 0; a < texts.length; a++) {
      for (let c = a + 1; c < texts.length; c++) {
        const p = texts[a] as ElementBox
        const q = texts[c] as ElementBox
        if (intersects(p, q)) {
          findings.push({
            rule: 'overlap',
            severity: 'error',
            slide: slide.id,
            element: p.el,
            message: `text elements ${p.el} and ${q.el} overlap`,
          })
        }
      }
    }

    const chars = Math.round(
      inner.filter((x) => x.slide === slide.id).reduce((n, x) => n + x.chars, 0),
    )
    if (chars > layout.json.density.max_chars) {
      findings.push({
        rule: 'density',
        severity: 'error',
        slide: slide.id,
        message: `${chars} characters of text (full-width units), over the limit of ${layout.json.density.max_chars} for layout ${slide.layout}`,
      })
    }

    for (const b of boxes.filter((x) => x.slide === slide.id)) {
      const o = bareBoxes.find((x) => x.slide === slide.id && x.el === b.el)
      if (!o) continue
      const drift = Math.max(
        Math.abs(b.x - o.x),
        Math.abs(b.y - o.y),
        Math.abs(b.w - o.w),
        Math.abs(b.h - o.h),
      )
      if (drift > 0.5) {
        findings.push({
          rule: 'geometry-invariant',
          severity: 'error',
          slide: slide.id,
          element: b.el,
          message: `theme CSS moved the element geometry by ${drift.toFixed(1)}px; a theme may only change appearance`,
        })
      }
    }

    findings.push(...motion.findings.filter((f) => f.slide === slide.id))

    return { id: slide.id, layout: slide.layout, findings }
  })

  const all = slides.flatMap((s) => s.findings)
  return {
    deck: deck.id,
    title: deck.title,
    checkedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    slides,
    skipped: pages.hidden,
    errors: all.filter((f) => f.severity === 'error').length,
    warnings: all.filter((f) => f.severity === 'warning').length,
    notices: all.filter((f) => f.severity === 'info').length,
    motion: motion.summary,
    durationMs: Date.now() - started,
  }
}

const MARK: Record<QaSeverity, string> = { error: '✖', warning: '⚠', info: 'ℹ' }

export function writeQaReport(report: QaReport, root = process.cwd()): string {
  const dir = join(root, 'artifacts', 'qa')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${report.deck}.json`)
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return file
}

export function formatQaReport(report: QaReport): string {
  const lines: string[] = [
    `${report.title} (${report.deck}) · ${report.slides.length} slides · ${report.durationMs} ms`,
  ]
  if (report.skipped?.length) lines.push(`- skipped hidden slides: ${report.skipped.join(', ')}`)
  if (report.motion)
    lines.push(
      `- motion: ${report.motion.pages} pages played, ${report.motion.entrances} entrances, ${report.motion.changes} page changes; rest state, leaving layer, reduced motion and duration bands checked`,
    )
  for (const s of report.slides) {
    if (s.findings.length === 0) {
      lines.push(`✓ ${s.id.padEnd(6)} ${s.layout}`)
      continue
    }
    const worst: QaSeverity = s.findings.some((f) => f.severity === 'error')
      ? 'error'
      : s.findings.some((f) => f.severity === 'warning')
        ? 'warning'
        : 'info'
    lines.push(`${MARK[worst]} ${s.id.padEnd(6)} ${s.layout}`)
    for (const f of s.findings) {
      lines.push(
        `    ${MARK[f.severity]} [${f.rule}] ${f.element ? `${f.element}: ` : ''}${f.message}`,
      )
    }
  }
  const notices = report.notices ? `, ${report.notices} notices` : ''
  lines.push(
    `${report.errors === 0 ? 'passed' : 'failed'}: ${report.errors} errors, ${report.warnings} warnings${notices}`,
  )
  return lines.join('\n')
}
