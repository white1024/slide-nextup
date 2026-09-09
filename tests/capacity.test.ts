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

  it('reads the English hint grammar the same way', () => {
    expect(hintLimits('one line, up to 24 characters')).toEqual({
      chars: 24,
      perLine: false,
      lines: 1,
      perItem: false,
    })
    expect(hintLimits('occasion or series name, 4 to 12 characters')).toMatchObject({
      chars: 12,
      lines: undefined,
    })
    expect(hintLimits('step name, up to 7 characters per line, up to 2 lines')).toEqual({
      chars: 7,
      perLine: true,
      lines: 2,
      perItem: false,
    })
    expect(hintLimits('3 to 5 supporting points, one line each')).toMatchObject({
      chars: undefined,
      lines: 1,
      perItem: true,
    })
    expect(hintLimits('a single-line claim, up to 16 characters')).toMatchObject({
      chars: 16,
      lines: 1,
    })
    expect(hintLimits('header row, up to 6 rows, 1 to 10 characters per cell')).toMatchObject({
      chars: 10,
      perLine: true,
      lines: undefined,
      perItem: true,
    })
    expect(hintLimits('top bar right, filled automatically')).toEqual({
      chars: undefined,
      perLine: false,
      lines: undefined,
      perItem: false,
    })
  })

  it('reads the item count in both grammars, with a word or two before the unit', () => {
    expect(hintLimits('2 to 3 supporting points, up to 2 lines each').items).toBe(3)
    expect(hintLimits('the members as chips, 4 to 9 items, up to 12 characters each').items).toBe(9)
    expect(hintLimits('3 supporting points, up to 2 lines each').items).toBe(3)
    expect(hintLimits('三到五條支撐；每條一行').items).toBe(5)
    expect(hintLimits('2到3點，每點兩行').items).toBe(3)
    // no item count: a total of lines, a table of rows, a hint with no numbers at all
    expect(hintLimits('one line, up to 24 characters').items).toBeUndefined()
    expect(
      hintLimits('header row, up to 6 rows, 1 to 10 characters per cell').items,
    ).toBeUndefined()
    expect(hintLimits('top bar right, filled automatically').items).toBeUndefined()
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

  it('counts a list by items, each costing its lines plus the margin between them', () => {
    // technical-brief cards-list: the items box of a card, 16px between items
    const items = { ...box(488, 360, 32, 51.2), items: 3, itemGap: 16 }
    expect(checkHint('2 to 3 supporting points, up to 2 lines each', items)).toBeNull()
    expect(checkHint('4 points, up to 2 lines each', items)).toMatch(/only holds 3 such items/)
    expect(checkHint('2 to 3 supporting points, up to 3 lines each', items)).toMatch(
      /3 items × 3 lines/,
    )
    // 5 items of one line each still fit: 5 × (51.2 + 16) = 336px of 360px
    expect(checkHint('up to 5 items, one line each', items)).toBeNull()
    // a hint with no item count says nothing about items
    expect(checkHint('one paragraph, up to 6 lines', items)).toBeNull()
    // the same numbers on an element with no list measured are left alone
    expect(checkHint('4 points, up to 2 lines each', box(488, 360, 32, 51.2))).toBeNull()
  })

  it('counts chips by how many fit in a row and how many rows the box holds', () => {
    // technical-brief chips-2: 756×200 at 24px, one chip padded 16/8 with a 12px gap
    const chips = {
      ...box(756, 200, 24, 36),
      items: 9,
      itemGap: 12,
      chip: { padX: 32, padY: 16, marginX: 12, marginY: 12, lineHeight: 36 },
    }
    // 12 characters make a 332px chip: two to a row, so nine of them need five rows of the three
    expect(
      checkHint('the members as chips, 4 to 9 items, up to 12 characters each', chips),
    ).toMatch(/9 chips of 12 characters, which need 5 rows/)
    expect(
      checkHint('the members as chips, 4 to 9 items, up to 12 characters each', chips),
    ).toMatch(/the box holds 3 rows/)
    // 8 characters make a 236px chip: three to a row, so nine of them fit in three rows
    expect(
      checkHint('the members as chips, 4 to 9 items, up to 8 characters each', chips),
    ).toBeNull()
    // chips are not lines: the same hint read as a list would have failed on nine items
    expect(checkHint('4 to 9 items', chips)).toBeNull()
  })
})
