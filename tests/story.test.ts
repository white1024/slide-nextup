import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkStory, loadStory, parseStory, type Story } from '../src/model/story.ts'

const sample = readFileSync(new URL('../examples/story.sample.md', import.meta.url), 'utf8')
const brokenFields = readFileSync(
  new URL('../examples/story.broken-fields.md', import.meta.url),
  'utf8',
)
const brokenRhythm = readFileSync(
  new URL('../examples/story.broken-rhythm.md', import.meta.url),
  'utf8',
)

interface SlideSpec {
  id?: string
  role?: string
  intensity?: number | string
  relation?: string
  message?: string
  extra?: string
}

function makeStory(slides: SlideSpec[], meta: Record<string, string | number> = {}): string {
  const fm = {
    title: '測試',
    audience: '測試受眾',
    occasion: '測試場合',
    duration_minutes: 10,
    density: 'standard',
    narrative_pattern: 'timeline',
    core_message: '一句核心主張。',
    ...meta,
  }
  const head = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${v}`), '---', '']
  const body = [
    '## 目標與受眾',
    '目標。',
    '',
    '## 核心主張',
    '主張。',
    '',
    '## 敘事骨架',
    '骨架。',
    '',
    '## 逐頁',
    '',
  ]
  slides.forEach((s, i) => {
    body.push(`### ${s.id ?? `s${i + 1}`} | 第 ${i + 1} 頁`)
    if (s.role !== undefined) body.push(`- scene_role: ${s.role}`)
    if (s.intensity !== undefined) body.push(`- intensity: ${s.intensity}`)
    if (s.relation !== undefined) body.push(`- content_relation: ${s.relation}`)
    if (s.message !== undefined) body.push(`- message: ${s.message}`)
    if (s.extra) body.push(s.extra)
    body.push('')
  })
  return [...head, ...body].join('\n')
}

const ok = (role: string, intensity: number, relation = 'statement'): SlideSpec => ({
  role,
  intensity,
  relation,
  message: '一句話。',
})

const rules = (text: string) => loadStory(text).diagnostics.map((d) => d.rule)
const errorsOf = (text: string) =>
  loadStory(text)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.rule)

