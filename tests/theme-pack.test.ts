import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Deck, parseDeck } from '../src/model/deck.ts'
import {
  exportTheme,
  importDestination,
  importTheme,
  parseImportTarget,
} from '../src/model/theme-pack.ts'
import { crc32, readZip, writeZip } from '../src/model/zip.ts'
import { findTheme, loadTheme, PROJECT_ROOT } from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

const REPO = { userThemesDir: null }
let tmp: string
let browser: Browser

function tidewatch(): { deck: Deck; deckDir: string } {
  const deckDir = resolve('examples/tidewatch-progress')
  const r = parseDeck(readFileSync(join(deckDir, 'deck.json'), 'utf8'))
  if (!r.ok) throw new Error('example deck does not parse')
  return { deck: r.deck, deckDir }
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-theme-pack-'))
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('the zip reader and writer', () => {
  it('round-trips text and binary entries and checks every CRC', () => {
    const big = Buffer.alloc(5000, 'a')
    const bin = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255])
    const zip = writeZip([
      { name: 'pack/theme.json', data: Buffer.from('{"id":"pack"}') },
      { name: 'pack/theme.css', data: big },
      { name: 'pack/layouts/cover/x.bin', data: bin },
      { name: 'pack/empty.txt', data: Buffer.alloc(0) },
      { name: 'pack/中文.txt', data: Buffer.from('你好') },
    ])
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    const back = readZip(zip)
    expect(back.map((e) => e.name)).toEqual([
      'pack/theme.json',
      'pack/theme.css',
      'pack/layouts/cover/x.bin',
      'pack/empty.txt',
      'pack/中文.txt',
    ])
    expect(Buffer.from(back[1]?.data ?? []).equals(big)).toBe(true)
    expect(Buffer.from(back[2]?.data ?? []).equals(bin)).toBe(true)
    expect(Buffer.from(back[4]?.data ?? []).toString('utf8')).toBe('你好')
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
    // a deflated entry that shrank, a stored one that did not
    expect(zip.length).toBeLessThan(5000)
  })

  it('refuses paths that would escape the target folder', () => {
    expect(() => writeZip([{ name: '../x', data: Buffer.alloc(1) }])).toThrow(/不能有這種路徑/)
    const zip = writeZip([{ name: 'ok/x', data: Buffer.alloc(1) }])
    // the name lives in the local header and in the central directory; poison both copies
    const bad = Buffer.from(zip)
    for (let i = bad.indexOf('ok/x'); i !== -1; i = bad.indexOf('ok/x', i + 1))
      bad.write('../x', i, 'utf8')
    expect(() => readZip(bad)).toThrow(/不安全的路徑/)
    expect(() => readZip(Buffer.from('not a zip at all'))).toThrow(/不是 zip/)
  })
})

describe('theme:export', () => {
  it('writes the pack folder to a zip and to a folder, generator included', () => {
    const zipOut = join(tmp, 'out', 'warm-keynote.zip')
    const z = exportTheme('warm-keynote', { lookup: REPO, out: zipOut })
    expect(z.kind).toBe('zip')
    expect(z.files).toEqual(
      expect.arrayContaining([
        'theme.json',
        'theme.css',
        'generate-layouts.cjs',
        'layouts/cover/layout.json',
      ]),
    )
    expect(z.check.errors).toBe(0)
    const entries = readZip(readFileSync(zipOut))
    expect(entries.map((e) => e.name)).toEqual(z.files.map((f) => `warm-keynote/${f}`))
    const dirOut = join(tmp, 'out', 'warm-keynote-dir')
    const d = exportTheme('warm-keynote', { lookup: REPO, out: dirOut })
    expect(d.kind).toBe('dir')
    expect(readFileSync(join(dirOut, 'theme.json'), 'utf8')).toBe(
      readFileSync(join(PROJECT_ROOT, 'themes', 'warm-keynote', 'theme.json'), 'utf8'),
    )
    expect(() => exportTheme('warm-keynote', { lookup: REPO, out: zipOut })).toThrow(/已存在/)
    expect(exportTheme('warm-keynote', { lookup: REPO, out: zipOut, force: true }).kind).toBe('zip')
    expect(() => exportTheme('nope', { lookup: REPO, out: join(tmp, 'x.zip') })).toThrow(
      /找不到主題/,
    )
  })
})

