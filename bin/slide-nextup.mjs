#!/usr/bin/env node
// slide-nextup <command> [arguments…]
//
// One entry point for every CLI under src/cli/, so a workspace that installs the package can call
// them through its own package.json scripts (`"story:check": "slide-nextup story:check"`) and the
// process skills keep saying `pnpm story:check` everywhere. Each command runs in this process with
// process.argv reshaped so that `process.argv.slice(2)` is the command's own arguments, exactly as
// when the file is run directly with `node src/cli/<name>.ts`. The table lives in src/cli/commands.ts.
//
// In the repo the TypeScript sources run directly (Node strips the types); the published package
// ships the compiled dist/ instead, because Node refuses to strip types under node_modules.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = existsSync(join(root, 'src', 'cli', 'commands.ts'))
const cliDir = join(root, source ? 'src' : 'dist', 'cli')
const ext = source ? '.ts' : '.js'
const { COMMANDS } = await import(pathToFileURL(join(cliDir, `commands${ext}`)).href)
const [command, ...rest] = process.argv.slice(2)

function usage() {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length))
  return [
    'Usage: slide-nextup <command> [arguments…]',
    '',
    ...Object.entries(COMMANDS).map(([name, { help }]) => `  ${name.padEnd(width)}  ${help}`),
    '',
    'Every command answers --help with its own arguments.',
  ].join('\n')
}

if (!command || command === '--help' || command === '-h') {
  console.log(usage())
  process.exit(command ? 0 : 2)
}
if (command === '--version' || command === '-v') {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}
const entry = COMMANDS[command]
if (!entry) {
  console.error(`✖ unknown command \`${command}\`\n\n${usage()}`)
  process.exit(2)
}

if (entry.module === null) {
  // browsers:install: playwright's own cli, wherever the package manager put it
  const require = createRequire(import.meta.url)
  const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js')
  const child = spawn(process.execPath, [cli, 'install', 'chromium', ...rest], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  const module = join(cliDir, entry.module.replace(/\.ts$/, ext))
  process.argv = [process.argv[0], module, ...(entry.args ?? []), ...rest]
  await import(pathToFileURL(module).href)
}
