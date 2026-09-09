import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Deck, parseDeck, type Slide, sha256 } from '../src/model/deck.ts'
import { rhythmDiffers, storyRhythm } from '../src/model/scaffold.ts'
import { loadStory, type Story } from '../src/model/story.ts'
import { writeConfirmation } from '../src/model/story-confirm.ts'

const EXAMPLE = resolve('examples/tidewatch-progress')
const OLD_NOTES = 'Ten seconds, just so the owner knows the structure.'
const NEW_NOTES = 'Ten seconds; name the two parts and move on.'

function run(cli: string, args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [resolve('src/cli', cli), ...args], {
      encoding: 'utf8',
      cwd: resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out, err: '' }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: err.stdout, err: err.stderr }
  }
}

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-sync-'))
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function deckOf(dir: string): Deck {
  const parsed = parseDeck(readFileSync(join(dir, 'deck.json'), 'utf8'))
  if (!parsed.ok) throw new Error(parsed.errors.map((e) => e.message).join('\n'))
  return parsed.deck
}

/** A private copy of the example with s2's notes rewritten in the story and the story confirmed again. */
function editedDeck(name: string, opts: { confirm?: boolean } = {}): string {
  const dir = join(tmp, name)
  cpSync(EXAMPLE, dir, { recursive: true })
  const storyFile = join(dir, 'story.md')
  const text = readFileSync(storyFile, 'utf8').replace(OLD_NOTES, NEW_NOTES)
  expect(text).toContain(NEW_NOTES)
  writeFileSync(storyFile, text, 'utf8')
  if (opts.confirm !== false) {
    const story = loadStory(text).story
    if (!story) throw new Error('the edited story no longer parses')
    writeConfirmation(storyFile, text, story.slides.length)
  }
  return dir
}

