import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseDeck } from '../src/model/deck.ts'
import {
  parseDesign,
  readDesign,
  stringifyDesign,
  validateDesign,
  writeDesign,
} from '../src/model/design.ts'

const EXAMPLE = resolve('examples/tidewatch-progress')

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
  tmp = mkdtempSync(join(tmpdir(), 'slide-design-'))
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

/** A private copy of the example deck; without deck.json unless asked, so the scaffold starts fresh. */
function freshDeck(name: string, opts: { deck?: boolean } = {}): string {
  const dir = join(tmp, name)
  cpSync(EXAMPLE, dir, { recursive: true })
  if (!opts.deck) rmSync(join(dir, 'deck.json'))
  return dir
}

function design(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, 'design.json'), 'utf8')) as Record<string, unknown>
}

describe('design.json model', () => {
  it('accepts the choice with or without its optional fields and rejects anything else', () => {
    expect(validateDesign({ theme: 'warm-keynote' }).ok).toBe(true)
    expect(
      validateDesign({ theme: 'warm-keynote', direction: 'safe', chosenAt: '2026-09-08T10:00:00Z' })
        .ok,
    ).toBe(true)
    const missing = validateDesign({ direction: 'safe' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.errors.join('\n')).toContain('missing `theme`')
    const extra = validateDesign({ theme: 'warm-keynote', layout: 'cover' })
    expect(extra.ok).toBe(false)
    if (!extra.ok) expect(extra.errors.join('\n')).toContain('unknown field `layout`')
    expect(validateDesign({ theme: '' }).ok).toBe(false)
    expect(validateDesign({ theme: 'has space' }).ok).toBe(false)
    const broken = parseDesign('{ "theme": ')
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors[0]).toContain('not valid JSON')
  })

  it('writes a fixed key order with a trailing newline and reads it back', () => {
    const dir = join(tmp, 'model')
    cpSync(EXAMPLE, dir, { recursive: true })
    expect(stringifyDesign({ chosenAt: 'now', theme: 'x', direction: 'bold' })).toBe(
      '{\n  "theme": "x",\n  "direction": "bold",\n  "chosenAt": "now"\n}\n',
    )
    expect(stringifyDesign({ theme: 'x' })).toBe('{\n  "theme": "x"\n}\n')
    writeDesign(dir, { theme: 'blue-professional', direction: 'bold' })
    const back = readDesign(dir)
    expect(back?.ok).toBe(true)
    if (back?.ok) expect(back.design).toEqual({ theme: 'blue-professional', direction: 'bold' })
    expect(readDesign(join(tmp, 'nowhere'))).toBeNull()
  })
})

