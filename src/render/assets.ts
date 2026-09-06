import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

export function themeDir(id: string, root = PROJECT_ROOT): string {
  return join(root, 'themes', id)
}

export function layoutDir(id: string, themeId?: string, root = PROJECT_ROOT): string {
  if (themeId) {
    const local = join(root, 'themes', themeId, 'layouts', id)
    if (existsSync(join(local, 'layout.json'))) return local
  }
  return join(root, 'layouts', id)
}

export function loadTheme(id: string, root = PROJECT_ROOT): Theme {
  const dir = themeDir(id, root)
  const jsonFile = join(dir, 'theme.json')
  if (!existsSync(jsonFile)) throw new Error(`找不到主題 \`${id}\`（${jsonFile}）`)
  return {
    id,
    dir,
    json: readJson(jsonFile) as ThemeJson,
    css: readFileSync(join(dir, 'theme.css'), 'utf8'),
  }
}

export function loadLayout(id: string, themeId?: string, root = PROJECT_ROOT): Layout {
  const dir = layoutDir(id, themeId, root)
  const jsonFile = join(dir, 'layout.json')
  if (!existsSync(jsonFile)) throw new Error(`找不到版型 \`${id}\`（${jsonFile}）`)
  return {
    id,
    dir,
    json: readJson(jsonFile) as LayoutJson,
    html: readFileSync(join(dir, 'layout.html'), 'utf8'),
    css: readFileSync(join(dir, 'layout.css'), 'utf8'),
  }
}

export function listLayoutIds(root = PROJECT_ROOT): string[] {
  const dir = join(root, 'layouts')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'layout.json')))
    .map((d) => d.name)
    .sort()
}

/** Layouts that ship inside a theme (themes/<id>/layouts/<layout>/); they shadow a global layout with the same id. */
export function listThemeLayoutIds(themeId: string, root = PROJECT_ROOT): string[] {
  const dir = join(root, 'themes', themeId, 'layouts')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'layout.json')))
    .map((d) => d.name)
    .sort()
}

/** Every layout id a theme can use: the global library plus the theme's own. */
export function listLayoutIdsFor(themeId?: string, root = PROJECT_ROOT): string[] {
  const ids = new Set(listLayoutIds(root))
  if (themeId) for (const id of listThemeLayoutIds(themeId, root)) ids.add(id)
  return [...ids].sort()
}

export function listThemeIds(root = PROJECT_ROOT): string[] {
  const dir = join(root, 'themes')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'theme.json')))
    .map((d) => d.name)
    .sort()
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
