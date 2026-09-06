import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import type { Enter, Slot } from '../model/deck.ts'

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Provenance of a theme ported from an external template; THIRD_PARTY_NOTICES.md lists the same sources. */
export interface ThemeSource {
  name: string
  url: string
  author: string
  license: string
  /** the template's slug inside the source project */
  template?: string
}

export interface ThemeJson {
  /** the theme.json format version this file is written for; the engine reads 1 */
  schemaVersion: number
  /** the engine version range the pack needs (semver), checked by theme:check; absent = any */
  engine?: string
  id: string
  name: string
  description: string
  colors: Record<string, { value: string; use: string }>
  typography: {
    display: { family: string; weight: number }
    body: { family: string; weight: number }
  }
  spacing: { radius: number }
  decoration: { vocabulary: string[]; avoid: string[] }
  source?: ThemeSource
  motion?: ThemeMotion
}

/** Playback rhythm: which entrance a step element gets when it does not say, and the timing. */
export interface ThemeMotion {
  default?: Enter
  byRole?: Record<string, Enter>
  /** ms between elements revealed by the same step */
  stagger?: number
  /** ms of one entrance */
  duration?: number
  /** the page transition a deck of this theme plays when deck.json names none (fade otherwise) */
  transition?: 'none' | 'fade' | 'push' | 'lift'
}

export const MOTION_DEFAULTS = { enter: 'fade-up' as Enter, stagger: 70, duration: 350 }

/** The entrance a step element uses: its own, else the theme default for its role, else fade-up. */
export function enterFor(theme: ThemeJson, role: string | undefined): Enter {
  const motion = theme.motion ?? {}
  return (
    (role !== undefined ? motion.byRole?.[role] : undefined) ??
    motion.default ??
    MOTION_DEFAULTS.enter
  )
}

export interface LayoutJson {
  id: string
  name: string
  description: string
  content_relations: string[]
  scene_roles: string[]
  density: { max_chars: number; max_elements: number }
  slots: Record<string, { type: Slot['type'] | Slot['type'][]; required: boolean; hint?: string }>
  elements: Array<{ id: string; kind: 'text' | 'image' | 'shape' }>
  sample: Record<string, Slot>
}

export interface Theme {
  id: string
  dir: string
  json: ThemeJson
  css: string
}

export interface Layout {
  id: string
  dir: string
  json: LayoutJson
  html: string
  css: string
}

/** element id → data-role, read from the layout html (themes pick entrances by role; details need a box role). */
export function layoutRoles(layout: Layout): Map<string, string> {
  const roles = new Map<string, string>()
  for (const m of layout.html.matchAll(/<[a-zA-Z][a-zA-Z0-9]*([^>]*)>/g)) {
    const attrs = m[1] ?? ''
    const el = / data-el="([^"]*)"/.exec(attrs)?.[1]
    const role = / data-role="([^"]*)"/.exec(attrs)?.[1]
    if (el !== undefined && role !== undefined) roles.set(el, role)
  }
  return roles
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const ajv = new Ajv({ allErrors: true, strict: true })
ajv.addSchema(readJson(join(PROJECT_ROOT, 'schemas', 'deck.schema.json')) as object)
export const validateThemeJson = ajv.compile(
  readJson(join(PROJECT_ROOT, 'schemas', 'theme.schema.json')) as object,
)
export const validateLayoutJson = ajv.compile(
  readJson(join(PROJECT_ROOT, 'schemas', 'layout.schema.json')) as object,
)

/**
 * Where a theme is looked for, highest priority first: the deck's own folder
 * (`<deckDir>/themes/<id>`), the user's directory (`$SLIDE_NEXTUP_HOME/themes`, else
 * `~/.slide-nextup/themes`), then the repo's `themes/`. The first copy found wins, and a
 * theme's own layouts are read from that copy; the generic layouts stay in the repo's
 * `layouts/`. A bare string is the repo root alone, which is what the older call sites pass.
 */
export interface AssetLookup {
  root?: string
  /** the deck's directory; a theme under <deckDir>/themes/ wins over every other copy */
  deckDir?: string
  /** the user directory's themes folder: undefined reads the environment, null turns it off */
  userThemesDir?: string | null
}
export type Lookup = string | AssetLookup

export type ThemeOrigin = 'deck' | 'user' | 'repo'

export interface ThemeSearchDir {
  origin: ThemeOrigin
  /** the themes/ folder searched */
  dir: string
}

export interface ThemeEntry {
  id: string
  origin: ThemeOrigin
  /** the theme's own folder */
  dir: string
}

function normaliseLookup(lookup?: Lookup): AssetLookup & { root: string } {
  if (typeof lookup === 'string') return { root: lookup }
  return { ...lookup, root: lookup?.root ?? PROJECT_ROOT }
}

/** The user directory's themes folder: $SLIDE_NEXTUP_HOME/themes, else ~/.slide-nextup/themes. */
export function userThemesDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.SLIDE_NEXTUP_HOME
  return home ? join(resolve(home), 'themes') : join(homedir(), '.slide-nextup', 'themes')
}

/** Every themes/ folder a lookup searches, highest priority first, whether or not it exists. */
export function themeSearchDirs(lookup?: Lookup): ThemeSearchDir[] {
  const l = normaliseLookup(lookup)
  const dirs: ThemeSearchDir[] = []
  if (l.deckDir) dirs.push({ origin: 'deck', dir: join(resolve(l.deckDir), 'themes') })
  const user = l.userThemesDir === undefined ? userThemesDir() : l.userThemesDir
  if (user) dirs.push({ origin: 'user', dir: resolve(user) })
  dirs.push({ origin: 'repo', dir: join(l.root, 'themes') })
  return dirs
}

