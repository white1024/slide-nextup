import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { PROJECT_ROOT } from '../render/assets.ts'
import { hashTree, listFiles, syncSkills } from '../skills/sync.ts'
import { SLIDE_SKILLS, workspaceScripts } from './commands.ts'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'Usage: slide-nextup init [<dir>] [--example] [--update] [--force] [--package <spec>]',
      '  Creates a workspace for making decks with your agent: package.json (slide-nextup pinned as a devDependency, one script per command),',
      '  AGENTS.md and CLAUDE.md, the five slide skills under .agents/skills with their .claude/skills mirror, decks/ and themes/.',
      '  An existing folder only gets the files it is missing; --force also rewrites AGENTS.md, CLAUDE.md and .gitignore from the templates.',
      '  --update refreshes the skills, the scripts and the pinned version and leaves everything else alone.',
      '  --package <spec> pins another package spec instead of this version (a tarball or a folder, for local builds).',
      '  --example copies the bundled tidewatch-progress deck (a confirmed story with its deck.json) into decks/ to try the commands on.',
    ].join('\n'),
  )
  process.exit(0)
}

const packageIndex = args.indexOf('--package')
const dirArg = args.find(
  (a, i) => !a.startsWith('-') && (packageIndex === -1 || i !== packageIndex + 1),
)
const target = resolve(dirArg ?? '.')
const update = args.includes('--update')
const force = args.includes('--force') && !update
const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8')) as {
  version: string
}
const spec = packageIndex === -1 ? pkg.version : args[packageIndex + 1]
if (!spec) {
  console.error('--package needs a spec (a version, a tarball or a folder)')
  process.exit(2)
}
if (relative(PROJECT_ROOT, target) === '') {
  console.log(
    '✖ this folder is slide-nextup itself; init makes a separate workspace, e.g. `slide-nextup init ../my-decks`',
  )
  process.exit(2)
}

const SKILLS = SLIDE_SKILLS
const created: string[] = []
const updated: string[] = []
const kept: string[] = []

/** Write a file; an existing one is kept unless `overwrite`, and an identical one counts as kept. */
function put(file: string, content: string, overwrite: boolean) {
  const abs = join(target, file)
  if (existsSync(abs)) {
    if (!overwrite || readFileSync(abs, 'utf8') === content) {
      kept.push(file)
      return
    }
    writeFileSync(abs, content)
    updated.push(file)
    return
  }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  created.push(file)
}
const template = (name: string) => readFileSync(join(PROJECT_ROOT, 'templates', name), 'utf8')

/** Make `dst` an exact copy of `src` (files added, changed and stray ones removed); returns what changed. */
function copyTree(src: string, dst: string): string[] {
  const wanted = hashTree(src)
  const changed: string[] = []
  for (const rel of listFiles(dst)) {
    if (!(rel in wanted)) {
      rmSync(join(dst, rel))
      changed.push(rel)
    }
  }
  for (const rel of Object.keys(wanted)) {
    const from = readFileSync(join(src, rel))
    const to = join(dst, rel)
    if (existsSync(to) && readFileSync(to).equals(from)) continue
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, from)
    changed.push(rel)
  }
  return changed
}

function workspaceName(dir: string): string {
  const name = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return name || 'slide-workspace'
}

mkdirSync(target, { recursive: true })

// package.json: create it, or merge our scripts and the pinned version into what is there
{
  const file = join(target, 'package.json')
  const existing = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)
    : null
  const next: Record<string, unknown> = existing
    ? { ...existing }
    : { name: workspaceName(target), private: true }
  next.scripts = {
    ...(existing?.scripts as Record<string, string> | undefined),
    ...workspaceScripts(),
  }
  next.devDependencies = {
    ...(existing?.devDependencies as Record<string, string> | undefined),
    'slide-nextup': spec,
  }
  put('package.json', `${JSON.stringify(next, null, 2)}\n`, true)
}

// the agent's entry points and the folder layout; only --force rewrites what is already there
put('AGENTS.md', template('AGENTS.md'), force)
put('CLAUDE.md', template('CLAUDE.md'), force)
put('.gitignore', template('gitignore'), force)
put('decks/.gitkeep', '', false)
put('themes/.gitkeep', '', false)

// the five slide skills, then the Claude Code mirror of the whole .agents/skills folder
const skillsDir = join(target, '.agents', 'skills')
let skillChanges = 0
for (const name of SKILLS) {
  const existed = existsSync(join(skillsDir, name, 'SKILL.md'))
  const changed = copyTree(join(PROJECT_ROOT, '.agents', 'skills', name), join(skillsDir, name))
  skillChanges += changed.length
  if (changed.length) (existed ? updated : created).push(`.agents/skills/${name}`)
}
const mirror = syncSkills(skillsDir, join(target, '.claude', 'skills'))

// --example: the bundled deck, once; an existing decks/tidewatch-progress is the user's now
if (args.includes('--example')) {
  const example = 'decks/tidewatch-progress'
  if (existsSync(join(target, example, 'deck.json'))) kept.push(example)
  else {
    copyTree(join(PROJECT_ROOT, 'examples', 'tidewatch-progress'), join(target, example))
    created.push(example)
  }
}

const shown = dirArg ?? '.'
console.log(`${update ? 'updated' : 'workspace'} ${shown}`)
for (const f of created) console.log(`  + ${f}`)
for (const f of updated) console.log(`  ~ ${f}`)
if (kept.length) console.log(`  = ${kept.length} unchanged`)
console.log(
  `  skills ${SKILLS.join(', ')}: ${skillChanges} files ${update ? 'updated' : 'copied'}; .claude/skills mirror: ${mirror.copied} copied, ${mirror.removed} removed`,
)
if (!update) {
  console.log(
    [
      '',
      'next:',
      `  cd ${shown}`,
      '  pnpm install',
      '  pnpm browsers:install   # the Chromium that qa and previews use, once',
      '  open the folder in Claude Code or Codex and ask for a deck',
    ].join('\n'),
  )
}
