import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import type { Enter, MotionFamily, Slot, TransitionFamily } from '../model/deck.ts'

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
  /** the data-tone values theme.css styles (inverse, and the variants of one role) */
  tones?: string[]
}

/** Playback rhythm: which entrance a step element gets when it does not say, and the timing. */
export interface ThemeMotion {
  /** the pack's motion personality: the pace, curve and band its entrances default to */
  family?: MotionFamily
  default?: Enter
  byRole?: Record<string, Enter>
  /** ms between elements revealed by the same step (overrides the family's figure) */
  stagger?: number
  /** ms of one entrance (overrides the family's figure; must stay in its band) */
  duration?: number
  /** the page transition a deck of this theme plays when deck.json names none (fade otherwise) */
  transition?: TransitionFamily
}

export interface MotionFamilySpec {
  /** ms of one entrance */
  duration: number
  /** ms between elements revealed by the same step */
  stagger: number
  /** the entrance curve (pop keeps its own overshoot) */
  ease: string
  /** the durations a pack of this family may declare, and what QA holds its computed entrances to */
  band: readonly [number, number]
}

/**
 * The three motion personalities a pack can pick. Craft figures, not product ones: a strong
 * ease-out at 150–400ms for a crisp pack, a longer rounder run for a soft one, a short plain
 * ease for a minimal one; stagger 30–90ms so a group never feels slow.
 */
export const MOTION_FAMILIES: Record<MotionFamily, MotionFamilySpec> = {
  crisp: { duration: 300, stagger: 60, ease: 'cubic-bezier(0.23, 1, 0.32, 1)', band: [150, 400] },
  soft: { duration: 450, stagger: 90, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', band: [300, 800] },
  minimal: { duration: 220, stagger: 40, ease: 'cubic-bezier(0.4, 0, 0.2, 1)', band: [150, 320] },
}

/** the widest band any entrance may use, family or not (open-slide's measured range) */
export const ENTRANCE_BAND: readonly [number, number] = [150, 800]

export const MOTION_DEFAULTS = {
  enter: 'fade-up' as Enter,
  stagger: 70,
  duration: 350,
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
}

/** The pace a theme's entrances play at: its family's figures, overridden by its own duration and stagger. */
export function motionFor(theme: Pick<ThemeJson, 'motion'>): {
  family: MotionFamily | null
  duration: number
  stagger: number
  ease: string
  band: readonly [number, number]
} {
  const motion = theme.motion ?? {}
  const family = motion.family ?? null
  const spec = family ? MOTION_FAMILIES[family] : null
  return {
    family,
    duration: motion.duration ?? spec?.duration ?? MOTION_DEFAULTS.duration,
    stagger: motion.stagger ?? spec?.stagger ?? MOTION_DEFAULTS.stagger,
    ease: spec?.ease ?? MOTION_DEFAULTS.ease,
    band: spec?.band ?? ENTRANCE_BAND,
  }
}

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
  slots: Record<
    string,
    {
      type: Slot['type'] | Slot['type'][]
      required: boolean
      hint?: string
      /** image slots: cover (the default) crops to fill the box, contain shows the whole picture */
      fit?: 'cover' | 'contain'
    }
  >
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
/**
 * object-fit rules for the image slots a layout declares `fit` on. The base sheet crops with cover
 * (a photo fills its frame); a diagram declares contain so nothing is cut off. Every renderer appends
 * this after the layout's own CSS, so the declaration wins over a stray object-fit there.
 */
export function layoutFitCss(layout: Layout): string {
  const rules: string[] = []
  for (const [slotId, slot] of Object.entries(layout.json.slots)) {
    if (slot.fit) {
      rules.push(
        `[data-layout="${layout.json.id}"] [data-el="${slotId}"] img { object-fit: ${slot.fit}; }`,
      )
    }
  }
  return rules.join('\n')
}

export const validateThemeJson = ajv.compile(
  readJson(join(PROJECT_ROOT, 'schemas', 'theme.schema.json')) as object,
)
export const validateLayoutJson = ajv.compile(
  readJson(join(PROJECT_ROOT, 'schemas', 'layout.schema.json')) as object,
)

/**
 * Where a theme is looked for, highest priority first: the deck's own folder
 * (`<deckDir>/themes/<id>`), the workspace's `themes/` (the working directory, implied only for
 * lookups rooted at the package), the user's directory (`$SLIDE_NEXTUP_HOME/themes`, else
 * `~/.slide-nextup/themes`), then the package's `themes/`. The first copy found wins, and a
 * theme's own layouts are read from that copy; the generic layouts stay in the repo's
 * `layouts/`. A bare string is the repo root alone, which is what the older call sites pass.
 */
export interface AssetLookup {
  root?: string
  /** the deck's directory; a theme under <deckDir>/themes/ wins over every other copy */
  deckDir?: string
  /** the workspace's themes folder's parent: undefined is the working directory, null turns it off */
  workspaceDir?: string | null
  /** the user directory's themes folder: undefined reads the environment, null turns it off */
  userThemesDir?: string | null
}
export type Lookup = string | AssetLookup

export type ThemeOrigin = 'deck' | 'workspace' | 'user' | 'repo'

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
  // the workspace (the folder `init` made, or wherever the command runs); when that is the repo
  // itself its themes/ is the repo entry below, not a second copy of it. A lookup that names another
  // root is a self-contained tree (tests, staging), so the working directory is not implied for it.
  const implied = relative(l.root, PROJECT_ROOT) === '' ? process.cwd() : null
  const workspace = l.workspaceDir === undefined ? implied : l.workspaceDir
  if (workspace) {
    const dir = join(resolve(workspace), 'themes')
    if (relative(dir, join(l.root, 'themes')) !== '') dirs.push({ origin: 'workspace', dir })
  }
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
  deck: 'deck folder',
  workspace: 'workspace',
  user: 'user directory',
  repo: 'repo',
}

/** "user directory" and friends, for messages that say where a theme came from. */
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
    throw new Error(`theme \`${id}\` not found; searched: ${searched.join(', ')}`)
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
    throw new Error(`layout \`${id}\` not found; searched: ${searched.join(', ')}`)
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
  for (const [name, c] of Object.entries(theme.colors)) {
    lines.push(`  --color-${name}: ${c.value};`)
    // the editor's colour palette shows what each token is for; a CSS string so it rides the same channel
    if (c.use)
      lines.push(
        `  --color-${name}-use: "${c.use.replace(/[\\"]/g, '\\$&').replace(/\s+/g, ' ')}";`,
      )
  }
  lines.push(`  --font-display: ${theme.typography.display.family};`)
  lines.push(`  --font-display-weight: ${theme.typography.display.weight};`)
  lines.push(`  --font-body: ${theme.typography.body.family};`)
  lines.push(`  --font-body-weight: ${theme.typography.body.weight};`)
  lines.push(`  --radius: ${theme.spacing.radius}px;`)
  const motion = motionFor(theme)
  lines.push(`  --motion-duration: ${motion.duration}ms;`)
  lines.push(`  --motion-stagger: ${motion.stagger}ms;`)
  lines.push(`  --motion-ease: ${motion.ease};`)
  return `:root {\n${lines.join('\n')}\n}\n`
}
