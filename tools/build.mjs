// Builds what the package ships: tsc compiles src/ into dist/ with the `.ts` imports rewritten to
// `.js`, then every file under src/ that is not TypeScript (the editor's JS and CSS, the runtime
// pieces shared with the browser, the dev client) is copied to the same place under dist/, because
// the renderer and the dev server read them next to their own module with import.meta.url.
// Node refuses to strip types under node_modules, so the sources themselves cannot ship.
// usage: node tools/build.mjs [--out <dir>]     (default dist/; runs on prepack)
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outIndex = process.argv.indexOf('--out')
const out = resolve(outIndex === -1 ? join(root, 'dist') : (process.argv[outIndex + 1] ?? 'dist'))

rmSync(out, { recursive: true, force: true })
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json'), '--outDir', out], {
  stdio: 'inherit',
  cwd: root,
})

const src = join(root, 'src')
let copied = 0
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs)
    else if (!name.endsWith('.ts') && name !== '.gitkeep') {
      const to = join(out, relative(src, abs))
      mkdirSync(dirname(to), { recursive: true })
      cpSync(abs, to)
      copied++
    }
  }
}
walk(src)
console.log(`built ${relative(root, out) || out}: ${copied} asset files copied next to the compiled modules`)
