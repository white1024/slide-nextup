import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Deck, parseDeck } from '../src/model/deck.ts'
import { MIN_FONT_BY_ROLE, minFontFor } from '../src/qa/measure.ts'
import { formatQaReport, type QaReport, runDeckQa } from '../src/qa/run.ts'
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
    expect(rules(report, 's3')).toContain('min-font:body')
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
    const themeCss = join(root, 'themes', 'ink-paper', 'theme.css')
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
