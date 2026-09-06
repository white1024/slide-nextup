import type { Page } from 'playwright'

export interface ElementBox {
  slide: string
  el: string
  x: number
  y: number
  w: number
  h: number
  /** content height and width as laid out, even when clipped by overflow: hidden */
  scrollW: number
  scrollH: number
  fontSize: number
  hasText: boolean
  /** the element's data-role; QA thresholds differ for page furniture (`meta`) */
  role: string
}

/**
 * Minimum font size for a text element, by role: page furniture and labels may be
 * smaller than content (chips, eyebrows and meta at 20px; chapter labels, kickers,
 * pills, pill lists (flow), captions and CTAs at 24px; table cells at 22px). Everything
 * else keeps the base floor. FIT_JS in src/render/runtime.ts embeds the same table.
 */
export const MIN_FONT_BY_ROLE: Record<string, number> = {
  default: 32,
  meta: 20,
  chip: 20,
  eyebrow: 20,
  'eyebrow-accent': 20,
  chapter: 24,
  pill: 24,
  caption: 24,
  cta: 24,
  kicker: 24,
  flow: 24,
  'flow-accent': 24,
  table: 22,
}

export function minFontFor(
  role: string,
  base: number = MIN_FONT_BY_ROLE.default as number,
): number {
  const floor = MIN_FONT_BY_ROLE[role]
  return floor === undefined || role === 'default' ? base : Math.min(base, floor)
}

/**
 * Wait until fonts are loaded and the auto-fit pass (FIT_JS) has run, so that
 * measurements see the final font sizes. Documents without FIT_JS resolve as
 * soon as fonts are ready.
 */
export async function waitForFit(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    const fit = (window as unknown as { __fit?: { ready: Promise<void> } }).__fit
    if (fit) await fit.ready
  })
}

/** Bounding boxes of every element on every slide currently in the document. */
export async function measureSlide(page: Page): Promise<ElementBox[]> {
  return page.evaluate(() => {
    const out: ElementBox[] = []
    for (const section of document.querySelectorAll<HTMLElement>('section.slide')) {
      const origin = section.getBoundingClientRect()
      for (const node of section.querySelectorAll<HTMLElement>('[data-el]')) {
        const r = node.getBoundingClientRect()
        const cs = getComputedStyle(node)
        out.push({
          slide: section.dataset.slide ?? '',
          el: node.dataset.el ?? '',
          role: node.dataset.role ?? '',
          x: r.left - origin.left,
          y: r.top - origin.top,
          w: r.width,
          h: r.height,
          scrollW: node.scrollWidth,
          scrollH: node.scrollHeight,
          fontSize: Number.parseFloat(cs.fontSize),
          hasText: (node.textContent ?? '').trim().length > 0,
        })
      }
    }
    return out
  })
}

const CANVAS_W = 1920
const CANVAS_H = 1080
const TOLERANCE = 1

export function summariseOverflow(boxes: ElementBox[]): string[] {
  const problems: string[] = []
  for (const b of boxes) {
    const where = `${b.slide}/${b.el}`
    if (
      b.x < -TOLERANCE ||
      b.y < -TOLERANCE ||
      b.x + b.w > CANVAS_W + TOLERANCE ||
      b.y + b.h > CANVAS_H + TOLERANCE
    ) {
      problems.push(
        `${where} 超出 1920×1080 畫布（${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}）`,
      )
    }
    if (b.hasText && (b.scrollH > b.h + TOLERANCE || b.scrollW > b.w + TOLERANCE)) {
      problems.push(
        `${where} 文字溢出元件框（內容 ${b.scrollW}×${b.scrollH}，框 ${Math.round(b.w)}×${Math.round(b.h)}）`,
      )
    }
  }
  return problems
}
