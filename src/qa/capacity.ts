import type { Page } from 'playwright'

/**
 * How much text a slot really holds, measured in the browser, against what its hint promises.
 * `pnpm layout:gallery` runs this on every layout's sample so that a hint like 「十字以內」 is
 * checked against the box (width ÷ font size per line, height ÷ line height for lines) instead
 * of being a guess; the numbers in a hint are read by `hintLimits`.
 */

/** One list item laid out inline (a chip): its own box, so that a row of chips can be counted. */
export interface ChipMetrics {
  /** left and right padding plus border, in px */
  padX: number
  /** top and bottom padding plus border, in px */
  padY: number
  /** left and right margin, in px */
  marginX: number
  /** top and bottom margin, in px */
  marginY: number
  /** the chip's own line height, in px */
  lineHeight: number
}

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
  /** list items in the sample (`li` count); absent when the element holds no list */
  items?: number
  /** one item's vertical margins (first `li`: margin-top + margin-bottom), in px */
  itemGap?: number
  /** set only when the items are laid out inline (a flow of chips) */
  chip?: ChipMetrics
}

/**
 * A hint is read in either grammar. English: "up to 24 characters", "4 to 12 characters",
 * "8 characters per line", "one line", "up to 2 lines", "3 to 5 items, one line each".
 * Chinese: 「二十四字以內」「四到十二個字」「每行八字」「單行」「兩行以內」「三到五條，每條一行」.
 * Character counts are full-width units: a CJK glyph counts 1, a Latin letter or digit ½.
 */
