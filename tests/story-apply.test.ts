import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Deck, mergeSlides, parseDeck, stringifyDeck } from '../src/model/deck.ts'
import { effectiveOrder } from '../src/model/pages.js'
import { scaffoldDeck } from '../src/model/scaffold.ts'
import { loadStory, type Story } from '../src/model/story.ts'
import { applyPagesToStory } from '../src/model/story-apply.ts'
import { confirmationStatus, writeConfirmation } from '../src/model/story-confirm.ts'
import { type LayoutJson, listLayoutIdsFor, loadLayout } from '../src/render/assets.ts'

const storyText = readFileSync(resolve('examples/story.sample.md'), 'utf8')
const story = loadStory(storyText).story as Story
const ids = story.slides.map((s) => s.id)
const headings = (text: string) =>
  text
    .split('\n')
    .filter((l) => l.startsWith('### '))
    .map((l) => l.slice(4).split('|')[0]?.trim())

describe('writing the deck’s page-level overrides back into story.md', () => {
  it('re-sequences the slide blocks to the playback order and touches nothing else', () => {
    // the editor writes the whole order; a partial one slots unlisted pages back after their
    // story predecessor (effectiveOrder), so s2 would land last
    const r = applyPagesToStory(storyText, story, {
      order: ['s1', 's3', 's2', 's4', 's5', 's6', 's7', 's8'],
    })
    expect(r.changed).toBe(true)
    expect(r.order).toEqual(['s1', 's3', 's2', 's4', 's5', 's6', 's7', 's8'])
    expect(applyPagesToStory(storyText, story, { order: ['s1', 's3', 's2'] }).order).toEqual([
      's1',
      's3',
      's4',
      's5',
      's6',
      's7',
      's8',
      's2',
    ])
    expect(headings(r.text)).toEqual(r.order)
    // the prose before the slides is byte for byte the same
    const cut = (t: string) => t.slice(0, t.indexOf('### s'))
    expect(cut(r.text)).toBe(cut(storyText))
    // every block is intact: the reparsed slides equal the originals, in the new order
    const again = loadStory(r.text)
    expect(again.hasErrors).toBe(false)
    const strip = (s: Story['slides'][number]) => ({ ...s, line: 0 })
    expect(again.story?.slides.map(strip)).toEqual(
      r.order.map((id) => strip(story.slides.find((s) => s.id === id) as Story['slides'][number])),
    )
    expect(r.text.endsWith('\n')).toBe(true)
    expect(r.text).not.toMatch(/\n{3,}/)
  })

  it('removes hidden slides and reports them by title', () => {
    const r = applyPagesToStory(storyText, story, { hidden: ['s7'] })
    expect(r.removed).toEqual([{ id: 's7', title: 'Pause for a moment' }])
    expect(headings(r.text)).toEqual(ids.filter((id) => id !== 's7'))
    expect(r.text).not.toContain('Pause for a moment')
    // what is left still parses as a story with the remaining seven pages, in order
    const again = loadStory(r.text)
    expect(again.story?.slides.map((s) => s.id)).toEqual(ids.filter((id) => id !== 's7'))
  })

  it('leaves the file alone when the deck follows the story, and ignores unknown ids', () => {
    const same = applyPagesToStory(storyText, story, { order: ids })
    expect(same.changed).toBe(false)
    expect(same.text).toBe(storyText)
    // unknown ids are reported and ignored; `order: [s2]` alone slots s1 back in front, so nothing moves
    const odd = applyPagesToStory(storyText, story, { order: ['s2', 'ghost'], hidden: ['nope'] })
    expect(odd.unknown).toEqual(['ghost', 'nope'])
    expect(odd.changed).toBe(false)
    expect(headings(odd.text)).toEqual(ids)
  })

  it('invalidates the confirmation, and after a fresh confirmation the scaffold clears the overrides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'story-apply-'))
    const storyFile = join(dir, 'story.md')
    writeFileSync(storyFile, storyText, 'utf8')
    writeConfirmation(storyFile, storyText, ids.length)
    const layouts = new Map<string, LayoutJson>(
      listLayoutIdsFor('blue-professional').map((id) => [
        id,
        loadLayout(id, 'blue-professional').json,
      ]),
    )
    const first = scaffoldDeck({
      story,
      storyText,
      storyRelativePath: 'story.md',
      deckId: 'apply',
      theme: 'blue-professional',
      layouts,
    })
    // the editor hid s7 and moved s6 before s4
    const deck: Deck = {
      ...first.deck,
      // the user also moved things on the page that is about to go, and on one that stays
      overrides: { 's7/title': { x: 10 }, 's7/body': { hidden: true }, 's4/ghost': { y: 5 } },
      pages: { order: ['s1', 's2', 's3', 's6', 's4', 's5', 's7', 's8'], hidden: ['s7'] },
    }
    const played = effectiveOrder(ids, deck.pages).visible
    expect(played).toEqual(['s1', 's2', 's3', 's6', 's4', 's5', 's8'])
    const applied = applyPagesToStory(storyText, story, deck.pages)
    writeFileSync(storyFile, applied.text, 'utf8')
    expect(confirmationStatus(storyFile).state).toBe('stale')
    // the gate holds until the user confirms the rewritten story
    const newStory = loadStory(applied.text).story as Story
    writeConfirmation(storyFile, applied.text, newStory.slides.length)
    expect(confirmationStatus(storyFile).state).toBe('confirmed')
    const second = scaffoldDeck({
      story: newStory,
      storyText: applied.text,
      storyRelativePath: 'story.md',
      deckId: 'apply',
      theme: 'blue-professional',
      layouts,
      existing: deck,
    })
    expect(second.deck.slides.map((s) => s.id)).toEqual(played)
    expect(second.deck.pages).toBeUndefined()
    expect(second.pagesDropped).toEqual(['order:s7', 'hidden:s7'])
    expect(second.pagesCleared).toEqual(['order'])
    expect(effectiveOrder(played, second.deck.pages).visible).toEqual(played)
    // the removed page's overrides go with it; an element orphan on a surviving page stays reported
    expect(second.overridesDropped).toEqual(['s7/body', 's7/title'])
    expect(second.orphaned).toEqual(['s4/ghost'])
    expect(Object.keys(second.deck.overrides)).toEqual(['s4/ghost'])
    // an order that merely repeats the story is redundant on any merge
    const merged = mergeSlides({ ...deck, pages: { order: ids } }, first.deck.slides)
    expect(merged.deck.pages).toBeUndefined()
    expect(merged.pagesCleared).toEqual(['order'])
    const partial = mergeSlides({ ...deck, pages: { order: ['s3', 's1'] } }, first.deck.slides)
    expect(partial.deck.pages).toEqual({ order: ['s3', 's1'] })
    expect(partial.pagesCleared).toEqual([])
  })

  it('runs as pnpm story:apply-deck: dry run leaves the file, a real run rewrites it and asks for confirmation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'story-apply-cli-'))
    const storyFile = join(dir, 'story.md')
    const deckFile = join(dir, 'deck.json')
    writeFileSync(storyFile, storyText, 'utf8')
    const r = parseDeck(readFileSync(resolve('examples/deck.sample.json'), 'utf8'))
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const deck: Deck = {
      ...r.deck,
      story: { path: 'story.md', sha256: 'a'.repeat(64) },
      pages: { order: ['s2', 's1', 's3', 's4', 's5', 's6', 's7', 's8'] },
    }
    writeFileSync(deckFile, stringifyDeck(deck), 'utf8')
    const run = (...extra: string[]) => {
      try {
        return {
          code: 0,
          out: execFileSync(process.execPath, ['src/cli/story-apply-deck.ts', deckFile, ...extra], {
            encoding: 'utf8',
            cwd: resolve('.'),
          }),
        }
      } catch (err) {
        const e = err as { status: number; stdout: string }
        return { code: e.status, out: e.stdout }
      }
    }
    const dry = run('--dry-run')
    expect(dry.code).toBe(0)
    expect(dry.out).toContain('s2 → s1 → s3')
    expect(dry.out).toContain('--dry-run')
    expect(readFileSync(storyFile, 'utf8')).toBe(storyText)
    const real = run()
    expect(real.code).toBe(0)
    expect(real.out).toContain('written back')
    expect(real.out).toContain('story:confirm')
    expect(headings(readFileSync(storyFile, 'utf8')).slice(0, 3)).toEqual(['s2', 's1', 's3'])
    // nothing left to write back once the story matches
    writeFileSync(
      deckFile,
      stringifyDeck({
        ...deck,
        pages: { order: ['s2', 's1', 's3', 's4', 's5', 's6', 's7', 's8'] },
      }),
      'utf8',
    )
    const same = run()
    expect(same.code).toBe(0)
    expect(same.out).toContain('nothing to write back')
  })
})
