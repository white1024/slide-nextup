import { describe, expect, it } from 'vitest'
import {
  capacityOf,
  checkHint,
  hintLimits,
  parseNumeral,
  type TextCapacity,
} from '../src/qa/capacity.ts'

describe('slot hint numbers', () => {
  it('reads Chinese and Arabic numerals up to 99', () => {
    expect(
      ['一', '兩', '十', '十二', '二十', '二十四', '六十', '45', '8'].map(parseNumeral),
    ).toEqual([1, 2, 10, 12, 20, 24, 60, 45, 8])
    expect(parseNumeral('')).toBeNull()
    expect(parseNumeral('一二')).toBeNull()
    expect(parseNumeral('字')).toBeNull()
  })

  it('takes the largest count and tells per-line hints from totals and item counts', () => {
    expect(hintLimits('一行主張，二十四字以內')).toEqual({
      chars: 24,
      perLine: false,
      lines: 1,
      perItem: false,
    })
    expect(hintLimits('場合或系列名，四到十二個字')).toMatchObject({ chars: 12, lines: undefined })
    expect(hintLimits('步驟名，每行七字以內、兩行以內')).toEqual({
      chars: 7,
      perLine: true,
      lines: 2,
      perItem: false,
    })
    expect(hintLimits('三到五條支撐；每條一行')).toMatchObject({
      chars: undefined,
      lines: 1,
      perItem: true,
    })
    expect(hintLimits('單行、十六字以內')).toMatchObject({ chars: 16, lines: 1 })
    expect(hintLimits('頂欄右，自動填')).toEqual({
      chars: undefined,
      perLine: false,
      lines: undefined,
      perItem: false,
    })
  })
})

describe('measured capacity', () => {
  const box = (
    contentW: number,
    contentH: number,
    fontSize: number,
    lineHeight: number,
    letterSpacing = 0,
  ): TextCapacity => ({
    slide: 'p',
    el: 'x',
    role: '',
    contentW,
    contentH,
    fontSize,
    lineHeight,
    letterSpacing,
    ...capacityOf({ contentW, contentH, fontSize, lineHeight, letterSpacing }),
  })

  it('divides the content box by the glyph advance and the line height, with 2px of rounding slack', () => {
    // warm-keynote process step: 232×96 minus 16/14px padding and a 1px border
    expect(
      capacityOf({ contentW: 198, contentH: 66, fontSize: 26, lineHeight: 33.8, letterSpacing: 0 }),
    ).toEqual({
      charsPerLine: 7,
      lines: 2,
    })
    // warm-keynote meta chip, mono with 0.06em tracking
    expect(
      capacityOf({
        contentW: 259,
        contentH: 48,
        fontSize: 24,
        lineHeight: 48,
        letterSpacing: 1.44,
      }),
    ).toEqual({
      charsPerLine: 10,
      lines: 1,
    })
    // warm-keynote lede: one line of 53
    expect(
      capacityOf({
        contentW: 1718,
        contentH: 60,
        fontSize: 32,
        lineHeight: 51.2,
        letterSpacing: 0,
      }),
    ).toEqual({
      charsPerLine: 53,
      lines: 1,
    })
  })

  it('flags a hint that promises more characters or lines than the box holds', () => {
    const step = box(198, 66, 26, 33.8)
    expect(checkHint('步驟名，每行七字以內、兩行以內', step)).toBeNull()
    expect(checkHint('步驟名，兩行以內、十字以內', step)).toBeNull()
    expect(checkHint('步驟名，每行十字以內', step)).toMatch(/10 characters per line/)
    expect(checkHint('三行以內', step)).toMatch(/3 lines/)
    const lede = box(1718, 60, 32, 51.2)
    expect(checkHint('一到兩行導語，六十字以內', lede)).toMatch(/2 lines/)
    expect(checkHint('一行導語，五十字以內', lede)).toBeNull()
    // lines about items (每條一行) are not lines of the box
    expect(checkHint('三到五條支撐；每條一行', lede)).toBeNull()
    expect(checkHint('頂欄右，自動填', lede)).toBeNull()
  })
})
