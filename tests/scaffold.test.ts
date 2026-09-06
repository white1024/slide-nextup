import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Deck, parseDeck, type Slide, validateDeck } from '../src/model/deck.ts'
import {
  autoLayout,
  autoSteps,
  BRAND_MAX_UNITS,
  chapterLabels,
  FURNITURE_MAX_UNITS,
  firstClause,
  fitLabel,
  furnitureDefaults,
  metricOrText,
  scaffoldDeck,
  seriesName,
  slotsFor,
  splitSide,
  textUnits,
} from '../src/model/scaffold.ts'
import { loadStory, type Story, type StorySlide } from '../src/model/story.ts'
import { confirmationStatus, writeConfirmation } from '../src/model/story-confirm.ts'
import { runDeckQa } from '../src/qa/run.ts'
import {
  type LayoutJson,
  listLayoutIds,
  listLayoutIdsFor,
  loadLayout,
} from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const storyText = readFileSync(resolve('examples/story.sample.md'), 'utf8')
const story = loadStory(storyText).story as Story
const layouts = new Map<string, LayoutJson>(listLayoutIds().map((id) => [id, loadLayout(id).json]))

function scaffold(extra: Partial<Parameters<typeof scaffoldDeck>[0]> = {}) {
  return scaffoldDeck({
    story,
    storyText,
    storyRelativePath: 'story.sample.md',
    deckId: 'story-first',
    theme: 'ink-paper',
    layouts,
    ...extra,
  })
}

