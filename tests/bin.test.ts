import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SLIDE_SKILLS } from '../src/cli/commands.ts'

const BIN = resolve('bin/slide-nextup.mjs')
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  version: string
  bin: Record<string, string>
  files: string[]
  scripts: Record<string, string>
}

function run(args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], {
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

describe('bin/slide-nextup', () => {
  it('is the package bin and lists every script command that has a cli module', () => {
    expect(pkg.bin['slide-nextup']).toBe('bin/slide-nextup.mjs')
    expect(pkg.files).toContain('bin')
    // the package ships the compiled dist/, never the sources or the tests
    expect(pkg.files).toContain('dist')
    expect(pkg.files).not.toContain('src')
    expect(pkg.files).not.toContain('tests')
    // every skill init copies must ship, or an npm-installed init writes fewer skills than it says
    for (const skill of SLIDE_SKILLS) expect(pkg.files).toContain(`.agents/skills/${skill}`)
    const help = run(['--help'])
    expect(help.code).toBe(0)
    // every package.json script that runs a cli module (or the browser download) is a command
    const commands = Object.entries(pkg.scripts)
      .filter(([, v]) => v.startsWith('node src/cli/') || v.startsWith('playwright install'))
      .map(([k]) => k)
    expect(commands.length).toBeGreaterThan(15)
    const listed = help.out.split('\n').filter((l) => l.startsWith('  '))
    for (const c of commands) expect(listed.some((l) => l.startsWith(`  ${c} `))).toBe(true)
  })

  it('prints usage with exit 2 when called bare or with an unknown command', () => {
    const bare = run([])
    expect(bare.code).toBe(2)
    expect(bare.out).toContain('Usage: slide-nextup <command>')
    const unknown = run(['story:chek'])
    expect(unknown.code).toBe(2)
    expect(unknown.err).toContain('unknown command `story:chek`')
  })

  it('prints the package version', () => {
    expect(run(['--version']).out.trim()).toBe(pkg.version)
  })

  it('runs a command exactly like the cli module, arguments and exit code included', () => {
    const viaBin = run(['story:check', 'examples/story.sample.md'])
    let direct: { code: number; out: string }
    try {
      direct = {
        code: 0,
        out: execFileSync(
          process.execPath,
          ['src/cli/story-check.ts', 'examples/story.sample.md'],
          {
            encoding: 'utf8',
            cwd: resolve('.'),
          },
        ),
      }
    } catch (e) {
      const err = e as { status: number; stdout: string }
      direct = { code: err.status, out: err.stdout }
    }
    expect(viaBin.code).toBe(direct.code)
    expect(viaBin.out).toBe(direct.out)
    expect(viaBin.out).toContain('passed')

    // a command's own --help and usage errors pass through
    const help = run(['render', '--help'])
    expect(`${help.out}${help.err}`).toContain('Usage: pnpm render')
    const missing = run(['story:check'])
    expect(missing.code).not.toBe(0)
  })

  it('says what to use when a theme command is handed a folder instead of an id', () => {
    // `theme:qa themes/x` used to run until it failed with `layout \`themes/x\` not found`
    for (const args of [
      ['theme:qa', '--theme', 'themes/warm-keynote'],
      ['theme:qa', 'themes/warm-keynote'],
      ['theme:check', '--theme', './themes/warm-keynote'],
      ['layout:gallery', '--theme', 'themes/warm-keynote'],
    ]) {
      const r = run(args)
      expect(r.code, args.join(' ')).toBe(2)
      expect(r.err).toContain('looks like a path')
      expect(r.err).toContain('--theme <id>')
      // the ids it can see from here, so the reader knows at once whether theirs is among them
      expect(r.err).toContain('Packs in reach from here: ')
      expect(r.err).toContain('warm-keynote')
      expect(r.err).toContain('theme:lint <file.css> --as theme|layout')
    }
    // an id is still an id, and a layout id next to it is still a layout id
    expect(run(['theme:check', '--theme', 'warm-keynote']).code).toBe(0)
  })

  it('asks for --as when a single CSS file is linted, and says what each half means', () => {
    const missing = run(['theme:lint', 'themes/warm-keynote/theme.css'])
    expect(missing.code).toBe(2)
    expect(missing.err).toContain('needs --as theme or --as layout')
    expect(missing.err).toContain('geometry is refused')
    expect(run(['theme:lint', 'themes/warm-keynote/theme.css', '--as', 'theme']).code).toBe(0)
    const help = run(['theme:lint', '--help'])
    expect(help.code).toBe(0)
    expect(help.out).toContain('--as theme|layout')
    // a pack folder used to die on EISDIR from readFileSync; now it says where a whole pack is checked
    const folder = run(['theme:lint', 'themes/warm-keynote'])
    expect(folder.code).toBe(2)
    expect(folder.err).toContain('is a folder')
    expect(folder.err).toContain('theme:check --theme <id>')
    expect(folder.err).not.toContain('EISDIR')
  })
})