describe('theme:import', () => {
  it('parses the target and knows where each one keeps a theme', () => {
    expect(parseImportTarget(undefined)).toEqual({ kind: 'user' })
    expect(parseImportTarget('repo')).toEqual({ kind: 'repo' })
    expect(parseImportTarget(`deck:${join(tmp, 'd', 'deck.json')}`)).toEqual({
      kind: 'deck',
      deckDir: join(tmp, 'd'),
    })
    expect(() => parseImportTarget('cloud')).toThrow(/--to 只接受/)
    expect(importDestination('x', { kind: 'user' }, { userThemesDir: '/u' })).toBe(join('/u', 'x'))
    expect(importDestination('x', { kind: 'repo' }, { root: '/r' })).toBe(join('/r', 'themes', 'x'))
    expect(importDestination('x', { kind: 'deck', deckDir: '/d' })).toBe(
      join(resolve('/d'), 'themes', 'x'),
    )
  })

  it('imports an exported zip into a user directory and renders a deck with it', async () => {
    const userDir = join(tmp, 'home', 'themes')
    const zip = join(tmp, 'share', 'warm-keynote.zip')
    exportTheme('warm-keynote', { lookup: REPO, out: zip })
    const stages: string[] = []
    const result = await importTheme(zip, {
      to: { kind: 'user' },
      userThemesDir: userDir,
      browser,
      onStage: (s) => stages.push(s),
    })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(stages).toEqual(['unpack', 'exists', 'check', 'qa', 'copy'])
    expect(result.dest).toBe(join(userDir, 'warm-keynote'))
    expect(result.qa.errors + result.qa.warnings).toBe(0)
    expect(result.source).toBeUndefined()
    expect(existsSync(join(userDir, 'warm-keynote', 'layouts', 'cover', 'layout.html'))).toBe(true)
    expect(findTheme('warm-keynote', { userThemesDir: userDir })?.origin).toBe('user')
    const { deck, deckDir } = tidewatch()
    const html = renderDeckDocument(deck, { deckDir, outDir: tmp, userThemesDir: userDir }).html
    expect(html).toContain('--color-accent: #14b8a6;')
    expect(loadTheme('warm-keynote', { userThemesDir: userDir }).dir).toBe(
      join(userDir, 'warm-keynote'),
    )
    // the same pack again is refused until --force
    const again = await importTheme(zip, { to: { kind: 'user' }, userThemesDir: userDir, browser })
    expect(again).toMatchObject({ ok: false, stage: 'exists' })
    const forced = await importTheme(zip, {
      to: { kind: 'user' },
      userThemesDir: userDir,
      browser,
      force: true,
    })
    expect(forced.ok).toBe(true)
  }, 120_000)

  it('imports a folder into a deck folder and reports the source for the notices file', async () => {
    const dir = join(tmp, 'share', 'blue-professional')
    exportTheme('blue-professional', { lookup: REPO, out: dir })
    const deckDir = join(tmp, 'somedeck')
    mkdirSync(deckDir, { recursive: true })
    const result = await importTheme(dir, { to: { kind: 'deck', deckDir }, browser })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(result.dest).toBe(join(deckDir, 'themes', 'blue-professional'))
    expect(result.source?.license).toBe('MIT')
    expect(findTheme('blue-professional', { deckDir, userThemesDir: null })?.origin).toBe('deck')
  }, 120_000)

  it('a pack whose layout css breaks ownership is stopped at theme:check and nothing is written', async () => {
    const dir = join(tmp, 'share', 'broken-css')
    exportTheme('warm-keynote', { lookup: REPO, out: dir })
    const css = join(dir, 'layouts', 'cover', 'layout.css')
    writeFileSync(
      css,
      `${readFileSync(css, 'utf8')}\n[data-layout="cover"] [data-el="title"] { color: red; }\n`,
    )
    const userDir = join(tmp, 'home-broken', 'themes')
    const result = await importTheme(dir, { to: { kind: 'user' }, userThemesDir: userDir, browser })
    expect(result).toMatchObject({ ok: false, stage: 'check', id: 'warm-keynote' })
    if (result.ok) return
    expect(result.check?.issues.map((i) => i.message).join('\n')).toMatch(/color/)
    expect(existsSync(join(userDir, 'warm-keynote'))).toBe(false)
    expect(existsSync(userDir) ? readdirSync(userDir) : []).toEqual([])
  }, 60_000)

  it('a pack whose sample overflows is stopped at theme:qa', async () => {
    const dir = join(tmp, 'share', 'overflow')
    exportTheme('blue-professional', { lookup: REPO, out: dir })
    const file = join(dir, 'layouts', 'quote', 'layout.json')
    const json = JSON.parse(readFileSync(file, 'utf8')) as {
      sample: { caption: { value: string } }
    }
    json.sample.caption.value = '出處'.repeat(80)
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
    const userDir = join(tmp, 'home-overflow', 'themes')
    const result = await importTheme(dir, { to: { kind: 'user' }, userThemesDir: userDir, browser })
    expect(result).toMatchObject({ ok: false, stage: 'qa', id: 'blue-professional' })
    if (result.ok) return
    expect(result.qa?.errors).toBeGreaterThan(0)
    expect(existsSync(join(userDir, 'blue-professional'))).toBe(false)
  }, 120_000)

  it('refuses a zip whose folder name and id disagree, or that has no manifest', async () => {
    const bad = join(tmp, 'share', 'bad.zip')
    mkdirSync(join(tmp, 'share'), { recursive: true })
    writeFileSync(
      bad,
      writeZip([{ name: 'other/theme.json', data: Buffer.from(JSON.stringify({ id: 'mine' })) }]),
    )
    const r1 = await importTheme(bad, {
      to: { kind: 'user' },
      userThemesDir: join(tmp, 'h3'),
      browser,
    })
    expect(r1).toMatchObject({ ok: false, stage: 'unpack' })
    if (!r1.ok) expect(r1.message).toMatch(/資料夾叫 other/)
    writeFileSync(bad, writeZip([{ name: 'x/theme.css', data: Buffer.from('') }]))
    const r2 = await importTheme(bad, {
      to: { kind: 'user' },
      userThemesDir: join(tmp, 'h3'),
      browser,
    })
    expect(r2).toMatchObject({ ok: false, stage: 'unpack' })
    if (!r2.ok) expect(r2.message).toMatch(/沒有 theme.json/)
  })
})
