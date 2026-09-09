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
  /** the element paints its own ground: a background, a border or a shadow, so its emptiness shows */
  paints: boolean
  /**
   * the height of what the element really holds: from the top of its first line, picture or
   * painted child to the bottom of its last; 0 when it holds nothing visible
   */
  contentH: number
  /** vertical padding plus borders, the part of the box that is not content by design */
  padY: number
}

export { MIN_FONT_BY_ROLE, minFontFor } from './font-floors.ts'

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
    // a box paints its ground when it has a visible background, a border or a shadow
    const paintsOwn = (el: Element): boolean => {
      const s = getComputedStyle(el)
      const bg = s.backgroundColor
      const clear = bg === 'transparent' || /^rgba\((?:\s*\d+\s*,){3}\s*0\s*\)$/.test(bg)
      if (!clear || s.backgroundImage !== 'none' || s.boxShadow !== 'none') return true
      return ['top', 'right', 'bottom', 'left'].some(
        (side) =>
          s.getPropertyValue(`border-${side}-style`) !== 'none' &&
          Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0,
      )
    }
    // the vertical extent of what the element holds: its own text by line boxes, and every
    // descendant that carries something of its own (text, a picture, a painted chip or rule);
    // bare wrappers are ignored so a stretched container does not hide the blank
    const extentOf = (node: HTMLElement): number => {
      let top = Number.POSITIVE_INFINITY
      let bottom = Number.NEGATIVE_INFINITY
      const add = (r: DOMRect) => {
        if (r.height <= 0 || r.width <= 0) return
        if (r.top < top) top = r.top
        if (r.bottom > bottom) bottom = r.bottom
      }
      const ownText = (el: Node) =>
        [...el.childNodes].some(
          (c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim().length > 0,
        )
      for (const child of node.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !(child.textContent ?? '').trim()) continue
        const range = document.createRange()
        range.selectNodeContents(child)
        for (const r of range.getClientRects()) add(r)
      }
      for (const el of node.querySelectorAll<HTMLElement>('*')) {
        if (el.getClientRects().length === 0) continue
        const replaced = /^(IMG|SVG|VIDEO|CANVAS)$/i.test(el.tagName)
        if (ownText(el) || replaced || paintsOwn(el)) add(el.getBoundingClientRect())
      }
      return bottom > top ? bottom - top : 0
    }
    for (const section of document.querySelectorAll<HTMLElement>('section.slide')) {
      const origin = section.getBoundingClientRect()
      for (const node of section.querySelectorAll<HTMLElement>('[data-el]')) {
        const r = node.getBoundingClientRect()
        const cs = getComputedStyle(node)
        const px = (v: string) => Number.parseFloat(v) || 0
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
          paints: paintsOwn(node),
          contentH: extentOf(node),
          padY:
            px(cs.paddingTop) +
            px(cs.paddingBottom) +
            px(cs.borderTopWidth) +
            px(cs.borderBottomWidth),
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
        `${where} outside the 1920×1080 canvas (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)})`,
      )
    }
    if (b.hasText && (b.scrollH > b.h + TOLERANCE || b.scrollW > b.w + TOLERANCE)) {
      problems.push(
        `${where} text overflows the element box (content ${b.scrollW}×${b.scrollH}, box ${Math.round(b.w)}×${Math.round(b.h)})`,
      )
    }
  }
  return problems
}
