import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The published package ships dist/, built by tools/build.mjs, because Node does not strip types
// under node_modules. The build goes to the repo's own dist/ (gitignored) so that the compiled
// modules find schemas/, layouts/ and themes/ two levels up, exactly as in the installed package.
const dist = resolve('dist')
const tmp = mkdtempSync(join(tmpdir(), 'slide-package-'))
const run = (args: string[]) =>
  execFileSync(process.execPath, args, { encoding: 'utf8', cwd: resolve('.') })

describe('the compiled package', () => {
  beforeAll(() => {
    run(['tools/build.mjs'])
  }, 120_000)
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('ships the runtime assets next to the compiled modules and no TypeScript', () => {
    for (const f of [
      'cli/commands.js',
      'cli/story-check.js',
      'cli/init.js',
      'render/assets.js',
      'render/deck.js',
      'render/slot-render.js',
      'model/pages.js',
      'editor/editor.js',
      'editor/editor.css',
      'dev/client.js',
    ])
      expect(existsSync(join(dist, f)), f).toBe(true)
    expect(existsSync(join(dist, 'cli', 'commands.ts'))).toBe(false)
    // imports were rewritten from .ts to .js
    expect(readFileSync(join(dist, 'cli', 'init.js'), 'utf8')).not.toMatch(/from '[^']+\.ts'/)
    expect(readFileSync(join(dist, 'editor', 'editor.js'), 'utf8')).toBe(
      readFileSync(resolve('src', 'editor', 'editor.js'), 'utf8'),
    )
  })

  it('runs a compiled cli exactly like the source', () => {
    const compiled = run([join(dist, 'cli', 'story-check.js'), 'examples/story.sample.md'])
    const source = run(['src/cli/story-check.ts', 'examples/story.sample.md'])
    expect(compiled).toBe(source)
    expect(compiled).toContain('passed')
  })

  it('renders with the compiled renderer, editor included', () => {
    const html = join(tmp, 'tidewatch.html')
    run([join(dist, 'cli', 'render.js'), 'examples/tidewatch-progress/deck.json', '-o', html])
    const text = readFileSync(html, 'utf8')
    expect(text).toContain('id="deck-model"')
    expect(text).toContain('ed-float')
  })
})
