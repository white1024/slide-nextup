import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normaliseDeck, validateDeck } from '../src/model/deck.ts'
import { detectLang, langOf } from '../src/model/lang.ts'
import { scaffoldDeck } from '../src/model/scaffold.ts'
import { loadStory } from '../src/model/story.ts'
import { type LayoutJson, listLayoutIds, loadLayout } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const layouts = new Map<string, LayoutJson>(listLayoutIds().map((id) => [id, loadLayout(id).json]))

const story = (lines: string[], lang?: string) =>
  [
    '---',
    'title: Tidewatch progress',
    'audience: the manager',
    'occasion: weekly review',
    'duration_minutes: 10',
    'density: standard',
    'narrative_pattern: timeline',
    'core_message: One sentence.',
    ...(lang ? [`lang: ${lang}`] : []),
    '---',
    '',
    '## Goal and audience',
    'Goal.',
    '',
    '## Core message',
    'Message.',
    '',
    '## Narrative skeleton',
    'Skeleton.',
    '',
    '## Slides',
    '',
    ...lines,
  ].join('\n')

const slide = (id: string, role: string, intensity: number, title: string, message: string) => [
  `### ${id} | ${title}`,
  `- scene_role: ${role}`,
  `- intensity: ${intensity}`,
  `- content_relation: ${role === 'close' ? 'closing' : 'statement'}`,
  `- message: ${message}`,
  '',
]

function scaffold(text: string) {
  const loaded = loadStory(text)
  if (!loaded.story) throw new Error(JSON.stringify(loaded.diagnostics))
  return scaffoldDeck({
    story: loaded.story,
    storyText: text,
    storyRelativePath: 'story.md',
    deckId: 'lang-test',
    theme: 'ink-paper',
    layouts,
  }).deck
}

describe('the language tag', () => {
  it('guesses the script of the text', () => {
    expect(detectLang('Confirm the story before the slides')).toBe('en')
    expect(detectLang('先確認敘事，再做簡報')).toBe('zh-Hant')
    expect(detectLang('スライドの前に物語を')).toBe('ja')
    expect(detectLang('슬라이드 전에 이야기')).toBe('ko')
    expect(langOf('en-GB', '先確認敘事')).toBe('en-GB')
    expect(langOf('not a tag', '先確認敘事')).toBe('zh-Hant')
    expect(langOf(undefined, 'plain')).toBe('en')
  })

  it('is written by the scaffold from the frontmatter or the story text, and kept on an existing deck', () => {
    const en = scaffold(
      story([
        ...slide('s1', 'hero', 4, 'Opening', 'We confirm the story first.'),
        ...slide('s2', 'close', 2, 'Closing', 'Try it next week.'),
      ]),
    )
    expect(en.lang).toBe('en')
    const zh = scaffold(
      story([
        ...slide('s1', 'hero', 4, '開場', '先確認敘事。'),
        ...slide('s2', 'close', 2, '收尾', '下週試用。'),
      ]),
    )
    expect(zh.lang).toBe('zh-Hant')
    const declared = scaffold(
      story(
        [
          ...slide('s1', 'hero', 4, '開場', '先確認敘事。'),
          ...slide('s2', 'close', 2, '收尾', '下週試用。'),
        ],
        'en-GB',
      ),
    )
    expect(declared.lang).toBe('en-GB')
    // key order: after motion, before story
    expect(Object.keys(normaliseDeck({ ...declared, motion: 'off' }))).toEqual([
      'schemaVersion',
      'id',
      'title',
      'theme',
      'canvas',
      'motion',
      'lang',
      'story',
      'slides',
      'overrides',
    ])
    const invalid = validateDeck({ ...declared, lang: 'english language' })
    expect(invalid.ok ? [] : invalid.errors.map((e) => e.path)).toEqual(['/lang'])
    // an existing deck keeps its own tag when the story is scaffolded again
    const text = story([
      ...slide('s1', 'hero', 4, 'Opening', 'We confirm the story first.'),
      ...slide('s2', 'close', 2, 'Closing', 'Try it next week.'),
    ])
    const loaded = loadStory(text)
    if (!loaded.story) throw new Error('story')
    const again = scaffoldDeck({
      story: loaded.story,
      storyText: text,
      storyRelativePath: 'story.md',
      deckId: 'lang-test',
      theme: 'ink-paper',
      layouts,
      existing: { ...en, lang: 'en-US' },
    }).deck
    expect(again.lang).toBe('en-US')
  })

  it('reaches <html lang>: the declared tag wins, otherwise the text decides', () => {
    const deckDir = resolve('examples')
    const zh = scaffold(
      story([
        ...slide('s1', 'hero', 4, '開場', '先確認敘事。'),
        ...slide('s2', 'close', 2, '收尾', '下週試用。'),
      ]),
    )
    expect(renderDeckDocument(zh, { deckDir, outDir: deckDir }).html).toContain(
      '<html lang="zh-Hant">',
    )
    expect(
      renderDeckDocument({ ...zh, lang: 'en-GB' }, { deckDir, outDir: deckDir }).html,
    ).toContain('<html lang="en-GB">')
    const { lang: _omitted, ...undeclared } = zh
    expect(renderDeckDocument(undeclared, { deckDir, outDir: deckDir }).html).toContain(
      '<html lang="zh-Hant">',
    )
    const en = scaffold(
      story([
        ...slide('s1', 'hero', 4, 'Opening', 'We confirm the story first.'),
        ...slide('s2', 'close', 2, 'Closing', 'Try it next week.'),
      ]),
    )
    const { lang: _omitted2, ...undeclaredEn } = en
    expect(renderDeckDocument(undeclaredEn, { deckDir, outDir: deckDir }).html).toContain(
      '<html lang="en">',
    )
  })
})
