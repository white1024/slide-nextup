import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classifyProperty,
  isEmptyContent,
  lintCss,
  lintLayoutScope,
  parseCss,
} from '../src/qa/css-ownership.ts'

const badTheme = readFileSync(new URL('./fixtures/bad-theme.css', import.meta.url), 'utf8')
const badLayout = readFileSync(new URL('./fixtures/bad-layout.css', import.meta.url), 'utf8')

describe('parseCss', () => {
  it('extracts declarations with selectors, line numbers and !important', () => {
    const decls = parseCss(
      `/* c */\na, b {\n  color: red;\n  width: 10px !important;\n}\n@media (min-width: 1px) {\n  .x { top: 0 }\n}\n@font-face { font-family: "F"; src: url(a.woff2) }`,
    )
    expect(decls.map((d) => [d.selector, d.property, d.line, d.important, d.atRule])).toEqual([
      ['a, b', 'color', 3, false, undefined],
      ['a, b', 'width', 4, true, undefined],
      ['.x', 'top', 7, false, 'media'],
      ['@font-face', 'font-family', 9, false, 'font-face'],
      ['@font-face', 'src', 9, false, 'font-face'],
    ])
  })

  it('keeps semicolons inside url() and quotes intact', () => {
    const decls = parseCss(`.a { background: url("x;y.png"); font-family: 'A;B', serif }`)
    expect(decls.map((d) => d.value)).toEqual(['url("x;y.png")', "'A;B', serif"])
  })
})

describe('classifyProperty', () => {
  it('splits geometry from appearance', () => {
    expect(classifyProperty('width')).toBe('geometry')
    expect(classifyProperty('grid-template-columns')).toBe('geometry')
    expect(classifyProperty('font-size')).toBe('geometry')
    expect(classifyProperty('color')).toBe('appearance')
    expect(classifyProperty('border-radius')).toBe('appearance')
    expect(classifyProperty('--color-ink')).toBe('custom')
    expect(classifyProperty('font')).toBe('forbidden')
    expect(classifyProperty('scroll-snap-type')).toBe('unknown')
  })
})

describe('lintCss as theme', () => {
  it('flags geometry, !important, layout-bound selectors and geometry smuggled through variables', () => {
    const issues = lintCss(badTheme, 'theme')
    const errors = issues.filter((i) => i.severity === 'error')
    const text = errors.map((i) => `${i.line}:${i.property ?? ''}:${i.message}`)
    expect(text.some((t) => t.startsWith('4:width:') && t.includes('geometry'))).toBe(true)
    expect(text.some((t) => t.startsWith('5:margin-top:'))).toBe(true)
    expect(text.some((t) => t.includes('!important'))).toBe(true)
    expect(text.some((t) => t.includes('data-layout'))).toBe(true)
    expect(text.some((t) => t.includes('--card-gap'))).toBe(true)
    expect(text.some((t) => t.includes('--radius'))).toBe(false)
    expect(text.some((t) => t.includes(':color:') && t.includes('geometry'))).toBe(false)
  })

  it('accepts a clean theme', () => {
    const css = `.slide { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-body); }
[data-role="card"] { border: 2px solid var(--color-line); border-radius: var(--radius); }
@font-face { font-family: "X"; src: url(x.woff2); }`
    expect(lintCss(css, 'theme')).toEqual([])
  })
})

describe('content on decorative pseudo-elements', () => {
  it('lets an empty content through on either side and refuses generated text', () => {
    for (const v of ['""', "''", 'none', 'normal', ' "" ', 'NONE'])
      expect(isEmptyContent(v)).toBe(true)
    for (const v of ['"→"', "'x'", 'attr(data-n)', 'counter(item)', 'url(x.png)', '" "'])
      expect(isEmptyContent(v)).toBe(false)
    expect(classifyProperty('content')).toBe('forbidden')

    const theme = `[data-role="eyebrow"]::after { content: ""; background: var(--color-line); }
.list li::before { content: none; }`
    expect(lintCss(theme, 'theme')).toEqual([])
    const layout = `[data-layout="demo"] [data-el="kicker"]::after { content: ""; width: 200px; height: 2px; }`
    expect(lintCss(layout, 'layout')).toEqual([])

    const text = lintCss(`[data-role="list"] li::before { content: "→"; }`, 'theme')
    expect(text).toHaveLength(1)
    expect(text[0]?.message).toContain('may only be empty')
    const generated = lintCss(
      `[data-layout="demo"] [data-el="x"]::after { content: attr(data-n); }`,
      'layout',
    )
    expect(generated.some((i) => i.property === 'content' && i.severity === 'error')).toBe(true)
  })
})

describe('lintCss as layout', () => {
  it('flags appearance properties and @font-face', () => {
    const issues = lintCss(badLayout, 'layout')
    const errors = issues.filter((i) => i.severity === 'error')
    const text = errors.map((i) => `${i.line}:${i.property ?? ''}:${i.message}`)
    expect(text.some((t) => t.startsWith('7:color:') && t.includes('appearance'))).toBe(true)
    expect(text.some((t) => t.startsWith('8:background:'))).toBe(true)
    expect(text.some((t) => t.includes('@font-face'))).toBe(true)
    expect(text.some((t) => t.includes(':left:') || t.includes(':top:'))).toBe(false)
  })

  it('accepts a clean layout and enforces the scope prefix', () => {
    const css = `[data-layout="demo"] [data-el="title"] { left: 96px; top: 96px; width: 100px; height: 50px; font-size: 40px; line-height: 1.2; }`
    expect(lintCss(css, 'layout')).toEqual([])
    expect(lintLayoutScope(css, 'demo')).toEqual([])
    const scope = lintLayoutScope(badLayout, 'demo')
    expect(scope.some((i) => i.selector === '[data-el="body"]')).toBe(true)
  })
})
