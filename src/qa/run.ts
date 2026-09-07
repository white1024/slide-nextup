import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import type { Deck } from '../model/deck.ts'
import { effectiveOrder } from '../model/pages.js'
import { loadLayout, PROJECT_ROOT } from '../render/assets.ts'
import { renderDeckDocument } from '../render/deck.ts'
import { launchChromium } from './browser.ts'
import { type ElementBox, measureSlide, minFontFor, waitForFit } from './measure.ts'

export type QaRule =
  | 'overflow'
  | 'overlap'
  | 'min-font'
  | 'min-font-inner'
  | 'density'
  | 'geometry-invariant'

export interface QaFinding {
  rule: QaRule
  severity: 'error' | 'warning'
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
  durationMs: number
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

function intersects(a: ElementBox, b: ElementBox): boolean {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ix > TOL && iy > TOL
}

export async function runDeckQa(deck: Deck, opts: QaOptions): Promise<QaReport> {
  const started = Date.now()
  const root = opts.root ?? PROJECT_ROOT
  const lookup = { root, deckDir: opts.deckDir, userThemesDir: opts.userThemesDir }
  const minFont = opts.minFont ?? 32
  const minInnerFont = opts.minInnerFont ?? 28
  const themed = renderDeckDocument(deck, {
    deckDir: opts.deckDir,
    outDir: opts.deckDir,
    root,
    userThemesDir: opts.userThemesDir,
    staticMode: true,
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
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('section.slide [data-el][data-hidden="true"]')].map(
      (n) => `${n.closest('section')?.getAttribute('data-slide')}/${n.dataset.el}`,
    ),
  )
  await page.setContent(bare)
  await waitForFit(page)
  const bareBoxes = await measureSlide(page)
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
      const floor = minFontFor(b.role, minFont)
      if (b.hasText && kind.get(b.el) === 'text' && b.fontSize < floor) {
        findings.push({
          rule: 'min-font',
          severity: 'error',
          slide: slide.id,
          element: b.el,
          message: `font size ${b.fontSize}px below the minimum ${floor}px${floor < minFont ? ` (${b.role} furniture)` : ''}`,
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
          message: `smallest inner text ${i.minInner}px below ${innerFloor}px`,
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
    durationMs: Date.now() - started,
  }
}

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
  for (const s of report.slides) {
    if (s.findings.length === 0) {
      lines.push(`✓ ${s.id.padEnd(6)} ${s.layout}`)
      continue
    }
    lines.push(
      `${s.findings.some((f) => f.severity === 'error') ? '✖' : '⚠'} ${s.id.padEnd(6)} ${s.layout}`,
    )
    for (const f of s.findings) {
      lines.push(
        `    ${f.severity === 'error' ? '✖' : '⚠'} [${f.rule}] ${f.element ? `${f.element}: ` : ''}${f.message}`,
      )
    }
  }
  lines.push(
    `${report.errors === 0 ? 'passed' : 'failed'}: ${report.errors} errors, ${report.warnings} warnings`,
  )
  return lines.join('\n')
}