describe('story → deck scaffolding', () => {
  it('fills brand / meta / page furniture only on layouts that declare those slots', () => {
    const furnished: LayoutJson = {
      ...(layouts.get('statement') as LayoutJson),
      id: 'furnished',
      slots: {
        ...(layouts.get('statement') as LayoutJson).slots,
        brand: { type: 'text', required: false },
        meta: { type: 'text', required: false },
        page: { type: 'text', required: false },
      },
    }
    const third = story.slides[2] as Story['slides'][number]
    const slots = slotsFor(third, furnished, story)
    expect(slots.brand).toEqual({ type: 'text', value: story.meta.title })
    expect(slots.meta).toEqual({ type: 'text', value: '週會提案' })
    expect(slots.page).toEqual({ type: 'text', value: '03 / 08' })
    const plain = slotsFor(third, layouts.get('statement') as LayoutJson, story)
    expect(Object.keys(plain)).not.toContain('brand')
    expect(Object.keys(plain)).not.toContain('page')
  })

  it('fills furniture with short labels: the occasion’s first clause and the title’s series name', () => {
    expect(firstClause('專案進度會，介紹健檢工具的現況、已交付的東西與工作方向')).toBe('專案進度會')
    expect(firstClause('週會提案')).toBe('週會提案')
    expect(firstClause('Q3 review: numbers and next steps')).toBe('Q3 review')
    expect(seriesName('Tidewatch 網站健檢工具：進度、交付與方向')).toBe('Tidewatch 網站健檢工具')
    expect(seriesName('先確認敘事，再做簡報')).toBe('先確認敘事，再做簡報')
    expect(seriesName('Quarterly Review — Q3')).toBe('Quarterly Review')
    expect(textUnits('專案進度會')).toBe(5)
    expect(textUnits('Tidewatch 網站健檢工具')).toBe(11)
    expect(textUnits('01 — 骨架')).toBe(5)
    expect(fitLabel('十個字十個字十個字十', FURNITURE_MAX_UNITS)).toBe('十個字十個字十個字十')
    expect(fitLabel('十一個字十一個字十一個', FURNITURE_MAX_UNITS)).toBe('')
    expect(fitLabel('', BRAND_MAX_UNITS)).toBe('')
    expect(furnitureDefaults(story)).toEqual({
      occasion: '週會提案',
      brand: '先確認敘事，再做簡報',
    })
  })

  it('leaves meta, brand and the hero kicker empty, with one warning each, when even the short form is too long', () => {
    const long: Story = {
      ...story,
      meta: {
        ...story.meta,
        occasion: '這是一個非常長而且沒有任何標點的場合描述',
        title: '一個沒有冒號而且超過二十四個字的簡報標題會讓頂欄的系列名放不下',
      },
    }
    const r = scaffold({ story: long, choices: { s3: 'process', s5: 'fact' } })
    for (const s of r.deck.slides) {
      expect(s.slots.meta, s.id).toBeUndefined()
      expect(s.slots.brand, s.id).toBeUndefined()
      expect(s.slots.kicker, s.id).toBeUndefined()
    }
    expect(r.warnings.filter((w) => w.includes('meta 留空'))).toHaveLength(1)
    expect(r.warnings.filter((w) => w.includes('brand 留空'))).toHaveLength(1)
    expect(r.warnings.find((w) => w.includes('meta 留空'))).toContain('s3、s5')
    // the sample story's labels are short, so no furniture is reported empty
    const short = scaffold({ choices: { s3: 'process', s5: 'fact' } })
    expect(short.warnings.filter((w) => w.includes('留空'))).toEqual([])
    expect(short.deck.slides[2]?.slots.meta).toEqual({ type: 'text', value: '週會提案' })
    expect(short.deck.slides[2]?.slots.brand).toEqual({
      type: 'text',
      value: '先確認敘事，再做簡報',
    })
  })

  it('numbers chapters in order of first appearance and puts the label in the kicker', () => {
    const chaptered: Story = {
      ...story,
      slides: story.slides.map((s) =>
        s.id === 's3' || s.id === 's4'
          ? { ...s, chapter: '診斷' }
          : s.id === 's5'
            ? { ...s, chapter: '解法' }
            : s,
      ),
    }
    expect([...chapterLabels(chaptered)]).toEqual([
      ['s3', '01 — 診斷'],
      ['s4', '01 — 診斷'],
      ['s5', '02 — 解法'],
    ])
    const r = scaffold({ story: chaptered, choices: { s3: 'fact', s4: 'photo-right', s5: 'hero' } })
    expect(r.deck.slides[2]?.slots.kicker).toEqual({ type: 'text', value: '01 — 診斷' })
    expect(r.deck.slides[3]?.slots.kicker).toEqual({ type: 'text', value: '01 — 診斷' })
    expect(r.deck.slides[4]?.slots.kicker).toEqual({ type: 'text', value: '02 — 解法' })
    expect(validateDeck(r.deck).ok).toBe(true)
    // without a chapter only a hero page gets the occasion in its kicker; others stay empty
    const plain = scaffold({ choices: { s3: 'fact' } })
    expect(plain.deck.slides[2]?.slots.kicker).toBeUndefined()
    expect(plain.deck.slides[2]?.slots.meta).toEqual({ type: 'text', value: '週會提案' })
    expect(plain.deck.slides[0]?.slots.kicker).toEqual({ type: 'text', value: '週會提案' })
  })

  it('picks layouts from scene role and content relation', () => {
    expect(story.slides.map((s) => `${s.id}=${autoLayout(s)}`)).toEqual([
      's1=cover',
      's2=cards',
      's3=statement',
      's4=comparison',
      's5=statement',
      's6=statement',
      's7=statement',
      's8=closing',
    ])
  })

  it('parses metric shorthand and comparison sides', () => {
    expect(metricOrText('72%｜主要指標｜較去年 +11pp')).toEqual({
      type: 'metric',
      value: '72%',
      label: '主要指標',
      delta: '較去年 +11pp',
    })
    expect(metricOrText('只是一句話')).toEqual({ type: 'text', value: '只是一句話' })
    expect(splitSide('現況：開簡報軟體 → 排版 → 講一遍')).toEqual({
      title: '現況',
      items: ['開簡報軟體', '排版', '講一遍'],
    })
    expect(splitSide(undefined)).toEqual({ title: '', items: [] })
  })

  it('produces a valid deck whose slides match their layouts and carry the story hash', () => {
    const r = scaffold()
    expect(validateDeck(r.deck).ok).toBe(true)
    expect(r.deck.story?.sha256).toHaveLength(64)
    expect(r.deck.slides).toHaveLength(8)
    expect(r.deck.slides[0]?.slots).toMatchObject({
      kicker: { type: 'text', value: '週會提案' },
      title: { type: 'text', value: '我們改簡報的時間，花在哪裡' },
      subtitle: { type: 'text', value: '我們改簡報的時間，多半花在版面而不是內容。' },
    })
    expect(r.deck.slides[3]?.slots).toMatchObject({
      'left-title': { type: 'text', value: '現況' },
      'right-items': { type: 'list', items: ['寫敘事', '確認', '生成版面', '只微調'] },
    })
    expect(r.deck.slides[1]?.slots['card-3']).toEqual({ type: 'text', value: '下週的試用計畫' })
    expect(r.warnings).toEqual([])
    expect(() =>
      renderDeckDocument(r.deck, { deckDir: resolve('examples'), outDir: resolve('dist') }),
    ).not.toThrow()
  })

  it('honours explicit layout choices and warns about slots it cannot fill', () => {
    const r = scaffold({ choices: { s3: 'photo', s5: 'cards' } })
    expect(r.chosen.s3).toBe('photo')
    expect(r.deck.slides[2]?.slots.photo).toMatchObject({ type: 'image' })
    expect(r.warnings.some((w) => w.includes('s3') && w.includes('photo'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('s5') && w.includes('card-2'))).toBe(true)
    expect(validateDeck(r.deck).ok).toBe(true)
    expect(() =>
      renderDeckDocument(r.deck, { deckDir: resolve('examples'), outDir: resolve('dist') }),
    ).toThrow(/card-2/)
  })

  it('keeps manual overrides when regenerating and reports orphans', () => {
    const existing = parseDeck(readFileSync(resolve('examples/deck.sample.json'), 'utf8'))
    if (!existing.ok) throw new Error('sample deck invalid')
    const r = scaffold({ existing: existing.deck, only: ['s6'], choices: { s6: 'statement' } })
    expect(r.deck.slides[5]?.layout).toBe('statement')
    expect(r.deck.slides[1]).toEqual(existing.deck.slides[1])
    expect(r.kept).toEqual(['s1/title'])
    expect(r.orphaned).toEqual(['s6/card-1', 's6/card-3'])
    expect(r.deck.overrides['s6/card-1']).toEqual(existing.deck.overrides['s6/card-1'])
    const again = scaffold({ existing: r.deck, only: ['s6'], choices: { s6: 'cards' } })
    expect(again.orphaned).toEqual([])
    expect(again.deck.overrides['s6/card-1']).toEqual(existing.deck.overrides['s6/card-1'])
  })

  it('keeps reveal steps on same-id elements when regenerating a slide and reports the rest', () => {
    const base = scaffold().deck
    const s2 = base.slides[1] as Slide
    // start from a slide with no steps at all (the scaffold assigns defaults to new slides)
    const withSteps: Deck = {
      ...base,
      slides: base.slides.map((s) =>
        s.id !== 's2'
          ? s
          : {
              ...s,
              elements: s.elements.map(({ step: _cleared, ...e }) =>
                e.id === 'card-2' ? { ...e, step: 2 } : e.id === 'card-3' ? { ...e, step: 3 } : e,
              ),
            },
      ),
    }
    expect(s2.layout).toBe('cards')
    // same layout: every step survives, overrides untouched
    const same = scaffold({ existing: withSteps, only: ['s2'], choices: { s2: 'cards' } })
    const steps = (d: Deck) =>
      Object.fromEntries(
        (d.slides[1] as Slide).elements.filter((e) => e.step).map((e) => [e.id, e.step]),
      )
    expect(steps(same.deck)).toEqual({ 'card-2': 2, 'card-3': 3 })
    expect(same.stepsKept).toEqual(['s2/card-2=2', 's2/card-3=3'])
    expect(same.stepsDropped).toEqual([])
    expect(validateDeck(same.deck).ok).toBe(true)
    // different layout: only elements that still exist keep their step, the rest are reported
    const changed = scaffold({ existing: withSteps, only: ['s2'], choices: { s2: 'statement' } })
    expect(steps(changed.deck)).toEqual({})
    expect(changed.stepsKept).toEqual([])
    expect(changed.stepsDropped).toEqual(['s2/card-2=2', 's2/card-3=3'])
    // untouched slides and a full regenerate without an existing deck report nothing
    expect(scaffold({ existing: withSteps, only: ['s1'] }).stepsKept).toEqual([])
    expect(scaffold().stepsKept).toEqual([])
  })

  it('leaves the transition to the theme, gives a default reveal order, and leaves regenerated slides alone', () => {
    const r = scaffold()
    expect(r.deck.transition).toBeUndefined()
    const steps = (d: Deck, i: number) =>
      Object.fromEntries(
        (d.slides[i] as Slide).elements.filter((e) => e.step).map((e) => [e.id, e.step]),
      )
    expect(steps(r.deck, 0)).toEqual({})
    expect(steps(r.deck, 1)).toEqual({ 'card-1': 1, 'card-2': 2, 'card-3': 3 })
    expect(r.stepsAuto).toContain('s2/card-1=1')
    expect(r.stepsAuto).toContain('s8/cta=1')
    expect(validateDeck(r.deck).ok).toBe(true)
    // regenerating an existing slide never re-applies the defaults: the editor's state wins, even "no steps"
    const cleared: Deck = {
      ...r.deck,
      slides: r.deck.slides.map((s) => ({
        ...s,
        elements: s.elements.map(({ step: _cleared, ...e }) => e),
      })),
    }
    const again = scaffold({ existing: cleared, only: ['s2'], choices: { s2: 'cards' } })
    expect(steps(again.deck, 1)).toEqual({})
    expect(again.stepsAuto).toEqual([])
    // the table itself
    expect(
      autoSteps('comparison', [
        { id: 'left-title' },
        { id: 'left-items' },
        { id: 'divider' },
        { id: 'right-title' },
        { id: 'right-items' },
      ]),
    ).toEqual(
      new Map([
        ['left-title', 1],
        ['left-items', 1],
        ['right-title', 2],
        ['right-items', 2],
      ]),
    )
    expect(
      autoSteps('process', [
        { id: 'rail' },
        { id: 'node-1' },
        { id: 'step-1' },
        { id: 'arrow-1' },
        { id: 'step-2' },
      ]),
    ).toEqual(
      new Map([
        ['node-1', 1],
        ['step-1', 1],
        ['arrow-1', 2],
        ['step-2', 2],
      ]),
    )
    expect(autoSteps('before-after', [{ id: 'before' }, { id: 'arrow' }, { id: 'after' }])).toEqual(
      new Map([
        ['before', 1],
        ['arrow', 2],
        ['after', 2],
      ]),
    )
    expect(autoSteps('hero', [{ id: 'stat-1' }, { id: 'stat-2' }])).toEqual(new Map())
    expect(autoSteps('closing', [{ id: 'title' }, { id: 'cta' }])).toEqual(new Map([['cta', 1]]))
  })

  it('keeps page-level overrides across a regenerate and prunes ids the story no longer has', () => {
    const base = scaffold().deck
    base.pages = { order: ['s2', 's1'], hidden: ['s3'] }
    const kept = scaffold({ existing: base, only: ['s2'] })
    expect(kept.deck.pages).toEqual({ order: ['s2', 's1'], hidden: ['s3'] })
    expect(kept.pagesDropped).toEqual([])
    base.pages = { order: ['s2', 'gone'], hidden: ['s3'] }
    const pruned = scaffold({ existing: base, only: ['s2'] })
    expect(pruned.deck.pages).toEqual({ order: ['s2'], hidden: ['s3'] })
    expect(pruned.pagesDropped).toEqual(['order:gone'])
  })

  it('rejects an unknown slide id with a clear message', () => {
    expect(() => scaffold({ only: ['s99'] })).toThrow(/s99/)
    expect(() => scaffold({ only: ['s99'] })).toThrow(/s1, s2/)
  })

  it('accepts an agent-authored replacement slide', () => {
    const base = scaffold().deck
    const s3 = base.slides[2] as Slide
    const replacement: Slide = {
      ...s3,
      slots: { ...s3.slots, title: { type: 'text', value: '改寫後' } },
    }
    const r = scaffold({ existing: base, only: ['s3'], replacements: { s3: replacement } })
    expect(r.deck.slides[2]?.slots.title).toEqual({ type: 'text', value: '改寫後' })
    expect(validateDeck(r.deck).ok).toBe(true)
  })

  it('slotsFor never returns a slot the layout does not accept', () => {
    for (const [id, layout] of layouts) {
      for (const slide of story.slides) {
        const slots = slotsFor(slide, layout, story)
        for (const [slotId, slot] of Object.entries(slots)) {
          const decl = layout.slots[slotId]
          expect(decl, `${id}/${slotId}`).toBeDefined()
          const accepted = Array.isArray(decl?.type) ? decl?.type : [decl?.type]
          expect(accepted, `${id}/${slotId}`).toContain(slot.type)
        }
      }
    }
  })
})

describe('story confirmation gate', () => {
  it('is missing, then confirmed, then stale after an edit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'story-confirm-'))
    const file = join(dir, 'story.md')
    writeFileSync(file, storyText, 'utf8')
    expect(confirmationStatus(file).state).toBe('missing')
    const c = writeConfirmation(file, storyText, 8)
    expect(c.slides).toBe(8)
    expect(confirmationStatus(file)).toMatchObject({ state: 'confirmed' })
    writeFileSync(file, `${storyText}\n`, 'utf8')
    expect(confirmationStatus(file).state).toBe('stale')
  })
})

