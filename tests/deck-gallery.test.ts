import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

/** width × height from the IHDR chunk of a PNG */
function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-gallery-'))
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('pnpm deck:gallery', () => {
  it('screenshots every visible slide at 1920×1080 in playback order and writes a contact sheet', () => {
    const out = join(tmp, 'all')
    const r = run('deck-gallery.ts', [join(EXAMPLE, 'deck.json'), '-o', out])
    expect(r.code, r.out + r.err).toBe(0)
    const pngs = readdirSync(out)
      .filter((f) => f.endsWith('.png'))
      .sort()
    expect(pngs).toEqual([
      '01-s1.png',
      '02-s2.png',
      '03-s3.png',
      '04-s4.png',
      '05-s5.png',
      '06-s6.png',
      '07-s7.png',
      '08-s8.png',
    ])
    for (const f of pngs) expect(pngSize(join(out, f))).toEqual({ width: 1920, height: 1080 })
    // the page number chip is server-rendered per slide, so two shots of a themed deck cannot be identical
    expect(readFileSync(join(out, '02-s2.png')).equals(readFileSync(join(out, '03-s3.png')))).toBe(
      false,
    )
    const sheet = readFileSync(join(out, 'index.html'), 'utf8')
    expect(sheet).toContain('<img src="01-s1.png"')
    expect(sheet).toContain('08 · s8 · closing')
    expect(sheet).not.toMatch(/https?:\/\//)
    expect(r.out).toContain('✓ 03     s3     photo')
    expect(r.out).toContain('8 slides →')
    expect(r.out).not.toContain('hidden page')
  })

  it('skips hidden pages unless asked, keeps the playback order, and takes trailing slide ids', () => {
    const dir = join(tmp, 'pages')
    cpSync(EXAMPLE, dir, { recursive: true })
    const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Record<string, unknown>
    deck.pages = { order: ['s1', 's3', 's2', 's4', 's5', 's6', 's7', 's8'], hidden: ['s2'] }
    writeFileSync(join(dir, 'deck.json'), JSON.stringify(deck, null, 2))

    const out = join(tmp, 'pages-out')
    const r = run('deck-gallery.ts', [join(dir, 'deck.json'), '-o', out])
    expect(r.code, r.out + r.err).toBe(0)
    const pngs = readdirSync(out)
      .filter((f) => f.endsWith('.png'))
      .sort()
    expect(pngs).toEqual([
      '01-s1.png',
      '02-s3.png',
      '03-s4.png',
      '04-s5.png',
      '05-s6.png',
      '06-s7.png',
      '07-s8.png',
    ])
    expect(r.out).toContain('1 hidden page skipped')

    const withHidden = run('deck-gallery.ts', [join(dir, 'deck.json'), '-o', out, '--hidden'])
    expect(withHidden.code, withHidden.out + withHidden.err).toBe(0)
    expect(existsSync(join(out, 'hidden-s2.png'))).toBe(true)
    expect(withHidden.out).not.toContain('hidden page skipped')

    const one = join(tmp, 'one')
    const only = run('deck-gallery.ts', [join(dir, 'deck.json'), '-o', one, 's4'])
    expect(only.code, only.out + only.err).toBe(0)
    expect(readdirSync(one).filter((f) => f.endsWith('.png'))).toEqual(['03-s4.png'])
    expect(run('deck-gallery.ts', [join(dir, 'deck.json'), '-o', one, 's99']).code).toBe(2)
    expect(run('deck-gallery.ts', []).code).toBe(2)
  })

  it('takes a rendered deck.html as well', () => {
    const html = join(tmp, 'rendered.html')
    const rendered = run('render.ts', [join(EXAMPLE, 'deck.json'), '-o', html, '--inline-assets'])
    expect(rendered.code, rendered.out + rendered.err).toBe(0)
    const out = join(tmp, 'from-html')
    const r = run('deck-gallery.ts', [html, '-o', out, 's1'])
    expect(r.code, r.out + r.err).toBe(0)
    expect(pngSize(join(out, '01-s1.png'))).toEqual({ width: 1920, height: 1080 })
  })
})