export interface HintLimits {
  /** the largest character count the hint names */
  chars?: number
  /** the count is per line, item or cell rather than a total */
  perLine: boolean
  /** the largest line count the hint names */
  lines?: number
  /** the line count is about items ("one line each", 「每條一行」), not about the box */
  perItem: boolean
  /** the largest item count the hint names (「三到五條」, "4 to 9 chips", "2 supporting points") */
  items?: number
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
const WORDS: Record<string, number> = {
  one: 1,
  single: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
}
const EN_NUMERAL = `(?:\\d+|${Object.keys(WORDS).join('|')})`

/** Chinese numerals up to 99 (「十」「十二」「二十四」), English number words or Arabic digits; null when it is none of these. */
export function parseNumeral(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s)
  const word = WORDS[s.toLowerCase()]
  if (word !== undefined) return word
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

/**
 * English counts: "up to 24 characters", "4 to 12 characters", "one line", "2 to 3 lines";
 * a range keeps its larger end. `between` allows a word or two between the number and the
 * unit, which is how item counts are written: "2 supporting points", "3 short entries".
 */
function largestEn(hint: string, unit: string, between = ''): number | undefined {
  let max: number | undefined
  const re = new RegExp(
    `\\b(${EN_NUMERAL})(?:\\s*(?:to|-|–)\\s*(${EN_NUMERAL}))?[\\s-]*${between}${unit}\\b`,
    'gi',
  )
  for (const m of hint.matchAll(re)) {
    for (const g of [m[1], m[2]]) {
      if (!g) continue
      const n = parseNumeral(g)
      if (n !== null && (max === undefined || n > max)) max = n
    }
  }
  return max
}

/** The units an item count is written in: 「三到五條」「2 到 3 點」, "4 to 9 chips", "2 supporting points". */
const ITEM_UNIT = '(?:條|點|項)'
const EN_ITEM_UNIT = '(?:items?|points?|chips?|entries|members?|bullets?)'
/** a word or two may sit between the number and the unit: "3 supporting points", "2 short entries" */
const EN_ITEM_BETWEEN = '(?:[a-z-]+\\s+){0,2}'

/** The numbers a slot hint promises. */
export function hintLimits(hint: string): HintLimits {
  const chars = largest(hint, '字') ?? largestEn(hint, 'characters?')
  let lines = largest(hint, '行') ?? largestEn(hint, 'lines?')
  if (lines === undefined && /單行/.test(hint)) lines = 1
  return {
    chars,
    perLine: /每行|每格|每條|每項|每列|\bper (?:line|cell|item|row)\b/i.test(hint),
    lines,
    perItem: /條|每項|每列|\bitems?\b|\brows?\b|\beach\b/i.test(hint),
    items: largest(hint, ITEM_UNIT) ?? largestEn(hint, EN_ITEM_UNIT, EN_ITEM_BETWEEN),
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

/**
 * Chips are laid out inline, so a chip is not a line: the width of one chip says how many fit
 * in a row, and the number of items says how many rows the flow needs. A chip's width is its
 * text at the hint's character count (full-width units, the same rule as `charsPerLine`) plus
 * its own padding, border and margin.
 */
function chipProblem(lim: HintLimits, cap: TextCapacity): string | null {
  const chip = cap.chip
  if (!chip || lim.items === undefined || lim.chars === undefined) return null
  const chipW = lim.chars * (cap.fontSize + cap.letterSpacing) + chip.padX + chip.marginX
  const perRow = Math.max(1, Math.floor((cap.contentW + TOL) / chipW))
  const rows = Math.ceil(lim.items / perRow)
  const rowH = chip.lineHeight + chip.padY + chip.marginY
  const fit = Math.max(1, Math.floor((cap.contentH + TOL) / rowH))
  if (rows <= fit) return null
  return `hint says ${lim.items} chips of ${lim.chars} characters, which need ${rows} rows of ${perRow} (a chip is ${Math.round(chipW)}px wide), the box holds ${fit} rows (content ${cap.contentW}×${cap.contentH}px, ${Math.round(rowH)}px per row)`
}

/** A list item costs its own lines plus the margin between items, so N items are not N lines. */
function listProblem(lim: HintLimits, cap: TextCapacity): string | null {
  if (lim.items === undefined || cap.itemGap === undefined) return null
  const linesEach = lim.perItem ? (lim.lines ?? 1) : 1
  const perItem = linesEach * cap.lineHeight + cap.itemGap
  const fit = Math.max(1, Math.floor((cap.contentH + TOL) / perItem))
  if (lim.items <= fit) return null
  return `hint says ${lim.items} items × ${linesEach} lines, the box only holds ${fit} such items (content height ${cap.contentH}px ÷ ${Math.round(perItem)}px per item: ${linesEach} × ${cap.lineHeight}px line + ${cap.itemGap}px margin)`
}

/** A message when the hint promises more than the box holds, else null. */
export function checkHint(hint: string, cap: TextCapacity): string | null {
  const lim = hintLimits(hint)
  if (lim.chars !== undefined) {
    const lines = lim.perLine ? 1 : (lim.lines ?? cap.lines)
    const room = cap.charsPerLine * lines
    if (lim.chars > room) {
      return `hint says ${lim.chars} characters${lim.perLine ? ' per line' : ''}, the box only holds ${cap.charsPerLine} characters per line${lim.perLine ? '' : ` × ${lines} lines = ${room} characters`} (content width ${cap.contentW}px ÷ ${cap.fontSize}px)`
    }
  }
  if (lim.lines !== undefined && !lim.perItem && lim.lines > cap.lines) {
    return `hint says ${lim.lines} lines, the box only holds ${cap.lines} lines (content height ${cap.contentH}px ÷ line height ${cap.lineHeight}px)`
  }
  // an item count is checked against the box only where the sample shows how items are laid out
  return cap.chip ? chipProblem(lim, cap) : listProblem(lim, cap)
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
        // a list: the first item stands for all of them (they share one rule in the layout CSS).
        // Only what is on screen counts, so a collapsed `details` list or a hidden tab panel
        // does not decide the metrics of the list that is actually shown.
        const lis = [...node.querySelectorAll<HTMLElement>('li')].filter(
          (n) => n.getClientRects().length > 0,
        )
        const first = lis[0]
        let itemGap: number | undefined
        let chip: ChipMetrics | undefined
        if (first) {
          const li = getComputedStyle(first)
          itemGap = px(li.marginTop) + px(li.marginBottom)
          if (li.display.startsWith('inline')) {
            const liSize = px(li.fontSize)
            chip = {
              padX:
                px(li.paddingLeft) +
                px(li.paddingRight) +
                px(li.borderLeftWidth) +
                px(li.borderRightWidth),
              padY:
                px(li.paddingTop) +
                px(li.paddingBottom) +
                px(li.borderTopWidth) +
                px(li.borderBottomWidth),
              marginX: px(li.marginLeft) + px(li.marginRight),
              marginY: itemGap,
              lineHeight: li.lineHeight === 'normal' ? Math.round(liSize * 1.2) : px(li.lineHeight),
            }
          }
        }
        out.push({
          items: lis.length || undefined,
          itemGap,
          chip,
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
