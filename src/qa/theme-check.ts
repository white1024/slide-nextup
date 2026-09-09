import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  findTheme,
  type Lookup,
  listLayoutIdsFor,
  listThemeLayoutIds,
  loadLayout,
  loadTheme,
  PROJECT_ROOT,
  type ThemeOrigin,
} from '../render/assets.ts'
import { type CheckIssue, checkLayout, checkTheme, scanLayoutHtml } from './layout-check.ts'

/**
 * Everything a theme pack must get right before it can be shared: the manifest's version fields,
 * the engine it asks for, the structural checks lint already runs on the theme and each of its
 * own layouts, the core layout vocabulary that lets `deck:retheme` move a deck onto it, and
 * whether theme.css has a word to say about every role its layouts use.
 */

/** The theme.json format this engine reads. */
export const THEME_SCHEMA_VERSION = 1

/**
 * The ten layouts every pack that ships its own layouts must provide, with the slots the generic
 * layouts of the same id declare; `deck:retheme` keeps a deck's content across packs through them.
 */
export const CORE_LAYOUTS: Record<string, string[]> = {
  cover: ['title', 'subtitle'],
  section: ['number', 'title', 'body'],
  statement: ['title', 'body', 'evidence'],
  cards: ['title', 'card-1', 'card-2', 'card-3'],
  comparison: ['title', 'left-title', 'left-items', 'right-title', 'right-items'],
  process: ['title', 'step-1', 'step-2', 'step-3', 'step-4'],
  photo: ['title', 'photo', 'caption'],
  'data-table': ['title', 'table', 'caption'],
  quote: ['title', 'caption'],
  closing: ['title', 'body', 'cta'],
}

/** The engine's own version, from package.json. */
export function engineVersion(root = PROJECT_ROOT): string {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string }
  return pkg.version ?? '0.0.0'
}

type Triple = [number, number, number]

function parseVersion(v: string): Triple | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function compare(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] as number) - (b[i] as number)
    if (d !== 0) return d
  }
  return 0
}

function comparator(v: Triple, clause: string): boolean {
  if (clause === '*' || clause === 'x') return true
  const m = /^(>=|<=|>|<|\^|~|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(clause)
  if (!m) throw new Error(`unrecognised version range \`${clause}\``)
  const op = m[1] ?? '='
  const major = Number(m[2])
  const minor = m[3] !== undefined && /^\d+$/.test(m[3]) ? Number(m[3]) : null
  const patch = m[4] !== undefined && /^\d+$/.test(m[4]) ? Number(m[4]) : null
  const lo: Triple = [major, minor ?? 0, patch ?? 0]
  const nextMinor: Triple = [major, (minor ?? 0) + 1, 0]
  const nextMajor: Triple = [major + 1, 0, 0]
  switch (op) {
    case '>=':
      return compare(v, lo) >= 0
    case '>':
      return compare(v, lo) > 0
    case '<=':
      return compare(v, lo) <= 0
    case '<':
      return compare(v, lo) < 0
    case '^': {
      let hi: Triple
      if (major > 0) hi = nextMajor
      else if (minor !== null && minor > 0) hi = nextMinor
      else if (minor !== null && patch !== null) hi = [0, minor, patch + 1]
      else if (minor !== null) hi = nextMinor
      else hi = [1, 0, 0]
      return compare(v, lo) >= 0 && compare(v, hi) < 0
    }
    case '~':
      return compare(v, lo) >= 0 && compare(v, minor !== null ? nextMinor : nextMajor) < 0
    default: {
      if (patch !== null) return compare(v, lo) === 0
      return compare(v, lo) >= 0 && compare(v, minor !== null ? nextMinor : nextMajor) < 0
    }
  }
}

/**
 * Does a version satisfy a range? Enough of semver for a manifest: `*`, exact, `>=`/`>`/`<=`/`<`,
 * `^`, `~`, x-ranges (`0.1.x`), space-joined ANDs and `||` ORs. Anything else throws.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version)
  if (!v) throw new Error(`unrecognised version number \`${version}\``)
  const alternatives = range
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean)
  if (alternatives.length === 0) return true
  return alternatives.some((alt) => alt.split(/\s+/).every((c) => comparator(v, c)))
}

export interface ThemeCheckOptions {
  /** the engine version to compare `engine` against (default: package.json) */
  engine?: string
}