describe('parseStory on the shipped sample', () => {
  it('parses meta, sections and eight slides without diagnostics', () => {
    const result = loadStory(sample)
    expect(result.hasErrors).toBe(false)
    expect(result.diagnostics).toEqual([])
    const story = result.story as Story
    expect(story.meta.title).toBe('Confirm the story before the slides')
    expect(story.meta.duration_minutes).toBe(12)
    expect(story.meta.density).toBe('standard')
    expect(story.sections.goal).toContain('with the new workflow next week')
    expect(story.slides).toHaveLength(8)
    expect(story.slides.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'])
  })

  it('keeps titles, list evidence, notes and heading line numbers', () => {
    const story = parseStory(sample).story as Story
    const s2 = story.slides[1] as Story['slides'][number]
    expect(s2.title).toBe('Three things today')
    expect(s2.evidence).toEqual([
      'Why the layout keeps changing',
      'What the new workflow looks like',
      "Next week's trial plan",
    ])
    expect(s2.notes).toContain('ten seconds')
    expect(sample.split('\n')[s2.line - 1]).toBe('### s2 | Three things today')
    const s1 = story.slides[0] as Story['slides'][number]
    expect(s1.evidence).toEqual([
      'Last quarter six decks averaged four rounds of revision, three of which touched only the layout.',
    ])
  })
})

describe('parseStory structural errors', () => {
  it('rejects a file without frontmatter', () => {
    const r = parseStory('# 沒有 frontmatter\n')
    expect(r.story).toBeNull()
    expect(r.diagnostics[0]).toMatchObject({ rule: 'frontmatter/missing', line: 1 })
  })

  it('reports missing frontmatter fields and bad enums with line numbers', () => {
    const text = makeStory([ok('hero', 4), ok('pause', 1), ok('close', 4)], {
      density: 'medium',
      audience: '',
    })
    const r = parseStory(text)
    expect(r.story).toBeNull()
    const density = r.diagnostics.find((d) => d.rule === 'frontmatter/enum')
    expect(density?.message).toContain('density')
    expect(text.split('\n')[(density?.line ?? 0) - 1]).toMatch(/^density:/)
    expect(
      r.diagnostics.some((d) => d.rule === 'frontmatter/field' && d.message.includes('audience')),
    ).toBe(true)
  })

  it('reports a missing section', () => {
    const text = makeStory([ok('hero', 4)]).replace('## 敘事骨架\n骨架。\n', '')
    expect(errorsOf(text)).toContain('section/missing')
  })

  it('accepts the English section headings and the Chinese ones as aliases', () => {
    const zh = makeStory([ok('hero', 4), ok('close', 2, 'closing')])
    const en = zh
      .replace('## 目標與受眾', '## Goal and audience')
      .replace('## 核心主張', '## Core message')
      .replace('## 敘事骨架', '## Narrative skeleton')
      .replace('## 逐頁', '## Slides')
    expect(en).not.toBe(zh)
    const a = parseStory(zh)
    const b = parseStory(en)
    expect(b.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(b.story?.sections).toEqual(a.story?.sections)
    expect(b.story?.slides.map((s) => s.id)).toEqual(a.story?.slides.map((s) => s.id))
    // mixed and case-insensitive headings still parse
    const mixed = en.replace('## Core message', '## core MESSAGE').replace('## Slides', '## 逐頁')
    expect(parseStory(mixed).diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    // a missing English section is reported with the canonical name and the alias
    const missing = en.replace('## Narrative skeleton\n骨架。\n', '')
    const d = parseStory(missing).diagnostics.find((x) => x.rule === 'section/missing')
    expect(d?.message).toContain('`## Narrative skeleton`')
    expect(d?.message).toContain('`## 敘事骨架`')
  })

  it('reports missing slide fields, bad enums and out-of-range intensity', () => {
    const text = makeStory([
      { role: 'hero', intensity: 4, message: '缺 relation。' },
      { role: 'villain', intensity: 9, relation: 'statement', message: 'x' },
      { role: 'close', intensity: 4, relation: 'closing' },
    ])
    const r = parseStory(text)
    expect(r.story).toBeNull()
    const msgs = r.diagnostics.map((d) => `${d.rule}:${d.message}`)
    expect(msgs.some((m) => m.startsWith('slide/enum:') && m.includes('content_relation'))).toBe(
      true,
    )
    expect(msgs.some((m) => m.startsWith('slide/enum:') && m.includes('villain'))).toBe(true)
    expect(msgs.some((m) => m.startsWith('slide/field:') && m.includes('intensity'))).toBe(true)
    expect(msgs.some((m) => m.startsWith('slide/field:') && m.includes('message'))).toBe(true)
  })

  it('rejects duplicate ids and multi-line messages', () => {
    const text = makeStory([
      { id: 'a', ...ok('hero', 4) },
      { id: 'a', ...ok('pause', 1) },
      { ...ok('close', 4), message: '|\n  第一句。\n  第二句。' },
    ])
    const r = errorsOf(text)
    expect(r).toContain('slide/duplicate-id')
    expect(r).toContain('message/single')
  })

  it('keeps an optional single-line chapter per slide and rejects other shapes', () => {
    const r = loadStory(
      makeStory([
        { ...ok('hero', 4), extra: '- chapter: 診斷' },
        { ...ok('pause', 1), extra: '- chapter:' },
        ok('close', 4, 'closing'),
      ]),
    )
    expect(r.hasErrors).toBe(false)
    // a known field: no unknown-field warning (the three-page story only draws the pacing one)
    expect(r.diagnostics.map((d) => d.rule)).toEqual(['pacing/pages'])
    expect(r.story?.slides.map((s) => s.chapter)).toEqual(['診斷', undefined, undefined])
    const bad = makeStory([
      { ...ok('hero', 4), extra: '- chapter: [a, b]' },
      ok('pause', 1),
      ok('close', 4, 'closing'),
    ])
    expect(errorsOf(bad)).toContain('slide/field')
    expect(loadStory(bad).story).toBeNull()
  })

  it('warns on unknown fields but still parses', () => {
    const text = makeStory([
      { ...ok('hero', 4), extra: '- layout: cover' },
      ok('pause', 1),
      ok('close', 4, 'closing'),
    ])
    const r = loadStory(text)
    expect(r.hasErrors).toBe(false)
    expect(r.story?.slides).toHaveLength(3)
    expect(rules(text)).toContain('slide/unknown-field')
  })
})

describe('checkStory rhythm rules', () => {
  it('flags a deck with no pause (no slide at intensity <= 2)', () => {
    const text = makeStory([ok('hero', 4), ok('evidence', 3), ok('close', 4, 'closing')])
    const r = loadStory(text)
    const d = r.diagnostics.find((x) => x.rule === 'rhythm/pause')
    expect(d?.severity).toBe('error')
    expect(text.split('\n')[(d?.line ?? 0) - 1]).toBe('### s2 | 第 2 頁')
  })

  it('flags a deck with no peak (no slide at intensity >= 4)', () => {
    const text = makeStory([ok('hero', 3), ok('pause', 1), ok('close', 3, 'closing')])
    expect(errorsOf(text)).toContain('rhythm/peak')
  })

  it('flags four consecutive slides with the same scene_role at the fourth heading', () => {
    const text = makeStory([
      ok('hero', 4),
      ok('evidence', 3),
      ok('evidence', 3),
      ok('evidence', 3),
      ok('evidence', 3),
      ok('pause', 1),
      ok('close', 4, 'closing'),
    ])
    const d = loadStory(text).diagnostics.find((x) => x.rule === 'rhythm/run')
    expect(d?.severity).toBe('error')
    expect(text.split('\n')[(d?.line ?? 0) - 1]).toBe('### s5 | 第 5 頁')
  })

  it('accepts exactly three consecutive slides with the same role', () => {
    const text = makeStory([
      ok('hero', 4),
      ok('evidence', 3),
      ok('evidence', 3),
      ok('evidence', 3),
      ok('pause', 1),
      ok('close', 4, 'closing'),
    ])
    expect(errorsOf(text)).toEqual([])
  })

  it('warns when the message holds more than one sentence', () => {
    const text = makeStory([
      { ...ok('hero', 4), message: '第一句。第二句。' },
      ok('pause', 1),
      ok('close', 4, 'closing'),
    ])
    const r = loadStory(text)
    expect(r.hasErrors).toBe(false)
    expect(r.diagnostics.find((d) => d.rule === 'message/single')?.severity).toBe('warning')
  })

  it('warns on evidence pages without evidence, odd open/close roles and pacing', () => {
    const text = makeStory([ok('map', 4), ok('evidence', 3, 'evidence'), ok('pause', 1)], {
      duration_minutes: 30,
    })
    const r = loadStory(text)
    expect(r.hasErrors).toBe(false)
    const rs = r.diagnostics.map((d) => d.rule)
    expect(rs).toContain('evidence/missing')
    expect(rs).toContain('structure/open')
    expect(rs).toContain('structure/close')
    expect(rs).toContain('pacing/pages')
  })

  it('returns nothing for an empty slide list', () => {
    const story = parseStory(sample).story as Story
    expect(checkStory({ ...story, slides: [] })).toEqual([])
  })
})

describe('the shipped broken examples', () => {
  it('story.broken-fields.md is caught for the bad density enum and the missing content_relation', () => {
    const r = loadStory(brokenFields)
    expect(r.hasErrors).toBe(true)
    expect(r.story).toBeNull()
    const lines = brokenFields.split('\n')
    const density = r.diagnostics.find((d) => d.rule === 'frontmatter/enum')
    expect(lines[(density?.line ?? 0) - 1]).toBe('density: medium')
    const relation = r.diagnostics.find((d) => d.rule === 'slide/enum' && d.message.includes('s2'))
    expect(relation).toBeDefined()
  })

  it('story.broken-rhythm.md parses cleanly but fails both rhythm rules with line numbers', () => {
    const r = loadStory(brokenRhythm)
    expect(r.story).not.toBeNull()
    expect(r.hasErrors).toBe(true)
    const lines = brokenRhythm.split('\n')
    const pause = r.diagnostics.find((d) => d.rule === 'rhythm/pause')
    expect(pause?.severity).toBe('error')
    expect(lines[(pause?.line ?? 0) - 1]).toBe('### s2 | Map')
    const run = r.diagnostics.find((d) => d.rule === 'rhythm/run')
    expect(run?.severity).toBe('error')
    expect(lines[(run?.line ?? 0) - 1]).toBe('### s6 | Evidence four')
  })
})
