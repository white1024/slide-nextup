import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { floorRoleOf, MIN_FONT_BY_ROLE, minFontFor } from '../src/qa/font-floors.ts'
import { scanLayoutHtml } from '../src/qa/layout-check.ts'
import { cssMentionsTone, runThemeCheck, tonesUsedBy } from '../src/qa/theme-check.ts'
import { PROJECT_ROOT, validateThemeJson } from '../src/render/assets.ts'
import { FIT_JS } from '../src/render/runtime.ts'

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-tones-'))
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('a role of your own', () => {
  it('inherits the floor of its longest known prefix, else counts as content', () => {
    expect(floorRoleOf('eyebrow-accent-2')).toBe('eyebrow-accent')
    expect(floorRoleOf('meta-right')).toBe('meta')
    expect(floorRoleOf('chapter-2-big')).toBe('chapter')
    expect(floorRoleOf('flow')).toBe('flow')
    expect(floorRoleOf('custom-thing')).toBeUndefined()
    expect(floorRoleOf('default')).toBeUndefined()
    expect(minFontFor('eyebrow-accent-2')).toBe(20)
    expect(minFontFor('meta-right')).toBe(20)
    expect(minFontFor('chapter-2')).toBe(24)
    expect(minFontFor('custom-thing')).toBe(32)
    expect(minFontFor('eyebrow-accent-2', 16)).toBe(16)
  })

  it('is walked the same way by the player auto-fit', () => {
    const m = /(function floorFor\(role\) \{[\s\S]*?\n {2}\})/.exec(FIT_JS)
    if (!m) throw new Error('FIT_JS has no floorFor')
    const floorFor = new Function('MIN', `${m[1]}; return floorFor;`)(MIN_FONT_BY_ROLE) as (
      role?: string,
    ) => number
    for (const role of [
      'eyebrow-accent-2',
      'meta-right',
      'chapter-2',
      'custom-thing',
      'title',
      undefined,
    ]) {
      expect(floorFor(role), role).toBe(minFontFor(role ?? ''))
    }
  })
})

describe('tones', () => {
  it('are read off the layouts and matched against the theme', () => {
    const html = `<section class="slide" data-layout="x" data-tone="inverse"><p data-el="a" data-role="label" data-tone="second">{{a}}</p><p data-el="b" data-role="label" data-tone="second"></p></section>`
    expect(scanLayoutHtml(html).tones).toEqual(['inverse', 'second'])
    expect(scanLayoutHtml(html).hasTone).toBe(true)
    expect(scanLayoutHtml('<section class="slide"></section>').tones).toEqual([])
    expect(tonesUsedBy([html, '<p data-tone="third"></p>'])).toEqual(['inverse', 'second', 'third'])
    expect(cssMentionsTone('[data-role="x"][data-tone="second"] { color: red }', 'second')).toBe(
      true,
    )
    expect(cssMentionsTone('[data-role="x"] { color: red }', 'second')).toBe(false)
  })

  it('are listed in theme.json as lowercase names, once each', () => {
    const base = JSON.parse(
      readFileSync(join(PROJECT_ROOT, 'themes', 'technical-brief', 'theme.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(base.tones).toEqual(['inverse', 'second', 'third'])
    expect(validateThemeJson(base)).toBe(true)
    expect(validateThemeJson({ ...base, tones: ['Second'] })).toBe(false)
    expect(validateThemeJson({ ...base, tones: ['second', 'second'] })).toBe(false)
  })

  it('theme:check warns about a tone the layouts ask for and the CSS never styles, and about a listed tone with no rule', () => {
    const userDir = join(tmp, 'themes')
    const dir = join(userDir, 'tb-tones')
    cpSync(join(PROJECT_ROOT, 'themes', 'technical-brief'), dir, { recursive: true })
    rmSync(join(dir, 'generate-layouts.cjs'), { force: true })
    const jsonFile = join(dir, 'theme.json')
    const json = JSON.parse(readFileSync(jsonFile, 'utf8')) as Record<string, unknown>
    json.id = 'tb-tones'
    json.tones = ['inverse', 'second', 'third', 'ghost']
    writeFileSync(jsonFile, `${JSON.stringify(json, null, 2)}\n`)
    const htmlFile = join(dir, 'layouts', 'cards-list', 'layout.html')
    writeFileSync(
      htmlFile,
      readFileSync(htmlFile, 'utf8').replace('data-tone="third"', 'data-tone="fourth"'),
    )

    const report = runThemeCheck('tb-tones', { userThemesDir: userDir })
    const messages = report.issues.map((i) => `${i.severity}: ${i.message}`)
    expect(messages).toContain(
      'warning: layouts use data-tone="fourth" but theme.css has no [data-tone="fourth"] rule; the element silently keeps the role\'s plain look',
    )
    expect(messages).toContain(
      'warning: theme.json lists tone `ghost` but theme.css has no [data-tone="ghost"] rule',
    )
    expect(messages.some((m) => m.includes('"second"') || m.includes('`second`'))).toBe(false)
    expect(report.errors).toBe(0)
  })
})
