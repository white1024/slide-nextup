import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CORE_LAYOUTS,
  cssMentionsRole,
  engineVersion,
  rolesUsedBy,
  runThemeCheck,
  satisfies,
  THEME_SCHEMA_VERSION,
} from '../src/qa/theme-check.ts'
import { listThemeIds, loadLayout, loadTheme, PROJECT_ROOT } from '../src/render/assets.ts'

const REPO = { userThemesDir: null }
let tmp: string
let userDir: string

/** A private copy of blue-professional under a new id, ready to be broken one way at a time. */
function copyPack(id: string, mutate: (dir: string) => void): { userThemesDir: string } {
  const dir = join(userDir, id)
  cpSync(join(PROJECT_ROOT, 'themes', 'blue-professional'), dir, { recursive: true })
  rmSync(join(dir, 'generate-layouts.cjs'), { force: true })
  const json = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')) as Record<string, unknown>
  json.id = id
  writeFileSync(join(dir, 'theme.json'), `${JSON.stringify(json, null, 2)}\n`)
  mutate(dir)
  return { userThemesDir: userDir }
}

function editJson(file: string, edit: (json: Record<string, unknown>) => void) {
  const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  edit(json)
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-theme-check-'))
  userDir = join(tmp, 'themes')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('semver ranges for the engine field', () => {
  it('reads the engine version from package.json', () => {
    expect(engineVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('handles the range forms a manifest would use', () => {
    expect(satisfies('0.1.0', '*')).toBe(true)
    expect(satisfies('0.1.0', '')).toBe(true)
    expect(satisfies('0.1.0', '0.1.0')).toBe(true)
    expect(satisfies('0.1.1', '0.1.0')).toBe(false)
    expect(satisfies('0.1.7', '0.1.x')).toBe(true)
    expect(satisfies('0.2.0', '0.1.x')).toBe(false)
    expect(satisfies('1.4.0', '1.x')).toBe(true)
    expect(satisfies('0.1.0', '>=0.1.0')).toBe(true)
    expect(satisfies('0.0.9', '>=0.1.0')).toBe(false)
    expect(satisfies('0.1.0', '>0.1.0')).toBe(false)
    expect(satisfies('0.1.0', '<=0.1.0')).toBe(true)
    expect(satisfies('0.1.0', '<0.1.0')).toBe(false)
    expect(satisfies('0.1.9', '^0.1.0')).toBe(true)
    expect(satisfies('0.2.0', '^0.1.0')).toBe(false)
    expect(satisfies('1.9.9', '^1.2.3')).toBe(true)
    expect(satisfies('2.0.0', '^1.2.3')).toBe(false)
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false)
    expect(satisfies('1.2.9', '~1.2.3')).toBe(true)
    expect(satisfies('1.3.0', '~1.2.3')).toBe(false)
    expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true)
    expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false)
    expect(satisfies('3.0.0', '^1.0.0 || ^3.0.0')).toBe(true)
    expect(() => satisfies('0.1.0', 'latest')).toThrow(/看不懂的版本範圍/)
    expect(() => satisfies('abc', '*')).toThrow(/看不懂的版本號/)
  })
})

describe('theme:check on the shipped themes', () => {
  it('every shipped theme carries the current schemaVersion and has no errors', () => {
    for (const id of listThemeIds(REPO)) {
      expect(loadTheme(id, REPO).json.schemaVersion, id).toBe(THEME_SCHEMA_VERSION)
      const report = runThemeCheck(id, REPO)
      expect(
        report.issues.filter((i) => i.severity === 'error'),
        id,
      ).toEqual([])
    }
  })

  it('the two complete packs pass clean, core vocabulary included', () => {
    for (const id of ['warm-keynote', 'blue-professional']) {
      const report = runThemeCheck(id, REPO)
      expect(report.coreChecked, id).toBe(true)
      expect(report.packLayouts.length, id).toBeGreaterThanOrEqual(10)
      expect(report.issues, id).toEqual([])
      expect(report.errors + report.warnings, id).toBe(0)
    }
  })

  it('the core table matches the slots the generic layouts declare', () => {
    for (const [id, slots] of Object.entries(CORE_LAYOUTS)) {
      const generic = loadLayout(id, undefined, REPO).json
      for (const s of slots) expect(generic.slots[s], `${id}/${s}`).toBeDefined()
    }
  })

  it('a cover-only bake-off pack gets one warning instead of ten missing-layout errors', () => {
    for (const id of ['cobalt-grid', 'creative-mode']) {
      const report = runThemeCheck(id, REPO)
      expect(report.packLayouts, id).toEqual(['cover'])
      expect(report.coreChecked, id).toBe(false)
      expect(report.errors, id).toBe(0)
      expect(
        report.issues.map((i) => i.message),
        id,
      ).toContainEqual(expect.stringMatching(/只有封面的比稿主題包/))
    }
  })

  it('a plain theme without its own layouts skips the core check but is measured against the library', () => {
    const report = runThemeCheck('ink-paper', REPO)
    expect(report.coreChecked).toBe(false)
    expect(report.packLayouts).toEqual([])
    expect(report.errors).toBe(0)
  })

  it('reads roles out of layout html and looks them up in the css', () => {
    expect(
      rolesUsedBy([
        '<section class="slide" data-layout="x"><p data-el="a" data-role="title"></p><div data-el="b" data-role="card"></div></section>',
      ]),
    ).toEqual(['title', 'card'])
    expect(cssMentionsRole('[data-role="card"] { color: red }', 'card')).toBe(true)
    expect(cssMentionsRole('[data-role="card"] { color: red }', 'stat')).toBe(false)
  })
})

describe('theme:check catches a broken pack', () => {
  it('a missing core layout', () => {
    const lookup = copyPack('bp-no-quote', (dir) =>
      rmSync(join(dir, 'layouts', 'quote'), { recursive: true }),
    )
    const report = runThemeCheck('bp-no-quote', lookup)
    expect(report.origin).toBe('user')
    expect(report.errors).toBe(1)
    expect(report.issues[0]?.message).toMatch(/缺少核心版型 `quote`/)
  })

  it('a renamed core slot', () => {
    const lookup = copyPack('bp-renamed', (dir) => {
      const cards = join(dir, 'layouts', 'cards')
      editJson(join(cards, 'layout.json'), (json) => {
        const slots = json.slots as Record<string, unknown>
        slots['card-x'] = slots['card-3']
        delete slots['card-3']
        json.elements = (json.elements as Array<{ id: string }>).map((e) =>
          e.id === 'card-3' ? { ...e, id: 'card-x' } : e,
        )
        const sample = json.sample as Record<string, unknown>
        sample['card-x'] = sample['card-3']
        delete sample['card-3']
      })
      const html = readFileSync(join(cards, 'layout.html'), 'utf8').replaceAll('card-3', 'card-x')
      writeFileSync(join(cards, 'layout.html'), html)
      const css = readFileSync(join(cards, 'layout.css'), 'utf8').replaceAll('card-3', 'card-x')
      writeFileSync(join(cards, 'layout.css'), css)
    })
    const report = runThemeCheck('bp-renamed', lookup)
    expect(report.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/核心版型 `cards` 缺少核心槽位 `card-3`/),
    ])
  })

  it('a core slot that lost a type the generic layout accepts', () => {
    const lookup = copyPack('bp-narrow', (dir) => {
      editJson(join(dir, 'layouts', 'statement', 'layout.json'), (json) => {
        const slots = json.slots as Record<string, { type: string | string[] }>
        const evidence = slots.evidence
        if (evidence) evidence.type = 'text'
      })
    })
    const report = runThemeCheck('bp-narrow', lookup)
    expect(report.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/核心槽位 `evidence` 的型別少了 list/),
    ])
  })

  it('a schemaVersion this engine does not know', () => {
    const lookup = copyPack('bp-v2', (dir) =>
      editJson(join(dir, 'theme.json'), (json) => {
        json.schemaVersion = 2
      }),
    )
    const report = runThemeCheck('bp-v2', lookup)
    expect(report.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/schemaVersion 2 不是這個引擎認得的 1/),
    ])
  })

  it('a missing schemaVersion fails the schema', () => {
    const lookup = copyPack('bp-unversioned', (dir) =>
      editJson(join(dir, 'theme.json'), (json) => {
        delete json.schemaVersion
      }),
    )
    const report = runThemeCheck('bp-unversioned', lookup)
    expect(report.errors).toBeGreaterThan(0)
    expect(report.issues[0]?.message).toMatch(/schemaVersion/)
  })

  it('an engine range the running engine does not satisfy, and one it does', () => {
    const lookup = copyPack('bp-engine', (dir) =>
      editJson(join(dir, 'theme.json'), (json) => {
        json.engine = '>=99.0.0'
      }),
    )
    expect(runThemeCheck('bp-engine', lookup).issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/主題要求引擎 >=99\.0\.0，這裡是 /),
    ])
    expect(runThemeCheck('bp-engine', lookup, { engine: '99.1.0' }).errors).toBe(0)
    editJson(join(userDir, 'bp-engine', 'theme.json'), (json) => {
      json.engine = 'latest'
    })
    expect(runThemeCheck('bp-engine', lookup).issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/看不懂的版本範圍 `latest`/),
    ])
  })

  it('a role the theme.css never mentions is a warning, not an error', () => {
    const lookup = copyPack('bp-mute', (dir) => {
      const css = readFileSync(join(dir, 'theme.css'), 'utf8').replaceAll(
        '[data-role="entry"]',
        '[data-role="entry-gone"]',
      )
      writeFileSync(join(dir, 'theme.css'), css)
    })
    const report = runThemeCheck('bp-mute', lookup)
    expect(report.errors).toBe(0)
    expect(report.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/role `entry`，theme.css 沒有任何 \[data-role="entry"\] 規則/),
    ])
  })

  it('reports an unknown theme with the folders it searched', () => {
    const report = runThemeCheck('nope', { userThemesDir: userDir })
    expect(report.origin).toBeNull()
    expect(report.errors).toBe(1)
    expect(report.issues[0]?.message).toMatch(/找不到主題 `nope`；找過：/)
  })
})
