import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
