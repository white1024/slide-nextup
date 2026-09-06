import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('toolchain smoke', () => {
  it('runs on the Node major the manifest requires', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      engines: { node: string }
    }
    const required = Number.parseInt(pkg.engines.node.replace(/[^\d]/g, ''), 10)
    const actual = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
    expect(actual).toBeGreaterThanOrEqual(required)
  })
})
