import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import type { Browser } from 'playwright'
import { type QaReport, runDeckQa } from '../qa/run.ts'
import { runThemeCheck, type ThemeCheckReport } from '../qa/theme-check.ts'
import { sampleDeck } from '../qa/theme-qa.ts'
import {
  type AssetLookup,
  findTheme,
  PROJECT_ROOT,
  type ThemeJson,
  userThemesDir,
} from '../render/assets.ts'
import { readZip, writeZip } from './zip.ts'

/**
 * A theme pack travels as its own folder (theme.json, theme.css, layouts/, a generator if it has
 * one) or as a zip of that folder. Export copies the folder out; import unpacks into a scratch
 * folder, runs theme:check and theme:qa on it there, and only then copies it to where themes are
 * looked up — nothing half-imported is ever left behind.
 */

/** Files a pack never carries: build output and editor noise. */
const SKIP = new Set(['node_modules', '.DS_Store', 'Thumbs.db'])

function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const d of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (SKIP.has(d.name) || d.name.endsWith('.tmp')) continue
    const p = join(dir, d.name)
    if (d.isDirectory()) out.push(...walk(p, base))
    else out.push(relative(base, p).replace(/\\/g, '/'))
  }
  return out
}

export interface ExportOptions {
  lookup?: AssetLookup
  /** a `.zip` path or a folder; default artifacts/themes/<id>.zip under the repo */
  out?: string
  /** overwrite an existing output */
  force?: boolean
}

export interface ExportResult {
  id: string
  /** the folder the pack was read from */
  from: string
  out: string
  kind: 'zip' | 'dir'
  files: string[]
  check: ThemeCheckReport
}

export function exportTheme(id: string, opts: ExportOptions = {}): ExportResult {
  const found = findTheme(id, opts.lookup)
  if (!found) throw new Error(`theme \`${id}\` not found`)
  const files = walk(found.dir)
  const out = resolve(opts.out ?? join(PROJECT_ROOT, 'artifacts', 'themes', `${id}.zip`))
  const kind = out.toLowerCase().endsWith('.zip') ? 'zip' : 'dir'
  if (existsSync(out) && !opts.force)
    throw new Error(`${out} already exists; add --force to overwrite it`)
  const check = runThemeCheck(id, opts.lookup)
  if (kind === 'zip') {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(
      out,
      writeZip(files.map((f) => ({ name: `${id}/${f}`, data: readFileSync(join(found.dir, f)) }))),
    )
  } else {
    if (existsSync(out)) rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    for (const f of files) {
      mkdirSync(dirname(join(out, f)), { recursive: true })
      cpSync(join(found.dir, f), join(out, f))
    }
  }
  return { id, from: found.dir, out, kind, files, check }
}

export type ImportTarget = { kind: 'repo' } | { kind: 'user' } | { kind: 'deck'; deckDir: string }

export interface ImportOptions {
  to: ImportTarget
  force?: boolean
  root?: string
  /** the user directory's themes folder for target `user` (default from the environment) */
  userThemesDir?: string
  /** an already running browser for the QA gate (the caller closes it) */
  browser?: Browser
  /** called as each gate starts, for a CLI to narrate */
  onStage?: (stage: ImportStage, detail: string) => void
}

export type ImportStage = 'unpack' | 'exists' | 'check' | 'qa' | 'copy'

export interface ImportFailure {
  ok: false
  stage: ImportStage
  message: string
  id?: string
  check?: ThemeCheckReport
  qa?: QaReport
}

export interface ImportSuccess {
  ok: true
  id: string
  dest: string
  files: string[]
  check: ThemeCheckReport
  qa: QaReport
  /** what theme.json says about where the look came from, for the notices file */
  source?: ThemeJson['source']
}

export type ImportResult = ImportSuccess | ImportFailure

/** Where a target keeps the theme with this id. */
export function importDestination(
  id: string,
  to: ImportTarget,
  opts: { root?: string; userThemesDir?: string } = {},
): string {
  switch (to.kind) {
    case 'repo':
      return join(opts.root ?? PROJECT_ROOT, 'themes', id)
    case 'user':
      return join(opts.userThemesDir ?? userThemesDir(), id)
    case 'deck':
      return join(resolve(to.deckDir), 'themes', id)
  }
}

