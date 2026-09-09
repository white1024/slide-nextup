import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importDestination, parseImportTarget } from '../src/model/theme-pack.ts'
import { checkSkills, isClean } from '../src/skills/sync.ts'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  version: string
  scripts: Record<string, string>
}

function init(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, ['src/cli/init.ts', ...args], {
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

const read = (ws: string, f: string) => readFileSync(join(ws, f), 'utf8')
const json = (ws: string, f: string) =>
  JSON.parse(read(ws, f)) as {
    name: string
    private: boolean
    scripts: Record<string, string>
    devDependencies: Record<string, string>
    dependencies?: Record<string, string>
  }

describe('slide-nextup init', () => {
  it('creates a workspace: package.json, agent entry points, the five skills with their mirror, decks/ and themes/', () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'slide-init-')), 'My Decks')
    const r = init([ws])
    expect(r.code, r.out).toBe(0)
    for (const f of [
      'package.json',
      'AGENTS.md',
      'CLAUDE.md',
      '.gitignore',
      'decks/.gitkeep',
      'themes/.gitkeep',
      '.agents/skills/slide-brief/SKILL.md',
      '.agents/skills/slide-story/SKILL.md',
      '.agents/skills/slide-design/SKILL.md',
      '.agents/skills/slide-build/SKILL.md',
      '.agents/skills/slide-talk/SKILL.md',
      '.agents/skills/slide-build/references/new-layout.md',
      '.claude/skills/slide-build/SKILL.md',
      '.claude/skills/.sync-lock.json',
    ])
      expect(existsSync(join(ws, f)), f).toBe(true)
    // the process skills of this workspace are not part of the product
    expect(existsSync(join(ws, '.agents/skills/wrap-up'))).toBe(false)

    const p = json(ws, 'package.json')
    expect(p.name).toBe('my-decks')
    expect(p.private).toBe(true)
    expect(p.scripts['story:check']).toBe('slide-nextup story:check')
    expect(p.scripts['deck:scaffold']).toBe('slide-nextup deck:scaffold')
    expect(p.scripts['browsers:install']).toBe('slide-nextup browsers:install')
    expect(p.scripts.init).toBeUndefined()
    expect(p.devDependencies['slide-nextup']).toBe(pkg.version)
    // the skills say `pnpm <script>`: every workspace script must exist in the repo under the same name
    for (const s of Object.keys(p.scripts)) expect(pkg.scripts, s).toHaveProperty(s)

    expect(read(ws, 'AGENTS.md')).toBe(readFileSync(resolve('templates/AGENTS.md'), 'utf8'))
    expect(read(ws, 'CLAUDE.md')).toContain('@AGENTS.md')
    expect(read(ws, '.agents/skills/slide-build/SKILL.md')).toBe(
      readFileSync(resolve('.agents/skills/slide-build/SKILL.md'), 'utf8'),
    )
    expect(isClean(checkSkills(join(ws, '.agents/skills'), join(ws, '.claude/skills')))).toBe(true)
    expect(r.out).toContain('pnpm install')
    expect(r.out).toContain('+ package.json')
  })

  it("--update refreshes the skills, scripts and pinned version but leaves the user's edits and fields alone", () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'slide-init-')), 'ws')
    expect(init([ws]).code).toBe(0)
    // the user customises the workspace
    writeFileSync(
      join(ws, 'AGENTS.md'),
      `${read(ws, 'AGENTS.md')}\n## House rules\n\nAlways use blue-professional.\n`,
    )
    const p = json(ws, 'package.json')
    p.scripts.lint = 'biome check .'
    p.devDependencies['slide-nextup'] = '0.0.1'
    p.dependencies = { left: '1.0.0' }
    writeFileSync(join(ws, 'package.json'), `${JSON.stringify(p, null, 2)}\n`)
    writeFileSync(join(ws, '.agents/skills/slide-build/SKILL.md'), 'broken\n')
    writeFileSync(join(ws, '.agents/skills/slide-build/stray.md'), 'stray\n')

    const r = init([ws, '--update'])
    expect(r.code, r.out).toBe(0)
    expect(read(ws, 'AGENTS.md')).toContain('## House rules')
    const q = json(ws, 'package.json')
    expect(q.scripts.lint).toBe('biome check .')
    expect(q.scripts['story:check']).toBe('slide-nextup story:check')
    expect(q.devDependencies['slide-nextup']).toBe(pkg.version)
    expect(q.dependencies).toEqual({ left: '1.0.0' })
    expect(read(ws, '.agents/skills/slide-build/SKILL.md')).toBe(
      readFileSync(resolve('.agents/skills/slide-build/SKILL.md'), 'utf8'),
    )
    expect(existsSync(join(ws, '.agents/skills/slide-build/stray.md'))).toBe(false)
    expect(isClean(checkSkills(join(ws, '.agents/skills'), join(ws, '.claude/skills')))).toBe(true)
    expect(r.out).toContain('~ .agents/skills/slide-build')
    expect(r.out).not.toContain('pnpm install')

    // a second update changes nothing
    const again = init([ws, '--update'])
    expect(again.code).toBe(0)
    expect(again.out).not.toContain('~ ')
    // --force rewrites AGENTS.md from the template; --update never does
    expect(init([ws, '--force']).code).toBe(0)
    expect(read(ws, 'AGENTS.md')).not.toContain('## House rules')
  })

  it('pins another spec with --package and refuses to run inside slide-nextup itself', () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'slide-init-')), 'ws')
    expect(init([ws, '--package', 'file:../slide-nextup-0.1.0.tgz']).code).toBe(0)
    expect(json(ws, 'package.json').devDependencies['slide-nextup']).toBe(
      'file:../slide-nextup-0.1.0.tgz',
    )
    const self = init(['.'])
    expect(self.code).toBe(2)
    expect(self.out).toContain('slide-nextup itself')
  })

  it('--example copies the bundled deck into decks/ once', () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'slide-init-')), 'ws')
    const r = init([ws, '--example'])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('+ decks/tidewatch-progress')
    for (const f of [
      'deck.json',
      'story.md',
      'story.confirmed.json',
      'design.json',
      'assets/system-map.svg',
    ])
      expect(existsSync(join(ws, 'decks/tidewatch-progress', f)), f).toBe(true)
    expect(read(ws, 'decks/tidewatch-progress/deck.json')).toBe(
      readFileSync(resolve('examples/tidewatch-progress/deck.json'), 'utf8'),
    )
    // the user's copy is theirs now: a second --example leaves it alone
    writeFileSync(join(ws, 'decks/tidewatch-progress/story.md'), 'mine\n')
    expect(init([ws, '--example']).code).toBe(0)
    expect(read(ws, 'decks/tidewatch-progress/story.md')).toBe('mine\n')
  })

  it('theme:import knows the workspace target', () => {
    expect(parseImportTarget('workspace')).toEqual({ kind: 'workspace' })
    expect(importDestination('x', { kind: 'workspace' }, { workspaceDir: '/w' })).toBe(
      join(resolve('/w'), 'themes', 'x'),
    )
    expect(() => parseImportTarget('cloud')).toThrow(/user, workspace, repo/)
  })
})
