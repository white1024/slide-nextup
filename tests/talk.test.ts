import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Deck, parseDeck } from '../src/model/deck.ts'
import { loadStory, type Story } from '../src/model/story.ts'
import {
  checkTalk,
  deckSteps,
  loadTalkCues,
  openQuestions,
  parseTalk,
  scaffoldTalk,
  type TalkDiagnostic,
  talkCues,
} from '../src/talk/talk.ts'

const EXAMPLE = resolve('examples/tidewatch-progress')

function example(): { deck: Deck; story: Story } {
  const parsed = parseDeck(readFileSync(join(EXAMPLE, 'deck.json'), 'utf8'))
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
  const loaded = loadStory(readFileSync(join(EXAMPLE, 'story.md'), 'utf8'))
  if (!loaded.story) throw new Error('example story does not load')
  return { deck: parsed.deck, story: loaded.story }
}

function skeleton(deck: Deck, story: Story): string {
  return scaffoldTalk({ deck, story, deckRel: 'deck.json', storyRel: 'story.md' })
}

const QUESTIONS = [
  '| 1 | Can it be handed over today? | high | high | Yes: the bundle installs unattended on a clean machine (story s4) |',
  '| 2 | Who supports it after the handover? | medium | high | open: not decided; the closing slide says support gets the same package |',
  '| 3 | Why are there no check results in the deck? | low | low | Producing data is out of scope for this project (the brief) |',
].join('\n')

/** The skeleton with every placeholder filled in and the story comments removed: a talk that passes. */
function filled(text: string): string {
  return text
    .replace(/<!-- from the story[\s\S]*?-->\n/g, '')
    .replace(
      /- must: \n/g,
      '- must: the one thing this slide is for, then the bridge to the next\n',
    )
    .replace(/- may: \n/g, '- may: the example behind the number\n')
    .replace(/- may@(\d+): \n/g, '- may@$1: what this press brings in\n')
    .replace('| 1 |  | high | high |  |', QUESTIONS)
    .replace('- [ ] \n', '- [ ] Close on "bundle plus GUI" as the delivery form\n')
}

const rules = (ds: TalkDiagnostic[]) => ds.map((d) => `${d.severity}:${d.rule}`)
const check = (text: string, deck: Deck) => {
  const p = parseTalk(text)
  return [...p.diagnostics, ...checkTalk(p.talk, deck)]
}