describe('the demo deck with the scaffold’s furniture defaults', () => {
  it('passes QA on warm-keynote without a single furniture edit (T-0020 acceptance)', async () => {
    const dir = resolve('examples/tidewatch-progress')
    const demo = loadStory(readFileSync(join(dir, 'story.md'), 'utf8')).story as Story
    const parsed = parseDeck(readFileSync(join(dir, 'deck.json'), 'utf8'))
    if (!parsed.ok) throw new Error('demo deck invalid')
    const deck = parsed.deck
    const themed = new Map<string, LayoutJson>(
      listLayoutIdsFor(deck.theme).map((id) => [id, loadLayout(id, deck.theme).json]),
    )
    const furniture = ['kicker', 'meta', 'brand', 'page']
    for (const slide of deck.slides) {
      const source = demo.slides.find((s) => s.id === slide.id) as StorySlide
      const defaults = slotsFor(source, themed.get(slide.layout) as LayoutJson, demo)
      for (const id of furniture) {
        delete slide.slots[id]
        const slot = defaults[id]
        if (slot) slide.slots[id] = slot
      }
      for (const key of Object.keys(deck.overrides)) {
        if (furniture.some((id) => key === `${slide.id}/${id}`)) delete deck.overrides[key]
      }
    }
    // what the scaffold now puts there instead of the whole occasion sentence
    expect(deck.slides[0]?.slots.brand).toEqual({ type: 'text', value: 'Tidewatch 網站健檢工具' })
    expect(deck.slides[3]?.slots.meta).toEqual({ type: 'text', value: '專案進度會' })
    expect(deck.slides[3]?.slots.kicker).toBeUndefined()
    expect(deck.slides[5]?.slots.page).toEqual({ type: 'text', value: '06 / 08' })
    const report = await runDeckQa(deck, { deckDir: dir })
    expect(
      report.slides.flatMap((s) => s.findings.map((f) => `${s.id}/${f.element}:${f.rule}`)),
    ).toEqual([])
    expect(report.errors).toBe(0)
  }, 60_000)
})

describe('deck fixtures stay in sync with the scaffold', () => {
  it('the shipped deck.sample.json uses the layouts the scaffold would pick, except where it deliberately differs', () => {
    const shipped = parseDeck(readFileSync(resolve('examples/deck.sample.json'), 'utf8'))
    if (!shipped.ok) throw new Error('sample deck invalid')
    const auto = scaffold().deck
    const diff = shipped.deck.slides
      .map((s, i) => [s.id, s.layout, (auto.slides[i] as Slide).layout] as const)
      .filter(([, a, b]) => a !== b)
    expect(diff).toEqual([['s6', 'cards', 'statement']])
    expect((shipped.deck as Deck).story?.sha256).toBe(auto.story?.sha256)
  })
})