/** The copy of a theme that wins for a lookup, or null when no search dir has it. */
export function findTheme(id: string, lookup?: Lookup): ThemeEntry | null {
  for (const s of themeSearchDirs(lookup)) {
    const dir = join(s.dir, id)
    if (existsSync(join(dir, 'theme.json'))) return { id, origin: s.origin, dir }
  }
  return null
}

const ORIGIN_LABEL: Record<ThemeOrigin, string> = {
  deck: 'deck 資料夾',
  user: '使用者目錄',
  repo: 'repo',
}

/** 「使用者目錄」 and friends, for messages that say where a theme came from. */
export function describeOrigin(origin: ThemeOrigin): string {
  return ORIGIN_LABEL[origin]
}

/** The theme's folder: the copy that wins, else where the repo would keep it (for paths to create). */
export function themeDir(id: string, lookup?: Lookup): string {
  return findTheme(id, lookup)?.dir ?? join(normaliseLookup(lookup).root, 'themes', id)
}

export function layoutDir(id: string, themeId?: string, lookup?: Lookup): string {
  if (themeId) {
    const local = join(themeDir(themeId, lookup), 'layouts', id)
    if (existsSync(join(local, 'layout.json'))) return local
  }
  return join(normaliseLookup(lookup).root, 'layouts', id)
}

export function loadTheme(id: string, lookup?: Lookup): Theme {
  const found = findTheme(id, lookup)
  if (!found) {
    const searched = themeSearchDirs(lookup).map((s) => join(s.dir, id))
    throw new Error(`找不到主題 \`${id}\`；找過：${searched.join('、')}`)
  }
  return {
    id,
    dir: found.dir,
    json: readJson(join(found.dir, 'theme.json')) as ThemeJson,
    css: readFileSync(join(found.dir, 'theme.css'), 'utf8'),
  }
}

export function loadLayout(id: string, themeId?: string, lookup?: Lookup): Layout {
  const dir = layoutDir(id, themeId, lookup)
  const jsonFile = join(dir, 'layout.json')
  if (!existsSync(jsonFile)) {
    const searched = themeId ? [join(themeDir(themeId, lookup), 'layouts', id), dir] : [dir]
    throw new Error(`找不到版型 \`${id}\`；找過：${searched.join('、')}`)
  }
  return {
    id,
    dir,
    json: readJson(jsonFile) as LayoutJson,
    html: readFileSync(join(dir, 'layout.html'), 'utf8'),
    css: readFileSync(join(dir, 'layout.css'), 'utf8'),
  }
}

function layoutIdsIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'layout.json')))
    .map((d) => d.name)
    .sort()
}

/** The generic library: the repo's layouts/ only. */
export function listLayoutIds(lookup?: Lookup): string[] {
  return layoutIdsIn(join(normaliseLookup(lookup).root, 'layouts'))
}

/** Layouts that ship inside a theme (<theme dir>/layouts/<layout>/); they shadow a global layout with the same id. */
export function listThemeLayoutIds(themeId: string, lookup?: Lookup): string[] {
  return layoutIdsIn(join(themeDir(themeId, lookup), 'layouts'))
}

/** Every layout id a theme can use: the global library plus the theme's own. */
export function listLayoutIdsFor(themeId?: string, lookup?: Lookup): string[] {
  const ids = new Set(listLayoutIds(lookup))
  if (themeId) for (const id of listThemeLayoutIds(themeId, lookup)) ids.add(id)
  return [...ids].sort()
}

/** Every theme a lookup can see, one entry per id (the copy that wins), sorted by id. */
export function listThemes(lookup?: Lookup): ThemeEntry[] {
  const seen = new Map<string, ThemeEntry>()
  for (const s of themeSearchDirs(lookup)) {
    if (!existsSync(s.dir)) continue
    for (const d of readdirSync(s.dir, { withFileTypes: true })) {
      if (!d.isDirectory() || seen.has(d.name)) continue
      if (!existsSync(join(s.dir, d.name, 'theme.json'))) continue
      seen.set(d.name, { id: d.name, origin: s.origin, dir: join(s.dir, d.name) })
    }
  }
  return [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function listThemeIds(lookup?: Lookup): string[] {
  return listThemes(lookup).map((t) => t.id)
}

/** The deck folder a CLI's --deck argument names: the folder itself, or the file's folder. */
export function deckDirOfPath(p: string): string {
  const abs = resolve(p)
  return existsSync(abs) && statSync(abs).isDirectory() ? abs : dirname(abs)
}

/** Theme tokens as CSS custom properties; the only bridge between theme.json and theme.css. */
export function themeCssVariables(theme: ThemeJson): string {
  const lines: string[] = []
  for (const [name, c] of Object.entries(theme.colors)) lines.push(`  --color-${name}: ${c.value};`)
  lines.push(`  --font-display: ${theme.typography.display.family};`)
  lines.push(`  --font-display-weight: ${theme.typography.display.weight};`)
  lines.push(`  --font-body: ${theme.typography.body.family};`)
  lines.push(`  --font-body-weight: ${theme.typography.body.weight};`)
  lines.push(`  --radius: ${theme.spacing.radius}px;`)
  lines.push(`  --motion-duration: ${theme.motion?.duration ?? MOTION_DEFAULTS.duration}ms;`)
  lines.push(`  --motion-stagger: ${theme.motion?.stagger ?? MOTION_DEFAULTS.stagger}ms;`)
  return `:root {\n${lines.join('\n')}\n}\n`
}