describe('talk scaffold', () => {
  it('writes one section per played slide in playback order, with the story material as a comment', () => {
    const { deck, story } = example()
    const text = skeleton(deck, story)
    expect(text.startsWith('---\ndeck: deck.json\nstory: story.md\n---\n')).toBe(true)
    expect(text).toContain(`# Talk notes: ${deck.title}`)
    const ids = [...text.matchAll(/^### (\S+) · /gm)].map((m) => m[1])
    expect(ids).toEqual(deck.slides.map((s) => s.id))
    expect(text).toContain(`message: ${story.slides[0]?.message}`)
    expect(text).toContain('<!-- from the story · cover · hero')
    expect(text).toContain('## Questions to expect')
    expect(text).toContain('## Before you go on')
    // the skeleton is not a passing talk: its placeholders are the work
    const found = rules(check(text, deck))
    expect(found).toContain('error:slides/empty')
    expect(found).toContain('error:questions/empty')
    expect(found).toContain('error:checklist/empty')
    expect(found).not.toContain('error:slides/missing')
    expect(found).not.toContain('error:slides/order')
  })

  it('leaves hidden pages out', () => {
    const { deck, story } = example()
    deck.pages = { hidden: ['s2'] }
    const text = skeleton(deck, story)
    expect(text).not.toContain('### s2 ·')
    expect(text).toContain('### s3 ·')
  })

  it('reads back a slide id with a hyphen, the grammar the story allows', () => {
    const { deck, story } = example()
    for (const s of deck.slides) if (s.id === 's1') s.id = 'intro-1'
    for (const s of story.slides) if (s.id === 's1') s.id = 'intro-1'
    const text = filled(skeleton(deck, story))
    expect(text).toContain('### intro-1 · ')
    const p = parseTalk(text)
    expect(p.talk.slides[0]?.id).toBe('intro-1')
    expect(checkTalk(p.talk, deck)).toEqual([])
  })
})

describe('talk check', () => {
  it('passes a filled talk and counts the open questions', () => {
    const { deck, story } = example()
    const text = filled(skeleton(deck, story))
    const p = parseTalk(text)
    expect(p.diagnostics).toEqual([])
    expect(checkTalk(p.talk, deck)).toEqual([])
    expect(p.talk.slides).toHaveLength(deck.slides.length)
    expect(p.talk.questions).toHaveLength(3)
    expect(openQuestions(p.talk).map((q) => q.n)).toEqual(['2'])
    expect(p.talk.checklist).toHaveLength(1)
  })

  it('insists on every played slide, in deck order, with a must: cue, and refuses untagged cues', () => {
    const { deck, story } = example()
    const good = filled(skeleton(deck, story))
    const s3 = /### s3 ·[\s\S]*?(?=### s4 ·)/
    expect(rules(check(good.replace(s3, ''), deck))).toContain('error:slides/missing')
    const s3Text = s3.exec(good)?.[0] ?? ''
    const moved = good.replace(s3, '').replace('### s5 ·', `${s3Text}### s5 ·`)
    expect(rules(check(moved, deck))).toContain('error:slides/order')
    const noMust = good.replace(
      '- must: the one thing this slide is for, then the bridge to the next\n- may:',
      '- may: only colour\n- may:',
    )
    expect(rules(check(noMust, deck))).toContain('error:slides/must')
    const untagged = good.replace(
      '- may: the example behind the number',
      '- the example behind the number',
    )
    expect(rules(check(untagged, deck))).toContain('error:slides/tag')
    // a paragraph under a slide is a script by another name
    const prose = good.replace(
      '- may: the example behind the number\n',
      '- may: the example behind the number\n\nGood morning everyone, today I will walk you through the tool.\n',
    )
    expect(rules(check(prose, deck))).toContain('error:slides/prose')
    // a talk written for a page that is hidden now
    const hidden = structuredClone(deck)
    hidden.pages = { hidden: ['s2'] }
    expect(rules(check(good, hidden))).toContain('error:slides/unknown')
  })

  it('warns about a cue that reads like a script and about story comments left in place', () => {
    const { deck, story } = example()
    const good = filled(skeleton(deck, story))
    const long = good.replace(
      '- may: the example behind the number',
      `- may: ${'a full sentence of prose that goes on and on, '.repeat(5)}`,
    )
    expect(rules(check(long, deck))).toContain('warning:slides/cue')
    // s1 still carries its story comment after the cues were written
    const kept = good.replace(
      /(### s1 · [^\n]*\n\n)/,
      '$1<!-- from the story · cover · hero\nmessage: kept for later\n-->\n',
    )
    const draft = check(kept, deck)
    expect(rules(draft)).toContain('warning:slides/draft')
    expect(draft.find((d) => d.rule === 'slides/draft')?.message).toContain('s1')
  })

  it('keeps the questions sorted by likely × costly and the levels to high, medium, low', () => {
    const { deck, story } = example()
    const good = filled(skeleton(deck, story))
    const lines = QUESTIONS.split('\n')
    const unsorted = good.replace(QUESTIONS, [lines[2], lines[0], lines[1]].join('\n'))
    const order = check(unsorted, deck).find((d) => d.rule === 'questions/order')
    expect(order?.severity).toBe('error')
    expect(order?.message).toContain('the order is 1, 2, 3')
    const level = good.replace('| high | high |', '| maybe | high |')
    const levelFound = rules(check(level, deck))
    expect(levelFound).toContain('error:questions/level')
    expect(levelFound).not.toContain('error:questions/order') // one fault, one report
    const bareOpen = good.replace(
      'open: not decided; the closing slide says support gets the same package',
      'open:',
    )
    expect(rules(check(bareOpen, deck))).toContain('error:questions/open')
    const few = good.replace(QUESTIONS, lines[0] ?? '')
    expect(rules(check(few, deck))).toContain('warning:questions/few')
    const none = good.replace(QUESTIONS, '')
    expect(rules(check(none, deck))).toContain('error:questions/none')
    const noList = good.replace('- [ ] Close on "bundle plus GUI" as the delivery form\n', '')
    expect(rules(check(noList, deck))).toContain('error:checklist/none')
  })
})

describe('talk:scaffold and talk:check', () => {
  const run = (cli: string, args: string[], cwd: string) => {
    try {
      const out = execFileSync(process.execPath, [resolve('src/cli', cli), ...args], {
        encoding: 'utf8',
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { code: 0, out }
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string }
      return { code: err.status, out: `${err.stdout}${err.stderr}` }
    }
  }

  it('writes talk.md next to the deck, keeps an existing one, and checks it', () => {
    const root = mkdtempSync(join(tmpdir(), 'talk-'))
    cpSync(EXAMPLE, join(root, 'deck'), { recursive: true })
    const first = run('talk-scaffold.ts', ['deck/deck.json'], root)
    expect(first.code, first.out).toBe(0)
    expect(first.out).toContain('wrote deck/talk.md')
    const file = join(root, 'deck', 'talk.md')
    expect(existsSync(file)).toBe(true)
    const again = run('talk-scaffold.ts', ['deck/deck.json'], root)
    expect(again.code).toBe(1)
    expect(again.out).toContain('--force')
    const draft = run('talk-check.ts', ['deck/talk.md'], root)
    expect(draft.code).toBe(1)
    expect(draft.out).toContain('[slides/empty]')
    expect(draft.out).toContain('failed:')
    writeFileSync(file, filled(readFileSync(file, 'utf8')))
    const done = run('talk-check.ts', ['deck/talk.md'], root)
    expect(done.code, done.out).toBe(0)
    expect(done.out).toContain('3 questions (1 open)')
    expect(done.out).toContain('passed: 0 errors, 0 warnings')
    // rendering the deck next to its talk embeds the cues for the presenter window
    const rendered = run('render.ts', ['deck/deck.json', '-o', 'deck/out.html'], root)
    expect(rendered.code, rendered.out).toBe(0)
    const html = readFileSync(join(root, 'deck', 'out.html'), 'utf8')
    expect(html).toContain('<script type="application/json" id="deck-talk">')
    expect(html).toContain('what this press brings in')
    // a talk with problems still rides along, and the render says so
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('- may: the example behind the number', '- may: '),
    )
    const noisy = run('render.ts', ['deck/deck.json', '-o', 'deck/out.html'], root)
    expect(noisy.code, noisy.out).toBe(0)
    expect(noisy.out).toMatch(
      /talk.md has \d+ problems?; the cues that parsed are embedded, run pnpm talk:check/,
    )
    // a deck generated from an older story: the scaffold says so before the cues are written
    const deckFile = join(root, 'deck', 'deck.json')
    const stale = JSON.parse(readFileSync(deckFile, 'utf8')) as { story: { sha256: string } }
    stale.story.sha256 = '0'.repeat(64) // a well-formed hash of some other story text
    writeFileSync(deckFile, `${JSON.stringify(stale, null, 2)}\n`)
    const lagging = run('talk-scaffold.ts', ['deck/deck.json', '--force'], root)
    expect(lagging.code).toBe(0)
    expect(lagging.out).toContain('the deck lags the story')
    expect(lagging.out).toContain('pnpm deck:sync-story')
    rmSync(root, { recursive: true, force: true })
  }, 60_000)
})

describe('cues pinned to a step', () => {
  const section = (text: string, id: string) =>
    new RegExp(`### ${id} ·[\\s\\S]*?(?=\\n### |\\n## )`).exec(text)?.[0] ?? ''

  it('the scaffold lists a slide’s steps and writes a may@n line for each; the parser keeps the step', () => {
    const { deck, story } = example()
    const steps = deckSteps(deck)
    const stepped = [...steps].filter(([, n]) => n > 0)
    expect(stepped.length).toBeGreaterThan(0)
    const text = skeleton(deck, story)
    for (const [id, n] of stepped) {
      const part = section(text, id)
      expect(part).toMatch(/steps: 1: /)
      for (let k = 1; k <= n; k++) expect(part).toContain(`- may@${k}: `)
      expect(part).not.toContain(`- may@${n + 1}: `)
    }
    const plain = [...steps].find(([, n]) => n === 0)?.[0]
    if (plain) expect(section(text, plain)).not.toContain('may@')
    const parsed = parseTalk(filled(text))
    expect(parsed.diagnostics).toEqual([])
    const first = stepped[0] as [string, number]
    const slide = parsed.talk.slides.find((x) => x.id === first[0])
    expect(slide?.cues.filter((c) => c.step !== undefined).map((c) => c.step)).toEqual(
      Array.from({ length: first[1] }, (_, i) => i + 1),
    )
    expect(slide?.cues.find((c) => c.step === 1)?.tag).toBe('may')
    expect(
      parseTalk('## Slides\n\n### s1 · x\n\n- must@2: at the second press\n').talk.slides[0]?.cues,
    ).toEqual([{ tag: 'must', step: 2, text: 'at the second press', line: 5 }])
  })

  it('talk:check refuses a step the slide does not have and warns when a stepped slide pins nothing', () => {
    const { deck, story } = example()
    const good = filled(skeleton(deck, story))
    expect(rules(check(good, deck))).toEqual([])
    const steps = deckSteps(deck)
    const [id, n] = [...steps].find(([, k]) => k > 0) as [string, number]
    const over = good.replace('- may@1: what this press brings in', `- may@${n + 1}: too far`)
    const overDiag = check(over, deck)
    expect(rules(overDiag)).toContain('error:slides/step')
    expect(overDiag.find((d) => d.rule === 'slides/step')?.message).toContain('builds in')
    const zero = good.replace('- may@1: what this press brings in', '- may@0: nothing yet')
    expect(rules(check(zero, deck))).toContain('error:slides/step')
    const flat = [...steps].find(([, k]) => k === 0)?.[0]
    if (flat) {
      const part = section(good, flat)
      const pinnedFlat = good.replace(part, `${part}- must@1: on a slide without steps\n`)
      const d = check(pinnedFlat, deck).find((x) => x.rule === 'slides/step')
      expect(d?.message).toContain('has no reveal steps')
    }
    const unpinned = good.replace(/- may@\d+: what this press brings in\n/g, '')
    const warn = check(unpinned, deck)
    expect(rules(warn)).toContain('warning:slides/steps')
    expect(warn.find((d) => d.rule === 'slides/steps')?.message).toContain(id)
  })

  it('the cues travel as one map per slide, read from the talk next to the deck', () => {
    const { deck, story } = example()
    const parsed = parseTalk(filled(skeleton(deck, story)))
    const cues = talkCues(parsed.talk)
    const [id, n] = [...deckSteps(deck)].find(([, k]) => k > 0) as [string, number]
    expect(cues[id]?.[0]).toEqual({
      tag: 'must',
      text: 'the one thing this slide is for, then the bridge to the next',
    })
    expect(cues[id]?.filter((c) => c.step !== undefined)).toHaveLength(n)
    expect(cues[id]?.find((c) => c.step === 1)).toEqual({
      tag: 'may',
      step: 1,
      text: 'what this press brings in',
    })
    expect(loadTalkCues('/nowhere', () => null)).toBeNull()
    const loaded = loadTalkCues('/somewhere', (file) =>
      file.endsWith('talk.md') ? filled(skeleton(deck, story)) : null,
    )
    expect(loaded?.cues).toEqual(cues)
    expect(loaded?.problems).toBe(0)
    const draft = loadTalkCues('/somewhere', () => skeleton(deck, story))
    expect(draft?.problems).toBeGreaterThan(0)
    expect(draft?.cues).toEqual({})
  })
})