describe('pnpm design:set', () => {
  it('records the theme, the direction and the time next to the story, saying what it replaced', () => {
    const dir = freshDeck('set-story')
    expect(design(dir)).toEqual({ theme: 'warm-keynote' })
    const r = run('design-set.ts', [
      join(dir, 'story.md'),
      '--theme',
      'blue-professional',
      '--direction',
      'safe',
    ])
    expect(r.code, r.out + r.err).toBe(0)
    expect(r.out).toContain('theme blue-professional (repo)')
    expect(r.out).toContain('(was warm-keynote)')
    expect(r.out).toContain('next: pnpm deck:scaffold')
    const d = design(dir)
    expect(d.theme).toBe('blue-professional')
    expect(d.direction).toBe('safe')
    expect(Number.isNaN(Date.parse(String(d.chosenAt)))).toBe(false)
    expect(readFileSync(join(dir, 'design.json'), 'utf8').endsWith('}\n')).toBe(true)
  })

  it('takes the deck folder itself and finds a theme that lives in that folder', () => {
    const dir = freshDeck('set-folder')
    const local = join(dir, 'themes', 'my-ink')
    cpSync(resolve('themes/blue-professional'), local, { recursive: true })
    const themeJson = JSON.parse(readFileSync(join(local, 'theme.json'), 'utf8')) as { id: string }
    themeJson.id = 'my-ink'
    writeFileSync(join(local, 'theme.json'), JSON.stringify(themeJson, null, 2))
    const r = run('design-set.ts', [dir, '--theme', 'my-ink'])
    expect(r.code, r.out + r.err).toBe(0)
    expect(r.out).toContain('theme my-ink (deck folder)')
    expect(design(dir)).toMatchObject({ theme: 'my-ink' })
    expect(design(dir).direction).toBeUndefined()
  })

  it('refuses a theme it cannot find and leaves the file alone', () => {
    const dir = freshDeck('set-missing')
    const r = run('design-set.ts', [dir, '--theme', 'nope'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('theme `nope` not found; searched:')
    expect(r.out).toContain('nothing written')
    expect(design(dir)).toEqual({ theme: 'warm-keynote' })
    expect(
      run('design-set.ts', [join(tmp, 'absent', 'story.md'), '--theme', 'blue-professional']).code,
    ).toBe(1)
    expect(run('design-set.ts', ['--theme', 'blue-professional']).code).toBe(2)
    expect(run('design-set.ts', [dir]).code).toBe(2)
  })

  it('points at deck:retheme when a built deck sits on another theme', () => {
    const dir = freshDeck('set-built', { deck: true })
    const r = run('design-set.ts', [dir, '--theme', 'blue-professional'])
    expect(r.code, r.out + r.err).toBe(0)
    expect(r.out).toContain('deck.json is on warm-keynote')
    expect(r.out).toContain('--theme blue-professional moves it')
  })
})

describe('deck:scaffold and deck:validate read design.json', () => {
  it('scaffolds a new deck on the chosen theme without --theme', () => {
    const dir = freshDeck('scaffold-fresh')
    writeDesign(dir, { theme: 'blue-professional' })
    const r = run('deck-scaffold.ts', [join(dir, 'story.md')])
    expect(r.code, r.out + r.err).toBe(0)
    expect(r.out).not.toContain('⚠ design.json')
    const parsed = parseDeck(readFileSync(join(dir, 'deck.json'), 'utf8'))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.deck.theme).toBe('blue-professional')
  })

  it('keeps a built deck on its own theme and says so; --theme wins for one run and says so too', () => {
    const dir = freshDeck('scaffold-built', { deck: true })
    writeDesign(dir, { theme: 'blue-professional' })
    const kept = run('deck-scaffold.ts', [join(dir, 'story.md'), '--slide', 's2'])
    expect(kept.code, kept.out + kept.err).toBe(0)
    expect(kept.out).toContain(
      '⚠ design.json chooses blue-professional but deck.json is on warm-keynote; keeping',
    )
    const parsed = parseDeck(readFileSync(join(dir, 'deck.json'), 'utf8'))
    if (parsed.ok) expect(parsed.deck.theme).toBe('warm-keynote')

    const fresh = freshDeck('scaffold-forced')
    writeDesign(fresh, { theme: 'blue-professional' })
    const forced = run('deck-scaffold.ts', [join(fresh, 'story.md'), '--theme', 'technical-brief'])
    expect(forced.code, forced.out + forced.err).toBe(0)
    expect(forced.out).toContain(
      '⚠ --theme technical-brief differs from design.json (blue-professional)',
    )
    const onBrief = parseDeck(readFileSync(join(fresh, 'deck.json'), 'utf8'))
    if (onBrief.ok) expect(onBrief.deck.theme).toBe('technical-brief')
  })

  it('fails both commands on a design.json that breaks the schema', () => {
    const dir = freshDeck('scaffold-broken', { deck: true })
    writeFileSync(join(dir, 'design.json'), '{ "theme": "warm-keynote", "font": "Inter" }\n')
    const s = run('deck-scaffold.ts', [join(dir, 'story.md')])
    expect(s.code).toBe(1)
    expect(s.out).toContain('unknown field `font`')
    expect(s.out).toContain('design.json failed its schema')
    const v = run('deck-validate.ts', [join(dir, 'deck.json')])
    expect(v.code).toBe(1)
    expect(v.out).toContain('failed: design.json does not match schemas/design.schema.json')
  })

  it('deck:validate warns when the deck sits on another theme than the one chosen', () => {
    const dir = freshDeck('validate-mismatch', { deck: true })
    const clean = run('deck-validate.ts', [join(dir, 'deck.json')])
    expect(clean.code, clean.out + clean.err).toBe(0)
    expect(clean.out).not.toContain('⚠ design.json')
    writeDesign(dir, { theme: 'blue-professional' })
    const r = run('deck-validate.ts', [join(dir, 'deck.json')])
    expect(r.code, r.out + r.err).toBe(0)
    expect(r.out).toContain(
      '⚠ design.json chooses blue-professional but the deck is on warm-keynote',
    )
    expect(existsSync(join(dir, 'deck.json'))).toBe(true)
  })
})
