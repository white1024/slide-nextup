import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Deck, parseDeck } from '../src/model/deck.ts'
import { DEFAULT_MIN_FONT, MIN_FONT_BY_ROLE as FLOORS } from '../src/qa/font-floors.ts'
import { MIN_FONT_BY_ROLE, minFontFor } from '../src/qa/measure.ts'
import { formatQaReport, type QaReport, runDeckQa, slackProblem } from '../src/qa/run.ts'
import { FIT_JS } from '../src/render/runtime.ts'

function load(file: string): Deck {
  const r = parseDeck(readFileSync(resolve(file), 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.deck
}

const rules = (report: QaReport, slide: string) =>
  report.slides.find((s) => s.id === slide)?.findings.map((f) => `${f.rule}:${f.element ?? ''}`) ??
  []

describe('minimum font size by role', () => {
  it('lets page furniture (meta) go down to 20px while content keeps the 32px floor', () => {
    expect(MIN_FONT_BY_ROLE.default).toBe(32)
    expect(MIN_FONT_BY_ROLE).toBe(FLOORS)
    expect(DEFAULT_MIN_FONT).toBe(32)
    expect(MIN_FONT_BY_ROLE.meta).toBe(20)
    expect(minFontFor('pill')).toBe(24)
    expect(minFontFor('chip', 28)).toBe(20)
    expect(minFontFor('title')).toBe(32)
    expect(minFontFor('meta')).toBe(20)
    expect(minFontFor('meta', 16)).toBe(16)
    expect(minFontFor('body', 40)).toBe(40)
  })

  it('treats kickers, CTAs and pill lists (flow) as furniture at 24px', () => {
    expect(minFontFor('kicker')).toBe(24)
    expect(minFontFor('cta')).toBe(24)
    expect(minFontFor('flow')).toBe(24)
    expect(minFontFor('flow-accent')).toBe(24)
  })

  it('keeps the player auto-fit table identical to the QA table', () => {
    const m = /const MIN = ({[^}]*});/.exec(FIT_JS)
    if (!m) throw new Error('FIT_JS has no MIN table')
    const runtimeTable = new Function(`return ${m[1]}`)() as Record<string, number>
    expect(runtimeTable).toEqual(MIN_FONT_BY_ROLE)
  })
})

describe('qa --min-font / --min-inner-font', () => {
  const run = (args: string[]) => {
    try {
      return execFileSync(process.execPath, [resolve('src/cli/qa.ts'), ...args], {
        encoding: 'utf8',
        cwd: resolve('.'),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      return (e as { stdout: string }).stdout
    }
  }

  it('lowers the floors for one run and says where the exit is otherwise', () => {
    const strict = run(['examples/deck.qa-broken.json'])
    expect(strict).toContain('[min-font] title')
    expect(strict).toContain('pnpm qa --min-font <px> lowers it')
    const loose = run([
      'examples/deck.qa-broken.json',
      '--min-font',
      '12',
      '--min-inner-font',
      '10',
    ])
    expect(loose).not.toContain('[min-font]')
    expect(loose).not.toContain('[min-font-inner]')
    expect(loose).toContain('[overflow] title')
    expect(run(['examples/deck.qa-broken.json', '--min-font', 'big'])).not.toContain('slides')
  }, 120_000)

  it('refuses a --slack level it does not know', () => {
    expect(run(['examples/deck.sample.json', '--slack', 'loud'])).not.toContain('slides')
  })
})

describe('slack', () => {
  const box = (h: number, contentH: number, paints = true, padY = 0) =>
    slackProblem({ h, contentH, paints, padY })

  it('reports a painted box taller than its content by 40px, or by 15% from 24px up, and an empty painted box', () => {
    // the feedback's cases: a 600px card around 540px of content, and an empty callout that still paints
    expect(box(600, 540)).toMatch(/60px \(10%\) taller than its content/)
    expect(box(300, 0)).toMatch(/300px tall\) but holds nothing/)
    expect(box(600, 570)).toBeNull() // 30px and 5%: a fair fit
    expect(box(200, 160)).toMatch(/40px \(20%\)/) // small box, big share
    expect(box(100, 80)).toBeNull() // 20px: under the floor, however large the share
    expect(box(600, 540, false)).toBeNull() // nothing painted: the blank is invisible
    expect(box(640, 540, true, 40)).toMatch(/60px \(10%\)/) // padding is not slack
  })

  it('is a notice on the sample deck, a warning on request, and never about a shape or page furniture', async () => {
    const deck = load('examples/deck.sample.json')
    const report = await runDeckQa(deck, { deckDir: resolve('examples') })
    const slack = report.slides.flatMap((s) => s.findings).filter((f) => f.rule === 'slack')
    expect(slack.length).toBeGreaterThan(0)
    expect(slack.every((f) => f.severity === 'info')).toBe(true)
    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
    expect(report.notices).toBe(slack.length)
    // the sample's backdrop and divider shapes paint their ground and hold nothing, by design
    const kinds = new Map(
      deck.slides.flatMap((s) => s.elements.map((e) => [`${s.id}/${e.id}`, e.kind])),
    )
    expect(slack.every((f) => kinds.get(`${f.slide}/${f.element}`) === 'text')).toBe(true)
    expect(slack.some((f) => f.element === 'card-1')).toBe(true)
    expect(slack.some((f) => f.element === 'cta' || f.element === 'meta')).toBe(false)
    const text = formatQaReport(report)
    expect(text).toContain('ℹ [slack] card-1: the box is')
    expect(text).toMatch(/passed: 0 errors, 0 warnings, \d+ notices/)
    const counted = await runDeckQa(deck, { deckDir: resolve('examples'), slack: 'warning' })
    expect(counted.warnings).toBe(slack.length)
    expect(counted.errors).toBe(0)
    const off = await runDeckQa(deck, { deckDir: resolve('examples'), slack: 'off' })
    expect(off.slides.flatMap((s) => s.findings).some((f) => f.rule === 'slack')).toBe(false)
    expect(formatQaReport(off)).toContain('passed: 0 errors, 0 warnings')
    expect(formatQaReport(off)).not.toContain('notices')
  }, 120_000)
})

describe('deck QA', () => {
  it('passes the shipped sample deck quickly', async () => {
    const report = await runDeckQa(load('examples/deck.sample.json'), {
      deckDir: resolve('examples'),
    })
    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
    expect(report.slides).toHaveLength(8)
    expect(report.durationMs).toBeLessThan(30_000)
    expect(formatQaReport(report)).toContain('passed: 0 errors')
  }, 60_000)

  it('skips hidden pages and says so', async () => {
    const deck = load('examples/deck.sample.json')
    deck.pages = { hidden: ['s2'] }
    const report = await runDeckQa(deck, { deckDir: resolve('examples') })
    expect(report.slides.map((s) => s.id)).not.toContain('s2')
    expect(report.slides).toHaveLength(7)
    expect(report.skipped).toEqual(['s2'])
    expect(formatQaReport(report)).toContain('skipped hidden slides: s2')
  }, 60_000)

  it('catches overflow, overlap, small type and density in the broken deck', async () => {
    const report = await runDeckQa(load('examples/deck.qa-broken.json'), {
      deckDir: resolve('examples'),
    })
    expect(rules(report, 's1')).toContain('overflow:title')
    expect(rules(report, 's2')).toContain('overlap:title')
    expect(rules(report, 's3')).toContain('min-font:title')
    expect(rules(report, 's4')).toContain('density:')
    expect(rules(report, 's4')).toContain('overflow:evidence')
    expect(report.errors).toBeGreaterThanOrEqual(5)
    const text = formatQaReport(report)
    expect(text).toContain('failed')
    expect(text).toContain('[overlap] title: text elements title and body overlap')
  }, 60_000)

  it('fails geometry-invariant when the theme moves boxes with a transform', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qa-root-'))
    cpSync(resolve('themes'), join(root, 'themes'), { recursive: true })
    cpSync(resolve('layouts'), join(root, 'layouts'), { recursive: true })
    cpSync(resolve('schemas'), join(root, 'schemas'), { recursive: true })
    const themeCss = join(root, 'themes', 'blue-professional', 'theme.css')
    writeFileSync(
      themeCss,
      `${readFileSync(themeCss, 'utf8')}\n[data-role="title"] { transform: translateY(40px); }\n`,
    )
    const report = await runDeckQa(load('examples/deck.sample.json'), {
      deckDir: resolve('examples'),
      root,
    })
    const drift = report.slides
      .flatMap((s) => s.findings)
      .filter((f) => f.rule === 'geometry-invariant')
    expect(drift.length).toBeGreaterThan(0)
    expect(drift.every((f) => f.element === 'title')).toBe(true)
    rmSync(root, { recursive: true, force: true })
  }, 60_000)
})

describe('motion rules', () => {
  const stepped = () => {
    const deck = load('examples/deck.sample.json')
    const s2 = deck.slides[1] as Deck['slides'][number]
    for (const el of s2.elements) {
      const m = /^card-(\d)$/.exec(el.id)
      if (m) el.step = Number(m[1])
    }
    const s4 = deck.slides[3] as Deck['slides'][number]
    for (const el of s4.elements) {
      if (el.id === 'left-items') {
        el.step = 1
        el.enter = 'cascade'
      }
      if (el.id === 'right-items') {
        el.step = 1
        el.enter = 'blur'
      }
    }
    return deck
  }
  const motionRules = (report: QaReport) =>
    report.slides.flatMap((s) =>
      s.findings
        .filter((f) => f.rule.startsWith('motion-'))
        .map((f) => `${s.id}/${f.element ?? ''}:${f.rule}`),
    )

  it('plays every page to its last step and finds nothing on the sample deck', async () => {
    const report = await runDeckQa(stepped(), { deckDir: resolve('examples') })
    expect(report.motion).toEqual({ pages: 8, entrances: 5, changes: 7 })
    expect(motionRules(report)).toEqual([])
    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
    expect(formatQaReport(report)).toContain(
      '- motion: 8 pages played, 5 entrances, 7 page changes; rest state, leaving layer, reduced motion and duration bands checked',
    )
  }, 60_000)

  it('plays charts to their real values: the components deck with grow, draw and count finds nothing', async () => {
    const deck = load('examples/deck.components.json')
    const set = (id: string, el: string, step: number, enter?: 'grow' | 'draw' | 'count') => {
      const e = deck.slides.find((s) => s.id === id)?.elements.find((x) => x.id === el)
      if (!e) throw new Error(`${id}/${el}`)
      e.step = step
      if (enter) e.enter = enter
    }
    for (const stat of ['stat-1', 'stat-2', 'stat-3']) set('s1', stat, 1)
    set('s2', 'chart', 1)
    set('s2', 'aside', 1, 'count')
    set('s3', 'chart', 1, 'draw')
    set('s3', 'aside', 2, 'grow')
    // s6's code sample overflows its box by a hair; that is the example's problem, not motion's
    deck.pages = { hidden: ['s6'] }
    const report = await runDeckQa(deck, { deckDir: resolve('examples') })
    expect(motionRules(report)).toEqual([])
    expect(report.motion?.entrances).toBe(7)
    expect(report.errors).toBe(0)
  }, 60_000)

  it('fails a theme whose entrance ends short of rest, runs too long, replays on the way out and survives reduced motion', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qa-motion-root-'))
    cpSync(resolve('themes'), join(root, 'themes'), { recursive: true })
    cpSync(resolve('layouts'), join(root, 'layouts'), { recursive: true })
    cpSync(resolve('schemas'), join(root, 'schemas'), { recursive: true })
    const themeCss = join(root, 'themes', 'blue-professional', 'theme.css')
    writeFileSync(
      themeCss,
      [
        readFileSync(themeCss, 'utf8'),
        '@keyframes qa-broken { from { opacity: 0; } to { opacity: 0.4; } }',
        '.deck-stage > .slide.is-active [data-step][data-el].is-entering { animation: qa-broken 1000ms linear both !important; }',
        '.deck-stage > .slide.is-leaving [data-step][data-el] { animation: qa-broken 1000ms linear both !important; }',
        '@media (prefers-reduced-motion: reduce) { .deck-stage > .slide.is-active [data-step][data-el] { animation: qa-broken 1000ms linear both !important; } }',
        '',
      ].join('\n'),
    )
    const report = await runDeckQa(stepped(), { deckDir: resolve('examples'), root })
    const found = motionRules(report)
    // only the last step's elements still carry the broken entrance when the page is at rest
    expect(found).not.toContain('s2/card-1:motion-rest')
    expect(found).toContain('s2/card-3:motion-rest')
    expect(found).toContain('s4/right-items:motion-rest')
    expect(found).toContain('s2/card-1:motion-band')
    expect(found).toContain('s2/card-1:motion-leaving')
    expect(found).toContain('s2/card-1:motion-reduced')
    expect(found).toContain('s4/left-items:motion-rest')
    expect(found.filter((f) => f.startsWith('s1/') || f.startsWith('s8/'))).toEqual([])
    const messages = report.slides.flatMap((s) => s.findings.map((f) => f.message))
    expect(messages).toContainEqual(
      expect.stringMatching(/opacity ends at 0.4 but static mode shows 1/),
    )
    expect(messages).toContainEqual(
      expect.stringMatching(/runs 1000ms, outside the theme family’s band 150–400ms/),
    )
    expect(messages).toContainEqual(
      expect.stringMatching(/still animating while the page leaves \(card-1, card-2, card-3\)/),
    )
    expect(messages).toContainEqual(
      expect.stringMatching(/with prefers-reduced-motion card-1, card-2, card-3 still animate/),
    )
    expect(report.errors).toBeGreaterThanOrEqual(6)
    expect(formatQaReport(report)).toContain('[motion-rest] card-3:')
    rmSync(root, { recursive: true, force: true })
  }, 90_000)
})