/** Unpack a zip or copy a folder into <scratch>/themes/<id>/ and return the id the pack claims. */
function stage(source: string, scratch: string): { id: string; dir: string; files: string[] } {
  const themesDir = join(scratch, 'themes')
  mkdirSync(themesDir, { recursive: true })
  const src = resolve(source)
  if (!existsSync(src)) throw new Error(`${src} not found`)
  if (statSync(src).isDirectory()) {
    if (!existsSync(join(src, 'theme.json'))) throw new Error(`${src} has no theme.json`)
    const json = JSON.parse(readFileSync(join(src, 'theme.json'), 'utf8')) as { id?: unknown }
    if (typeof json.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(json.id))
      throw new Error('the id in theme.json is not a valid theme id')
    const dir = join(themesDir, json.id)
    const files = walk(src)
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true })
      cpSync(join(src, f), join(dir, f))
    }
    return { id: json.id, dir, files }
  }
  const entries = readZip(readFileSync(src))
  if (entries.length === 0) throw new Error('the zip is empty')
  // every entry sits under one top-level folder named after the theme; a flat zip is accepted too
  const tops = new Set(entries.map((e) => e.name.split('/')[0] as string))
  const flat = entries.some((e) => e.name === 'theme.json')
  const top = flat ? null : tops.size === 1 ? [...tops][0] : null
  if (!flat && !top)
    throw new Error(`the zip must hold exactly one theme folder, it has: ${[...tops].join(', ')}`)
  const strip = (name: string) => (top ? name.slice(top.length + 1) : name)
  const manifest = entries.find((e) => strip(e.name) === 'theme.json')
  if (!manifest) throw new Error('the zip has no theme.json')
  const json = JSON.parse(Buffer.from(manifest.data).toString('utf8')) as { id?: unknown }
  if (typeof json.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(json.id))
    throw new Error('the id in theme.json is not a valid theme id')
  if (top && top !== json.id)
    throw new Error(`the zip's folder is called ${top} but the id in theme.json is ${json.id}`)
  const dir = join(themesDir, json.id)
  const files: string[] = []
  for (const e of entries) {
    const rel = strip(e.name)
    if (!rel) continue
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), e.data)
    files.push(rel)
  }
  return { id: json.id, dir, files: files.sort() }
}

export async function importTheme(source: string, opts: ImportOptions): Promise<ImportResult> {
  const say = opts.onStage ?? (() => {})
  const scratch = mkdtempSync(join(tmpdir(), 'slide-theme-import-'))
  try {
    say('unpack', source)
    let staged: ReturnType<typeof stage>
    try {
      staged = stage(source, scratch)
    } catch (err) {
      return { ok: false, stage: 'unpack', message: (err as Error).message }
    }
    const { id, files } = staged
    const dest = importDestination(id, opts.to, {
      root: opts.root,
      userThemesDir: opts.userThemesDir,
    })
    say('exists', dest)
    if (existsSync(dest) && !opts.force) {
      return {
        ok: false,
        stage: 'exists',
        id,
        message: `${dest} already has this theme; add --force to overwrite it`,
      }
    }
    // the scratch copy wins the lookup as a "user directory" theme; the deck folder is left out so
    // a same-id theme there cannot stand in for the one being checked
    const lookup: AssetLookup = { root: opts.root, userThemesDir: join(scratch, 'themes') }
    say('check', id)
    const check = runThemeCheck(id, lookup)
    if (check.errors > 0) {
      return {
        ok: false,
        stage: 'check',
        id,
        message: `theme:check reported ${check.errors} errors`,
        check,
      }
    }
    say('qa', id)
    const deck = sampleDeck(id, lookup)
    const qa = await runDeckQa(deck, {
      deckDir: staged.dir,
      root: opts.root,
      userThemesDir: lookup.userThemesDir,
      browser: opts.browser,
    })
    if (qa.errors + qa.warnings > 0) {
      return {
        ok: false,
        stage: 'qa',
        id,
        message: `theme:qa reported ${qa.errors} errors, ${qa.warnings} warnings`,
        check,
        qa,
      }
    }
    say('copy', dest)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(staged.dir, dest, { recursive: true })
    const json = JSON.parse(readFileSync(join(dest, 'theme.json'), 'utf8')) as ThemeJson
    return { ok: true, id, dest, files, check, qa, source: json.source }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** `repo`, `user` or `deck:<deck.json|dir>` from the command line. */
export function parseImportTarget(value: string | undefined): ImportTarget {
  if (value === undefined || value === 'user') return { kind: 'user' }
  if (value === 'repo') return { kind: 'repo' }
  if (value.startsWith('deck:')) {
    const p = resolve(value.slice('deck:'.length))
    const deckDir = existsSync(p) && statSync(p).isDirectory() ? p : dirname(p)
    return { kind: 'deck', deckDir }
  }
  throw new Error(
    `--to accepts only repo, user or deck:<deck.json|folder>, cannot parse \`${value}\``,
  )
}
