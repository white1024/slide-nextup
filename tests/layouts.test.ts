import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Slot } from '../src/model/deck.ts'
import { checkLayout, checkTheme, scanLayoutHtml } from '../src/qa/layout-check.ts'
import { measureSlide, summariseOverflow, waitForFit } from '../src/qa/measure.ts'
import {
  type Layout,
  listLayoutIds,
  listThemeIds,
  loadLayout,
  loadTheme,
  themeCssVariables,
} from '../src/render/assets.ts'
import { renderPreviewDocument } from '../src/render/preview.ts'
import {
  applyTextOverride,
  inlineMarkup,
  overrideToInlineStyle,
  renderSlideHtml,
  renderSlot,
  slotText,
} from '../src/render/slide.ts'

const layoutIds = listLayoutIds()
const theme = loadTheme('ink-paper')

describe('shipped themes and layouts', () => {
  it('ships the ink-paper theme and the first-batch layouts (more may be added per deck)', () => {
    expect(listThemeIds()).toContain('ink-paper')
    expect(layoutIds).toEqual(
      expect.arrayContaining(['cards', 'closing', 'comparison', 'cover', 'photo', 'statement']),
    )
  })

  it('theme.json validates, theme.css is appearance-only and tokens become CSS variables', () => {
    expect(checkTheme(theme)).toEqual([])
    const vars = themeCssVariables(theme.json)
    expect(vars).toContain('--color-accent: #c8102e;')
    expect(vars).toContain('--font-display:')
    expect(vars).toContain('--radius: 4px;')
  })

  it.each(layoutIds)('layout %s passes the contract check', (id) => {
    expect(checkLayout(loadLayout(id))).toEqual([])
  })
})

describe('layout contract violations', () => {
  const mutate = (id: string, f: (l: Layout) => void): Layout => {
    const l = loadLayout(id)
    const copy: Layout = { ...l, json: structuredClone(l.json) }
    f(copy)
    return copy
  }

  it('rejects an element declared in json but missing in html', () => {
    const l = mutate('cover', (x) => {
      x.json.elements.push({ id: 'ghost', kind: 'shape' })
    })
    const msgs = checkLayout(l).map((i) => i.message)
    expect(msgs.some((m) => m.includes('ghost') && m.includes('layout.html'))).toBe(true)
  })

  it('rejects a data-el in html that json does not declare', () => {
    const l = mutate('cover', (x) => {
      x.html = x.html.replace(
        '</section>',
        '<div data-el="extra" data-role="divider"></div></section>',
      )
    })
    const msgs = checkLayout(l).map((i) => i.message)
    expect(
      msgs.some((m) => m.includes('data-el="extra"') && m.includes('沒有在 layout.json')),
    ).toBe(true)
  })

  it('rejects a slot whose element kind cannot hold it, and a missing placeholder', () => {
    const l = mutate('cover', (x) => {
      x.json.slots.backdrop = { type: 'text', required: false }
      x.html = x.html.replace('{{subtitle}}', '')
    })
    const msgs = checkLayout(l).map((i) => i.message)
    expect(msgs.some((m) => m.includes('backdrop') && m.includes('shape'))).toBe(true)
    expect(msgs.some((m) => m.includes('{{subtitle}}'))).toBe(true)
  })

  it('rejects layout css that paints', () => {
    const l = mutate('cover', (x) => {
      x.css += '\n[data-layout="cover"] [data-el="title"] { color: red; }'
    })
    const msgs = checkLayout(l).map((i) => i.message)
    expect(msgs.some((m) => m.includes('color') && m.includes('主題'))).toBe(true)
  })

  it('scanLayoutHtml reports elements, slots, roles and placeholders', () => {
    const scan = scanLayoutHtml(loadLayout('comparison').html)
    expect(scan.elements.filter((e) => e.el).map((e) => e.el)).toEqual([
      'title',
      'divider',
      'left-title',
      'left-items',
      'right-title',
      'right-items',
    ])
    expect(scan.placeholders).toEqual([
      'title',
      'left-title',
      'left-items',
      'right-title',
      'right-items',
    ])
  })
})

