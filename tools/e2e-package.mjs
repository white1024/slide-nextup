// End-to-end check of the published form: pack the tarball (prepack builds dist/), create a
// workspace from it with `init --package file:<tgz> --example`, install it with npm, then run the
// workspace's own scripts through the bin shim exactly as a user would. The transcript goes to
// artifacts/demo/npm-package/transcript.md; the temp workspace is removed unless --keep is given.
// usage: node tools/e2e-package.mjs [--keep]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const nodeDir = dirname(process.execPath)
const npm = [
  join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find((p) => existsSync(p))
if (!npm) {
  console.error('npm-cli.js not found next to node')
  process.exit(2)
}

const tmp = mkdtempSync(join(tmpdir(), 'slide-e2e-'))
const ws = join(tmp, 'my-decks')
const lines = [
  '# npm package end-to-end',
  '',
  `node ${process.version} · ${process.platform} ${process.arch} · ${new Date().toISOString()}`,
  '',
]
let failed = false

/** Run one step, record it, and stop the run at the first failure. */
function step(title, cmd, args, cwd) {
  if (failed) return null
  const shown = `${cmd === process.execPath ? 'node' : cmd} ${args.join(' ')}`
    .replace(npm, 'npm')
    .replace(/\S+[\\/]bin[\\/]slide-nextup\.mjs/, 'slide-nextup')
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, CI: '1' } })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n')
  const shownOut = out.length > 40 ? [...out.slice(0, 12), `… (${out.length - 24} lines)`, ...out.slice(-12)] : out
  lines.push(`## ${title}`, '', '```', `$ ${shown}`, ...shownOut, '```', `exit ${r.status}`, '')
  console.log(`${r.status === 0 ? '✓' : '✖'} ${title}`)
  if (r.status !== 0) failed = true
  return r
}
const run = (title, args, cwd = ws) => step(title, process.execPath, [npm, ...args], cwd)

// 1. the tarball, built by prepack
const pack = step('pack', process.execPath, [npm, 'pack', '--json', '--pack-destination', tmp], root)
let tgz = ''
if (pack?.status === 0) {
  // prepack's own output precedes the JSON on stdout
  const info = JSON.parse(pack.stdout.slice(pack.stdout.search(/^\[/m)))[0]
  tgz = join(tmp, info.filename)
  lines.push(`tarball: ${info.filename}, ${info.entryCount} files, ${(info.size / 1024).toFixed(0)} KB packed, ${(info.unpackedSize / 1024).toFixed(0)} KB unpacked`, '')
}

// 2. a workspace from it, with the bundled example deck
const spec = `file:${tgz.replace(/\\/g, '/')}`
step('init', process.execPath, [join(root, 'bin', 'slide-nextup.mjs'), 'init', ws, '--package', spec, '--example'], root)
run('install', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'])
// the Chromium build that this Playwright version wants (a no-op when it is already there)
run('browsers:install', ['run', 'browsers:install', '--silent'])

// 3. the workspace scripts, through the shim npm made for the bin
const deck = 'decks/tidewatch-progress'
run('story:check', ['run', 'story:check', '--silent', '--', `${deck}/story.md`, '--require-confirmed'])
run('deck:validate', ['run', 'deck:validate', '--silent', '--', `${deck}/deck.json`])
run('render', ['run', 'render', '--silent', '--', `${deck}/deck.json`, '-o', `${deck}/deck.html`])
run('qa', ['run', 'qa', '--silent', '--', `${deck}/deck.json`])
run('layouts', ['run', 'layouts', '--silent', '--', '--theme', 'warm-keynote'])
run('theme:check', ['run', 'theme:check', '--silent', '--', '--theme', 'warm-keynote'])
run('skills:check', ['run', 'skills:check', '--silent'])
run('init --update', ['exec', '--', 'slide-nextup', 'init', '--update'])
run('preflight', ['run', 'preflight', '--silent'])

if (!failed) {
  const html = join(ws, deck, 'deck.html')
  const report = join(ws, 'artifacts', 'qa', 'tidewatch-progress.json')
  lines.push(
    '## outputs in the workspace',
    '',
    `- ${deck}/deck.html: ${(statSync(html).size / 1024).toFixed(0)} KB`,
    `- artifacts/qa/tidewatch-progress.json: ${JSON.parse(readFileSync(report, 'utf8')).errors} errors`,
    '',
  )
}
lines.push(failed ? '**FAILED** at the step above.' : '**PASSED**: every step exited 0.', '')

const outDir = join(root, 'artifacts', 'demo', 'npm-package')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'transcript.md')
writeFileSync(outFile, `${lines.join('\n')}\n`)
console.log(`transcript: ${relative(root, outFile)}${keep ? `; workspace kept at ${ws}` : ''}`)
if (!keep) rmSync(tmp, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
