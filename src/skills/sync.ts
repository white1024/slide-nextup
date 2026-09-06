import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'

export const LOCK_FILE = '.sync-lock.json'

export interface SyncLock {
  source: string
  files: Record<string, string>
}

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name !== LOCK_FILE) out.push(relative(dir, full).replace(/\\/g, '/'))
    }
  }
  walk(dir)
  return out.sort()
}

function hashFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of listFiles(dir)) out[rel] = hashFile(join(dir, rel))
  return out
}

/** Mirror `source` into `target` (extra files in target are removed) and record the hashes. */
export function syncSkills(source: string, target: string): { copied: number; removed: number } {
  const wanted = hashTree(source)
  let copied = 0
  let removed = 0
  for (const rel of listFiles(target)) {
    if (!(rel in wanted)) {
      rmSync(join(target, rel))
      removed++
    }
  }
  for (const rel of Object.keys(wanted)) {
    const dst = join(target, rel)
    const src = join(source, rel)
    if (existsSync(dst) && hashFile(dst) === wanted[rel]) continue
    mkdirSync(dirname(dst), { recursive: true })
    writeFileSync(dst, readFileSync(src))
    copied++
  }
  for (const dir of emptyDirs(target)) rmSync(dir, { recursive: true, force: true })
  const lock: SyncLock = {
    source: relative(dirname(target), source).replace(/\\/g, '/'),
    files: wanted,
  }
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
  return { copied, removed }
}

function emptyDirs(root: string): string[] {
  const out: string[] = []
  const walk = (d: string): boolean => {
    if (!existsSync(d)) return true
    let empty = true
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        if (walk(full)) out.push(full)
        else empty = false
      } else empty = false
    }
    return empty && d !== root
  }
  walk(root)
  return out
}

export interface DriftReport {
  missing: string[]
  extra: string[]
  changed: string[]
  lockStale: boolean
}

/** Compare the mirror with its source; any difference is drift. */
export function checkSkills(source: string, target: string): DriftReport {
  const wanted = hashTree(source)
  const actual = hashTree(target)
  const missing = Object.keys(wanted).filter((f) => !(f in actual))
  const extra = Object.keys(actual).filter((f) => !(f in wanted))
  const changed = Object.keys(wanted).filter((f) => f in actual && actual[f] !== wanted[f])
  const lockFile = join(target, LOCK_FILE)
  let lockStale = true
  if (existsSync(lockFile) && statSync(lockFile).isFile()) {
    const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as SyncLock
    lockStale = JSON.stringify(lock.files) !== JSON.stringify(wanted)
  }
  return { missing, extra, changed, lockStale }
}

export function isClean(report: DriftReport): boolean {
  return (
    report.missing.length === 0 &&
    report.extra.length === 0 &&
    report.changed.length === 0 &&
    !report.lockStale
  )
}