describe('slide rendering', () => {
  it('renders each slot type and escapes html', () => {
    expect(renderSlot({ type: 'text', value: 'a<b\nc' })).toBe('a&lt;b<br>c')
    expect(renderSlot({ type: 'list', items: ['x', 'y'] })).toBe(
      '<ul class="list"><li>x</li><li>y</li></ul>',
    )
    expect(renderSlot({ type: 'image', src: 'p.png', alt: 'q"' })).toBe(
      '<img src="p.png" alt="q&quot;">',
    )
    expect(renderSlot({ type: 'metric', value: '0', label: 'L' })).toContain('metric-value">0<')
  })

  it('renders chart, table, code and icon slots', () => {
    const bar = renderSlot({
      type: 'chart',
      kind: 'bar',
      series: [
        { label: 'a', value: 3 },
        { label: 'b', value: 1 },
      ],
      unit: 'x',
    })
    expect(bar).toContain('<svg class="chart chart-bar"')
    expect(bar).toContain('class="chart-fill"')
    expect(bar).toContain('>3x<')
    expect(
      renderSlot({ type: 'chart', kind: 'donut', series: [{ label: 'done', value: 40 }] }),
    ).toContain('chart-ring-fill')
    expect(
      renderSlot({
        type: 'chart',
        kind: 'line',
        series: [
          { label: 'q1', value: 1 },
          { label: 'q2', value: 2 },
        ],
      }),
    ).toContain('<polyline class="chart-line"')
    expect(
      renderSlot({ type: 'chart', kind: 'progress', series: [{ label: 'p', value: 50 }] }),
    ).toContain('chart chart-progress')
    expect(renderSlot({ type: 'table', header: ['a', 'b'], rows: [['1', '<2>']] })).toBe(
      '<table class="table"><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>&lt;2&gt;</td></tr></tbody></table>',
    )
    expect(renderSlot({ type: 'code', value: 'a<b', lang: 'sh' })).toBe(
      '<pre class="code" data-lang="sh"><code>a&lt;b</code></pre>',
    )
    expect(renderSlot({ type: 'icon', name: 'check' })).toContain('href="#icon-check"')
  })

  it('text overrides edit charts, tables, code and icons as rows of text', () => {
    const chart: Slot = {
      type: 'chart',
      kind: 'bar',
      series: [{ label: 'a', value: 1 }],
      unit: '%',
    }
    expect(applyTextOverride(chart, 'x｜2\ny | 3.5\nbad')).toEqual({
      type: 'chart',
      kind: 'bar',
      series: [
        { label: 'x', value: 2 },
        { label: 'y', value: 3.5 },
      ],
      unit: '%',
    })
    expect(slotText(chart)).toBe('a｜1')
    const table: Slot = { type: 'table', header: ['h1', 'h2'], rows: [['a', 'b']] }
    expect(applyTextOverride(table, 'H1 | H2\n1 | 2\n3 | 4')).toEqual({
      type: 'table',
      header: ['H1', 'H2'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    })
    expect(slotText(table)).toBe('h1 | h2\na | b')
    expect(applyTextOverride({ type: 'code', value: 'x' }, 'y\nz')).toEqual({
      type: 'code',
      value: 'y\nz',
    })
    expect(applyTextOverride({ type: 'icon', name: 'check' }, ' cpu \n')).toEqual({
      type: 'icon',
      name: 'cpu',
    })
  })

  it('turns *word* into <em> after escaping, keeps \\* literal, and works inside lists and metrics', () => {
    expect(inlineMarkup('先確認*敘事*，再做簡報')).toBe('先確認<em>敘事</em>，再做簡報')
    expect(inlineMarkup('a \\* b')).toBe('a * b')
    expect(inlineMarkup('*<b>*')).toBe('<em>&lt;b&gt;</em>')
    expect(inlineMarkup('unclosed * star')).toBe('unclosed * star')
    expect(renderSlot({ type: 'list', items: ['*x*', 'y'] })).toBe(
      '<ul class="list"><li><em>x</em></li><li>y</li></ul>',
    )
    expect(renderSlot({ type: 'metric', value: '72%', label: '*主要*指標' })).toContain(
      'metric-label"><em>主要</em>指標<',
    )
  })

  it('fills placeholders, stamps the slide id and applies overrides inline', () => {
    const layout = loadLayout('cover')
    const html = renderSlideHtml({
      layout,
      slideId: 's1',
      slots: { title: { type: 'text', value: '標題' } },
      overrides: {
        's1/title': { x: 10, y: 20, style: { fontSize: 100, color: '#fff' }, text: '覆寫標題' },
        's1/backdrop': { hidden: true },
        's2/title': { x: 999 },
      },
    })
    expect(html).toContain('data-layout="cover" data-slide="s1"')
    expect(html).toContain('>覆寫標題</h1>')
    expect(html).toContain('data-el="title" style="left:10px;top:20px;font-size:100px;color:#fff"')
    expect(html).toContain('data-el="backdrop" data-hidden="true"')
    expect(html).not.toContain('999')
    expect(html).toContain('data-el="kicker" data-slot="kicker" data-role="kicker"></p>')
  })

  it('maps override fields to css', () => {
    expect(
      overrideToInlineStyle({
        w: 5,
        h: 6,
        rotation: 3,
        z: 2,
        style: { opacity: 0.5, borderRadius: 8 },
      }),
    ).toBe('width:5px;height:6px;transform:rotate(3deg);z-index:2;opacity:0.5;border-radius:8px')
  })
})

describe('layouts in a real browser', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  it.each(layoutIds)('%s renders its sample without overflow', async (id) => {
    const layout = loadLayout(id)
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.setContent(
      renderPreviewDocument({ theme, layout, slideId: id, slots: layout.json.sample }),
    )
    await waitForFit(page)
    const boxes = await measureSlide(page)
    expect(boxes.map((b) => b.el).sort()).toEqual(layout.json.elements.map((e) => e.id).sort())
    expect(summariseOverflow(boxes)).toEqual([])
    for (const b of boxes.filter((x) => x.hasText))
      expect(b.fontSize, `${id}/${b.el}`).toBeGreaterThanOrEqual(b.role === 'meta' ? 20 : 28)
    await page.close()
  })

  it('data-fit shrinks an overlong text down towards the role minimum without overflow', async () => {
    const layout = loadLayout('quote')
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    const long = '這是一句故意寫得很長很長的引言，'.repeat(6)
    await page.setContent(
      renderPreviewDocument({
        theme,
        layout,
        slideId: 'fit',
        slots: { ...layout.json.sample, title: { type: 'text', value: long } },
      }),
    )
    await waitForFit(page)
    const boxes = await measureSlide(page)
    const title = boxes.find((b) => b.el === 'title') as (typeof boxes)[number]
    expect(title.fontSize).toBeLessThan(80)
    expect(title.fontSize).toBeGreaterThanOrEqual(32)
    expect(summariseOverflow(boxes)).toEqual([])
    await page.close()
  })

  it('theme css does not move any box (geometry invariant)', async () => {
    // one page for all layouts: opening a page per layout costs seconds each under emulation
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    for (const id of layoutIds) {
      const layout = loadLayout(id)
      await page.setContent(
        renderPreviewDocument({ theme, layout, slideId: id, slots: layout.json.sample }),
      )
      const themed = await measureSlide(page)
      await page.setContent(
        renderPreviewDocument({
          theme,
          layout,
          slideId: id,
          slots: layout.json.sample,
          withoutTheme: true,
        }),
      )
      const bare = await measureSlide(page)
      for (const a of themed) {
        const b = bare.find((x) => x.el === a.el)
        expect(b, `${id}/${a.el}`).toBeDefined()
        for (const k of ['x', 'y', 'w', 'h'] as const) {
          expect(Math.abs(a[k] - (b as typeof a)[k]), `${id}/${a.el}.${k}`).toBeLessThanOrEqual(0.5)
        }
      }
    }
    await page.close()
  }, 120_000)
})
