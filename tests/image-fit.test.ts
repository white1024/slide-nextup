import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Slot } from '../src/model/deck.ts'
import { launchChromium } from '../src/qa/browser.ts'
import { checkLayout } from '../src/qa/layout-check.ts'
import { IMAGE_CROP_LIMIT, imageFitProblem, runDeckQa } from '../src/qa/run.ts'
import { sampleDeck } from '../src/qa/theme-qa.ts'
import { layoutFitCss, loadLayout, validateLayoutJson } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

/** a 4:1 picture, the shape of an architecture diagram that no photo frame fits */
const WIDE: Slot = {
  type: 'image',
  src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='100'><rect width='400' height='100' fill='%23888'/></svg>",
  alt: 'a wide diagram',
}

describe('image fit', () => {
  it('names the crop cover would make, and stays quiet for contain, a fair crop or a picture that did not load', () => {
    const wide = { slide: 's1', el: 'photo', naturalW: 400, naturalH: 100, boxW: 1056, boxH: 888 }
    const problem = imageFitProblem({ ...wide, fit: 'cover' })
    expect(problem).toContain('image is 4.00:1 but the box is 1.19:1')
    expect(problem).toContain('cover crops 70% of it')
    expect(problem).toContain('fit: contain')
    expect(imageFitProblem({ ...wide, fit: 'contain' })).toBeNull()
    expect(imageFitProblem({ ...wide, fit: 'cover', naturalW: 0 })).toBeNull()
    // 1.9:1 in a 1.78:1 box cuts off 6%, well under the limit
    expect(
      imageFitProblem({
        slide: 's1',
        el: 'p',
        naturalW: 1900,
        naturalH: 1000,
        boxW: 1920,
        boxH: 1080,
        fit: 'cover',
      }),
    ).toBeNull()
    expect(IMAGE_CROP_LIMIT).toBe(0.25)
  })

  it('turns a declared fit into an object-fit rule that every renderer appends', () => {
    const declared = loadLayout('photo', 'technical-brief')
    expect(declared.json.slots.photo?.fit).toBe('contain')
    expect(layoutFitCss(declared)).toBe(
      '[data-layout="photo"] [data-el="photo"] img { object-fit: contain; }',
    )
    expect(layoutFitCss(loadLayout('photo'))).toBe('')
    const html = renderDeckDocument(sampleDeck('technical-brief', undefined, ['photo']), {
      deckDir: resolve('examples'),
      outDir: resolve('examples'),
    }).html
    expect(html).toContain('[data-layout="photo"] [data-el="photo"] img { object-fit: contain; }')
    expect(declared.css).not.toContain('object-fit')
  })

  it('accepts only cover and contain, and only on image slots', () => {
    const generic = loadLayout('photo')
    const withFit = (fit: string, slot = 'photo') => ({
      ...generic.json,
      slots: { ...generic.json.slots, [slot]: { ...generic.json.slots[slot], fit } },
    })
    expect(validateLayoutJson(withFit('contain'))).toBe(true)
    expect(validateLayoutJson(withFit('cover'))).toBe(true)
    expect(validateLayoutJson(withFit('stretch'))).toBe(false)
    const misplaced = checkLayout({
      ...generic,
      json: withFit('contain', 'title') as typeof generic.json,
    })
    expect(misplaced.map((i) => i.message).join('\n')).toContain(
      'slot `title` declares fit but is not an image slot',
    )
    expect(checkLayout(generic).filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('image-fit in the QA', () => {
  let browser: Awaited<ReturnType<typeof launchChromium>>
  beforeAll(async () => {
    browser = await launchChromium()
  })
  afterAll(async () => {
    await browser.close()
  })

  it('warns for a wide diagram in a cover frame and not in a frame declared contain', async () => {
    const cover = sampleDeck('blue-professional', undefined, ['photo'])
    const slide = cover.slides[0]
    if (!slide) throw new Error('no photo slide')
    slide.slots.photo = WIDE
    const report = await runDeckQa(cover, { deckDir: resolve('examples'), browser })
    const fits = report.slides[0]?.findings.filter((f) => f.rule === 'image-fit') ?? []
    expect(fits).toHaveLength(1)
    expect(fits[0]?.severity).toBe('warning')
    expect(fits[0]?.element).toBe('photo')
    expect(fits[0]?.message).toContain('cover crops')
    expect(report.errors).toBe(0)

    const contain = sampleDeck('technical-brief', undefined, ['photo'])
    const diagram = contain.slides[0]
    if (!diagram) throw new Error('no photo slide')
    diagram.slots.photo = WIDE
    const quiet = await runDeckQa(contain, { deckDir: resolve('examples'), browser })
    expect(quiet.slides[0]?.findings.filter((f) => f.rule === 'image-fit')).toEqual([])
  }, 60_000)
})
