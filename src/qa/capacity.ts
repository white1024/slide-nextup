import type { Page } from 'playwright'

/**
 * How much text a slot really holds, measured in the browser, against what its hint promises.
 * `pnpm layout:gallery` runs this on every layout's sample so that a hint like 「十字以內」 is
 * checked against the box (width ÷ font size per line, height ÷ line height for lines) instead
 * of being a guess; the numbers in a hint are read by `hintLimits`.
 */

export interface TextCapacity {
  slide: string
  el: string
  role: string
  /** content box (padding and border excluded), in px */
  contentW: number
  contentH: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
  /** CJK characters per line at the current font size */
  charsPerLine: number
  /** whole lines that fit in the content box */
  lines: number
}

export interface HintLimits {
  /** the largest character count the hint names (「二十四字以內」「四到十二個字」) */
  chars?: number
  /** the count is per line, item or cell (「每行七字」「每格一到十個字」) rather than a total */
  perLine: boolean
  /** the largest line count the hint names (「兩行以內」「一到三行」「單行」) */
  lines?: number
  /** the line count is about items (「每條一行」「三到五條」), not about the box */
  perItem: boolean
}

const DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}
const NUMERAL = '[0-9一二兩三四五六七八九十]+'

/** Chinese numerals up to 99 (「十」「十二」「二十四」) or Arabic digits; null when it is neither. */
export function parseNumeral(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s)
  const m = /^([一二兩三四五六七八九])?(十)?([一二兩三四五六七八九])?$/.exec(s)
  if (!m || (!m[1] && !m[2] && !m[3]) || (!m[2] && m[3])) return null
  const tens = m[2] ? (m[1] ? (DIGITS[m[1]] as number) : 1) : 0
  const ones = m[2] ? (m[3] ? (DIGITS[m[3]] as number) : 0) : m[1] ? (DIGITS[m[1]] as number) : 0
  return tens * 10 + ones
}

function largest(hint: string, unit: string): number | undefined {
  let max: number | undefined
  for (const m of hint.matchAll(new RegExp(`(${NUMERAL})(?:個)?${unit}`, 'g'))) {
    const n = parseNumeral(m[1] as string)
    if (n !== null && (max === undefined || n > max)) max = n
  }
  return max
}

/** The numbers a slot hint promises. */
export function hintLimits(hint: string): HintLimits {
  const chars = largest(hint, '字')
  let lines = largest(hint, '行')
  if (lines === undefined && /單行/.test(hint)) lines = 1
  return {
    chars,
    perLine: /每行|每格|每條|每項|每列/.test(hint),
    lines,
    perItem: /條|每項|每列/.test(hint),
  }
}

/** Rounding slack, in px: line boxes round to whole pixels and the QA overflow rule tolerates 1px. */
const TOL = 2

export function capacityOf(box: {
  contentW: number
  contentH: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
}): { charsPerLine: number; lines: number } {
  const advance = box.fontSize + box.letterSpacing
  return {
    charsPerLine: Math.max(0, Math.floor((box.contentW + TOL) / advance)),
    lines: Math.max(1, Math.floor((box.contentH + TOL) / box.lineHeight)),
  }
}

/** A message when the hint promises more than the box holds, else null. */
export function checkHint(hint: string, cap: TextCapacity): string | null {
  const lim = hintLimits(hint)
  if (lim.chars !== undefined) {
    const lines = lim.perLine ? 1 : (lim.lines ?? cap.lines)
    const room = cap.charsPerLine * lines
    if (lim.chars > room) {
      return `提示寫${lim.perLine ? '每行' : ''} ${lim.chars} 字，框只放得下每行 ${cap.charsPerLine} 字${lim.perLine ? '' : ` × ${lines} 行 = ${room} 字`}（內容寬 ${cap.contentW}px ÷ ${cap.fontSize}px）`
    }
  }
  if (lim.lines !== undefined && !lim.perItem && lim.lines > cap.lines) {
    return `提示寫 ${lim.lines} 行，框只放得下 ${cap.lines} 行（內容高 ${cap.contentH}px ÷ 行高 ${cap.lineHeight}px）`
  }
  return null
}

/** Content box, font metrics and the derived capacity of every element on every slide in the document. */
export async function measureCapacity(page: Page): Promise<TextCapacity[]> {
  const raw = await page.evaluate(() => {
    const out: Array<Omit<TextCapacity, 'charsPerLine' | 'lines'>> = []
    const px = (v: string) => Number.parseFloat(v) || 0
    for (const section of document.querySelectorAll<HTMLElement>('section.slide')) {
      for (const node of section.querySelectorAll<HTMLElement>('[data-el]')) {
        const cs = getComputedStyle(node)
        const fontSize = px(cs.fontSize)
        const rect = node.getBoundingClientRect()
        const innerW =
          node.clientWidth || rect.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth)
        const innerH =
          node.clientHeight || rect.height - px(cs.borderTopWidth) - px(cs.borderBottomWidth)
        const w = Math.round(innerW - px(cs.paddingLeft) - px(cs.paddingRight))
        const h = Math.round(innerH - px(cs.paddingTop) - px(cs.paddingBottom))
        // vertical writing (直排): lines run top to bottom, so the axes swap
        const vertical = cs.writingMode.startsWith('vertical')
        out.push({
          slide: section.dataset.slide ?? '',
          el: node.dataset.el ?? '',
          role: node.dataset.role ?? '',
          contentW: vertical ? h : w,
          contentH: vertical ? w : h,
          fontSize,
          lineHeight: cs.lineHeight === 'normal' ? Math.round(fontSize * 1.2) : px(cs.lineHeight),
          letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
        })
      }
    }
    return out
  })
  return raw.map((r) => ({ ...r, ...capacityOf(r) }))
}