export interface ThemeCheckReport {
  theme: string
  origin: ThemeOrigin | null
  dir: string | null
  /** own layouts found; the core vocabulary is only checked when there is at least one */
  packLayouts: string[]
  coreChecked: boolean
  issues: CheckIssue[]
  errors: number
  warnings: number
}

function slotTypes(t: string | string[]): string[] {
  return Array.isArray(t) ? t : [t]
}

/** The roles a set of layouts puts on elements, in first-seen order. */
export function rolesUsedBy(html: string[]): string[] {
  const roles = new Set<string>()
  for (const h of html) for (const e of scanLayoutHtml(h).elements) if (e.role) roles.add(e.role)
  return [...roles]
}

/** Does theme.css say anything about a role? A selector mentioning `[data-role="<role>"]` counts. */
export function cssMentionsRole(css: string, role: string): boolean {
  return css.includes(`[data-role="${role}"]`)
}

export function cssMentionsTone(css: string, tone: string): boolean {
  return css.includes(`[data-tone="${tone}"]`)
}

/** The tones a set of layouts asks for, in first-seen order. */
export function tonesUsedBy(html: string[]): string[] {
  const tones = new Set<string>()
  for (const h of html) for (const t of scanLayoutHtml(h).tones) tones.add(t)
  return [...tones]
}