describe('pnpm deck:sync-story', () => {
  it('copies the notes and the story hash and nothing else', () => {
    const dir = editedDeck('sync')
    const before = deckOf(dir)
    const s2 = before.slides.find((s) => s.id === 's2')
    expect(s2?.notes).toBe(OLD_NOTES)
    const storyText = readFileSync(join(dir, 'story.md'), 'utf8')
    expect(before.story?.sha256).not.toBe(sha256(storyText))

    const r = run('deck-sync-story.ts', [join(dir, 'deck.json')])
    expect(r.code, r.out + r.err).toBe(0)
    expect(r.out).toContain('notes 1 updated (s2)')
    expect(r.out).toContain(
      `${before.story?.sha256.slice(0, 8)} → ${sha256(storyText).slice(0, 8)}`,
    )
    expect(r.out).toContain('written →')

    const after = deckOf(dir)
    expect(after.slides.find((s) => s.id === 's2')?.notes).toBe(NEW_NOTES)
    expect(after.story).toEqual({ path: 'story.md', sha256: sha256(storyText) })
    // everything that is not notes or the hash is byte-for-byte what it was
    const strip = (d: Deck) => ({
      ...d,
      story: undefined,
      slides: d.slides.map((s) => ({ ...s, notes: undefined })),
    })
    expect(strip(after)).toEqual(strip(before))
    expect(after.overrides).toEqual(before.overrides)
    expect(after.slides.filter((s) => s.id !== 's2').map((s) => s.notes)).toEqual(
      before.slides.filter((s) => s.id !== 's2').map((s) => s.notes),
    )
  })

  it('--dry-run reports the same and writes nothing; a synced deck has nothing to sync', () => {
    const dir = editedDeck('dry')
    const bytes = readFileSync(join(dir, 'deck.json'), 'utf8')
    const dry = run('deck-sync-story.ts', [join(dir, 'deck.json'), '--dry-run'])
    expect(dry.code, dry.out + dry.err).toBe(0)
    expect(dry.out).toContain('notes 1 updated (s2)')
    expect(dry.out).toContain('dry run: nothing written')
    expect(readFileSync(join(dir, 'deck.json'), 'utf8')).toBe(bytes)
    expect(run('deck-sync-story.ts', [join(dir, 'deck.json')]).code).toBe(0)
    const again = run('deck-sync-story.ts', [join(dir, 'deck.json')])
    expect(again.code).toBe(0)
    expect(again.out).toContain('nothing to sync')
  })

  it('keeps the confirmation gate: an edited but unconfirmed story is refused', () => {
    const dir = editedDeck('unconfirmed', { confirm: false })
    const bytes = readFileSync(join(dir, 'deck.json'), 'utf8')
    const r = run('deck-sync-story.ts', [join(dir, 'deck.json')])
    expect(r.code).toBe(1)
    expect(r.out).toContain('modified after it was confirmed')
    expect(r.out).toContain('there is no --force')
    expect(readFileSync(join(dir, 'deck.json'), 'utf8')).toBe(bytes)
    expect(run('deck-sync-story.ts', [join(dir, 'deck.json'), '--force']).code).toBe(1)
  })

  it('refuses a deck that records no story, and explains the usage without one', () => {
    const dir = editedDeck('nostory')
    const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Record<string, unknown>
    delete deck.story
    writeFileSync(join(dir, 'deck.json'), JSON.stringify(deck, null, 2))
    const r = run('deck-sync-story.ts', [join(dir, 'deck.json')])
    expect(r.code).toBe(1)
    expect(r.out).toContain('records no story')
    expect(run('deck-sync-story.ts', []).code).toBe(2)
  })

  it('reports the slides whose steps or transition no longer follow the story, and --resequence rewrites only those', () => {
    const dir = editedDeck('rhythm')
    const before = deckOf(dir)
    const story = loadStory(readFileSync(join(dir, 'story.md'), 'utf8')).story as Story
    const differs = (s: Slide) => {
      const r = storyRhythm(s, story)
      return r !== null && rhythmDiffers(s, r)
    }
    const differing = before.slides.filter(differs).map((s) => s.id)
    // the example was sequenced by layout before the story decided: at least one page differs
    expect(differing.length).toBeGreaterThan(0)
    const dry = run('deck-sync-story.ts', [join(dir, 'deck.json'), '--dry-run'])
    expect(dry.code, dry.out + dry.err).toBe(0)
    for (const id of differing) expect(dry.out).toContain(`ℹ rhythm ${id} (`)
    expect(dry.out).toContain('--resequence')
    expect(dry.out).not.toContain('resequenced')
    // rewrite the first differing slide only
    const first = differing[0] as string
    const w = run('deck-sync-story.ts', [join(dir, 'deck.json'), '--resequence', first])
    expect(w.code, w.out + w.err).toBe(0)
    expect(w.out).toContain(`↻ resequenced ${first} (`)
    expect(w.out).toContain('written →')
    const after = deckOf(dir)
    expect(differs(after.slides.find((s) => s.id === first) as Slide)).toBe(false)
    for (const s of after.slides) {
      if (s.id === first) continue
      const was = before.slides.find((b) => b.id === s.id) as Slide
      expect(
        s.elements.map((e) => e.step),
        s.id,
      ).toEqual(was.elements.map((e) => e.step))
      expect(s.transition, s.id).toBe(was.transition)
    }
    expect(after.overrides).toEqual(before.overrides)
    expect(after.slides.map((s) => s.slots)).toEqual(before.slides.map((s) => s.slots))
    // that slide is in line now; the rest still report, and an unknown id is called out
    const again = run('deck-sync-story.ts', [
      join(dir, 'deck.json'),
      '--dry-run',
      '--resequence',
      's99',
    ])
    expect(again.out).not.toContain(`rhythm ${first} (`)
    for (const id of differing.slice(1)) expect(again.out).toContain(`ℹ rhythm ${id} (`)
    expect(again.out).toContain('--resequence s99: no such slide')
    // --resequence alone takes every remaining slide
    const all = run('deck-sync-story.ts', [join(dir, 'deck.json'), '--resequence'])
    expect(all.code, all.out + all.err).toBe(0)
    expect(deckOf(dir).slides.filter(differs)).toEqual([])
  })

  it('deck:validate points at the sync once the story changed, and is quiet once it is synced', () => {
    const dir = editedDeck('validate')
    const before = run('deck-validate.ts', [join(dir, 'deck.json')])
    expect(before.code, before.out + before.err).toBe(0)
    expect(before.out).toContain('⚠ story story.md has changed since the deck was generated')
    expect(before.out).toContain('notes differ from the story on s2')
    expect(run('deck-sync-story.ts', [join(dir, 'deck.json')]).code).toBe(0)
    const after = run('deck-validate.ts', [join(dir, 'deck.json')])
    expect(after.code, after.out + after.err).toBe(0)
    expect(after.out).not.toContain('has changed since')
    expect(after.out).not.toContain('notes differ')
    // the untouched example itself carries no such warning
    const pristine = run('deck-validate.ts', [join(EXAMPLE, 'deck.json')])
    expect(pristine.code, pristine.out + pristine.err).toBe(0)
    expect(pristine.out).not.toContain('⚠ story')
    expect(pristine.out).not.toContain('notes differ')
  })
})
