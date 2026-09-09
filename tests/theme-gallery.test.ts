import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listThemeIds, listThemeLayoutIds, loadTheme } from '../src/render/assets.ts'

const REPO = { userThemesDir: null }

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [resolve('src/cli/theme-gallery.ts'), ...args], {
      encoding: 'utf8',
      cwd: resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout}${err.stderr}` }
  }
}

const walk = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`],
  )

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-theme-gallery-'))
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('pnpm theme:gallery', () => {
  it('writes one real page per pack layout, a page of frames per theme, a short index, and no picture', () => {
    const out = join(tmp, 'all')
    const r = run(['-o', out])
    expect(r.code, r.out).toBe(0)
    const files = walk(out).sort()
    const themes = listThemeIds(REPO)
    const layouts = themes.flatMap((t) => listThemeLayoutIds(t, REPO).map((l) => `${t}/${l}.html`))
    const expected = ['index.html', ...themes.map((t) => `${t}/index.html`), ...layouts].sort()
    expect(files).toEqual(expected)
    expect(files.some((f) => /\.(png|jpe?g|webp)$/i.test(f))).toBe(false)
    expect(r.out).toContain(`${layouts.length} layouts for ${themes.length} themes`)
    // the generic library is not part of a pack's gallery
    expect(files).not.toContain('blue-professional/hero.html')

    // a page is the layout rendered with its sample under the theme, complete in itself
    const cover = readFileSync(join(out, 'blue-professional', 'cover.html'), 'utf8')
    expect(cover).toContain('data-layout="cover"')
    expect(cover).toContain('--color-accent: #1e2bfa;')
    expect(cover).not.toMatch(/<link\s/)

    // a theme's page frames each of its layouts, the cover first, the closing last
    for (const t of themes) {
      const page = readFileSync(join(out, t, 'index.html'), 'utf8')
      const own = listThemeLayoutIds(t, REPO)
      expect(page).toContain(loadTheme(t, REPO).json.name)
      expect(page.match(/<iframe /g)).toHaveLength(own.length)
      for (const l of own) expect(page).toContain(`src="${l}.html"`)
      const order = [...page.matchAll(/<iframe src="([^"]+)\.html"/g)].map((m) => m[1])
      expect(order[0]).toBe('cover')
      expect(order[order.length - 1]).toBe('closing')
      expect(page).not.toContain('<img')
    }

    // the index is one entry per pack with a teaser frame and a link to the pack's page
    const index = readFileSync(join(out, 'index.html'), 'utf8')
    expect(index.match(/<iframe /g)).toHaveLength(themes.length)
    for (const t of themes) {
      expect(index).toContain(`href="${t}/index.html"`)
      expect(index).toContain(`src="${t}/cover.html"`)
      expect(index).toContain(loadTheme(t, REPO).json.name)
    }
    expect(index).not.toContain('<img')
  })

  it('--check passes on a fresh gallery and fails on a stale, missing or stray page', () => {
    const out = join(tmp, 'check')
    expect(run(['-o', out]).code).toBe(0)
    const fresh = run(['-o', out, '--check'])
    expect(fresh.code, fresh.out).toBe(0)
    expect(fresh.out).toContain('is current')

    const page = join(out, 'warm-keynote', 'cover.html')
    writeFileSync(page, `${readFileSync(page, 'utf8')}<!-- edited -->`)
    const stale = run(['-o', out, '--check'])
    expect(stale.code).toBe(1)
    expect(stale.out).toContain('stale    warm-keynote/cover.html')
    expect(stale.out).toContain('run pnpm theme:gallery')

    rmSync(page)
    writeFileSync(join(out, 'old-theme.html'), '<!doctype html>')
    const broken = run(['-o', out, '--check'])
    expect(broken.code).toBe(1)
    expect(broken.out).toContain('missing  warm-keynote/cover.html')
    expect(broken.out).toContain('stray    old-theme.html')

    // a full run repairs it: the stray page goes, the missing one comes back
    expect(run(['-o', out]).code).toBe(0)
    expect(run(['-o', out, '--check']).code).toBe(0)
    expect(walk(out)).not.toContain('old-theme.html')
  })

  it('renders only the packs named with --theme and refuses a path', () => {
    const out = join(tmp, 'one')
    const r = run(['--theme', 'technical-brief', '-o', out])
    expect(r.code, r.out).toBe(0)
    expect(readdirSync(out).sort()).toEqual(['index.html', 'technical-brief'])
    const bad = run(['--theme', 'themes/technical-brief', '-o', out])
    expect(bad.code).not.toBe(0)
    expect(bad.out).toContain('looks like a path')
  })

  it('the committed docs/gallery is current with the themes and layouts', () => {
    const r = run(['--check'])
    expect(r.code, r.out).toBe(0)
  }, 30_000)
})