export function runThemeCheck(
  themeId: string,
  lookup?: Lookup,
  opts: ThemeCheckOptions = {},
): ThemeCheckReport {
  const issues: CheckIssue[] = []
  const found = findTheme(themeId, lookup)
  const report: ThemeCheckReport = {
    theme: themeId,
    origin: found?.origin ?? null,
    dir: found?.dir ?? null,
    packLayouts: [],
    coreChecked: false,
    issues,
    errors: 0,
    warnings: 0,
  }
  const finish = () => {
    report.errors = issues.filter((i) => i.severity === 'error').length
    report.warnings = issues.length - report.errors
    return report
  }
  let theme: ReturnType<typeof loadTheme>
  try {
    theme = loadTheme(themeId, lookup)
  } catch (err) {
    issues.push({ severity: 'error', file: themeId, message: (err as Error).message })
    return finish()
  }
  const jsonFile = `${theme.dir}/theme.json`
  const cssFile = `${theme.dir}/theme.css`

  // 1. the manifest: schema (checkTheme), then the two version fields with plain messages
  const structural = checkTheme(theme)
  issues.push(...structural)
  const json = theme.json as Partial<typeof theme.json>
  if (json.schemaVersion !== undefined && json.schemaVersion !== THEME_SCHEMA_VERSION) {
    issues.push({
      severity: 'error',
      file: jsonFile,
      message: `schemaVersion ${json.schemaVersion} is not the ${THEME_SCHEMA_VERSION} this engine understands`,
    })
  }
  if (json.engine !== undefined) {
    const version = opts.engine ?? engineVersion()
    try {
      if (!satisfies(version, json.engine)) {
        issues.push({
          severity: 'error',
          file: jsonFile,
          message: `theme requires engine ${json.engine}, this is ${version}`,
        })
      }
    } catch (err) {
      issues.push({ severity: 'error', file: jsonFile, message: (err as Error).message })
    }
  }
  if (structural.some((i) => i.severity === 'error' && i.file === jsonFile)) return finish()

  // 2. every layout the pack ships: the same structural contract lint runs
  const packIds = listThemeLayoutIds(themeId, lookup)
  report.packLayouts = packIds
  const html: string[] = []
  for (const id of packIds) {
    const layout = loadLayout(id, themeId, lookup)
    issues.push(...checkLayout(layout))
    html.push(layout.html)
  }

  // 3. the core vocabulary, only for a pack with layouts of its own (a plain theme uses the library).
  // A pack that ships nothing but a cover is the bake-off stage slide-design goes through before a
  // theme is chosen: it is told so once, not charged with ten errors.
  const coverOnly = packIds.length === 1 && packIds[0] === 'cover'
  if (coverOnly) {
    issues.push({
      severity: 'warning',
      file: `${theme.dir}/layouts`,
      message:
        'cover-only pitch theme pack: the core layouts are not in yet, so the other slides of a deck fall back to the generic layouts (port the full set once it is chosen)',
    })
  } else if (packIds.length > 0) {
    report.coreChecked = true
    for (const [coreId, coreSlots] of Object.entries(CORE_LAYOUTS)) {
      if (!packIds.includes(coreId)) {
        issues.push({
          severity: 'error',
          file: `${theme.dir}/layouts/${coreId}`,
          message: `missing core layout \`${coreId}\` (the deck falls back to the generic layout, which looks a notch weaker after a theme switch)`,
        })
        continue
      }
      const pack = loadLayout(coreId, themeId, lookup).json
      const generic = loadLayout(coreId, undefined, lookup).json
      const file = `${theme.dir}/layouts/${coreId}/layout.json`
      for (const slotId of coreSlots) {
        const own = pack.slots[slotId]
        const ref = generic.slots[slotId]
        if (!own) {
          issues.push({
            severity: 'error',
            file,
            message: `core layout \`${coreId}\` is missing core slot \`${slotId}\` (names must match the generic layout; extras are fine, omissions are not)`,
          })
          continue
        }
        if (!ref) continue
        const missing = slotTypes(ref.type).filter((t) => !slotTypes(own.type).includes(t))
        if (missing.length > 0) {
          issues.push({
            severity: 'error',
            file,
            message: `core slot \`${slotId}\` type lacks ${missing.join(', ')} (the generic layout accepts ${slotTypes(ref.type).join('|')})`,
          })
        }
      }
    }
  }

  // 4. every role the theme will be asked to paint: its own layouts, else the library's
  if (packIds.length === 0) {
    for (const id of listLayoutIdsFor(undefined, lookup))
      html.push(loadLayout(id, undefined, lookup).html)
  }
  for (const role of rolesUsedBy(html)) {
    if (!cssMentionsRole(theme.css, role)) {
      issues.push({
        severity: 'warning',
        file: cssFile,
        message: `layouts use role \`${role}\` but theme.css has no [data-role="${role}"] rule`,
      })
    }
  }

  // 5. every tone the layouts ask for: a tone no rule styles falls back to the plain look in silence
  const used = tonesUsedBy(html)
  for (const tone of used) {
    if (!cssMentionsTone(theme.css, tone)) {
      issues.push({
        severity: 'warning',
        file: cssFile,
        message: `layouts use data-tone="${tone}" but theme.css has no [data-tone="${tone}"] rule; the element silently keeps the role's plain look`,
      })
    }
  }
  for (const tone of theme.json.tones ?? []) {
    if (!used.includes(tone) && !cssMentionsTone(theme.css, tone)) {
      issues.push({
        severity: 'warning',
        file: jsonFile,
        message: `theme.json lists tone \`${tone}\` but theme.css has no [data-tone="${tone}"] rule`,
      })
    }
  }
  return finish()
}

export function formatThemeCheck(report: ThemeCheckReport, root = PROJECT_ROOT): string {
  const lines: string[] = []
  const where = report.dir ? report.dir.replace(root, '.').replace(/\\/g, '/') : '(not found)'
  lines.push(
    `theme ${report.theme} ${where}${report.packLayouts.length ? ` · ${report.packLayouts.length} pack layouts${report.coreChecked ? ', core layouts checked' : ''}` : ' · no pack layouts, only the manifest and theme.css checked'}`,
  )
  for (const i of report.issues) {
    const file = i.file.replace(root, '.').replace(/\\/g, '/')
    lines.push(
      `  ${i.severity === 'error' ? '✖' : '⚠'} ${file}${i.line ? `:${i.line}` : ''}  ${i.message}`,
    )
  }
  lines.push(
    `  ${report.errors === 0 ? 'passed' : 'failed'}: ${report.errors} errors, ${report.warnings} warnings`,
  )
  return lines.join('\n')
}
